#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://api.figma.com/v1";
const DEFAULT_OUT_DIR = ".figma";
const DEFAULT_FORMAT = "png";
const DEFAULT_SCALE = "2";
const RENDERABLE_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "GROUP",
  "SECTION",
]);

function usage() {
  return `
Usage:
  npm run figma:pull -- <figma-url-or-file-key> [options]

Options:
  --ids <id,id>          Override URL node-id and export these node IDs.
  --out <dir>           Output directory. Default: ${DEFAULT_OUT_DIR}
  --format <fmt>        png, jpg, svg, or pdf. Default: ${DEFAULT_FORMAT}
  --scale <n>           Render scale for PNG/JPG. Default: ${DEFAULT_SCALE}
  --depth <n>           Optional Figma API depth when reading the file.
  --image-fills         Download image fills used by selected nodes.
  --no-render           Pull JSON only, skip rendered node images.
  --help                Show this help.

Env:
  FIGMA_PERSONAL_TOKEN, FIGMA_TOKEN, or FIGMA_ACCESS_TOKEN
`.trim();
}

function parseArgs(argv) {
  const args = {
    input: "",
    ids: [],
    outDir: DEFAULT_OUT_DIR,
    format: DEFAULT_FORMAT,
    scale: DEFAULT_SCALE,
    depth: "",
    imageFills: false,
    render: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--ids") {
      args.ids = required(argv, ++index, "--ids").split(",").map(normalizeNodeId).filter(Boolean);
    } else if (value === "--out") args.outDir = required(argv, ++index, "--out");
    else if (value === "--format") args.format = required(argv, ++index, "--format").toLowerCase();
    else if (value === "--scale") args.scale = required(argv, ++index, "--scale");
    else if (value === "--depth") args.depth = required(argv, ++index, "--depth");
    else if (value === "--image-fills") args.imageFills = true;
    else if (value === "--no-render") args.render = false;
    else if (!args.input) args.input = value;
    else throw new Error(`Unknown argument: ${value}`);
  }

  if (!["png", "jpg", "svg", "pdf"].includes(args.format)) {
    throw new Error("--format must be one of: png, jpg, svg, pdf");
  }
  return args;
}

function required(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function getToken() {
  return (
    process.env.FIGMA_PERSONAL_TOKEN ||
    process.env.FIGMA_TOKEN ||
    process.env.FIGMA_ACCESS_TOKEN ||
    ""
  ).trim();
}

function parseFigmaInput(input) {
  if (!input) throw new Error("Missing Figma URL or file key");

  try {
    const url = new URL(input);
    const parts = url.pathname.split("/").filter(Boolean);
    const fileTypeIndex = parts.findIndex((part) =>
      ["file", "design", "proto", "board", "slides"].includes(part),
    );
    if (fileTypeIndex === -1 || !parts[fileTypeIndex + 1]) {
      throw new Error(`Could not parse Figma file key from URL: ${input}`);
    }
    return {
      fileKey: parts[fileTypeIndex + 1],
      nodeId: normalizeNodeId(url.searchParams.get("node-id") || ""),
    };
  } catch (error) {
    if (error instanceof TypeError) return { fileKey: input.trim(), nodeId: "" };
    throw error;
  }
}

function normalizeNodeId(nodeId) {
  return String(nodeId || "").trim().replace("-", ":");
}

function sanitizeName(value) {
  return String(value || "figma")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

async function figmaGet(pathname, query, token) {
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Figma API ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, bytes);
  return bytes.length;
}

function walk(node, callback) {
  if (!node) return;
  callback(node);
  for (const child of node.children || []) walk(child, callback);
}

function findNode(root, nodeId) {
  let found;
  walk(root, (node) => {
    if (!found && node.id === nodeId) found = node;
  });
  return found;
}

function getNodePath(root, targetId) {
  const names = [];
  let found = false;
  function visit(node) {
    if (!node || found) return;
    names.push(node.name || node.type || node.id);
    if (node.id === targetId) {
      found = true;
      return;
    }
    for (const child of node.children || []) {
      visit(child);
      if (found) return;
    }
    names.pop();
  }
  visit(root);
  return found ? names.join(" / ") : "";
}

function directRenderableChildren(node) {
  return (node.children || []).filter((child) => RENDERABLE_TYPES.has(child.type));
}

function defaultExportNodes(document) {
  return (document.children || [])
    .filter((node) => node.type === "CANVAS")
    .flatMap(directRenderableChildren);
}

function selectedExportNodes(document, selectedIds) {
  if (selectedIds.length === 0) return defaultExportNodes(document);
  return selectedIds.flatMap((id) => {
    const node = findNode(document, id);
    if (!node) return [];
    return node.type === "CANVAS" ? directRenderableChildren(node) : [node];
  });
}

function rgbToHex(color) {
  if (!color || typeof color !== "object") return "";
  const toByte = (value) =>
    Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
  const hex = [color.r, color.g, color.b]
    .map((value) => toByte(value).toString(16).padStart(2, "0"))
    .join("");
  const alpha = color.a === undefined ? 1 : Number(color.a);
  return alpha < 1 ? `#${hex}${toByte(alpha).toString(16).padStart(2, "0")}` : `#${hex}`;
}

function summarizePaint(paint) {
  if (!paint || paint.visible === false) return undefined;
  if (paint.type === "SOLID") {
    return {
      type: paint.type,
      color: rgbToHex({ ...(paint.color || {}), a: paint.opacity ?? paint.color?.a ?? 1 }),
    };
  }
  if (paint.type === "IMAGE") {
    return { type: paint.type, imageRef: paint.imageRef, scaleMode: paint.scaleMode };
  }
  return { type: paint.type };
}

function summarizeNode(node, document) {
  const box = node.absoluteBoundingBox || {};
  const style = node.style || {};
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    path: getNodePath(document, node.id),
    bounds: node.absoluteBoundingBox
      ? { x: box.x, y: box.y, width: box.width, height: box.height }
      : undefined,
    layoutMode: node.layoutMode,
    layoutSizingHorizontal: node.layoutSizingHorizontal,
    layoutSizingVertical: node.layoutSizingVertical,
    itemSpacing: node.itemSpacing,
    padding:
      node.paddingTop !== undefined
        ? {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
          }
        : undefined,
    cornerRadius: node.cornerRadius,
    fills: Array.isArray(node.fills) ? node.fills.map(summarizePaint).filter(Boolean) : undefined,
    strokes: Array.isArray(node.strokes)
      ? node.strokes.map(summarizePaint).filter(Boolean)
      : undefined,
    effects: node.effects,
    characters: node.characters,
    font:
      node.type === "TEXT"
        ? {
            family: style.fontFamily,
            postScriptName: style.fontPostScriptName,
            weight: style.fontWeight,
            size: style.fontSize,
            lineHeightPx: style.lineHeightPx,
            lineHeightPercent: style.lineHeightPercent,
            letterSpacing: style.letterSpacing,
            textAlignHorizontal: style.textAlignHorizontal,
            textAlignVertical: style.textAlignVertical,
          }
        : undefined,
  };
}

function implementationSummary(nodes, document) {
  const summary = [];
  for (const node of nodes) {
    walk(node, (child) => {
      if (child.absoluteBoundingBox || child.type === "TEXT" || child.fills || child.strokes) {
        summary.push(summarizeNode(child, document));
      }
    });
  }
  return summary;
}

function imageRefs(nodes) {
  const refs = new Set();
  for (const node of nodes) {
    walk(node, (child) => {
      for (const paint of [...(child.fills || []), ...(child.strokes || [])]) {
        if (paint?.type === "IMAGE" && paint.imageRef) refs.add(paint.imageRef);
      }
    });
  }
  return refs;
}

async function downloadRenders(fileKey, nodes, args, outDir, token) {
  if (!args.render || nodes.length === 0) return [];
  const imageResponse = await figmaGet(
    `/images/${encodeURIComponent(fileKey)}`,
    {
      ids: nodes.map((node) => node.id).join(","),
      format: args.format,
      scale: args.format === "png" || args.format === "jpg" ? args.scale : "",
      use_absolute_bounds: "true",
    },
    token,
  );

  const renderedDir = path.join(outDir, "renders");
  await mkdir(renderedDir, { recursive: true });
  const downloads = [];
  for (const node of nodes) {
    const imageUrl = imageResponse.images?.[node.id];
    if (!imageUrl) {
      downloads.push({ id: node.id, name: node.name, path: "", bytes: 0, error: imageResponse.err });
      continue;
    }
    const fileName = `${sanitizeName(node.name)}__${node.id.replace(":", "-")}.${args.format}`;
    const filePath = path.join(renderedDir, fileName);
    downloads.push({
      id: node.id,
      name: node.name,
      path: path.relative(process.cwd(), filePath),
      bytes: await downloadFile(imageUrl, filePath),
    });
  }
  return downloads;
}

async function downloadImageFills(fileKey, nodes, outDir, token) {
  const refs = imageRefs(nodes);
  if (refs.size === 0) return [];

  const imageResponse = await figmaGet(`/files/${encodeURIComponent(fileKey)}/images`, {}, token);
  const fillsDir = path.join(outDir, "image-fills");
  await mkdir(fillsDir, { recursive: true });
  const downloads = [];
  for (const ref of refs) {
    const imageUrl = imageResponse.meta?.images?.[ref];
    if (!imageUrl) {
      downloads.push({ ref, path: "", bytes: 0, error: "Missing image fill URL" });
      continue;
    }
    const extension = new URL(imageUrl).pathname.split(".").pop() || "png";
    const filePath = path.join(fillsDir, `${sanitizeName(ref)}.${extension}`);
    downloads.push({ ref, path: path.relative(process.cwd(), filePath), bytes: await downloadFile(imageUrl, filePath) });
  }
  return downloads;
}

function makeManifest(args, parsed, file, exportNodes, renders, fills) {
  return {
    source: {
      input: args.input,
      fileKey: parsed.fileKey,
      urlNodeId: parsed.nodeId || undefined,
      selectedIds: args.selectedIds,
      pulledAt: new Date().toISOString(),
    },
    file: {
      name: file.name,
      lastModified: file.lastModified,
      version: file.version,
      thumbnailUrl: file.thumbnailUrl,
      editorType: file.editorType,
      linkAccess: file.linkAccess,
    },
    exportedNodes: exportNodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      path: getNodePath(file.document, node.id),
      absoluteBoundingBox: node.absoluteBoundingBox,
    })),
    renders,
    imageFills: fills,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const token = getToken();
  if (!token) {
    throw new Error(
      "Missing Figma token. Try: doppler run --project api_keys --config dev -- npm run figma:pull -- <figma-url>",
    );
  }

  const parsed = parseFigmaInput(args.input);
  args.selectedIds = args.ids.length > 0 ? args.ids : parsed.nodeId ? [parsed.nodeId] : [];
  const file = await figmaGet(
    `/files/${encodeURIComponent(parsed.fileKey)}`,
    { depth: args.depth, geometry: "paths" },
    token,
  );

  const exportNodes = selectedExportNodes(file.document, args.selectedIds);
  if (exportNodes.length === 0) {
    throw new Error(
      args.selectedIds.length > 0
        ? `No exportable nodes found for IDs: ${args.selectedIds.join(", ")}`
        : "No top-level exportable frames found in file",
    );
  }

  const rootName =
    exportNodes.length === 1
      ? `${sanitizeName(file.name)}-${sanitizeName(exportNodes[0].name)}`
      : sanitizeName(file.name);
  const outDir = path.resolve(args.outDir, parsed.fileKey, rootName);
  await mkdir(outDir, { recursive: true });

  const renders = await downloadRenders(parsed.fileKey, exportNodes, args, outDir, token);
  const fills = args.imageFills ? await downloadImageFills(parsed.fileKey, exportNodes, outDir, token) : [];
  const manifest = makeManifest(args, parsed, file, exportNodes, renders, fills);

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outDir, "nodes.json"), `${JSON.stringify(exportNodes, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "implementation-summary.json"),
    `${JSON.stringify(implementationSummary(exportNodes, file.document), null, 2)}\n`,
  );

  console.log(`Figma pull complete: ${path.relative(process.cwd(), outDir)}`);
  console.log(`Nodes: ${exportNodes.length}`);
  console.log(`Renders: ${renders.filter((render) => render.path).length}`);
  if (args.imageFills) console.log(`Image fills: ${fills.filter((fill) => fill.path).length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
