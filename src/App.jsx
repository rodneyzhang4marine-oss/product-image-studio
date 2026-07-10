import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Circle,
  Crosshair,
  Download,
  Eraser,
  ImagePlus,
  Hand,
  Maximize2,
  Move,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Sparkles,
  Type,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const DEFAULT_CANVAS = { width: 2000, height: 2000 };
const PRODUCT_SCALE_MIN = 0.05;
const PRODUCT_SCALE_MAX = 6;
const VIEW_ZOOM_MIN = 0.35;
const VIEW_ZOOM_MAX = 3;
const SAMPLE_URL = "";
const DEFAULT_PRODUCT = { x: 1000, y: 940, scale: 0.5, rotation: 0 };
const DEFAULT_CROP = { left: 17, top: 29, right: 74, bottom: 73 };
const DEFAULT_ADJUSTMENTS = { brightness: 105, contrast: 106, saturation: 102, sharpness: 10, shadow: true };

function makeProductLayer({ id = `layer-${Date.now()}`, name = "Product image", src = "", product = DEFAULT_PRODUCT, crop = DEFAULT_CROP, adjustments = DEFAULT_ADJUSTMENTS } = {}) {
  return {
    id,
    name,
    src,
    product: { ...product },
    crop: { ...crop },
    adjustments: { ...adjustments },
  };
}

function getProductLayers(state) {
  if (Array.isArray(state.productLayers)) return state.productLayers;
  return [
    makeProductLayer({
      id: "legacy-product",
      name: "Product image",
      src: "",
      product: state.product || DEFAULT_PRODUCT,
      crop: state.crop || DEFAULT_CROP,
      adjustments: state.adjustments || DEFAULT_ADJUSTMENTS,
    }),
  ];
}

function getSelectedLayer(state) {
  const layers = getProductLayers(state);
  return layers.find((layer) => layer.id === state.selectedLayerId) || layers[layers.length - 1] || null;
}

function layerAsProductState(state, layer = getSelectedLayer(state)) {
  if (!layer) return state;
  return {
    ...state,
    product: layer.product,
    crop: layer.crop,
    adjustments: layer.adjustments,
  };
}

function syncLegacyProductState(state, layer = getSelectedLayer(state)) {
  if (!layer) return state;
  return {
    ...state,
    product: layer.product,
    crop: layer.crop,
    adjustments: layer.adjustments,
  };
}

const starterAnnotations = [
  {
    id: "thread",
    text: "Material\nProduct body detail",
    type: "arrow",
    point: { x: 760, y: 1040 },
    label: { x: 250, y: 720 },
    color: "#1d7992",
  },
  {
    id: "face",
    text: "Key Feature\nPrimary product detail",
    type: "circle",
    point: { x: 610, y: 1100 },
    label: { x: 260, y: 1220 },
    color: "#1d7992",
  },
  {
    id: "cable",
    text: "Connection\nInstallation note",
    type: "dot",
    point: { x: 1370, y: 930 },
    label: { x: 1360, y: 1180 },
    color: "#157a52",
  },
];

const dimensionTypes = new Set(["dimension", "diameter", "line"]);
const calloutTypes = [
  { id: "text", label: "Text" },
  { id: "dot", label: "Dot" },
  { id: "circle", label: "Circle" },
  { id: "highlight", label: "Highlight" },
  { id: "arrow", label: "Arrow" },
];

const compositionPresets = {
  none: { name: "None", lines: [] },
  industrial: {
    name: "Industrial",
    lines: [
      { axis: "x", value: 0.5, label: "Hero center" },
      { axis: "y", value: 0.58, label: "Product weight line" },
      { axis: "x", value: 0.18, label: "Callout margin" },
      { axis: "x", value: 0.82, label: "Spec margin" },
    ],
  },
  food: {
    name: "Food",
    lines: [
      { axis: "x", value: 0.333, label: "Rule of thirds" },
      { axis: "x", value: 0.667, label: "Rule of thirds" },
      { axis: "y", value: 0.333, label: "Appetite focus" },
      { axis: "y", value: 0.667, label: "Serving base" },
    ],
  },
  travel: {
    name: "Travel",
    lines: [
      { axis: "y", value: 0.42, label: "Horizon" },
      { axis: "x", value: 0.333, label: "Subject third" },
      { axis: "x", value: 0.667, label: "Destination third" },
      { axis: "y", value: 0.72, label: "Foreground anchor" },
    ],
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value) {
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return Math.round(next);
}

function angleBetween(center, point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawArrowHead(ctx, from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 28;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 7), to.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 7), to.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function textScale(annotation) {
  return clamp((annotation.fontSize ?? 36) / 36, 0.5, 2.4);
}

function textFontSize(annotation) {
  return Math.round(36 * textScale(annotation));
}

function wrapTextLine(ctx, line, maxWidth) {
  const source = String(line || "");
  if (!source) return [""];
  const words = source.includes(" ") ? source.split(/(\s+)/).filter(Boolean) : Array.from(source);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current}${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current.trimEnd());
    current = word.trimStart();
  });
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function measureLabel(ctx, text, annotation = {}) {
  const lines = text.split("\n");
  const scale = textScale(annotation);
  const titleSize = 36 * scale;
  const bodySize = 27 * scale;
  const paddingX = 56 * scale;
  const oneLineHeight = 74 * scale;
  const titleBodyGap = 39 * scale;
  const bodyLineHeight = 31 * scale;
  if (annotation.type === "text" && annotation.boxWidth) {
    const hasContent = lines.slice(1).some((line) => line.trim());
    let width = clamp(annotation.boxWidth, 160, 1200);
    if (!hasContent && !annotation.manualBoxWidth) {
      ctx.font = `700 ${titleSize}px Segoe UI, Arial`;
      width = clamp(ctx.measureText(lines[0] || "Label").width + 56 * scale, 160, 900);
    }
    const contentWidth = Math.max(40, width - 56 * scale);
    ctx.font = `700 ${titleSize}px Segoe UI, Arial`;
    const titleLines = wrapTextLine(ctx, lines[0] || "Label", contentWidth);
    ctx.font = `400 ${bodySize}px Segoe UI, Arial`;
    const bodyLines = lines.slice(1).filter((line) => line.trim()).flatMap((line) => wrapTextLine(ctx, line, contentWidth));
    const titleHeight = titleLines.length * titleSize * 1.18;
    const titleBodyGapCompact = 5 * scale;
    const bodyBaseline = 44 * scale + titleHeight + titleBodyGapCompact;
    const bodyHeight = bodyLines.length ? titleBodyGapCompact + bodyLines.length * bodyLineHeight : 0;
    const topPadding = hasContent ? 28 * scale : 20 * scale;
    const bottomPadding = hasContent ? 24 * scale : 18 * scale;
    const contentHeight = topPadding + titleHeight + bodyHeight + bottomPadding;
    const height = Math.max(hasContent || annotation.manualBoxHeight ? annotation.boxHeight || 0 : 0, contentHeight);
    const textBlockHeight = titleHeight + bodyHeight;
    const verticalStart = annotation.verticalAlign === "center"
      ? Math.max(topPadding, (height - textBlockHeight) / 2)
      : topPadding;
    return {
      width,
      height,
      scale,
      titleSize,
      bodySize,
      paddingX: 28 * scale,
      titleBaseline: verticalStart + titleSize,
      bodyBaseline: verticalStart + titleHeight + titleBodyGapCompact + bodySize * 0.88,
      bodyLineHeight,
      titleLineHeight: titleSize * 1.18,
      radius: 18 * scale,
      titleLines,
      bodyLines,
    };
  }
  ctx.font = `700 ${titleSize}px Segoe UI, Arial`;
  const title = ctx.measureText(lines[0] || "").width;
  ctx.font = `400 ${bodySize}px Segoe UI, Arial`;
  const sub = Math.max(...lines.slice(1).map((line) => ctx.measureText(line).width), 0);
  return {
    width: Math.max(title, sub) + paddingX,
    height: lines.length > 1 ? oneLineHeight + titleBodyGap + (lines.length - 2) * bodyLineHeight : oneLineHeight,
    scale,
    titleSize,
    bodySize,
    paddingX: 28 * scale,
    titleBaseline: 45 * scale,
    bodyBaseline: 84 * scale,
    bodyLineHeight,
    radius: 18 * scale,
  };
}

function isResizableCallout(annotation) {
  return annotation.type === "circle" || annotation.type === "highlight";
}

function calloutRadiusRange(type) {
  return type === "highlight" ? { min: 28, max: 240, defaultValue: 74 } : { min: 18, max: 180, defaultValue: 54 };
}

function calloutRadius(annotation) {
  const range = calloutRadiusRange(annotation.type);
  return clamp(annotation.radius ?? range.defaultValue, range.min, range.max);
}

function resizeHandlePadding(type) {
  return type === "highlight" ? 58 : 26;
}

function resizeHandlePoint(annotation) {
  const radius = calloutRadius(annotation) + resizeHandlePadding(annotation.type);
  return { x: annotation.point.x + radius, y: annotation.point.y };
}

function textResizeHandlePoint(annotation, labelSize) {
  return {
    x: annotation.label.x + labelSize.width,
    y: annotation.label.y + labelSize.height,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

function dimensionLineGeometry(annotation) {
  const lineEnd = annotation.end || { x: annotation.point.x + 320, y: annotation.point.y };
  const dx = lineEnd.x - annotation.point.x;
  const dy = lineEnd.y - annotation.point.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const offset = annotation.offset ?? 72;
  const a = { x: annotation.point.x + nx * offset, y: annotation.point.y + ny * offset };
  const b = { x: lineEnd.x + nx * offset, y: lineEnd.y + ny * offset };
  const extensionA = { x: annotation.point.x + nx * (offset + 42), y: annotation.point.y + ny * (offset + 42) };
  const extensionB = { x: lineEnd.x + nx * (offset + 42), y: lineEnd.y + ny * (offset + 42) };
  return { lineEnd, dx, dy, length, nx, ny, offset, a, b, extensionA, extensionB };
}

function hitTestDimensionStroke(annotation, point) {
  const lineEnd = annotation.end || { x: annotation.point.x + 320, y: annotation.point.y };
  if (annotation.type === "dimension") {
    const { a, b, extensionA, extensionB } = dimensionLineGeometry(annotation);
    return (
      distanceToSegment(point, a, b) <= 30 ||
      distanceToSegment(point, annotation.point, extensionA) <= 24 ||
      distanceToSegment(point, lineEnd, extensionB) <= 24
    );
  }
  if (annotation.type === "diameter") {
    const radius = Math.hypot(lineEnd.x - annotation.point.x, lineEnd.y - annotation.point.y) / 2;
    const center = { x: (annotation.point.x + lineEnd.x) / 2, y: (annotation.point.y + lineEnd.y) / 2 };
    const onCircle = Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius) <= 30;
    const onLeader = distanceToSegment(point, annotation.point, annotation.label) <= 26;
    return onCircle || onLeader;
  }
  return false;
}

function drawAnnotation(ctx, annotation, selected = false) {
  if (dimensionTypes.has(annotation.type)) {
    drawDimensionAnnotation(ctx, annotation, selected);
    return;
  }

  const { point, label, text, type, color } = annotation;
  const labelSize = measureLabel(ctx, text, annotation);
  const labelCenter = { x: label.x + labelSize.width / 2, y: label.y + labelSize.height / 2 };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = selected ? 7 : 5;
  ctx.lineCap = "round";

  if (type !== "highlight" && type !== "text") {
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(labelCenter.x, labelCenter.y);
    ctx.stroke();
    if (type === "arrow") drawArrowHead(ctx, labelCenter, point, color);
  }

  if (type === "highlight") {
    const radius = calloutRadius(annotation);
    const selectedRadius = selected ? radius + 8 : radius;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, selectedRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = selected ? 8 : 6;
    ctx.beginPath();
    ctx.arc(point.x, point.y, selectedRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = selected ? 5 : 4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, selectedRadius + 30, Math.PI * 1.05, Math.PI * 1.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, selectedRadius + 50, Math.PI * 1.15, Math.PI * 1.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 15, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "circle") {
    const radius = calloutRadius(annotation);
    ctx.beginPath();
    ctx.arc(point.x, point.y, selected ? radius + 8 : radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (type !== "text") {
    ctx.beginPath();
    ctx.arc(point.x, point.y, selected ? 16 : 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (text.trim()) {
    if (type === "highlight") {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(labelCenter.x, labelCenter.y);
      ctx.stroke();
    }

    const textStyle = annotation.textStyle || "box";
    const fillTextBox = type !== "text" || textStyle === "box";
    ctx.shadowColor = fillTextBox ? "rgba(15, 31, 40, 0.14)" : "transparent";
    ctx.shadowBlur = fillTextBox ? 18 : 0;
    ctx.shadowOffsetY = fillTextBox ? 8 : 0;
    if (fillTextBox) {
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, label.x, label.y, labelSize.width, labelSize.height, labelSize.radius);
      ctx.fill();
    }
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = type === "text" && textStyle === "border" ? color : selected ? color : "#d7e5e7";
    ctx.lineWidth = type === "text" && textStyle === "border" ? (selected ? 5 : 4) : selected ? 4 : 2;
    roundedRect(ctx, label.x, label.y, labelSize.width, labelSize.height, labelSize.radius);
    ctx.stroke();

    if (type === "text" && textStyle === "box") {
      ctx.fillStyle = color;
      roundedRect(ctx, label.x, label.y, Math.max(5, 7 * labelSize.scale), labelSize.height, Math.max(5, 7 * labelSize.scale));
      ctx.fill();
    }

    ctx.fillStyle = "#17201d";
    ctx.font = `700 ${labelSize.titleSize}px Segoe UI, Arial`;
    const titleLines = labelSize.titleLines || [text.split("\n")[0] || "Label"];
    titleLines.forEach((line, index) => {
      ctx.fillText(line, label.x + labelSize.paddingX, label.y + labelSize.titleBaseline + index * (labelSize.titleLineHeight || labelSize.titleSize * 1.18));
    });
    ctx.fillStyle = "#60706b";
    ctx.font = `400 ${labelSize.bodySize}px Segoe UI, Arial`;
    const bodyLines = labelSize.bodyLines || text.split("\n").slice(1);
    bodyLines.forEach((line, index) => {
      ctx.fillText(line, label.x + labelSize.paddingX, label.y + labelSize.bodyBaseline + index * labelSize.bodyLineHeight);
    });
  }

  if (selected && (isResizableCallout(annotation) || annotation.type === "text")) {
    const handle = annotation.type === "text" ? textResizeHandlePoint(annotation, labelSize) : resizeHandlePoint(annotation);
    ctx.shadowColor = "rgba(15, 31, 40, 0.16)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    roundedRect(ctx, handle.x - 18, handle.y - 18, 36, 36, 8);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(handle.x - 7, handle.y);
    ctx.lineTo(handle.x + 7, handle.y);
    ctx.moveTo(handle.x, handle.y - 7);
    ctx.lineTo(handle.x, handle.y + 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDimensionAnnotation(ctx, annotation, selected = false) {
  const { point, end, label, text, type, color } = annotation;
  const lineEnd = end || { x: point.x + 320, y: point.y };
  const labelSize = measureLabel(ctx, text);
  const textValue = text.split("\n")[0] || "Dimension";

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = selected ? 6 : 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.font = "700 36px Segoe UI, Arial";

  if (type === "line") {
    ctx.lineWidth = selected ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();

    if (selected) {
      [point, lineEnd].forEach((handle) => {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      const mid = { x: (point.x + lineEnd.x) / 2, y: (point.y + lineEnd.y) / 2 };
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (type === "dimension") {
    const { dx, dy, length, a, b, extensionA, extensionB } = dimensionLineGeometry(annotation);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(extensionA.x, extensionA.y);
    ctx.moveTo(lineEnd.x, lineEnd.y);
    ctx.lineTo(extensionB.x, extensionB.y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    drawArrowHead(ctx, { x: a.x + (dx / length) * 78, y: a.y + (dy / length) * 78 }, a, color);
    drawArrowHead(ctx, { x: b.x - (dx / length) * 78, y: b.y - (dy / length) * 78 }, b, color);

    const textX = label.x;
    const textY = label.y;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, textX, textY - 34, labelSize.width, 72, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(textValue, textX + 24, textY + 16);
  } else {
    const radius = Math.hypot(lineEnd.x - point.x, lineEnd.y - point.y) / 2;
    const cx = (point.x + lineEnd.x) / 2;
    const cy = (point.y + lineEnd.y) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(label.x, label.y);
    ctx.stroke();
    drawArrowHead(ctx, { x: label.x, y: label.y }, point, color);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, label.x, label.y - 34, labelSize.width, 70, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(textValue, label.x + 24, label.y + 16);
  }

  if (selected) {
    [point, lineEnd].forEach((handle) => {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(label.x, label.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function productSourceRect(productImage, crop) {
  if (!productImage) return null;
  const sx = Math.round(productImage.width * (crop.left / 100));
  const sy = Math.round(productImage.height * (crop.top / 100));
  const sw = Math.max(1, Math.round(productImage.width * ((crop.right - crop.left) / 100)));
  const sh = Math.max(1, Math.round(productImage.height * ((crop.bottom - crop.top) / 100)));
  return { sx, sy, sw, sh };
}

function productBox(state, productImage) {
  const source = productSourceRect(productImage, state.crop);
  if (!source) return null;
  const width = source.sw * state.product.scale;
  const height = source.sh * state.product.scale;
  const center = croppedProductCenter(state, productImage);
  return {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
    width,
    height,
    centerX: center.x,
    centerY: center.y,
  };
}

function fullProductBox(state, productImage) {
  if (!productImage) return null;
  const width = productImage.width * state.product.scale;
  const height = productImage.height * state.product.scale;
  return {
    left: state.product.x - width / 2,
    top: state.product.y - height / 2,
    right: state.product.x + width / 2,
    bottom: state.product.y + height / 2,
    width,
    height,
    centerX: state.product.x,
    centerY: state.product.y,
  };
}

function croppedProductCenter(state, productImage) {
  if (!productImage) return { x: state.product.x, y: state.product.y };
  const fullWidth = productImage.width * state.product.scale;
  const fullHeight = productImage.height * state.product.scale;
  const cropCenterXPct = (state.crop.left + state.crop.right) / 200;
  const cropCenterYPct = (state.crop.top + state.crop.bottom) / 200;
  const dx = (cropCenterXPct - 0.5) * fullWidth;
  const dy = (cropCenterYPct - 0.5) * fullHeight;
  const angle = (state.product.rotation * Math.PI) / 180;
  return {
    x: state.product.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: state.product.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function cropSelectionBox(state, productImage) {
  const box = fullProductBox(state, productImage);
  if (!box) return null;
  const left = box.left + box.width * (state.crop.left / 100);
  const top = box.top + box.height * (state.crop.top / 100);
  const right = box.left + box.width * (state.crop.right / 100);
  const bottom = box.top + box.height * (state.crop.bottom / 100);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function alignmentGuides(product, canvas) {
  const width = canvas?.width || DEFAULT_CANVAS.width;
  const height = canvas?.height || DEFAULT_CANVAS.height;
  const threshold = 28;
  const positions = [
    { axis: "x", value: width / 2, label: "Center" },
    { axis: "y", value: height / 2, label: "Center" },
    { axis: "x", value: width * 0.382, label: "Golden 38.2%" },
    { axis: "x", value: width * 0.618, label: "Golden 61.8%" },
    { axis: "y", value: height * 0.382, label: "Golden 38.2%" },
    { axis: "y", value: height * 0.618, label: "Golden 61.8%" },
  ];

  return positions.filter((item) => Math.abs(product[item.axis] - item.value) <= threshold);
}

function snapToGuides(product, canvas) {
  const width = canvas?.width || DEFAULT_CANVAS.width;
  const height = canvas?.height || DEFAULT_CANVAS.height;
  const threshold = 22;
  const xTargets = [width / 2, width * 0.382, width * 0.618];
  const yTargets = [height / 2, height * 0.382, height * 0.618];
  const next = { ...product };
  const xMatch = xTargets.find((value) => Math.abs(product.x - value) <= threshold);
  const yMatch = yTargets.find((value) => Math.abs(product.y - value) <= threshold);
  if (xMatch !== undefined) next.x = xMatch;
  if (yMatch !== undefined) next.y = yMatch;
  return next;
}

function snapProductToGuides(state, productImage, product) {
  const draft = { ...state, product };
  const box = productBox(draft, productImage);
  const anchor = box ? { x: box.centerX, y: box.centerY } : product;
  const snappedAnchor = snapToGuides(anchor, state.canvas || DEFAULT_CANVAS);
  return {
    ...product,
    x: product.x + (snappedAnchor.x - anchor.x),
    y: product.y + (snappedAnchor.y - anchor.y),
  };
}

function drawAlignmentGuides(ctx, product, canvas) {
  const width = canvas?.width || DEFAULT_CANVAS.width;
  const height = canvas?.height || DEFAULT_CANVAS.height;
  const guides = alignmentGuides(product, canvas);
  if (!guides.length) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.font = "700 28px Segoe UI, Arial";
  guides.forEach((guide) => {
    const isCenter = guide.label === "Center";
    ctx.strokeStyle = isCenter ? "rgba(18, 122, 82, 0.86)" : "rgba(242, 140, 56, 0.9)";
    ctx.fillStyle = isCenter ? "#127a52" : "#c66519";
    ctx.setLineDash(isCenter ? [18, 14] : [10, 12]);
    ctx.beginPath();
    if (guide.axis === "x") {
      ctx.moveTo(guide.value, 0);
      ctx.lineTo(guide.value, height);
    } else {
      ctx.moveTo(0, guide.value);
      ctx.lineTo(width, guide.value);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const text = guide.axis === "x" ? `${guide.label} vertical` : `${guide.label} horizontal`;
    const textWidth = ctx.measureText(text).width + 36;
    const x = guide.axis === "x" ? clamp(guide.value + 18, 20, width - textWidth - 20) : 28;
    const y = guide.axis === "x" ? 72 : clamp(guide.value + 18, 60, height - 28);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundedRect(ctx, x, y - 34, textWidth, 48, 12);
    ctx.fill();
    ctx.strokeStyle = isCenter ? "rgba(18, 122, 82, 0.34)" : "rgba(242, 140, 56, 0.38)";
    ctx.stroke();
    ctx.fillStyle = isCenter ? "#127a52" : "#c66519";
    ctx.fillText(text, x + 18, y);
  });
  ctx.restore();
}

function drawCompositionGuides(ctx, presetId, canvas) {
  const canvasWidth = canvas?.width || DEFAULT_CANVAS.width;
  const canvasHeight = canvas?.height || DEFAULT_CANVAS.height;
  const preset = compositionPresets[presetId];
  if (!preset || presetId === "none") return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "700 24px Segoe UI, Arial";
  preset.lines.forEach((guide, index) => {
    const value = guide.value * (guide.axis === "x" ? canvasWidth : canvasHeight);
    ctx.strokeStyle = "rgba(29, 121, 146, 0.42)";
    ctx.fillStyle = "#1d7992";
    ctx.setLineDash([8, 14]);
    ctx.beginPath();
    if (guide.axis === "x") {
      ctx.moveTo(value, 0);
      ctx.lineTo(value, canvasHeight);
    } else {
      ctx.moveTo(0, value);
      ctx.lineTo(canvasWidth, value);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const text = guide.label;
    const width = ctx.measureText(text).width + 28;
    const x = guide.axis === "x" ? clamp(value + 14, 18, canvasWidth - width - 18) : 32 + index * 16;
    const y = guide.axis === "x" ? 142 + index * 42 : clamp(value - 14, 42, canvasHeight - 24);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    roundedRect(ctx, x, y - 28, width, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#1d7992";
    ctx.fillText(text, x + 14, y);
  });
  ctx.restore();
}

function boxesOverlapOnAxis(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;
}

function annotationLabelBox(ctx, annotation) {
  if (!annotation?.label || !annotation.text?.trim()) return null;
  const size = measureLabel(ctx, annotation.text, annotation);
  return {
    id: annotation.id,
    kind: annotation.type === "text" ? "text" : "callout",
    left: annotation.label.x,
    top: annotation.label.y,
    right: annotation.label.x + size.width,
    bottom: annotation.label.y + size.height,
    width: size.width,
    height: size.height,
    centerX: annotation.label.x + size.width / 2,
    centerY: annotation.label.y + size.height / 2,
  };
}

function productLayerBox(state, productImages, layer) {
  const image = productImages[layer.id];
  if (!image) return null;
  const box = productBox(layerAsProductState(state, layer), image);
  if (!box) return null;
  return { ...box, id: layer.id, kind: "image" };
}

function collectLayoutBoxes(ctx, state, productImages, excludeAnnotationId) {
  const annotationBoxes = state.annotations
    .filter((annotation) => annotation.id !== excludeAnnotationId && !dimensionTypes.has(annotation.type))
    .map((annotation) => annotationLabelBox(ctx, annotation))
    .filter(Boolean);
  const imageBoxes = getProductLayers(state)
    .map((layer) => productLayerBox(state, productImages, layer))
    .filter(Boolean);
  return [...annotationBoxes, ...imageBoxes];
}

function layoutDistanceGuides(ctx, state, productImages, annotationId, threshold = 150) {
  const annotation = state.annotations.find((item) => item.id === annotationId);
  if (!annotation || annotation.type !== "text") return [];
  const selected = annotationLabelBox(ctx, annotation);
  if (!selected) return [];
  const guides = [];

  collectLayoutBoxes(ctx, state, productImages, annotationId).forEach((box) => {
    if (boxesOverlapOnAxis(selected.top, selected.bottom, box.top, box.bottom)) {
      if (box.right <= selected.left) {
        const gap = Math.round(selected.left - box.right);
        if (gap > 0 && gap <= threshold) {
          guides.push({ axis: "x", side: "left", gap, selected, target: box, x1: box.right, x2: selected.left, y: (Math.max(selected.top, box.top) + Math.min(selected.bottom, box.bottom)) / 2 });
        }
      }
      if (selected.right <= box.left) {
        const gap = Math.round(box.left - selected.right);
        if (gap > 0 && gap <= threshold) {
          guides.push({ axis: "x", side: "right", gap, selected, target: box, x1: selected.right, x2: box.left, y: (Math.max(selected.top, box.top) + Math.min(selected.bottom, box.bottom)) / 2 });
        }
      }
    }

    if (boxesOverlapOnAxis(selected.left, selected.right, box.left, box.right)) {
      if (box.bottom <= selected.top) {
        const gap = Math.round(selected.top - box.bottom);
        if (gap > 0 && gap <= threshold) {
          guides.push({ axis: "y", side: "top", gap, selected, target: box, y1: box.bottom, y2: selected.top, x: (Math.max(selected.left, box.left) + Math.min(selected.right, box.right)) / 2 });
        }
      }
      if (selected.bottom <= box.top) {
        const gap = Math.round(box.top - selected.bottom);
        if (gap > 0 && gap <= threshold) {
          guides.push({ axis: "y", side: "bottom", gap, selected, target: box, y1: selected.bottom, y2: box.top, x: (Math.max(selected.left, box.left) + Math.min(selected.right, box.right)) / 2 });
        }
      }
    }
  });

  return guides.sort((a, b) => a.gap - b.gap);
}

function layoutAlignmentGuides(ctx, state, productImages, annotationId, threshold = 18) {
  const annotation = state.annotations.find((item) => item.id === annotationId);
  if (!annotation || annotation.type !== "text") return [];
  const selected = annotationLabelBox(ctx, annotation);
  if (!selected) return [];
  const guides = [];

  collectLayoutBoxes(ctx, state, productImages, annotationId).forEach((box) => {
    const leftDiff = Math.abs(selected.left - box.left);
    if (leftDiff <= threshold) {
      guides.push({
        type: "left",
        diff: leftDiff,
        x: box.left,
        y1: Math.min(selected.top, box.top) - 42,
        y2: Math.max(selected.bottom, box.bottom) + 42,
      });
    }
    const centerDiff = Math.abs(selected.centerX - box.centerX);
    if (centerDiff <= threshold) {
      guides.push({
        type: "center",
        diff: centerDiff,
        x: box.centerX,
        y1: Math.min(selected.top, box.top) - 42,
        y2: Math.max(selected.bottom, box.bottom) + 42,
      });
    }
  });

  return guides.sort((a, b) => a.diff - b.diff);
}

function snapTextLabelToObjectAlignment(ctx, state, productImages, annotation, nextLabel) {
  if (annotation.type !== "text") return nextLabel;
  const size = measureLabel(ctx, annotation.text, annotation);
  const selected = {
    left: nextLabel.x,
    top: nextLabel.y,
    right: nextLabel.x + size.width,
    bottom: nextLabel.y + size.height,
    width: size.width,
    height: size.height,
    centerX: nextLabel.x + size.width / 2,
    centerY: nextLabel.y + size.height / 2,
  };
  const threshold = 18;
  let best = null;
  collectLayoutBoxes(ctx, state, productImages, annotation.id).forEach((box) => {
    const leftDiff = Math.abs(selected.left - box.left);
    if (leftDiff <= threshold && (!best || leftDiff < best.diff)) {
      best = { diff: leftDiff, x: box.left };
    }
    const centerDiff = Math.abs(selected.centerX - box.centerX);
    if (centerDiff <= threshold && (!best || centerDiff < best.diff)) {
      best = { diff: centerDiff, x: box.centerX - selected.width / 2 };
    }
  });
  return best ? { ...nextLabel, x: best.x } : nextLabel;
}

function drawDistanceGuideLabel(ctx, text, x, y) {
  ctx.font = "700 24px Segoe UI, Arial";
  const width = ctx.measureText(text).width + 26;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.strokeStyle = "rgba(29,121,146,0.28)";
  ctx.lineWidth = 2;
  roundedRect(ctx, x - width / 2, y - 18, width, 34, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1d7992";
  ctx.fillText(text, x - width / 2 + 13, y + 7);
}

function drawDistanceGuides(ctx, state, productImages, annotationId) {
  const guides = layoutDistanceGuides(ctx, state, productImages, annotationId);
  if (!guides.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(29,121,146,0.88)";
  ctx.fillStyle = "#1d7992";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  guides
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 4)
    .forEach((guide) => {
      const label = `${guide.gap}px`;
      ctx.beginPath();
      if (guide.axis === "x") {
        ctx.moveTo(guide.x1, guide.y);
        ctx.lineTo(guide.x2, guide.y);
        ctx.stroke();
        ctx.setLineDash([]);
        drawDistanceGuideLabel(ctx, label, (guide.x1 + guide.x2) / 2, guide.y - 18);
      } else {
        ctx.moveTo(guide.x, guide.y1);
        ctx.lineTo(guide.x, guide.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawDistanceGuideLabel(ctx, label, guide.x + 46, (guide.y1 + guide.y2) / 2);
      }
      ctx.setLineDash([10, 8]);
    });
  ctx.restore();
}

function drawObjectAlignmentGuides(ctx, state, productImages, annotationId) {
  const guides = layoutAlignmentGuides(ctx, state, productImages, annotationId);
  if (!guides.length) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.font = "700 24px Segoe UI, Arial";
  guides.slice(0, 2).forEach((guide) => {
    const label = guide.type === "left" ? "Left align" : "Center align";
    ctx.strokeStyle = guide.type === "left" ? "rgba(18,122,82,0.9)" : "rgba(242,140,56,0.9)";
    ctx.fillStyle = guide.type === "left" ? "#127a52" : "#c66519";
    ctx.setLineDash(guide.type === "left" ? [18, 10] : [8, 8]);
    ctx.beginPath();
    ctx.moveTo(guide.x, guide.y1);
    ctx.lineTo(guide.x, guide.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const width = ctx.measureText(label).width + 28;
    roundedRect(ctx, guide.x + 14, guide.y1 + 14, width, 36, 9);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(18, 30, 34, 0.12)";
    ctx.stroke();
    ctx.fillStyle = guide.type === "left" ? "#127a52" : "#c66519";
    ctx.fillText(label, guide.x + 28, guide.y1 + 39);
  });
  ctx.restore();
}

function drawProductSelection(ctx, state, productImage) {
  const box = productBox(state, productImage);
  if (!box) return;
  ctx.save();
  ctx.strokeStyle = "#157a52";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(box.left, box.top, box.width, box.height);
  ctx.setLineDash([]);
  const handles = [
    [box.left, box.top],
    [box.right, box.top],
    [box.right, box.bottom],
    [box.left, box.bottom],
  ];
  handles.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.rect(x - 20, y - 20, 40, 40);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawCropSelection(ctx, state, productImage) {
  const fullBox = fullProductBox(state, productImage);
  const box = cropSelectionBox(state, productImage);
  if (!box) return;
  ctx.save();
  if (fullBox) {
    ctx.fillStyle = "rgba(16, 24, 21, 0.2)";
    ctx.beginPath();
    ctx.rect(fullBox.left, fullBox.top, fullBox.width, fullBox.height);
    ctx.rect(box.left, box.top, box.width, box.height);
    ctx.fill("evenodd");
  }
  ctx.strokeStyle = "#f28c38";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.setLineDash([28, 16]);
  ctx.strokeRect(box.left, box.top, box.width, box.height);
  ctx.setLineDash([]);
  ctx.font = "700 38px Segoe UI, Arial";
  ctx.fillStyle = "#f28c38";
  ctx.fillText("✂", box.left + 22, box.top + 48);

  const handles = [
    [box.left, box.top, "nw"],
    [box.right, box.top, "ne"],
    [box.right, box.bottom, "se"],
    [box.left, box.bottom, "sw"],
    [(box.left + box.right) / 2, box.top, "n"],
    [box.right, (box.top + box.bottom) / 2, "e"],
    [(box.left + box.right) / 2, box.bottom, "s"],
    [box.left, (box.top + box.bottom) / 2, "w"],
  ];
  handles.forEach(([x, y]) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#f28c38";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(x - 18, y - 18, 36, 36);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function hitTestProduct(state, productImage, point) {
  const box = productBox(state, productImage);
  if (!box) return null;
  const handles = [
    { handle: "nw", x: box.left, y: box.top },
    { handle: "ne", x: box.right, y: box.top },
    { handle: "se", x: box.right, y: box.bottom },
    { handle: "sw", x: box.left, y: box.bottom },
  ];
  const corner = handles.find((item) => Math.abs(point.x - item.x) <= 44 && Math.abs(point.y - item.y) <= 44);
  if (corner) return { part: "scale", handle: corner.handle };
  if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) {
    return { part: "move" };
  }
  return null;
}

function hitTestProductLayer(state, productImages, point) {
  const layers = getProductLayers(state);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    const image = productImages[layer.id];
    if (!image) continue;
    const hit = hitTestProduct(layerAsProductState(state, layer), image, point);
    if (hit) return { ...hit, layerId: layer.id };
  }
  return null;
}

function hitTestCrop(state, productImage, point) {
  const box = cropSelectionBox(state, productImage);
  if (!box) return null;
  const handles = [
    { handle: "nw", x: box.left, y: box.top },
    { handle: "ne", x: box.right, y: box.top },
    { handle: "se", x: box.right, y: box.bottom },
    { handle: "sw", x: box.left, y: box.bottom },
    { handle: "n", x: (box.left + box.right) / 2, y: box.top },
    { handle: "e", x: box.right, y: (box.top + box.bottom) / 2 },
    { handle: "s", x: (box.left + box.right) / 2, y: box.bottom },
    { handle: "w", x: box.left, y: (box.top + box.bottom) / 2 },
  ];
  const match = handles.find((item) => Math.abs(point.x - item.x) <= 44 && Math.abs(point.y - item.y) <= 44);
  return match?.handle || null;
}

function applySharpen(sourceCanvas, amount) {
  if (amount <= 0) return sourceCanvas;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const strength = amount / 100;

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const center = src[i + c] * (1 + 4 * strength);
        const blur = (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]) * strength;
        out[i + c] = clamp(center - blur, 0, 255);
      }
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return sourceCanvas;
}

function drawScene(ctx, state, images, options = {}) {
  const { annotations, selectedAnnotationId, background, composition } = state;
  const { productImage, productImages = {}, backgroundImage } = images;
  const showSelection = options.showSelection ?? true;
  const canvas = state.canvas || DEFAULT_CANVAS;
  const canvasWidth = canvas.width || DEFAULT_CANVAS.width;
  const canvasHeight = canvas.height || DEFAULT_CANVAS.height;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (background.mode !== "transparent") {
    ctx.fillStyle = background.mode === "dark" ? "#101815" : "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (background.mode === "grid") {
    ctx.fillStyle = "#fbfdfe";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    for (let x = 0; x <= canvasWidth; x += 50) {
      ctx.strokeStyle = x % 250 === 0 ? "#d5e6ea" : "#edf4f6";
      ctx.lineWidth = x % 250 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= canvasHeight; y += 50) {
      ctx.strokeStyle = y % 250 === 0 ? "#d5e6ea" : "#edf4f6";
      ctx.lineWidth = y % 250 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }

  if (background.mode === "soft") {
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, "#f7fbfb");
    gradient.addColorStop(0.55, "#ffffff");
    gradient.addColorStop(1, "#e9f1f2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (background.mode === "uploaded" && backgroundImage) {
    const scale = Math.max(canvasWidth / backgroundImage.width, canvasHeight / backgroundImage.height);
    const w = backgroundImage.width * scale;
    const h = backgroundImage.height * scale;
    ctx.drawImage(backgroundImage, (canvasWidth - w) / 2, (canvasHeight - h) / 2, w, h);
    ctx.fillStyle = `rgba(255,255,255,${background.wash / 100})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (showSelection) drawCompositionGuides(ctx, composition, canvas);

  const layers = getProductLayers(state);
  const drawLayer = (layer, image, isSelected) => {
    if (!image) return;
    const layerState = layerAsProductState(state, layer);
    const { product, crop, adjustments } = layerState;
    const isEditingCrop = showSelection && state.activeTool === "crop" && isSelected;
    const sourceRect = isEditingCrop
      ? { sx: 0, sy: 0, sw: image.width, sh: image.height }
      : productSourceRect(image, crop);
    if (!sourceRect) return;
    const { sx, sy, sw, sh } = sourceRect;
    const w = sw * product.scale;
    const h = sh * product.scale;
    const temp = document.createElement("canvas");
    temp.width = Math.max(1, Math.round(w));
    temp.height = Math.max(1, Math.round(h));
    const tctx = temp.getContext("2d");
    tctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
    tctx.drawImage(image, sx, sy, sw, sh, 0, 0, temp.width, temp.height);
    applySharpen(temp, adjustments.sharpness);

    const drawCenter = isEditingCrop ? { x: product.x, y: product.y } : croppedProductCenter(layerState, image);
    ctx.save();
    ctx.translate(drawCenter.x, drawCenter.y);
    ctx.rotate((product.rotation * Math.PI) / 180);
    ctx.shadowColor = adjustments.shadow ? "rgba(20, 30, 33, 0.18)" : "transparent";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    ctx.drawImage(temp, -temp.width / 2, -temp.height / 2);
    ctx.restore();

    if (showSelection && state.activeTool === "crop" && isSelected) drawCropSelection(ctx, layerState, image);
    if (showSelection && state.activeTool === "product" && isSelected) {
      const alignmentBox = productBox(layerState, image);
      const alignmentAnchor = alignmentBox ? { x: alignmentBox.centerX, y: alignmentBox.centerY } : product;
      drawAlignmentGuides(ctx, alignmentAnchor, canvas);
    }
  };

  if (layers.length) {
    layers.forEach((layer) => {
      drawLayer(layer, productImages[layer.id], layer.id === state.selectedLayerId);
    });
  } else if (productImage) {
    drawLayer(makeProductLayer({
      product: state.product,
      crop: state.crop,
      adjustments: state.adjustments,
    }), productImage, true);
  }

  annotations.forEach((annotation) => {
    drawAnnotation(ctx, annotation, showSelection && selectedAnnotationId === annotation.id);
  });
  if (showSelection && state.distanceGuideAnnotationId) {
    drawObjectAlignmentGuides(ctx, state, productImages, state.distanceGuideAnnotationId);
    drawDistanceGuides(ctx, state, productImages, state.distanceGuideAnnotationId);
  }
}

function hitTestAnnotation(ctx, annotations, point) {
  for (let i = annotations.length - 1; i >= 0; i -= 1) {
    const annotation = annotations[i];
    if (dimensionTypes.has(annotation.type)) {
      const end = annotation.end || { x: annotation.point.x + 320, y: annotation.point.y };
      if (Math.hypot(point.x - annotation.point.x, point.y - annotation.point.y) <= 42) {
        return { id: annotation.id, part: "point" };
      }
      if (Math.hypot(point.x - end.x, point.y - end.y) <= 42) {
        return { id: annotation.id, part: "end" };
      }
      if (annotation.type === "line") {
        if (distanceToSegment(point, annotation.point, end) <= 28) {
          return { id: annotation.id, part: "line" };
        }
        continue;
      }
      if (hitTestDimensionStroke(annotation, point)) {
        return { id: annotation.id, part: annotation.type === "dimension" ? "dimension-line" : "line" };
      }
      const labelSize = measureLabel(ctx, annotation.text, annotation);
      if (
        point.x >= annotation.label.x - 32 &&
        point.x <= annotation.label.x + labelSize.width + 32 &&
        point.y >= annotation.label.y - 48 &&
        point.y <= annotation.label.y + labelSize.height + 48
      ) {
        return { id: annotation.id, part: "label" };
      }
      continue;
    }
    const labelSize = measureLabel(ctx, annotation.text, annotation);
    if (annotation.type === "text") {
      const handle = textResizeHandlePoint(annotation, labelSize);
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= 48) {
        return { id: annotation.id, part: "text-resize" };
      }
    }
    if (
      point.x >= annotation.label.x &&
      point.x <= annotation.label.x + labelSize.width &&
      point.y >= annotation.label.y &&
      point.y <= annotation.label.y + labelSize.height
    ) {
      return { id: annotation.id, part: "label" };
    }
    if (annotation.type === "text") continue;
    if (isResizableCallout(annotation)) {
      const handle = resizeHandlePoint(annotation);
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= 42) {
        return { id: annotation.id, part: "radius" };
      }
    }
    const radius = annotation.type === "circle"
      ? calloutRadius(annotation) + 20
      : annotation.type === "highlight"
        ? calloutRadius(annotation) + 70
        : 34;
    const distance = Math.hypot(point.x - annotation.point.x, point.y - annotation.point.y);
    if (distance <= radius) return { id: annotation.id, part: "point" };
  }
  return null;
}

function Slider({ label, value, min, max, step = 1, onChange, suffix = "" }) {
  return (
    <label className="sliderRow">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

function SizeNumberControl({ label, value, min, max, onChange }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = (nextDraft = draft) => {
    const parsed = Number(nextDraft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const nextValue = clamp(Math.round(parsed), min, max);
    setDraft(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div className="sizeControlRow">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => commitValue(event.target.value)}
      />
      <input
        className="sizeNumber"
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onMouseUp={(event) => event.preventDefault()}
        onChange={(event) => {
          const nextDraft = event.target.value.trim();
          if (/^\d{0,3}$/.test(nextDraft)) setDraft(nextDraft);
        }}
        onBlur={() => commitValue()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
      <strong>px</strong>
    </div>
  );
}

function CalloutSizeControl({ annotation, onChange }) {
  const range = calloutRadiusRange(annotation.type);
  const value = Math.round(calloutRadius(annotation));
  return (
    <SizeNumberControl
      label="Size"
      value={value}
      min={range.min}
      max={range.max}
      onChange={onChange}
    />
  );
}

function TextSizeControl({ annotation, onChange }) {
  const min = 18;
  const max = 86;
  const value = textFontSize(annotation);
  return (
    <SizeNumberControl
      label="Text size"
      value={value}
      min={min}
      max={max}
      onChange={onChange}
    />
  );
}

function DistanceNumberControl({ guide, onApply }) {
  const [draft, setDraft] = useState(guide ? String(guide.gap) : "");
  useEffect(() => {
    setDraft(guide ? String(guide.gap) : "");
  }, [guide?.axis, guide?.side, guide?.target?.id, guide?.gap]);

  if (!guide) return null;
  const apply = () => {
    const numeric = Number(draft);
    if (Number.isFinite(numeric)) onApply(Math.max(0, Math.round(numeric)));
  };

  return (
    <label className="distanceControl">
      <span>{guide.axis === "x" ? "Horizontal gap" : "Vertical gap"}</span>
      <input
        type="number"
        min="0"
        max="1200"
        step="1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <strong>px</strong>
    </label>
  );
}

function InlineDistanceInput({ guide, style, onApply }) {
  const [draft, setDraft] = useState(guide ? String(guide.gap) : "");
  useEffect(() => {
    setDraft(guide ? String(guide.gap) : "");
  }, [guide?.axis, guide?.side, guide?.target?.id, guide?.gap]);

  if (!guide || !style) return null;
  const apply = () => {
    const numeric = Number(draft);
    if (Number.isFinite(numeric)) onApply(Math.max(0, Math.round(numeric)));
  };

  return (
    <div
      className="inlineDistanceInput"
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <input
        type="number"
        min="0"
        max="1200"
        step="1"
        value={draft}
        aria-label={guide.axis === "x" ? "Horizontal gap pixels" : "Vertical gap pixels"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span>px</span>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const previewRef = useRef(null);
  const productImageRef = useRef(null);
  const productImagesRef = useRef({});
  const backgroundImageRef = useRef(null);
  const dragRef = useRef(null);
  const viewDragRef = useRef(null);
  const panelDragRef = useRef(null);
  const annotationClipboardRef = useRef(null);
  const pendingTextPasteTimerRef = useRef(null);
  const inlineTextEditorRef = useRef(null);
  const historyLockRef = useRef(false);
  const [brandColors, setBrandColors] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("product-image-studio-brand-colors") || "[]");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      // Ignore invalid saved palette.
    }
    return ["#1d7992", "#157a52", "#17201d", "#f28c38"];
  });
  const [brandLibraryOpen, setBrandLibraryOpen] = useState(false);
  const [brandColorDraft, setBrandColorDraft] = useState("#1d7992");

  const [imageName, setImageName] = useState("No product image");
  const [productSrc, setProductSrc] = useState("");
  const [backgroundSrc, setBackgroundSrc] = useState("");
  const [projectHistory, setProjectHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("product-image-studio-project-history") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [state, setState] = useState({
    canvas: DEFAULT_CANVAS,
    product: DEFAULT_PRODUCT,
    crop: DEFAULT_CROP,
    adjustments: DEFAULT_ADJUSTMENTS,
    productLayers: [],
    selectedLayerId: "",
    background: { mode: "grid", wash: 35 },
    composition: "none",
    annotations: [],
    selectedAnnotationId: "",
    activeTool: "none",
  });
  const [canvasDraft, setCanvasDraft] = useState(DEFAULT_CANVAS);
  const [floatingPanelPosition, setFloatingPanelPosition] = useState(null);
  const [editingTextAnnotationId, setEditingTextAnnotationId] = useState("");
  const [inlineTextDraft, setInlineTextDraft] = useState("");
  const [viewZoom, setViewZoom] = useState(1);
  const [viewMode, setViewMode] = useState("edit");
  const [history, setHistory] = useState({ past: [], future: [] });

  const selectedAnnotation = useMemo(
    () => state.annotations.find((annotation) => annotation.id === state.selectedAnnotationId),
    [state.annotations, state.selectedAnnotationId],
  );
  const productLayers = useMemo(() => getProductLayers(state), [state.productLayers, state.product, state.crop, state.adjustments]);
  const selectedLayer = useMemo(() => getSelectedLayer(state), [state.productLayers, state.selectedLayerId, state.product, state.crop, state.adjustments]);
  const selectedDistanceGuide = useMemo(() => {
    if (!selectedAnnotation || selectedAnnotation.type !== "text" || !canvasRef.current) return null;
    const ctx = canvasRef.current.getContext("2d");
    return layoutDistanceGuides(ctx, state, productImagesRef.current, selectedAnnotation.id, 320)[0] || null;
  }, [state, selectedAnnotation]);
  const editingTextAnnotation = useMemo(
    () => state.annotations.find((annotation) => annotation.id === editingTextAnnotationId && annotation.type === "text"),
    [state.annotations, editingTextAnnotationId],
  );

  const imageColors = useMemo(() => {
    return Array.from(new Set(state.annotations.map((annotation) => annotation.color))).slice(0, 12);
  }, [state.annotations]);

  const selectedVariant = "product-image";
  const canvasSize = state.canvas || DEFAULT_CANVAS;
  const canvasAspect = canvasSize.width / canvasSize.height;
  const canvasStyle = {
    aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
    width: `min(calc((100vh - 160px) / ${1 / Math.max(0.05, canvasAspect * viewZoom)}), calc((100vw - 760px) / ${1 / viewZoom}))`,
    background: state.background.mode === "transparent" ? "transparent" : "#ffffff",
  };

  useEffect(() => {
    if (!SAMPLE_URL) return;
    loadImage(SAMPLE_URL).then((image) => {
      productImagesRef.current["layer-sample"] = image;
      productImageRef.current = image;
      render();
    });
  }, []);

  useEffect(() => {
    render();
  }, [state]);

  useEffect(() => {
    setCanvasDraft(state.canvas || DEFAULT_CANVAS);
  }, [state.canvas?.width, state.canvas?.height]);

  useEffect(() => {
    if (!editingTextAnnotationId || !inlineTextEditorRef.current) return;
    inlineTextEditorRef.current.focus();
    inlineTextEditorRef.current.select();
  }, [editingTextAnnotationId]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "c") {
        if (copySelectedTextAnnotation()) {
          event.preventDefault();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "v") {
        if (annotationClipboardRef.current?.annotation) {
          if (pendingTextPasteTimerRef.current) window.clearTimeout(pendingTextPasteTimerRef.current);
          pendingTextPasteTimerRef.current = window.setTimeout(() => {
            pendingTextPasteTimerRef.current = null;
            pasteCopiedTextAnnotation();
          }, 0);
        }
        return;
      }
      const arrowDeltas = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const arrowDelta = arrowDeltas[event.key];
      if (arrowDelta && productImageRef.current && state.activeTool === "product" && !state.selectedAnnotationId) {
        event.preventDefault();
        nudgeProduct(arrowDelta.x * (event.shiftKey ? 10 : 1), arrowDelta.y * (event.shiftKey ? 10 : 1));
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedAnnotationId) {
        event.preventDefault();
        removeSelectedAnnotation();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        productImageRef.current &&
        state.activeTool === "product" &&
        !state.selectedAnnotationId
      ) {
        event.preventDefault();
        removeProductImage();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.activeTool, state.selectedAnnotationId, selectedAnnotation]);

  useEffect(() => {
    function onPanelPointerMove(event) {
      const drag = panelDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      setFloatingPanelPosition(clampFloatingPanel(
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
      ));
    }

    function onPanelPointerUp(event) {
      if (panelDragRef.current?.pointerId === event.pointerId) {
        panelDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", onPanelPointerMove);
    window.addEventListener("pointerup", onPanelPointerUp);
    window.addEventListener("pointercancel", onPanelPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPanelPointerMove);
      window.removeEventListener("pointerup", onPanelPointerUp);
      window.removeEventListener("pointercancel", onPanelPointerUp);
    };
  }, []);

  useEffect(() => {
    async function onPaste(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isEditingText =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        event.target?.isContentEditable;
      if (isEditingText) return;

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const imageFiles = [
        ...clipboardItems
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile?.())
          .filter(Boolean),
        ...Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/")),
      ];
      if (!imageFiles.length) {
        if (pendingTextPasteTimerRef.current) {
          window.clearTimeout(pendingTextPasteTimerRef.current);
          pendingTextPasteTimerRef.current = null;
        }
        if (pasteCopiedTextAnnotation()) {
          event.preventDefault();
        }
        return;
      }

      if (pendingTextPasteTimerRef.current) {
        window.clearTimeout(pendingTextPasteTimerRef.current);
        pendingTextPasteTimerRef.current = null;
      }
      event.preventDefault();
      for (const [index, imageFile] of imageFiles.entries()) {
        const dataUrl = await fileToDataUrl(imageFile);
        const extension = imageFile.type.split("/")[1] || "png";
        const name = imageFile.name || `clipboard-image-${Date.now()}-${index + 1}.${extension}`;
        await loadProductSource(dataUrl, name);
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function render(exportMode = false) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const selected = getSelectedLayer(state);
    drawScene(ctx, state, {
      productImage: selected ? productImagesRef.current[selected.id] || productImageRef.current : productImageRef.current,
      productImages: productImagesRef.current,
      backgroundImage: backgroundImageRef.current,
    }, { showSelection: !exportMode });
  }

  function updateState(patch) {
    setState((current) => {
      pushHistory(current);
      return { ...current, ...patch };
    });
  }

  function updateUiState(patch) {
    setState((current) => ({ ...current, ...patch }));
  }

  function copySelectedTextAnnotation() {
    if (!selectedAnnotation || selectedAnnotation.type !== "text") return false;
    annotationClipboardRef.current = {
      annotation: {
        ...selectedAnnotation,
        point: { ...selectedAnnotation.point },
        label: { ...selectedAnnotation.label },
        end: selectedAnnotation.end ? { ...selectedAnnotation.end } : undefined,
      },
      pasteCount: 1,
    };
    return true;
  }

  function pasteCopiedTextAnnotation() {
    const clipboard = annotationClipboardRef.current;
    if (!clipboard?.annotation) return false;
    const offset = 34 * clipboard.pasteCount;
    clipboard.pasteCount = clipboard.pasteCount >= 6 ? 1 : clipboard.pasteCount + 1;
    const source = clipboard.annotation;
    const id = `annotation-${Date.now()}`;
    const pasted = {
      ...source,
      id,
      point: { x: source.point.x + offset, y: source.point.y + offset },
      label: { x: source.label.x + offset, y: source.label.y + offset },
      end: source.end ? { x: source.end.x + offset, y: source.end.y + offset } : undefined,
    };
    setState((current) => {
      pushHistory(current);
      return {
        ...current,
        activeTool: "annotation",
        selectedAnnotationId: id,
        annotations: [...current.annotations, pasted],
      };
    });
    return true;
  }

  function setCanvasViewZoom(nextZoom) {
    setViewZoom((current) => clamp(Math.round((typeof nextZoom === "function" ? nextZoom(current) : nextZoom) * 100) / 100, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX));
  }

  function fitCanvasView() {
    setViewZoom(1);
    setViewMode("edit");
    requestAnimationFrame(() => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = 0;
    });
  }

  function applyCanvasSize() {
    const width = clamp(Math.round(Number(canvasDraft.width) || DEFAULT_CANVAS.width), 600, 4000);
    const height = clamp(Math.round(Number(canvasDraft.height) || DEFAULT_CANVAS.height), 600, 4000);
    setCanvasDraft({ width, height });
    setViewZoom(1);
    setViewMode("edit");
    setState((current) => {
      pushHistory(current);
      const layers = getProductLayers(current).map((layer) => ({
        ...layer,
        product: layer.id === current.selectedLayerId ? { ...layer.product, x: width / 2, y: height / 2 } : layer.product,
      }));
      const selected = layers.find((layer) => layer.id === current.selectedLayerId);
      return syncLegacyProductState({
        ...current,
        canvas: { width, height },
        productLayers: layers,
      }, selected);
    });
    requestAnimationFrame(() => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = 0;
    });
  }

  function updateSelectedLayer(mutator) {
    setState((current) => {
      pushHistory(current);
      const layers = getProductLayers(current);
      const selectedId = current.selectedLayerId || layers[layers.length - 1]?.id;
      let selectedLayer = null;
      const nextLayers = layers.map((layer) => {
        if (layer.id !== selectedId) return layer;
        const nextLayer = typeof mutator === "function" ? mutator(layer, current) : { ...layer, ...mutator };
        selectedLayer = nextLayer;
        return nextLayer;
      });
      return syncLegacyProductState({
        ...current,
        productLayers: nextLayers,
        selectedLayerId: selectedId,
        activeTool: "product",
      }, selectedLayer);
    });
  }

  function updateProduct(patch) {
    updateSelectedLayer((layer) => ({ ...layer, product: { ...layer.product, ...patch } }));
  }

  function nudgeProduct(dx, dy) {
    updateSelectedLayer((layer) => ({
      ...layer,
      product: {
        ...layer.product,
        x: layer.product.x + dx,
        y: layer.product.y + dy,
      },
    }));
    setState((current) => ({ ...current, selectedAnnotationId: "" }));
  }

  function updateCrop(patch) {
    updateSelectedLayer((layer) => {
      const next = { ...layer.crop, ...patch };
      next.left = clamp(next.left, 0, next.right - 5);
      next.right = clamp(next.right, next.left + 5, 100);
      next.top = clamp(next.top, 0, next.bottom - 5);
      next.bottom = clamp(next.bottom, next.top + 5, 100);
      return { ...layer, crop: next };
    });
  }

  function updateAdjustments(patch) {
    updateSelectedLayer((layer) => ({ ...layer, adjustments: { ...layer.adjustments, ...patch } }));
  }

  function updateBackground(patch) {
    setState((current) => {
      pushHistory(current);
      return { ...current, background: { ...current.background, ...patch } };
    });
  }

  function updateSelectedAnnotation(patch) {
    setState((current) => {
      pushHistory(current);
      return {
        ...current,
        annotations: current.annotations.map((annotation) =>
          annotation.id === current.selectedAnnotationId ? { ...annotation, ...patch } : annotation,
        ),
      };
    });
  }

  function alignSelectedTextToReference(mode) {
    if (!selectedAnnotation || selectedAnnotation.type !== "text") return;
    setState((current) => {
      const ctx = canvasRef.current.getContext("2d");
      const annotation = current.annotations.find((item) => item.id === current.selectedAnnotationId);
      if (!annotation || annotation.type !== "text") return current;
      const selected = annotationLabelBox(ctx, annotation);
      if (!selected) return current;
      const candidates = collectLayoutBoxes(ctx, current, productImagesRef.current, annotation.id);
      if (!candidates.length) return current;
      const target = candidates
        .map((box) => {
          const hasVerticalOverlap = boxesOverlapOnAxis(selected.top, selected.bottom, box.top, box.bottom);
          const diff = mode === "left" ? Math.abs(selected.left - box.left) : Math.abs(selected.centerX - box.centerX);
          const distance = Math.hypot(selected.centerX - box.centerX, selected.centerY - box.centerY);
          return { box, score: diff + (hasVerticalOverlap ? 0 : 260) + distance * 0.04 };
        })
        .sort((a, b) => a.score - b.score)[0]?.box;
      if (!target) return current;
      pushHistory(current);
      const nextX = mode === "left" ? target.left : target.centerX - selected.width / 2;
      return {
        ...current,
        distanceGuideAnnotationId: annotation.id,
        annotations: current.annotations.map((item) =>
          item.id === annotation.id ? { ...item, label: { ...item.label, x: nextX } } : item,
        ),
      };
    });
  }

  function applySelectedDistanceGap(guide, gap) {
    if (!guide || !selectedAnnotation || selectedAnnotation.type !== "text") return;
    setState((current) => {
      const ctx = canvasRef.current.getContext("2d");
      const annotation = current.annotations.find((item) => item.id === current.selectedAnnotationId);
      if (!annotation || annotation.type !== "text") return current;
      const size = measureLabel(ctx, annotation.text, annotation);
      const target = collectLayoutBoxes(ctx, current, productImagesRef.current, annotation.id).find((box) => box.id === guide.target.id && box.kind === guide.target.kind);
      if (!target) return current;
      const nextLabel = { ...annotation.label };
      if (guide.axis === "x" && guide.side === "left") nextLabel.x = target.right + gap;
      if (guide.axis === "x" && guide.side === "right") nextLabel.x = target.left - gap - size.width;
      if (guide.axis === "y" && guide.side === "top") nextLabel.y = target.bottom + gap;
      if (guide.axis === "y" && guide.side === "bottom") nextLabel.y = target.top - gap - size.height;
      pushHistory(current);
      return {
        ...current,
        distanceGuideAnnotationId: annotation.id,
        annotations: current.annotations.map((item) =>
          item.id === annotation.id ? { ...item, label: nextLabel } : item,
        ),
      };
    });
  }

  function makeHistorySnapshot(snapshotState = state) {
    const layers = getProductLayers(snapshotState);
    return {
      state: snapshotState,
      productSrc,
      imageName,
      layerSources: layers.map((layer) => ({
        id: layer.id,
        src: layer.src || "",
        name: layer.name || "Product image",
      })),
      backgroundSrc,
    };
  }

  async function restoreHistorySnapshot(snapshot) {
    const normalized = snapshot.state ? snapshot : makeHistorySnapshot(snapshot);
    historyLockRef.current = true;
    const loadedState = normalized.state || {};
    setState(loadedState);
    const layers = getProductLayers(loadedState);
    const layerSources = normalized.layerSources || layers.map((layer) => ({
      id: layer.id,
      src: layer.src || normalized.productSrc || "",
      name: layer.name || normalized.imageName || "Product image",
    }));
    const nextImages = {};
    for (const source of layerSources) {
      if (source.src) nextImages[source.id] = await loadImage(source.src);
    }
    productImagesRef.current = nextImages;
    const selected = getSelectedLayer(loadedState);
    const selectedSource = layerSources.find((source) => source.id === selected?.id) || layerSources[0];
    setProductSrc(selectedSource?.src || "");
    setImageName(selectedSource?.name || "No product image");
    setBackgroundSrc(normalized.backgroundSrc || "");
    productImageRef.current = selected ? nextImages[selected.id] || null : null;
    backgroundImageRef.current = normalized.backgroundSrc ? await loadImage(normalized.backgroundSrc) : null;
    render();
    setTimeout(() => {
      historyLockRef.current = false;
    }, 0);
  }

  function pushHistory(snapshot) {
    if (historyLockRef.current) return;
    setHistory((current) => ({
      past: [...current.past, makeHistorySnapshot(snapshot)].slice(-3),
      future: [],
    }));
  }

  function undo() {
    setHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      const past = current.past.slice(0, -1);
      restoreHistorySnapshot(previous);
      return { past, future: [makeHistorySnapshot(state), ...current.future].slice(0, 3) };
    });
  }

  function redo() {
    setHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      const future = current.future.slice(1);
      restoreHistorySnapshot(next);
      return { past: [...current.past, makeHistorySnapshot(state)].slice(-3), future };
    });
  }

  function addBrandColor(color = brandColorDraft) {
    const normalized = color.toLowerCase();
    setBrandColors((current) => {
      const next = [normalized, ...current.filter((item) => item.toLowerCase() !== normalized)].slice(0, 16);
      localStorage.setItem("product-image-studio-brand-colors", JSON.stringify(next));
      return next;
    });
    setBrandColorDraft(normalized);
  }

  function removeBrandColor(color) {
    setBrandColors((current) => {
      const next = current.filter((item) => item.toLowerCase() !== color.toLowerCase());
      localStorage.setItem("product-image-studio-brand-colors", JSON.stringify(next));
      return next;
    });
  }

  function applyAnnotationColor(color) {
    updateSelectedAnnotation({ color });
  }

  function applyAnnotationType(type) {
    if (!selectedAnnotation || dimensionTypes.has(selectedAnnotation.type)) return;
    const patch = { type };
    if (type === "circle" || type === "highlight") {
      patch.radius = calloutRadius({ ...selectedAnnotation, type });
    }
    if (type === "text") {
      patch.fontSize = selectedAnnotation.fontSize ?? 36;
      patch.textStyle = selectedAnnotation.textStyle || "box";
      patch.boxWidth = selectedAnnotation.boxWidth || 520;
      patch.boxHeight = selectedAnnotation.boxHeight || 130;
    }
    updateSelectedAnnotation(patch);
  }

  async function loadProductSource(src, name, shouldRemember = true) {
    const image = await loadImage(src);
    const id = `layer-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    productImagesRef.current[id] = image;
    setProductSrc(src);
    setImageName(name);
    const scale = Math.min(1400 / image.width, 930 / image.height);
    setState((current) => {
      if (shouldRemember) pushHistory(current);
      const canvas = current.canvas || DEFAULT_CANVAS;
      const layer = makeProductLayer({
        id,
        name,
        src,
        product: { x: canvas.width / 2, y: canvas.height / 2, scale: Number(scale.toFixed(3)), rotation: 0 },
        crop: { left: 0, top: 0, right: 100, bottom: 100 },
        adjustments: current.adjustments || DEFAULT_ADJUSTMENTS,
      });
      productImageRef.current = image;
      return syncLegacyProductState({
        ...current,
        productLayers: [...getProductLayers(current), layer],
        selectedLayerId: id,
        selectedAnnotationId: "",
        activeTool: "product",
      }, layer);
    });
  }

  function replaceSelectedLayerImage(layerId, nextImage, nextSrc, nextName, nextProductPatch = {}, nextLayerPatch = {}) {
    productImagesRef.current[layerId] = nextImage;
    productImageRef.current = nextImage;
    setProductSrc(nextSrc);
    setImageName(nextName);
    setState((current) => {
      pushHistory(current);
      const nextLayers = getProductLayers(current).map((item) =>
        item.id === layerId
          ? {
              ...item,
              ...nextLayerPatch,
              name: nextName,
              src: nextSrc,
              product: { ...item.product, ...nextProductPatch },
              crop: { left: 0, top: 0, right: 100, bottom: 100 },
            }
          : item,
      );
      const nextLayer = nextLayers.find((item) => item.id === layerId);
      return syncLegacyProductState({
        ...current,
        productLayers: nextLayers,
        selectedLayerId: layerId,
        activeTool: "product",
        selectedAnnotationId: "",
      }, nextLayer);
    });
  }

  function compactImageDataUrl(image, maxEdge = 900) {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }

  function saveProjectHistory() {
    const canvas = canvasRef.current;
    const layers = getProductLayers(state);
    if (!canvas || !layers.some((layer) => productImagesRef.current[layer.id])) return;
    const ctx = canvas.getContext("2d");
    drawScene(ctx, state, { productImages: productImagesRef.current, backgroundImage: backgroundImageRef.current }, { showSelection: false });
    const thumbnail = canvas.toDataURL("image/jpeg", 0.62);
    const storedLayerSources = layers
      .map((layer) => {
        const image = productImagesRef.current[layer.id];
        if (!image) return null;
        return {
          id: layer.id,
          name: layer.name || "Product image",
          src: compactImageDataUrl(image),
        };
      })
      .filter(Boolean);
    const selectedStored = storedLayerSources.find((source) => source.id === state.selectedLayerId) || storedLayerSources[0];
    const storedBackgroundSrc = backgroundImageRef.current ? compactImageDataUrl(backgroundImageRef.current, 900) : "";
    drawScene(ctx, state, { productImages: productImagesRef.current, backgroundImage: backgroundImageRef.current }, { showSelection: true });

    const entry = {
      id: `project-${Date.now()}`,
      name: selectedStored?.name || imageName || "Untitled project",
      savedAt: new Date().toISOString(),
      imageName: selectedStored?.name || imageName,
      productSrc: selectedStored?.src || "",
      layerSources: storedLayerSources,
      backgroundSrc: storedBackgroundSrc,
      state: { ...state, selectedAnnotationId: "", activeTool: "annotation" },
      thumbnail,
    };
    const next = [entry, ...projectHistory.filter((item) => item.id !== entry.id)].slice(0, 6);
    try {
      localStorage.setItem("product-image-studio-project-history", JSON.stringify(next));
      setProjectHistory(next);
    } catch {
      window.alert("Project history is full. Please remove older saved projects before saving another one.");
    }
  }

  async function loadProjectHistory(entry) {
    const loadedState = { ...entry.state, canvas: entry.state.canvas || DEFAULT_CANVAS };
    const layers = getProductLayers(loadedState);
    const layerSources = entry.layerSources || layers.map((layer) => ({
      id: layer.id,
      name: layer.name || entry.imageName || entry.name,
      src: layer.src || entry.productSrc,
    }));
    const nextImages = {};
    for (const source of layerSources) {
      if (source.src) nextImages[source.id] = await loadImage(source.src);
    }
    productImagesRef.current = nextImages;
    const selected = getSelectedLayer(loadedState);
    const selectedSource = layerSources.find((source) => source.id === selected?.id) || layerSources[0];
    productImageRef.current = selected ? nextImages[selected.id] || null : null;
    setProductSrc(selectedSource?.src || "");
    setImageName(selectedSource?.name || entry.imageName || entry.name);
    if (entry.backgroundSrc) {
      backgroundImageRef.current = await loadImage(entry.backgroundSrc);
      setBackgroundSrc(entry.backgroundSrc);
    } else {
      backgroundImageRef.current = null;
      setBackgroundSrc("");
    }
    setCanvasDraft(loadedState.canvas);
    setState(loadedState);
  }

  function nextTextPlacement(current) {
    const canvas = current.canvas || DEFAULT_CANVAS;
    const textAnnotations = current.annotations.filter((annotation) => annotation.type === "text" && annotation.label);
    const lastText = textAnnotations[textAnnotations.length - 1];
    const width = 520;
    const height = 130;
    const margin = 60;
    let x = lastText ? lastText.label.x : Math.min(620, Math.max(margin, canvas.width - width - margin));
    let y = lastText ? lastText.label.y + height + 36 : Math.min(240, Math.max(margin, canvas.height - height - margin));

    if (y + height > canvas.height - margin) {
      x = lastText ? lastText.label.x + width + 36 : margin;
      y = margin;
    }
    if (x + width > canvas.width - margin) x = margin;

    return {
      label: { x, y },
      point: { x: x + width / 2, y: y + height / 2 },
    };
  }

function addAnnotation(type = "arrow") {
    const id = `annotation-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const isDimension = dimensionTypes.has(type);
    setState((current) => {
      pushHistory(current);
      const selectedLine = type === "line"
        ? current.annotations.find((annotation) => annotation.id === current.selectedAnnotationId && annotation.type === "line")
        : null;
      const lineStart = selectedLine
        ? { ...(selectedLine.end || { x: selectedLine.point.x + 320, y: selectedLine.point.y }) }
        : { x: 720, y: 700 };
      const lineEnd = selectedLine
        ? { x: lineStart.x + 260, y: lineStart.y }
        : { x: 1080, y: 700 };
      const textPlacement = type === "text" ? nextTextPlacement(current) : null;
      return {
        ...current,
        activeTool: "annotation",
        selectedAnnotationId: id,
        annotations: [
          ...current.annotations,
          isDimension
            ? type === "line"
              ? {
                  id,
                  type,
                  text: "",
                  point: lineStart,
                  end: lineEnd,
                  label: { x: (lineStart.x + lineEnd.x) / 2, y: (lineStart.y + lineEnd.y) / 2 },
                  color: selectedLine?.color || "#1d7992",
                }
              : {
                  id,
                  type,
                  text: type === "diameter" ? "Ø6.5 mm" : "51 mm",
                  point: type === "diameter" ? { x: 820, y: 900 } : { x: 650, y: 1160 },
                  end: type === "diameter" ? { x: 1030, y: 1110 } : { x: 1220, y: 1030 },
                  label: type === "diameter" ? { x: 900, y: 1005 } : { x: 900, y: 1035 },
                  offset: type === "dimension" ? 72 : undefined,
                  color: "#1d7992",
                }
            : {
                id,
                type,
                text: type === "text"
                  ? "Text heading\nEdit supporting detail"
                  : type === "circle"
                    ? "Feature Detail\nDrag point to target"
                    : type === "highlight"
                      ? ""
                      : "New Callout\nEdit label text",
                point: type === "text" ? textPlacement.point : { x: 980, y: 960 },
                label: type === "text" ? textPlacement.label : { x: 1180, y: 760 },
                color: type === "dot" || type === "text" ? "#157a52" : "#1d7992",
                fontSize: 36,
                textStyle: type === "text" ? "box" : undefined,
                boxWidth: type === "text" ? 520 : undefined,
                boxHeight: type === "text" ? 130 : undefined,
                manualBoxWidth: false,
                manualBoxHeight: false,
              },
        ],
      };
    });
  }

  function removeSelectedAnnotation() {
    setState((current) => {
      pushHistory(current);
      const remaining = current.annotations.filter((annotation) => annotation.id !== current.selectedAnnotationId);
      return { ...current, annotations: remaining, selectedAnnotationId: "" };
    });
  }

  function removeProductImage() {
    setState((current) => {
      pushHistory(current);
      const layers = getProductLayers(current);
      const selectedId = current.selectedLayerId || layers[layers.length - 1]?.id;
      if (selectedId) delete productImagesRef.current[selectedId];
      const remaining = layers.filter((layer) => layer.id !== selectedId);
      const nextLayer = remaining[remaining.length - 1] || null;
      productImageRef.current = nextLayer ? productImagesRef.current[nextLayer.id] || null : null;
      setProductSrc(nextLayer?.src || "");
      setImageName(nextLayer?.name || "No product image");
      return syncLegacyProductState({
        ...current,
        productLayers: remaining,
        selectedLayerId: nextLayer?.id || "",
        selectedAnnotationId: "",
        activeTool: nextLayer ? "product" : "none",
      }, nextLayer);
    });
  }

  function selectProductLayer(layerId) {
    const layer = getProductLayers(state).find((item) => item.id === layerId);
    productImageRef.current = layer ? productImagesRef.current[layer.id] || null : null;
    setProductSrc(layer?.src || "");
    setImageName(layer?.name || "No product image");
    setState((current) => syncLegacyProductState({
      ...current,
      selectedLayerId: layerId,
      selectedAnnotationId: "",
      activeTool: "product",
    }, layer));
  }

  async function resetLayout() {
    productImagesRef.current = {};
    productImageRef.current = null;
    setProductSrc("");
    setImageName("No product image");
    setState((current) => {
      pushHistory(current);
      const canvas = current.canvas || DEFAULT_CANVAS;
      return {
        ...current,
        canvas,
        product: { ...DEFAULT_PRODUCT, x: canvas.width / 2, y: canvas.height / 2 },
        crop: DEFAULT_CROP,
        adjustments: DEFAULT_ADJUSTMENTS,
        productLayers: [],
        selectedLayerId: "",
        background: { mode: "grid", wash: 35 },
        composition: "none",
        annotations: [],
        selectedAnnotationId: "",
        activeTool: "none",
      };
    });
  }

  async function onProductUpload(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      await loadProductSource(dataUrl, file.name);
    }
    event.target.value = "";
  }

  async function onBackgroundUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    backgroundImageRef.current = await loadImage(dataUrl);
    setBackgroundSrc(dataUrl);
    updateBackground({ mode: "uploaded" });
  }

  async function onCanvasDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []).filter((item) => item.type.startsWith("image/"));
    if (!files.length) return;
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      await loadProductSource(dataUrl, file.name);
    }
  }

  async function cutOutBackground() {
    const layer = getSelectedLayer(state);
    const image = layer ? productImagesRef.current[layer.id] : null;
    if (!layer || !image) return;
    const layerState = layerAsProductState(state, layer);
    const source = productSourceRect(image, layer.crop);
    if (!source) return;
    const temp = document.createElement("canvas");
    temp.width = source.sw;
    temp.height = source.sh;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, source.sw, source.sh);

    const imageData = tctx.getImageData(0, 0, temp.width, temp.height);
    const data = imageData.data;
    const width = temp.width;
    const height = temp.height;
    const samples = { r: [], g: [], b: [] };
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
    function addSample(index) {
      samples.r.push(data[index]);
      samples.g.push(data[index + 1]);
      samples.b.push(data[index + 2]);
    }
    for (let x = 0; x < width; x += step) {
      addSample(x * 4);
      addSample(((height - 1) * width + x) * 4);
    }
    for (let y = 0; y < height; y += step) {
      addSample((y * width) * 4);
      addSample((y * width + width - 1) * 4);
    }

    function median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] || 255;
    }

    const bg = {
      r: median(samples.r),
      g: median(samples.g),
      b: median(samples.b),
    };

    function distance(index) {
      const dr = data[index] - bg.r;
      const dg = data[index + 1] - bg.g;
      const db = data[index + 2] - bg.b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function pixelStats(index) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      return { r, g, b, brightness, chroma, dist: distance(index) };
    }

    function isFloodBackground(index) {
      const { brightness, chroma, dist } = pixelStats(index);
      return (
        dist < 58 ||
        (brightness > 218 && chroma < 30) ||
        (brightness > 198 && chroma < 18 && dist < 92)
      );
    }

    function isInteriorBackground(index) {
      const { brightness, chroma, dist } = pixelStats(index);
      return (
        dist < 30 ||
        (brightness > 242 && chroma < 20) ||
        (brightness > 224 && chroma < 16 && dist < 78)
      );
    }

    function softBackgroundAlpha(index) {
      const { brightness, chroma, dist } = pixelStats(index);
      if (isInteriorBackground(index)) return 0;
      if (brightness > 214 && chroma < 24 && dist < 98) return 70;
      if (brightness > 200 && chroma < 18 && dist < 118) return 120;
      return 255;
    }

    function foregroundMinimumAlpha(index) {
      const { r, g, b, brightness, chroma, dist } = pixelStats(index);
      if (dist < 42) return 0;
      const darkerThanBackground = bg.r - r > 54 || bg.g - g > 54 || bg.b - b > 54;
      if (brightness < 172 || (chroma > 46 && dist > 84) || dist > 122 || darkerThanBackground) return 225;
      return 0;
    }

    const visited = new Uint8Array(width * height);
    const queue = [];
    for (let x = 0; x < width; x += 1) {
      queue.push(x, (height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      queue.push(y * width, y * width + width - 1);
    }

    while (queue.length) {
      const pixel = queue.pop();
      if (visited[pixel]) continue;
      const index = pixel * 4;
      if (!isFloodBackground(index)) continue;
      visited[pixel] = 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) queue.push(pixel - 1);
      if (x < width - 1) queue.push(pixel + 1);
      if (y > 0) queue.push(pixel - width);
      if (y < height - 1) queue.push(pixel + width);
    }

    const alpha = new Uint8ClampedArray(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const index = pixel * 4;
      alpha[pixel] = visited[pixel] ? 0 : Math.max(softBackgroundAlpha(index), foregroundMinimumAlpha(index));
    }

    const smoothedAlpha = new Uint8ClampedArray(alpha);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const index = pixel * 4;
        const weighted =
          alpha[pixel] * 4 +
          alpha[pixel - 1] * 2 +
          alpha[pixel + 1] * 2 +
          alpha[pixel - width] * 2 +
          alpha[pixel + width] * 2 +
          alpha[pixel - width - 1] +
          alpha[pixel - width + 1] +
          alpha[pixel + width - 1] +
          alpha[pixel + width + 1];
        smoothedAlpha[pixel] = Math.max(Math.round(weighted / 16), foregroundMinimumAlpha(index));
      }
    }

    function cleanChannel(value, background, alphaValue) {
      if (alphaValue >= 250) return value;
      if (alphaValue <= 0) return value;
      const a = alphaValue / 255;
      return clamp(Math.round((value - background * (1 - a)) / a), 0, 255);
    }

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const index = pixel * 4;
      const alphaValue = smoothedAlpha[pixel];
      data[index] = cleanChannel(data[index], bg.r, alphaValue);
      data[index + 1] = cleanChannel(data[index + 1], bg.g, alphaValue);
      data[index + 2] = cleanChannel(data[index + 2], bg.b, alphaValue);
      data[index + 3] = alphaValue;
    }

    tctx.putImageData(imageData, 0, 0);
    const cutoutSrc = temp.toDataURL("image/png");
    const cutout = await loadImage(cutoutSrc);
    const cutoutCenter = croppedProductCenter(layerState, image);
    const nextName = `${(layer.name || imageName).replace(/\.[^.]+$/, "")}-cutout.png`;
    replaceSelectedLayerImage(layer.id, cutout, cutoutSrc, nextName, { x: cutoutCenter.x, y: cutoutCenter.y });
  }

  async function removeImageShadow() {
    const layer = getSelectedLayer(state);
    const image = layer ? productImagesRef.current[layer.id] : null;
    if (!layer || !image) return;
    const layerState = layerAsProductState(state, layer);
    const source = productSourceRect(image, layer.crop);
    if (!source) return;

    const temp = document.createElement("canvas");
    temp.width = source.sw;
    temp.height = source.sh;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, source.sw, source.sh);

    const imageData = tctx.getImageData(0, 0, temp.width, temp.height);
    const data = imageData.data;
    const width = temp.width;
    const height = temp.height;
    const samples = { r: [], g: [], b: [] };
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
    function addBgSample(index) {
      samples.r.push(data[index]);
      samples.g.push(data[index + 1]);
      samples.b.push(data[index + 2]);
    }
    for (let x = 0; x < width; x += step) {
      addBgSample(x * 4);
      addBgSample(((height - 1) * width + x) * 4);
    }
    for (let y = 0; y < height; y += step) {
      addBgSample((y * width) * 4);
      addBgSample((y * width + width - 1) * 4);
    }

    function median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] || 255;
    }

    const bg = {
      r: median(samples.r),
      g: median(samples.g),
      b: median(samples.b),
    };

    function stats(index) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      const brightness = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const dr = r - bg.r;
      const dg = g - bg.g;
      const db = b - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      return { r, g, b, a, brightness, chroma, dist };
    }

    function isForeground(index) {
      const { brightness, chroma, dist } = stats(index);
      return brightness < 136 || chroma > 44 || dist > 128;
    }

    function isShadowCandidate(index) {
      const { a, brightness, chroma, dist } = stats(index);
      if (isForeground(index)) return false;
      return (
        a < 32 ||
        brightness > 232 ||
        (brightness > 166 && chroma < 30 && dist < 118) ||
        (brightness > 138 && chroma < 16 && dist < 96)
      );
    }

    const visited = new Uint8Array(width * height);
    const queue = [];
    for (let x = 0; x < width; x += 1) {
      queue.push(x, (height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      queue.push(y * width, y * width + width - 1);
    }

    while (queue.length) {
      const pixel = queue.pop();
      if (visited[pixel]) continue;
      const index = pixel * 4;
      if (!isShadowCandidate(index)) continue;
      visited[pixel] = 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) queue.push(pixel - 1);
      if (x < width - 1) queue.push(pixel + 1);
      if (y > 0) queue.push(pixel - width);
      if (y < height - 1) queue.push(pixel + width);
    }

    for (let pass = 0; pass < 3; pass += 1) {
      const expanded = new Uint8Array(visited);
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const pixel = y * width + x;
          if (visited[pixel]) continue;
          const index = pixel * 4;
          if (!isShadowCandidate(index)) continue;
          const neighborCount =
            visited[pixel - 1] +
            visited[pixel + 1] +
            visited[pixel - width] +
            visited[pixel + width] +
            visited[pixel - width - 1] +
            visited[pixel - width + 1] +
            visited[pixel + width - 1] +
            visited[pixel + width + 1];
          if (neighborCount >= 2) expanded[pixel] = 1;
        }
      }
      visited.set(expanded);
    }

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const index = pixel * 4;
      const { a, brightness, chroma, dist } = stats(index);
      if (visited[pixel]) {
        data[index] = bg.r;
        data[index + 1] = bg.g;
        data[index + 2] = bg.b;
        data[index + 3] = 0;
      } else if (!isForeground(index) && brightness > 148 && chroma < 34 && dist < 122) {
        const cleanup = brightness > 204 ? 0.18 : 0.34;
        data[index] = clamp(Math.round(data[index] + (bg.r - data[index]) * 0.72), 0, 255);
        data[index + 1] = clamp(Math.round(data[index + 1] + (bg.g - data[index + 1]) * 0.72), 0, 255);
        data[index + 2] = clamp(Math.round(data[index + 2] + (bg.b - data[index + 2]) * 0.72), 0, 255);
        data[index + 3] = Math.round(a * cleanup);
      }
    }

    tctx.putImageData(imageData, 0, 0);
    const cleanedSrc = temp.toDataURL("image/png");
    const cleaned = await loadImage(cleanedSrc);
    const cleanedCenter = croppedProductCenter(layerState, image);
    const nextName = `${(layer.name || imageName).replace(/\.[^.]+$/, "")}-shadow-clean.png`;
    replaceSelectedLayerImage(layer.id, cleaned, cleanedSrc, nextName, { x: cleanedCenter.x, y: cleanedCenter.y });
  }

  async function createLineSketch() {
    const layer = getSelectedLayer(state);
    const image = layer ? productImagesRef.current[layer.id] : null;
    if (!layer || !image) return;
    const layerState = layerAsProductState(state, layer);
    const source = productSourceRect(image, layer.crop);
    if (!source) return;

    const temp = document.createElement("canvas");
    temp.width = source.sw;
    temp.height = source.sh;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, source.sw, source.sh);

    const imageData = tctx.getImageData(0, 0, temp.width, temp.height);
    const data = imageData.data;
    const width = temp.width;
    const height = temp.height;
    const samples = { r: [], g: [], b: [] };
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

    function addSample(index) {
      samples.r.push(data[index]);
      samples.g.push(data[index + 1]);
      samples.b.push(data[index + 2]);
    }

    for (let x = 0; x < width; x += step) {
      addSample(x * 4);
      addSample(((height - 1) * width + x) * 4);
    }
    for (let y = 0; y < height; y += step) {
      addSample((y * width) * 4);
      addSample((y * width + width - 1) * 4);
    }

    function median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] || 255;
    }

    const bg = {
      r: median(samples.r),
      g: median(samples.g),
      b: median(samples.b),
    };
    const gray = new Float32Array(width * height);
    const foreground = new Uint8Array(width * height);

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const index = pixel * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      const brightness = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const dr = r - bg.r;
      const dg = g - bg.g;
      const db = b - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      gray[pixel] = 255 - (0.299 * r + 0.587 * g + 0.114 * b);
      foreground[pixel] = a > 24 && (dist > 58 || brightness < 226 || chroma > 28) ? 1 : 0;
    }

    const lineCanvas = document.createElement("canvas");
    lineCanvas.width = width;
    lineCanvas.height = height;
    const lineCtx = lineCanvas.getContext("2d", { willReadFrequently: true });
    const lineData = lineCtx.createImageData(width, height);
    const out = lineData.data;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const gx =
          -gray[pixel - width - 1] -
          2 * gray[pixel - 1] -
          gray[pixel + width - 1] +
          gray[pixel - width + 1] +
          2 * gray[pixel + 1] +
          gray[pixel + width + 1];
        const gy =
          -gray[pixel - width - 1] -
          2 * gray[pixel - width] -
          gray[pixel - width + 1] +
          gray[pixel + width - 1] +
          2 * gray[pixel + width] +
          gray[pixel + width + 1];
        const gradient = Math.hypot(gx, gy);
        const boundary =
          foreground[pixel] !== foreground[pixel - 1] ||
          foreground[pixel] !== foreground[pixel + 1] ||
          foreground[pixel] !== foreground[pixel - width] ||
          foreground[pixel] !== foreground[pixel + width];
        const lineAlpha = boundary ? 245 : clamp(Math.round((gradient - 34) * 3.8), 0, 210);
        if (lineAlpha > 18 && (foreground[pixel] || boundary || gradient > 58)) {
          const index = pixel * 4;
          out[index] = 18;
          out[index + 1] = 30;
          out[index + 2] = 32;
          out[index + 3] = lineAlpha;
        }
      }
    }

    const thickened = new Uint8ClampedArray(out);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const index = pixel * 4;
        if (out[index + 3] > 170) {
          [pixel - 1, pixel + 1, pixel - width, pixel + width].forEach((neighbor) => {
            const neighborIndex = neighbor * 4;
            if (thickened[neighborIndex + 3] < 86) {
              thickened[neighborIndex] = 18;
              thickened[neighborIndex + 1] = 30;
              thickened[neighborIndex + 2] = 32;
              thickened[neighborIndex + 3] = 86;
            }
          });
        }
      }
    }
    lineData.data.set(thickened);
    lineCtx.putImageData(lineData, 0, 0);

    const sketchSrc = lineCanvas.toDataURL("image/png");
    const sketch = await loadImage(sketchSrc);
    const sketchCenter = croppedProductCenter(layerState, image);
    const nextName = `${(layer.name || imageName).replace(/\.[^.]+$/, "")}-line-sketch.png`;
    replaceSelectedLayerImage(
      layer.id,
      sketch,
      sketchSrc,
      nextName,
      { x: sketchCenter.x, y: sketchCenter.y },
      { adjustments: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, shadow: false } },
    );
  }

  function canvasPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const canvas = state.canvas || DEFAULT_CANVAS;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function canvasOverlayMetrics() {
    const canvasNode = canvasRef.current;
    const surface = canvasNode?.parentElement;
    if (!canvasNode || !surface) return null;
    const canvasRect = canvasNode.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const canvas = state.canvas || DEFAULT_CANVAS;
    return {
      left: canvasRect.left - surfaceRect.left,
      top: canvasRect.top - surfaceRect.top,
      scaleX: canvasRect.width / canvas.width,
      scaleY: canvasRect.height / canvas.height,
    };
  }

  function canvasToSurfaceStyle(x, y) {
    const metrics = canvasOverlayMetrics();
    if (!metrics) return null;
    return {
      left: metrics.left + x * metrics.scaleX,
      top: metrics.top + y * metrics.scaleY,
      scaleX: metrics.scaleX,
      scaleY: metrics.scaleY,
    };
  }

  function inlineDistanceStyle() {
    if (!selectedDistanceGuide) return null;
    const guide = selectedDistanceGuide;
    const x = guide.axis === "x" ? (guide.x1 + guide.x2) / 2 : guide.x + 46;
    const y = guide.axis === "x" ? guide.y - 18 : (guide.y1 + guide.y2) / 2;
    const converted = canvasToSurfaceStyle(x, y);
    if (!converted) return null;
    return {
      left: `${converted.left}px`,
      top: `${converted.top}px`,
      transform: "translate(-50%, -50%)",
    };
  }

  function inlineTextEditorStyle(annotation) {
    if (!annotation || annotation.type !== "text") return null;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const size = measureLabel(ctx, annotation.text, annotation);
    const converted = canvasToSurfaceStyle(annotation.label.x, annotation.label.y);
    if (!converted) return null;
    const scale = textScale(annotation);
    return {
      left: `${converted.left}px`,
      top: `${converted.top}px`,
      width: `${size.width * converted.scaleX}px`,
      height: `${size.height * converted.scaleY}px`,
      fontSize: `${36 * scale * converted.scaleY}px`,
      padding: `${18 * scale * converted.scaleY}px ${28 * scale * converted.scaleX}px`,
      borderColor: annotation.color,
      borderWidth: `${Math.max(2, 4 * converted.scaleX)}px`,
      borderRadius: `${size.radius * converted.scaleX}px`,
      boxShadow: (annotation.textStyle || "box") === "box"
        ? `inset ${Math.max(5, 7 * scale * converted.scaleX)}px 0 0 ${annotation.color}, 0 12px 26px rgba(20,34,38,0.14)`
        : "0 12px 26px rgba(20,34,38,0.12)",
      lineHeight: 1.18,
    };
  }

  function startInlineTextEdit(annotation) {
    if (!annotation || annotation.type !== "text") return;
    setState((current) => ({ ...current, selectedAnnotationId: annotation.id, activeTool: "annotation", distanceGuideAnnotationId: annotation.id }));
    setInlineTextDraft(annotation.text);
    setEditingTextAnnotationId(annotation.id);
  }

  function commitInlineTextEdit() {
    const id = editingTextAnnotationId;
    if (!id) return;
    setEditingTextAnnotationId("");
    setState((current) => {
      const annotation = current.annotations.find((item) => item.id === id);
      if (!annotation || annotation.text === inlineTextDraft) return current;
      pushHistory(current);
      return {
        ...current,
        annotations: current.annotations.map((item) => (item.id === id ? { ...item, text: inlineTextDraft } : item)),
      };
    });
  }

  function cancelInlineTextEdit() {
    setEditingTextAnnotationId("");
    setInlineTextDraft("");
  }

  function onCanvasDoubleClick(event) {
    if (viewMode === "pan") return;
    const point = canvasPoint(event);
    const ctx = canvasRef.current.getContext("2d");
    const hit = hitTestAnnotation(ctx, state.annotations, point);
    if (!hit || hit.part !== "label") return;
    const annotation = state.annotations.find((item) => item.id === hit.id);
    if (annotation?.type !== "text") return;
    event.preventDefault();
    event.stopPropagation();
    startInlineTextEdit(annotation);
  }

  function onCanvasViewportPointerDown(event) {
    if (viewMode !== "pan") {
      if (event.target === event.currentTarget) {
        setFloatingPanelPosition(null);
        setState((current) => ({ ...current, selectedAnnotationId: "", activeTool: "none", distanceGuideAnnotationId: "" }));
        commitInlineTextEdit();
      }
      return;
    }
    if (event.target?.closest?.("button, input, textarea, select, label")) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    viewDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function onCanvasViewportPointerMove(event) {
    const drag = viewDragRef.current;
    const viewport = canvasViewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    event.preventDefault();
    event.stopPropagation();
  }

  function onCanvasViewportPointerUp(event) {
    if (viewDragRef.current?.pointerId === event.pointerId) {
      viewDragRef.current = null;
    }
  }

  function onPointerDown(event) {
    if (viewMode === "pan") return;
    if (editingTextAnnotationId) commitInlineTextEdit();
    const point = canvasPoint(event);
    const ctx = canvasRef.current.getContext("2d");
    if (state.activeTool === "crop") {
      const layer = getSelectedLayer(state);
      const image = layer ? productImagesRef.current[layer.id] : null;
      const layerState = layerAsProductState(state, layer);
      const cropHandle = layer && image ? hitTestCrop(layerState, image, point) : null;
      if (cropHandle) {
        pushHistory(state);
        dragRef.current = { mode: "crop", handle: cropHandle, layerId: layer.id, last: point };
        return;
      }

      setState((current) => ({
        ...current,
        selectedAnnotationId: "",
        activeTool: "none",
        distanceGuideAnnotationId: "",
      }));
      return;
    }

    const hit = hitTestAnnotation(ctx, state.annotations, point);
    if (hit) {
      pushHistory(state);
      const hitAnnotation = state.annotations.find((annotation) => annotation.id === hit.id);
      const showDistanceGuides = hitAnnotation?.type === "text" && (hit.part === "label" || hit.part === "text-resize");
      setState((current) => ({
        ...current,
        selectedAnnotationId: hit.id,
        activeTool: "annotation",
        distanceGuideAnnotationId: showDistanceGuides ? hit.id : "",
      }));
      dragRef.current = { mode: hit.part, id: hit.id, last: point };
      return;
    }
    const productHit = hitTestProductLayer(state, productImagesRef.current, point);
    if (productHit?.part === "scale") {
      const layer = getProductLayers(state).find((item) => item.id === productHit.layerId);
      const image = layer ? productImagesRef.current[layer.id] : null;
      const layerState = layerAsProductState(state, layer);
      const box = productBox(layerState, image);
      const center = box ? { x: box.centerX, y: box.centerY } : { x: layer.product.x, y: layer.product.y };
      pushHistory(state);
      dragRef.current = {
        mode: "product-scale",
        layerId: productHit.layerId,
        last: point,
        center,
        startScale: layer.product.scale,
        startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      };
      productImageRef.current = image;
      setProductSrc(layer?.src || "");
      setImageName(layer?.name || "Product image");
      setState((current) => syncLegacyProductState({ ...current, selectedLayerId: productHit.layerId, selectedAnnotationId: "", activeTool: "product", distanceGuideAnnotationId: "" }, layer));
      return;
    }
    if (productHit?.part === "move") {
      pushHistory(state);
      const layer = getProductLayers(state).find((item) => item.id === productHit.layerId);
      productImageRef.current = layer ? productImagesRef.current[layer.id] || null : null;
      setProductSrc(layer?.src || "");
      setImageName(layer?.name || "Product image");
      dragRef.current = { mode: "product", layerId: productHit.layerId, last: point };
      setState((current) => syncLegacyProductState({ ...current, selectedLayerId: productHit.layerId, selectedAnnotationId: "", activeTool: "product", distanceGuideAnnotationId: "" }, layer));
      return;
    }

    setState((current) => ({
      ...current,
      selectedAnnotationId: "",
      activeTool: "none",
      distanceGuideAnnotationId: "",
    }));
  }

  function onPointerMove(event) {
    if (!dragRef.current) return;
    const point = canvasPoint(event);
    const drag = dragRef.current;
    const dx = point.x - drag.last.x;
    const dy = point.y - drag.last.y;
    dragRef.current = { ...drag, last: point };

    setState((current) => {
      if (drag.mode === "product") {
        const layers = getProductLayers(current);
        let selectedLayer = null;
        const nextLayers = layers.map((layer) => {
          if (layer.id !== drag.layerId) return layer;
          const image = productImagesRef.current[layer.id];
          const layerState = layerAsProductState(current, layer);
          const moved = { ...layer.product, x: layer.product.x + dx, y: layer.product.y + dy };
          selectedLayer = { ...layer, product: snapProductToGuides(layerState, image, moved) };
          return selectedLayer;
        });
        return syncLegacyProductState({ ...current, productLayers: nextLayers, selectedLayerId: drag.layerId }, selectedLayer);
      }
      if (drag.mode === "product-scale") {
        const layers = getProductLayers(current);
        const center = drag.center || getSelectedLayer(current)?.product || current.product;
        const distance = Math.max(1, Math.hypot(point.x - center.x, point.y - center.y));
        let selectedLayer = null;
        const nextLayers = layers.map((layer) => {
          if (layer.id !== drag.layerId) return layer;
          selectedLayer = { ...layer, product: { ...layer.product, scale: clamp(drag.startScale * (distance / drag.startDistance), PRODUCT_SCALE_MIN, PRODUCT_SCALE_MAX) } };
          return selectedLayer;
        });
        return syncLegacyProductState({ ...current, productLayers: nextLayers, selectedLayerId: drag.layerId }, selectedLayer);
      }
      if (drag.mode === "product-rotate") {
        const center = drag.center || getSelectedLayer(current)?.product || current.product;
        const currentAngle = angleBetween(center, point);
        const rotation = normalizeDegrees(drag.startRotation + currentAngle - drag.startAngle);
        let selectedLayer = null;
        const nextLayers = getProductLayers(current).map((layer) => {
          if (layer.id !== drag.layerId) return layer;
          selectedLayer = { ...layer, product: { ...layer.product, rotation } };
          return selectedLayer;
        });
        return syncLegacyProductState({ ...current, productLayers: nextLayers, selectedLayerId: drag.layerId }, selectedLayer);
      }
      if (drag.mode === "crop") {
        const layer = getProductLayers(current).find((item) => item.id === drag.layerId);
        const image = layer ? productImagesRef.current[layer.id] : null;
        const layerState = layerAsProductState(current, layer);
        const box = fullProductBox(layerState, image);
        if (!box) return current;
        const dxPct = (dx / Math.max(1, box.width)) * 100;
        const dyPct = (dy / Math.max(1, box.height)) * 100;
        const next = { ...layer.crop };
        if (drag.handle.includes("w")) next.left += dxPct;
        if (drag.handle.includes("e")) next.right += dxPct;
        if (drag.handle.includes("n")) next.top += dyPct;
        if (drag.handle.includes("s")) next.bottom += dyPct;
        next.left = clamp(next.left, 0, next.right - 5);
        next.right = clamp(next.right, next.left + 5, 100);
        next.top = clamp(next.top, 0, next.bottom - 5);
        next.bottom = clamp(next.bottom, next.top + 5, 100);
        const nextLayer = { ...layer, crop: next };
        const nextLayers = getProductLayers(current).map((item) => (item.id === drag.layerId ? nextLayer : item));
        return syncLegacyProductState({ ...current, productLayers: nextLayers, selectedLayerId: drag.layerId }, nextLayer);
      }
      return {
        ...current,
        annotations: current.annotations.map((annotation) => {
          if (annotation.id !== drag.id) return annotation;
          if (drag.mode === "point") return { ...annotation, point: { x: annotation.point.x + dx, y: annotation.point.y + dy } };
          if (drag.mode === "radius" && isResizableCallout(annotation)) {
            const range = calloutRadiusRange(annotation.type);
            const rawRadius = Math.hypot(point.x - annotation.point.x, point.y - annotation.point.y) - resizeHandlePadding(annotation.type);
            return { ...annotation, radius: Math.round(clamp(rawRadius, range.min, range.max)) };
          }
          if (drag.mode === "end") {
            const currentEnd = annotation.end || { x: annotation.point.x + 320, y: annotation.point.y };
            return { ...annotation, end: { x: currentEnd.x + dx, y: currentEnd.y + dy } };
          }
          if (drag.mode === "dimension-line" && annotation.type === "dimension") {
            const geometry = dimensionLineGeometry(annotation);
            const offsetDelta = dx * geometry.nx + dy * geometry.ny;
            return {
              ...annotation,
              offset: geometry.offset + offsetDelta,
              label: {
                x: annotation.label.x + geometry.nx * offsetDelta,
                y: annotation.label.y + geometry.ny * offsetDelta,
              },
            };
          }
          if (drag.mode === "line") {
            const currentEnd = annotation.end || { x: annotation.point.x + 320, y: annotation.point.y };
            const currentLabel = annotation.label || {
              x: (annotation.point.x + currentEnd.x) / 2,
              y: (annotation.point.y + currentEnd.y) / 2,
            };
            return {
              ...annotation,
              point: { x: annotation.point.x + dx, y: annotation.point.y + dy },
              end: { x: currentEnd.x + dx, y: currentEnd.y + dy },
              label: { x: currentLabel.x + dx, y: currentLabel.y + dy },
            };
          }
          if (drag.mode === "text-resize" && annotation.type === "text") {
            return {
              ...annotation,
              boxWidth: Math.round(clamp((annotation.boxWidth || measureLabel(canvasRef.current.getContext("2d"), annotation.text, annotation).width) + dx, 160, 1400)),
              boxHeight: Math.round(clamp((annotation.boxHeight || measureLabel(canvasRef.current.getContext("2d"), annotation.text, annotation).height) + dy, 70, 1000)),
              manualBoxWidth: true,
              manualBoxHeight: true,
            };
          }
          const nextLabel = { x: annotation.label.x + dx, y: annotation.label.y + dy };
          const snappedLabel = drag.mode === "label"
            ? snapTextLabelToObjectAlignment(canvasRef.current.getContext("2d"), current, productImagesRef.current, annotation, nextLabel)
            : nextLabel;
          return { ...annotation, label: snappedLabel };
        }),
      };
    });
  }

  function onPointerUp() {
    dragRef.current = null;
    setState((current) => current.distanceGuideAnnotationId ? { ...current, distanceGuideAnnotationId: "" } : current);
  }

  function exportImage(format) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    drawScene(ctx, state, { productImages: productImagesRef.current, backgroundImage: backgroundImageRef.current }, { showSelection: false });
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    let url = canvas.toDataURL(mime, 0.94);
    if (format === "jpg" && state.background.mode === "transparent") {
      const jpgCanvas = document.createElement("canvas");
      jpgCanvas.width = canvas.width;
      jpgCanvas.height = canvas.height;
      const jpgCtx = jpgCanvas.getContext("2d");
      jpgCtx.fillStyle = "#ffffff";
      jpgCtx.fillRect(0, 0, jpgCanvas.width, jpgCanvas.height);
      jpgCtx.drawImage(canvas, 0, 0);
      url = jpgCanvas.toDataURL(mime, 0.94);
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedVariant.toLowerCase()}-${format === "jpg" ? "export.jpg" : "export.png"}`;
    link.click();
    drawScene(ctx, state, { productImages: productImagesRef.current, backgroundImage: backgroundImageRef.current }, { showSelection: true });
  }

  function clampFloatingPanel(left, top) {
    return {
      left: clamp(left, 12, Math.max(12, window.innerWidth - 332)),
      top: clamp(top, 12, Math.max(12, window.innerHeight - 320)),
    };
  }

  function onFloatingPanelPointerDown(event) {
    event.stopPropagation();
    const tagName = event.target?.tagName?.toLowerCase();
    if (["button", "input", "textarea", "select", "label"].includes(tagName)) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const panelRect = event.currentTarget.getBoundingClientRect();
    panelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    setFloatingPanelPosition(clampFloatingPanel(panelRect.left, panelRect.top));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onFloatingPanelPointerMove(event) {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    setFloatingPanelPosition(clampFloatingPanel(
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY,
    ));
  }

  function onFloatingPanelPointerUp(event) {
    if (panelDragRef.current?.pointerId === event.pointerId) {
      panelDragRef.current = null;
    }
  }

  function floatingSelectedStyle() {
    if (!selectedAnnotation) return {};
    if (floatingPanelPosition) {
      return {
        left: `${floatingPanelPosition.left}px`,
        top: `${floatingPanelPosition.top}px`,
      };
    }
    const canvas = state.canvas || DEFAULT_CANVAS;
    const anchor = selectedAnnotation.label || selectedAnnotation.point;
    const canvasNode = canvasRef.current;
    const viewport = canvasViewportRef.current;
    if (canvasNode && viewport) {
      const canvasRect = canvasNode.getBoundingClientRect();
      const rawLeft = canvasRect.left + (anchor.x / canvas.width) * canvasRect.width + 18;
      const rawTop = canvasRect.top + (anchor.y / canvas.height) * canvasRect.height - 24;
      const clamped = clampFloatingPanel(rawLeft, rawTop);
      return {
        left: `${clamped.left}px`,
        top: `${clamped.top}px`,
      };
    }
    const xPercent = clamp(((anchor.x + 180) / canvas.width) * 100, 6, 68);
    const yPercent = clamp(((anchor.y - 36) / canvas.height) * 100, 6, 70);
    return {
      left: `${xPercent}%`,
      top: `${yPercent}%`,
    };
  }

  function productSelectionOverlayMetrics() {
    const layer = getSelectedLayer(state);
    const image = layer ? productImagesRef.current[layer.id] : null;
    if (state.activeTool !== "product" || !layer || !image) return null;
    const canvas = state.canvas || DEFAULT_CANVAS;
    const layerState = layerAsProductState(state, layer);
    const box = productBox(layerState, image);
    const canvasNode = canvasRef.current;
    const wrapper = canvasNode?.parentElement;
    if (!box || !canvasNode || !wrapper) return null;
    const canvasRect = canvasNode.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    return {
      style: {
        left: `${canvasRect.left - wrapperRect.left + box.left * scaleX}px`,
        top: `${canvasRect.top - wrapperRect.top + box.top * scaleY}px`,
        width: `${box.width * scaleX}px`,
        height: `${box.height * scaleY}px`,
        transform: `rotate(${layer.product.rotation}deg)`,
      },
      widthPx: Math.round(box.width),
      heightPx: Math.round(box.height),
      rotation: layer.product.rotation,
      layerId: layer.id,
    };
  }

  function onProductOverlayPointerDown(event) {
    if (viewMode === "pan") return;
    const layer = getSelectedLayer(state);
    const image = layer ? productImagesRef.current[layer.id] : null;
    if (!layer || !image || state.activeTool !== "product") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(event);
    const layerState = layerAsProductState(state, layer);
    const box = productBox(layerState, image);
    const isHandle = Boolean(event.target?.dataset?.productHandle);
    const isRotateHandle = Boolean(event.target?.closest?.("[data-product-rotate]"));
    pushHistory(state);
    if (isRotateHandle) {
      const center = box ? { x: box.centerX, y: box.centerY } : { x: layer.product.x, y: layer.product.y };
      dragRef.current = {
        mode: "product-rotate",
        layerId: layer.id,
        last: point,
        center,
        startAngle: angleBetween(center, point),
        startRotation: layer.product.rotation,
      };
    } else if (isHandle) {
      const center = box ? { x: box.centerX, y: box.centerY } : { x: layer.product.x, y: layer.product.y };
      dragRef.current = {
        mode: "product-scale",
        layerId: layer.id,
        last: point,
        center,
        startScale: layer.product.scale,
        startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      };
    } else {
      dragRef.current = { mode: "product", layerId: layer.id, last: point };
    }
    setState((current) => syncLegacyProductState({ ...current, selectedAnnotationId: "", activeTool: "product" }, layer));
  }

  const productOverlay = productSelectionOverlayMetrics();

  return (
    <div className="editorShell">
      <aside className="leftRail">
        <div className="brandBlock">
          <div className="brandMark">PI</div>
          <div>
            <h1>Product Image Studio</h1>
            <p>Open-source product image editor</p>
          </div>
        </div>

        <section className="panel">
          <div className="panelTitle">
            <Move size={17} />
            Canvas size
          </div>
          <div className="canvasSizeGrid">
            <label>
              <span>Width px</span>
              <input
                type="number"
                min="600"
                max="4000"
                step="10"
                value={canvasDraft.width}
                onChange={(event) => setCanvasDraft((current) => ({ ...current, width: event.target.value }))}
              />
            </label>
            <label>
              <span>Height px</span>
              <input
                type="number"
                min="600"
                max="4000"
                step="10"
                value={canvasDraft.height}
                onChange={(event) => setCanvasDraft((current) => ({ ...current, height: event.target.value }))}
              />
            </label>
          </div>
          <button className="softButton fullWidth" onClick={applyCanvasSize}>Apply size</button>
          <p className="hint">{canvasSize.width} x {canvasSize.height} px export canvas</p>
        </section>

        <section className="panel brandLibraryPanel">
          <div className="panelTitle">
            <Palette size={17} />
            Brand colors
          </div>
          <button className="softButton fullWidth" onClick={() => setBrandLibraryOpen((open) => !open)}>
            <Palette size={16} />
            {brandLibraryOpen ? "Close color library" : "Open color library"}
          </button>
          <div className="brandMiniSwatches" aria-label="Saved brand color preview">
            {brandColors.slice(0, 8).map((color) => (
              <span key={`brand-preview-${color}`} className="brandMiniSwatch" style={{ background: color }} />
            ))}
          </div>
          {brandLibraryOpen && (
            <div className="brandLibraryPopover">
              <div className="brandAddRow">
                <input
                  type="color"
                  value={brandColorDraft}
                  onChange={(event) => setBrandColorDraft(event.target.value)}
                  aria-label="Pick brand color"
                />
                <button className="primaryButton" onClick={() => addBrandColor()}>
                  <Plus size={15} />
                  Add
                </button>
              </div>
              <div className="brandLibraryList">
                {brandColors.map((color) => (
                  <div className="brandLibraryItem" key={`brand-library-${color}`}>
                    <button
                      className="brandColorSelect"
                      style={{ background: color }}
                      title={color}
                      onClick={() => setBrandColorDraft(color)}
                    />
                    <span>{color}</span>
                    <button
                      className="brandDeleteButton"
                      title={`Delete ${color}`}
                      onClick={() => removeBrandColor(color)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {!brandColors.length && <p className="hint">Use the picker above to add the first brand color.</p>}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panelTitle">
            <ImagePlus size={17} />
            Product
          </div>
          <label className="fileButton">
            <Upload size={16} />
            Upload photos
            <input type="file" accept="image/*" multiple onChange={onProductUpload} />
          </label>
          <div className="fileName">{selectedLayer?.name || imageName}</div>
          <div className="layerList" aria-label="Image layers">
            {productLayers.map((layer, index) => (
              <button
                key={layer.id}
                className={layer.id === state.selectedLayerId ? "layerItem active" : "layerItem"}
                onClick={() => selectProductLayer(layer.id)}
              >
                <span className="layerIndex">{index + 1}</span>
                <span className="layerName">{layer.name || "Product image"}</span>
              </button>
            ))}
            {!productLayers.length && <p className="hint">Upload, drag, or paste images to add layers.</p>}
          </div>
          <p className="hint productKeyHint">Click a layer or image to select. Delete removes selected image. Shift + arrows move 10px.</p>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <ArrowDownToLine size={17} />
            Export
          </div>
          <div className="buttonGrid">
            <button className="primaryButton" onClick={() => exportImage("png")}>
              <Download size={16} />
              PNG
            </button>
            <button className="darkButton" onClick={() => exportImage("jpg")}>
              <Download size={16} />
              JPG
            </button>
          </div>
          <p className="hint">Exports {canvasSize.width} x {canvasSize.height}. Selection outlines are hidden in the final file.</p>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <Save size={17} />
            Project history
          </div>
          <button className="primaryButton fullWidth" onClick={saveProjectHistory}>
            <Save size={16} />
            Save current
          </button>
          <div className="historyList">
            {projectHistory.map((entry) => (
              <button key={entry.id} className="historyItem" onClick={() => loadProjectHistory(entry)}>
                <img src={entry.thumbnail} alt="" />
                <span>
                  <strong>{entry.name}</strong>
                  <small>{new Date(entry.savedAt).toLocaleString()}</small>
                </span>
              </button>
            ))}
            {!projectHistory.length && <p className="hint">Saved projects will appear here next time you open the studio.</p>}
          </div>
        </section>
      </aside>

      <main className="stageColumn">
        <header className="topbar">
          <div>
            <h2>Canvas</h2>
            <p>Drag product, annotation point, or label box directly on the image.</p>
          </div>
          <div className="topbarActions">
            <div className="toolSwitch">
              <button className={state.activeTool === "product" ? "active" : ""} onClick={() => updateUiState({ activeTool: "product", selectedAnnotationId: "" })}>
                <Move size={16} />
                Product
              </button>
              <button className={state.activeTool === "annotation" ? "active" : ""} onClick={() => updateUiState({ activeTool: "annotation" })}>
                <MousePointer2 size={16} />
                Annotation
              </button>
              <button onClick={resetLayout}>
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
            <div className="viewSwitch">
              <button className={viewMode === "pan" ? "active" : ""} onClick={() => setViewMode((mode) => (mode === "pan" ? "edit" : "pan"))} title="Pan view">
                <Hand size={16} />
                Pan
              </button>
              <button onClick={() => setCanvasViewZoom((zoom) => zoom - 0.15)} title="Zoom out">
                <ZoomOut size={16} />
              </button>
              <span className="zoomReadout">{Math.round(viewZoom * 100)}%</span>
              <button onClick={() => setCanvasViewZoom((zoom) => zoom + 0.15)} title="Zoom in">
                <ZoomIn size={16} />
              </button>
              <button onClick={fitCanvasView} title="Fit canvas">
                <Maximize2 size={16} />
                Fit
              </button>
            </div>
          </div>
        </header>

        <div
          ref={canvasViewportRef}
          className={viewMode === "pan" ? "canvasWrap isPanning" : "canvasWrap"}
          onPointerDownCapture={onCanvasViewportPointerDown}
          onPointerMove={onCanvasViewportPointerMove}
          onPointerUp={onCanvasViewportPointerUp}
          onPointerCancel={onCanvasViewportPointerUp}
        >
          <div className="canvasSurface">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={canvasStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onDoubleClick={onCanvasDoubleClick}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onCanvasDrop}
            />
            {selectedDistanceGuide && selectedAnnotation?.type === "text" && (
              <InlineDistanceInput
                guide={selectedDistanceGuide}
                style={inlineDistanceStyle()}
                onApply={(gap) => applySelectedDistanceGap(selectedDistanceGuide, gap)}
              />
            )}
            {editingTextAnnotation && (
              <textarea
                ref={inlineTextEditorRef}
                className="inlineTextEditor"
                style={inlineTextEditorStyle(editingTextAnnotation)}
                value={inlineTextDraft}
                onChange={(event) => setInlineTextDraft(event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onBlur={commitInlineTextEdit}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") cancelInlineTextEdit();
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur();
                }}
              />
            )}
            {productOverlay && (
              <div
                className="productSelectionOverlay"
                style={productOverlay.style}
                onPointerDown={onProductOverlayPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onLostPointerCapture={onPointerUp}
              >
                <span className="productDimensionBadge widthBadge">{productOverlay.widthPx} px W</span>
                <span className="productDimensionBadge heightBadge">{productOverlay.heightPx} px H</span>
                <button className="productRotateHandle" data-product-rotate="true" title="Drag to rotate">
                  <RotateCw size={18} />
                </button>
                <span className="productRotationBadge">{productOverlay.rotation}°</span>
                {["nw", "ne", "se", "sw"].map((handle) => (
                  <span key={handle} className={`productHandle ${handle}`} data-product-handle={handle} />
                ))}
              </div>
            )}
            {selectedAnnotation && (
            <div
              className="floatingSelectedPanel"
              style={floatingSelectedStyle()}
              onPointerDown={onFloatingPanelPointerDown}
              onPointerMove={onFloatingPanelPointerMove}
              onPointerUp={onFloatingPanelPointerUp}
              onLostPointerCapture={onFloatingPanelPointerUp}
            >
              <div className="floatingPanelTitle">
                <MousePointer2 size={16} />
                Selected item
                <span>Drag panel</span>
              </div>
              {!dimensionTypes.has(selectedAnnotation.type) && (
                <div className="calloutTypeGrid" aria-label="Callout style">
                  {calloutTypes.map((type) => (
                    <button
                      key={type.id}
                      className={selectedAnnotation.type === type.id ? "active" : ""}
                      onClick={() => applyAnnotationType(type.id)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              )}
              {isResizableCallout(selectedAnnotation) && (
                <CalloutSizeControl
                  annotation={selectedAnnotation}
                  onChange={(radius) => updateSelectedAnnotation({ radius })}
                />
              )}
              {selectedAnnotation.type === "text" && (
                <div className="textStyleBlock">
                  <span>Text style</span>
                  <div className="textStyleGrid">
                    {[
                      ["box", "Box"],
                      ["border", "Border"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={(selectedAnnotation.textStyle || "box") === value ? "active" : ""}
                        onClick={() => updateSelectedAnnotation({ textStyle: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    className={(selectedAnnotation.verticalAlign || "top") === "center" ? "textCenterButton active" : "textCenterButton"}
                    onClick={() => updateSelectedAnnotation({ verticalAlign: (selectedAnnotation.verticalAlign || "top") === "center" ? "top" : "center" })}
                  >
                    Center text
                  </button>
                  <div className="layoutToolBlock">
                    <span>Object alignment</span>
                    <div className="textStyleGrid">
                      <button onClick={() => alignSelectedTextToReference("left")}>Align left</button>
                      <button onClick={() => alignSelectedTextToReference("center")}>Align center</button>
                    </div>
                  </div>
                </div>
              )}
              {!dimensionTypes.has(selectedAnnotation.type) && (
                <TextSizeControl
                  annotation={selectedAnnotation}
                  onChange={(fontSize) => updateSelectedAnnotation({ fontSize })}
                />
              )}
              {selectedAnnotation.type !== "line" && selectedAnnotation.type !== "text" && (
                <textarea
                  value={selectedAnnotation.text}
                  rows={3}
                  onChange={(event) => updateSelectedAnnotation({ text: event.target.value })}
                />
              )}
              <label className="colorRow compactColorRow">
                <span>Color</span>
                <input type="color" value={selectedAnnotation.color} onChange={(event) => applyAnnotationColor(event.target.value)} />
              </label>
              <div className="paletteColumns compactPalette">
                <div>
                  <span className="paletteLabel">Image colors</span>
                  <div className="swatchGrid">
                    {imageColors.map((color) => (
                      <button
                        key={`floating-image-${color}`}
                        className={selectedAnnotation.color === color ? "swatch active" : "swatch"}
                        style={{ background: color }}
                        title={color}
                        onClick={() => applyAnnotationColor(color)}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <span className="paletteLabel">Brand colors</span>
                  <div className="swatchGrid">
                    {brandColors.map((color) => (
                      <button
                        key={`floating-brand-${color}`}
                        className={selectedAnnotation.color === color ? "swatch active" : "swatch"}
                        style={{ background: color }}
                        title={color}
                        onClick={() => applyAnnotationColor(color)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="hint darkHint">Press Delete to remove it.</p>
            </div>
            )}
          </div>
          <div className="floatingEditActions">
            <button onClick={undo} disabled={!history.past.length} title="Undo">
              <Undo2 size={17} />
              Undo
            </button>
            <button onClick={redo} disabled={!history.future.length} title="Redo">
              <Redo2 size={17} />
              Redo
            </button>
          </div>
        </div>
      </main>

      <aside className="rightRail">
        <section className="panel">
          <div className="panelTitle">
            <Wand2 size={17} />
            Retouch tools
          </div>
          <div className="buttonGrid">
            <button className="primaryButton" onClick={cutOutBackground}>
              <Wand2 size={16} />
              Cutout
            </button>
            <button className="softButton" onClick={removeImageShadow}>
              <Eraser size={16} />
              Clean shadow
            </button>
            <button className="softButton" onClick={createLineSketch}>
              <Crosshair size={16} />
              Line sketch
            </button>
            <button
              className={state.activeTool === "crop" ? "primaryButton" : "softButton"}
              onClick={() => updateUiState({ activeTool: state.activeTool === "crop" ? "product" : "crop", selectedAnnotationId: "" })}
            >
              <Scissors size={16} />
              Crop
            </button>
          </div>
          <p className="hint darkHint">
            Click Crop, then drag the orange scissors border on the canvas.
          </p>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <Sparkles size={17} />
            Composition guides
          </div>
          <div className="compositionGrid">
            {Object.entries(compositionPresets).map(([id, preset]) => (
              <button
                key={id}
                className={state.composition === id ? "active" : ""}
                onClick={() => updateUiState({ composition: id })}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <p className="hint darkHint">Adds shopping-scene composition lines. Center and golden lines stay active in Product mode.</p>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <Sparkles size={17} />
            Image tuning
          </div>
          <Slider label="Brightness" min={70} max={140} value={(selectedLayer?.adjustments || DEFAULT_ADJUSTMENTS).brightness} onChange={(brightness) => updateAdjustments({ brightness })} suffix="%" />
          <Slider label="Contrast" min={70} max={150} value={(selectedLayer?.adjustments || DEFAULT_ADJUSTMENTS).contrast} onChange={(contrast) => updateAdjustments({ contrast })} suffix="%" />
          <Slider label="Saturation" min={70} max={140} value={(selectedLayer?.adjustments || DEFAULT_ADJUSTMENTS).saturation} onChange={(saturation) => updateAdjustments({ saturation })} suffix="%" />
          <Slider label="Sharpness" min={0} max={70} value={(selectedLayer?.adjustments || DEFAULT_ADJUSTMENTS).sharpness} onChange={(sharpness) => updateAdjustments({ sharpness })} />
          <label className="toggleRow">
            <span>Soft shadow</span>
            <input type="checkbox" checked={(selectedLayer?.adjustments || DEFAULT_ADJUSTMENTS).shadow} onChange={(event) => updateAdjustments({ shadow: event.target.checked })} />
          </label>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <ImagePlus size={17} />
            Background
          </div>
          <div className="segmented">
            {[
              ["transparent", "Transparent"],
              ["white", "White"],
              ["grid", "Grid"],
              ["soft", "Soft"],
              ["dark", "Dark"],
            ].map(([mode, label]) => (
              <button key={mode} className={state.background.mode === mode ? "active" : ""} onClick={() => updateBackground({ mode })}>{label}</button>
            ))}
          </div>
          <label className="fileButton compact">
            <Upload size={16} />
            Upload background
            <input type="file" accept="image/*" onChange={onBackgroundUpload} />
          </label>
          {state.background.mode === "uploaded" && (
            <Slider label="White wash" min={0} max={85} value={state.background.wash} onChange={(wash) => updateBackground({ wash })} suffix="%" />
          )}
        </section>

        <section className="panel">
          <div className="panelTitle">
            <Crosshair size={17} />
            Callouts
          </div>
          <div className="buttonGrid four">
            <button className="softButton" onClick={() => addAnnotation("dot")}>
              <Plus size={15} />
              Dot
            </button>
            <button className="softButton" onClick={() => addAnnotation("text")}>
              <Type size={15} />
              Text
            </button>
            <button className="softButton" onClick={() => addAnnotation("circle")}>
              <Circle size={15} />
              Circle
            </button>
            <button className="softButton" onClick={() => addAnnotation("arrow")}>
              <Plus size={15} />
              Arrow
            </button>
            <button className="softButton" onClick={() => addAnnotation("highlight")}>
              <Circle size={15} />
              Highlight
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <Scissors size={17} />
            Dimensions
          </div>
          <div className="buttonGrid three">
            <button className="softButton wideButton" onClick={() => addAnnotation("dimension")}>Dim</button>
            <button className="softButton" onClick={() => addAnnotation("diameter")}>Ø Dim</button>
            <button className="softButton" onClick={() => addAnnotation("line")}>Line</button>
          </div>
        </section>

      </aside>
    </div>
  );
}
