# Product Image Studio

Product Image Studio is an open-source, browser-based editor for ecommerce product images. It helps you clean up product photos, create callouts, add engineering-style dimensions, align text boxes, remove backgrounds, and export listing-ready PNG/JPG images.

This repository is a public, generic version of an internal product-image workflow tool. It does not include private product photos, local file paths, brand-specific templates, or store-specific upload credentials.

## Features

- Multi-image canvas with upload, drag-and-drop, and clipboard paste.
- Product move, scale, crop, rotate, and transparent-background export.
- One-click cutout for white, light, and solid-color backgrounds.
- Clean-shadow tool for reducing harsh product-photo shadows.
- Text boxes with box/border styles, inline double-click editing, resizing, and independent styling.
- Callouts with dot, circle, arrow, and highlight markers.
- Engineering-style dimensions, diameter labels, and free-angle line annotations.
- Alignment guides, center/golden-ratio guides, and pixel-gap distance guides.
- Manual pixel-gap editing directly on the canvas.
- Undo/redo for recent editing steps.
- Local browser project history and local brand color library.
- PNG and JPG export.

## Quick Start

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5177
```

Build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Basic Workflow

1. Upload, paste, or drag a product image onto the canvas.
2. Use `Cutout` to remove a simple background.
3. Use `Crop`, scale, rotate, and image tuning to prepare the product image.
4. Add text boxes, callouts, and dimensions.
5. Use alignment and pixel-gap guides to make repeated labels consistent.
6. Choose white, transparent, grid, soft, dark, or uploaded background.
7. Export PNG for transparency, or JPG for a white-backed ecommerce image.

## Batch Image API

The local server also includes optional batch image endpoints for scanning and processing a source folder.

Set these environment variables when needed:

```bash
PRODUCT_IMAGE_SOURCE=/path/to/source/images
PRODUCT_IMAGE_OUTPUT=/path/to/output
```

Then run:

```bash
npm run dev
```

The browser editor does not require these variables.

## Privacy Notes

- No product images are bundled with this repository.
- No private local paths are required.
- Browser project history and brand colors are stored locally in your browser.
- Exported files are generated in the browser unless you use the optional local batch API.

## Roadmap

- Better object-aware background removal.
- More ecommerce layout templates.
- Keyboard-accessible layer management.
- Batch template application.
- Optional hosted demo.
- Plugin hooks for export pipelines.

## License

MIT License. See [LICENSE](./LICENSE).

---

# Product Image Studio 中文说明

Product Image Studio 是一个开源的浏览器端产品图编辑工具，适合电商产品图、工业产品说明图、Shopify/独立站详情图等场景。它可以帮助你完成抠图、裁剪、旋转、标注、尺寸线、文字框、透明底导出等工作。

这个仓库是从内部图片工作流工具整理出的通用开源版本，不包含私有产品图片、本地路径、品牌专用模板或店铺上传凭证。

## 功能

- 多图片画布：支持上传、拖拽、剪贴板粘贴图片。
- 图片移动、缩放、裁剪、旋转、透明底导出。
- 一键抠图：支持白底、浅色背景和纯色背景。
- 去阴影：减少产品图底部或边缘阴影。
- Text 文字框：支持方框/边框样式、双击框内编辑、拉伸尺寸、独立颜色和字体大小。
- 标注：支持点、圆圈、箭头、高亮效果。
- 工程尺寸：支持尺寸线、直径标注、自由角度线条。
- 对齐辅助：支持中心线、黄金线、左侧对齐、中间对齐、像素间距提示。
- 像素间距可直接在画布上输入修改。
- 撤销/重做最近步骤。
- 本地项目历史和本地品牌色库。
- PNG/JPG 导出。

## 快速开始

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:5177
```

构建：

```bash
npm run build
```

预览构建结果：

```bash
npm run preview
```

## 基础使用流程

1. 上传、粘贴或拖拽产品图片到画布。
2. 使用 `Cutout` 去除简单背景。
3. 使用 `Crop`、缩放、旋转和图像调节处理产品主体。
4. 添加文字框、标注和尺寸线。
5. 使用对齐线和像素间距提示，让多个说明框保持统一。
6. 选择白底、透明底、网格、柔和背景、深色背景或上传背景。
7. 需要透明底时导出 PNG，需要普通电商白底图时导出 JPG。

## 可选批量图片接口

本地服务器保留了可选的批量图片扫描和处理接口。只有在你需要批量处理本地图片文件夹时才需要配置。

```bash
PRODUCT_IMAGE_SOURCE=/path/to/source/images
PRODUCT_IMAGE_OUTPUT=/path/to/output
```

然后运行：

```bash
npm run dev
```

浏览器编辑器本身不依赖这些环境变量。

## 隐私说明

- 仓库不附带任何产品图片。
- 仓库不依赖任何私人本地路径。
- 项目历史和品牌色保存在浏览器本地。
- 普通导出在浏览器中完成；只有使用可选批量接口时才会读写本地文件夹。

## 后续方向

- 更好的产品主体识别和背景移除。
- 更多电商布局模板。
- 更完善的图层管理。
- 批量模板应用。
- 在线 Demo。
- 可扩展的导出插件接口。

## 许可证

MIT License，详见 [LICENSE](./LICENSE)。
