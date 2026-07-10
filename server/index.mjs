import express from "express";
import { createServer as createViteServer } from "vite";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const app = express();
const port = Number(process.env.PORT || 5177);
const isProduction = process.argv.includes("--production");
const projectRoot = process.cwd();

const DEFAULT_SOURCE = process.env.PRODUCT_IMAGE_SOURCE || "";
const DEFAULT_OUTPUT = process.env.PRODUCT_IMAGE_OUTPUT || path.join(projectRoot, "output", "product-ready");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

app.use(express.json({ limit: "20mb" }));

const categoryMap = [
  [/型号1|ultrasonic/i, "ultrasonic-sensor"],
  [/B3FJ/i, "b3fj-photoelectric-sensor"],
  [/B3F/i, "b3f-photoelectric-sensor"],
  [/方形光电/i, "square-photoelectric-sensor"],
  [/方形激光/i, "laser-distance-sensor"],
  [/槽型光电/i, "slot-photoelectric-sensor"],
  [/电容式/i, "capacitive-proximity-sensor"],
  [/环形/i, "ring-proximity-sensor"],
  [/角柱形/i, "rectangular-proximity-sensor"],
  [/接近/i, "proximity-sensor"],
  [/光电/i, "photoelectric-sensor"],
];

function slugify(value) {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return ascii || "product-image";
}

function detectCategory(parts) {
  const joined = parts.join(" ");
  return categoryMap.find(([pattern]) => pattern.test(joined))?.[1] || slugify(parts[0] || "sensor");
}

function detectModel(parts, fileName) {
  const cleanParts = parts
    .map((part) => String(part || "").replace(/\.[^.]+$/, ""))
    .filter((part) => !/^(白底|images|修过|已修|750|SKU)$/i.test(part));

  const joined = cleanParts.join(" ");
  const ultrasonic = joined.match(/m\s*(12|18|30).*?(?:距离)?\s*(\d+(?:-\d+)?)(mm|米|m)/i);
  if (ultrasonic) {
    const range = ultrasonic[3] === "米" ? `${ultrasonic[2]}m` : `${ultrasonic[2]}${ultrasonic[3].toLowerCase()}`;
    return `m${ultrasonic[1]}-${range}`;
  }

  const top = cleanParts[0] || "";
  const variant = cleanParts.find((part) => /对射|漫反射|镜面反射/.test(part));
  if (/B3FJ/i.test(top) && variant) {
    const variantSlug = variant.includes("对射")
      ? "through-beam"
      : variant.includes("漫反射")
        ? "diffuse"
        : "retro-reflective";
    return `b3fj-${variantSlug}`;
  }

  if (/B3F/i.test(top) && variant) {
    const variantSlug = variant.includes("对射")
      ? "through-beam"
      : variant.includes("漫反射")
        ? "diffuse"
        : "retro-reflective";
    return `b3f-${variantSlug}`;
  }

  const knownModelPattern = /\b(?:PRA|PRE|PL|SN|CR|B3FJ|B3F|E3F|E3JK|B3Z|LGUB|LGDA)[A-Z0-9() -]*\d[A-Z0-9() -]*/i;
  const cameraPattern = /^(?:IA7A|DSC|019A)[_-]?\d+$/i;
  const candidates = cleanParts.slice().reverse();
  for (const candidate of candidates) {
    const match = String(candidate).match(knownModelPattern);
    if (match && /[0-9]/.test(match[0]) && !cameraPattern.test(match[0])) return slugify(match[0]);
  }

  for (const candidate of candidates) {
    const generic = /光电|接近|传感器|开关|普通款|升级款|总合|白底|修过|已修/.test(candidate);
    if (!generic && !cameraPattern.test(candidate) && /[a-z0-9]/i.test(candidate)) return slugify(candidate);
  }

  return slugify(top || fileName.replace(/\.[^.]+$/, ""));
}

function detectAssetType(relativePath, fileName) {
  if (/透明图/i.test(fileName)) return "transparent";
  if (/白底/i.test(relativePath)) return "white_background";
  if (/修过|已修|images|主图|详情|长图/i.test(relativePath)) return "edited_or_marketing";
  return "raw_photo";
}

function detectLanguageRisk(relativePath) {
  return /修过|已修|images|主图|详情|长图|未标题|中文|旗舰店/i.test(relativePath)
    ? "review_chinese_or_marketing_graphic"
    : "low";
}

function imageRisk(width, height) {
  const megaPixels = (width * height) / 1_000_000;
  if (megaPixels > 25) return "must_resize_over_25mp";
  if (megaPixels > 20) return "resize_recommended";
  return "ok";
}

function roleFor(assetType, index) {
  if (assetType === "transparent" || index === 0) return "main";
  if (assetType === "white_background") return `white-background-${index + 1}`;
  return `detail-${index + 1}`;
}

function outputExtension(metadata, options) {
  if (options.squareCanvas !== false) return "jpg";
  return metadata.hasAlpha ? "png" : "jpg";
}

async function walkImages(root) {
  const results = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;
      results.push(fullPath);
    }
  }

  await visit(root);
  return results;
}

async function scanFolder(root) {
  const files = await walkImages(root);
  const rows = [];

  for (const fullPath of files) {
    try {
      const metadata = await sharp(fullPath, { limitInputPixels: false }).metadata();
      const fileStat = await stat(fullPath);
      const relativePath = path.relative(root, fullPath);
      const parts = relativePath.split(path.sep);
      const assetType = detectAssetType(relativePath, path.basename(fullPath));
      const category = detectCategory(parts);
      const model = detectModel(parts, path.basename(fullPath));
      const categoryForName = category.startsWith(`${model}-`)
        ? category.slice(model.length + 1)
        : category;
      const categoryPhrase = categoryForName.replace(/-/g, " ");
      const modelPhrase = model.replace(/-/g, " ").toUpperCase();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const megaPixels = Number(((width * height) / 1_000_000).toFixed(2));
      const index = rows.filter((row) => row.model === model).length;
      const role = roleFor(assetType, index);
      const outputFileName = `product-${model}-${categoryForName}-${role}.${outputExtension(metadata, {})}`;

      rows.push({
        id: Buffer.from(relativePath).toString("base64url"),
        relativePath,
        fullPath,
        fileName: path.basename(fullPath),
        topCategory: parts[0] || "",
        subfolder: parts.slice(1, -1).join(" / "),
        category,
        model,
        assetType,
        width,
        height,
        megaPixels,
        sizeKB: Number((fileStat.size / 1024).toFixed(1)),
        shopifyRisk: imageRisk(width, height),
        languageRisk: detectLanguageRisk(relativePath),
        outputFileName,
        altText: `${modelPhrase} ${categoryPhrase} product image for ecommerce product listings`,
      });
    } catch (error) {
      rows.push({
        id: Buffer.from(fullPath).toString("base64url"),
        relativePath: path.relative(root, fullPath),
        fullPath,
        fileName: path.basename(fullPath),
        error: error.message,
      });
    }
  }

  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const headers = [
    "relativePath",
    "outputFileName",
    "altText",
    "category",
    "model",
    "assetType",
    "width",
    "height",
    "megaPixels",
    "shopifyRisk",
    "languageRisk",
    "sizeKB",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

async function processImage(row, sourceRoot, outputRoot, options) {
  const sourcePath = path.join(sourceRoot, row.relativePath);
  const outputFileName = options.squareCanvas === false
    ? row.outputFileName
    : row.outputFileName.replace(/\.(png|webp|jpeg)$/i, ".jpg");
  const outputPath = path.join(outputRoot, row.category, outputFileName);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const maxEdge = Number(options.maxEdge || 2048);
  const maxMegaPixels = Number(options.maxMegaPixels || 24);
  const quality = Number(options.quality || 88);
  const canvasSize = Number(options.canvasSize || 2048);
  const productScale = Math.min(0.96, Math.max(0.5, Number(options.productScale || 0.86)));
  const squareCanvas = options.squareCanvas !== false;
  const autoTrim = options.autoTrim !== false;
  const trimThreshold = Number(options.trimThreshold || 18);
  const metadata = await sharp(sourcePath, { limitInputPixels: false }).metadata();
  const width = metadata.width || row.width;
  const height = metadata.height || row.height;

  if (squareCanvas) {
    const innerSize = Math.floor(canvasSize * productScale);
    let productPipeline = sharp(sourcePath, { limitInputPixels: false }).rotate();
    if (autoTrim) productPipeline = productPipeline.trim({ threshold: trimThreshold });

    const productBuffer = await productPipeline.resize({
        width: innerSize,
        height: innerSize,
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite([{ input: productBuffer, gravity: "center" }])
      .jpeg({ quality, mozjpeg: true })
      .toFile(outputPath);
  } else {
    const edgeRatio = Math.min(1, maxEdge / Math.max(width, height));
    const pixelRatio = Math.min(1, Math.sqrt((maxMegaPixels * 1_000_000) / (width * height)));
    const ratio = Math.min(edgeRatio, pixelRatio);
    const targetWidth = Math.max(1, Math.floor(width * ratio));
    const targetHeight = Math.max(1, Math.floor(height * ratio));

    let pipeline = sharp(sourcePath, { limitInputPixels: false }).rotate().resize({
      width: targetWidth,
      height: targetHeight,
      fit: "inside",
      withoutEnlargement: true,
    });

    const extension = path.extname(outputPath).toLowerCase();
    if (extension === ".png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else {
      pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true });
    }

    await pipeline.toFile(outputPath);
  }
  const optimized = await sharp(outputPath).metadata();
  const outputStat = await stat(outputPath);

  return {
    ...row,
    outputPath,
    outputRelativePath: path.relative(outputRoot, outputPath),
    outputWidth: optimized.width,
    outputHeight: optimized.height,
    outputMegaPixels: Number((((optimized.width || 0) * (optimized.height || 0)) / 1_000_000).toFixed(2)),
    outputSizeKB: Number((outputStat.size / 1024).toFixed(1)),
    status: "processed",
  };
}

app.get("/api/defaults", (_request, response) => {
  response.json({ sourceRoot: DEFAULT_SOURCE, outputRoot: DEFAULT_OUTPUT });
});

app.get("/api/scan", async (request, response) => {
  const root = String(request.query.root || DEFAULT_SOURCE);
  if (!root) {
    response.status(400).json({ error: "No source folder provided. Set PRODUCT_IMAGE_SOURCE or pass a root query parameter." });
    return;
  }
  if (!existsSync(root)) {
    response.status(400).json({ error: `Folder does not exist: ${root}` });
    return;
  }
  const rows = await scanFolder(root);
  response.json({
    root,
    rows,
    summary: {
      total: rows.length,
      whiteBackground: rows.filter((row) => row.assetType === "white_background").length,
      transparent: rows.filter((row) => row.assetType === "transparent").length,
      marketingRisk: rows.filter((row) => row.languageRisk !== "low").length,
      overLimit: rows.filter((row) => row.shopifyRisk === "must_resize_over_25mp").length,
      resizeRecommended: rows.filter((row) => row.shopifyRisk === "resize_recommended").length,
    },
  });
});

app.get("/api/image", (request, response) => {
  const filePath = String(request.query.path || "");
  if (!filePath || !existsSync(filePath)) {
    response.status(404).end("Image not found");
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  createReadStream(filePath).pipe(response);
});

app.post("/api/process", async (request, response) => {
  const sourceRoot = String(request.body.sourceRoot || DEFAULT_SOURCE);
  const outputRoot = String(request.body.outputRoot || DEFAULT_OUTPUT);
  const rows = Array.isArray(request.body.rows) ? request.body.rows : [];
  const options = request.body.options || {};

  if (!rows.length) {
    response.status(400).json({ error: "No images selected." });
    return;
  }

  await mkdir(outputRoot, { recursive: true });
  const processed = [];
  for (const row of rows) {
    processed.push(await processImage(row, sourceRoot, outputRoot, options));
  }

  const manifestPath = path.join(outputRoot, "product-image-studio-manifest.csv");
  await writeFile(manifestPath, toCsv(processed), "utf8");

  response.json({
    outputRoot,
    manifestPath,
    processed,
  });
});

if (isProduction) {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(projectRoot, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: error.message || "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Product Image Studio running at http://localhost:${port}`);
});
