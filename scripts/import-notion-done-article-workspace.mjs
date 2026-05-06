#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

loadDotEnv();

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = process.env.ARTICLE_WORKSPACE_DIR || path.join(PROJECT_ROOT, "data", "article-workspace");
const ARTICLES_ROOT = path.join(WORKSPACE_ROOT, "articles");
const NOTION_VERSION = process.env.NOTION_VERSION || "2025-09-03";
const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.HERMES_NOTION_API_KEY || process.env.NOTION_OPENCLAW_TOKEN;
const DATA_SOURCE_ID = process.env.NOTION_ARTICLE_DATA_SOURCE_ID || "52ef8d3f-d097-4e53-a0e7-a0773ff1758b";
const STATUS_PROPERTY = process.env.NOTION_ARTICLE_STATUS_PROPERTY || "Status";
const STATUS_VALUE = process.env.NOTION_ARTICLE_STATUS_VALUE || "Done";
const IMPORT_LIMIT = Math.max(1, Number.parseInt(process.env.NOTION_DONE_ARTICLE_LIMIT || "24", 10) || 24);

if (!NOTION_API_KEY) {
  console.error("Missing NOTION_API_KEY (or HERMES_NOTION_API_KEY / NOTION_OPENCLAW_TOKEN).");
  process.exit(1);
}

await mkdir(ARTICLES_ROOT, { recursive: true });

const pages = await queryDonePages();
let imported = 0;
for (const page of pages.slice(0, IMPORT_LIMIT)) {
  const blocks = await listBlocks(page.id);
  const article = articleFromNotionPage(page, blocks);
  await writeArticleWorkspace(article, page, blocks);
  imported += 1;
}

console.log("notion done article import complete");
console.log(`workspace: ${WORKSPACE_ROOT}`);
console.log(`data source: ${DATA_SOURCE_ID}`);
console.log(`status filter: ${STATUS_PROPERTY} = ${STATUS_VALUE}`);
console.log(`article folders imported/updated: ${imported}`);

async function queryDonePages() {
  const pages = [];
  let start_cursor;
  while (pages.length < IMPORT_LIMIT) {
    const body = {
      page_size: Math.min(100, IMPORT_LIMIT - pages.length),
      filter: { property: STATUS_PROPERTY, select: { equals: STATUS_VALUE } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      ...(start_cursor ? { start_cursor } : {}),
    };
    const result = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, { method: "POST", body });
    pages.push(...(Array.isArray(result.results) ? result.results : []));
    if (!result.has_more || !result.next_cursor) break;
    start_cursor = result.next_cursor;
  }
  return pages;
}

async function listBlocks(pageId) {
  const blocks = [];
  let start_cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (start_cursor) query.set("start_cursor", start_cursor);
    const result = await notion(`/blocks/${pageId}/children?${query.toString()}`);
    blocks.push(...(Array.isArray(result.results) ? result.results : []));
    start_cursor = result.has_more ? result.next_cursor : undefined;
  } while (start_cursor);
  return blocks;
}

async function notion(endpoint, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`Notion API ${response.status}: ${json.message || text}`);
  }
  return json;
}

function articleFromNotionPage(page, blocks) {
  const title = cleanTitle(
    richTextProperty(page, "Medium Title") || titleProperty(page, "Name") || page.id
  );
  const firstHeading = firstBlockText(blocks, ["heading_1", "heading_2", "heading_3"]);
  const subtitle = cleanSubtitle(
    firstBlockText(blocks, ["quote"]) || firstMeaningfulParagraph(blocks) || firstHeading || "Imported from a finished Notion article."
  );
  const heroImageUrl = pageCoverUrl(page) || richTextProperty(page, "imageLink") || firstImageUrl(blocks) || "";
  const markdown = blocksToMarkdown(title, subtitle, heroImageUrl, blocks);
  const slug = uniqueNotionSlug(title, page.id);
  const notionUrl = page.public_url || page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`;
  const mediumUrl = richTextProperty(page, "Medium URL") || urlProperty(page, "Article Link") || "";

  return {
    slug,
    title,
    subtitle,
    heroImageUrl,
    notionUrl,
    mediumUrl,
    status: STATUS_VALUE,
    sourceRoot: "notion-done",
    sourceKind: "published-reference",
    sourcePath: notionUrl,
    importedAt: new Date().toISOString(),
    lastEditedTime: page.last_edited_time,
    markdown,
  };
}

async function writeArticleWorkspace(article, page, blocks) {
  const targetDir = path.join(ARTICLES_ROOT, article.slug);
  const versionDir = path.join(targetDir, "v001");
  await mkdir(versionDir, { recursive: true });
  await mkdir(path.join(targetDir, "artifacts", "images"), { recursive: true });
  await mkdir(path.join(targetDir, "artifacts", "sources"), { recursive: true });
  await mkdir(path.join(targetDir, "artifacts", "evals"), { recursive: true });

  await writeFile(path.join(versionDir, "article.md"), article.markdown, "utf8");
  await writeFile(
    path.join(versionDir, "version.json"),
    `${JSON.stringify(
      {
        sourceRoot: article.sourceRoot,
        sourceKind: article.sourceKind,
        sourcePath: article.sourcePath,
        sourceFile: "Notion page blocks",
        importedAt: article.importedAt,
        lastEditedTime: article.lastEditedTime,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await writeFile(
    path.join(targetDir, "artifacts", "images", "hero-image.json"),
    `${JSON.stringify({ url: article.heroImageUrl || null, source: "notion" }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(targetDir, "artifacts", "sources", "notion-page.json"),
    `${JSON.stringify(page, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(targetDir, "artifacts", "sources", "notion-blocks.json"),
    `${JSON.stringify(blocks, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(targetDir, "artifacts", "evals", "evolution-notes.md"),
    `# Article evolution notes\n\n- Imported from Notion status: ${STATUS_VALUE}\n- This is a finished/published reference article, not a newly generated variant.\n- Title, subtitle, hero image, source blocks, and article text are preserved so future agents can compare old article shape against generated versions.\n- Notion: ${article.notionUrl}\n${article.mediumUrl ? `- Medium: ${article.mediumUrl}\n` : ""}`,
    "utf8"
  );

  await writeFile(
    path.join(targetDir, "import-manifest.json"),
    `${JSON.stringify(
      {
        slug: article.slug,
        title: article.title,
        subtitle: article.subtitle,
        heroImageUrl: article.heroImageUrl,
        notionUrl: article.notionUrl,
        mediumUrl: article.mediumUrl,
        status: "complete",
        sourceRoot: article.sourceRoot,
        sourceKind: article.sourceKind,
        sourcePath: article.sourcePath,
        versions: [{ version: "v001", sourceFile: "Notion page blocks" }],
        artifactCount: 4,
        importedAt: article.importedAt,
        lastEditedTime: article.lastEditedTime,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function blocksToMarkdown(title, subtitle, heroImageUrl, blocks) {
  const lines = [`# ${title}`, ""];
  if (subtitle) lines.push(`> ${subtitle}`, "");
  if (heroImageUrl) lines.push(`![Hero image](${heroImageUrl})`, "");

  for (const block of blocks) {
    const text = blockText(block).trim();
    if (block.type === "image") {
      const url = imageUrl(block);
      if (url && url !== heroImageUrl) lines.push(`![Image](${url})`, "");
      continue;
    }
    if (!text) {
      if (block.type === "divider") lines.push("---", "");
      continue;
    }
    if (["heading_1", "heading_2", "heading_3"].includes(block.type)) {
      const prefix = block.type === "heading_1" ? "##" : block.type === "heading_2" ? "###" : "####";
      lines.push(`${prefix} ${text}`, "");
      continue;
    }
    if (block.type === "quote") lines.push(`> ${text}`, "");
    else if (block.type === "bulleted_list_item") lines.push(`- ${text}`);
    else if (block.type === "numbered_list_item") lines.push(`1. ${text}`);
    else if (block.type === "to_do") lines.push(`- [ ] ${text}`);
    else lines.push(text, "");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function titleProperty(page, name) {
  const prop = page.properties?.[name];
  if (!prop || prop.type !== "title") return "";
  return plainText(prop.title);
}

function richTextProperty(page, name) {
  const prop = page.properties?.[name];
  if (!prop || prop.type !== "rich_text") return "";
  return plainText(prop.rich_text);
}

function urlProperty(page, name) {
  const prop = page.properties?.[name];
  if (!prop || prop.type !== "url") return "";
  return prop.url || "";
}

function pageCoverUrl(page) {
  if (page.cover?.type === "external") return page.cover.external?.url || "";
  if (page.cover?.type === "file") return page.cover.file?.url || "";
  return "";
}

function firstImageUrl(blocks) {
  for (const block of blocks) {
    const url = imageUrl(block);
    if (url) return url;
  }
  return "";
}

function imageUrl(block) {
  if (block.type !== "image") return "";
  if (block.image?.type === "external") return block.image.external?.url || "";
  if (block.image?.type === "file") return block.image.file?.url || "";
  return "";
}

function firstBlockText(blocks, types) {
  for (const block of blocks) {
    if (!types.includes(block.type)) continue;
    const text = blockText(block).trim();
    if (text) return text;
  }
  return "";
}

function firstMeaningfulParagraph(blocks) {
  for (const block of blocks) {
    if (block.type !== "paragraph") continue;
    const text = blockText(block).trim();
    if (text.length >= 60 && !/^if you liked this story/i.test(text)) return text;
  }
  return "";
}

function blockText(block) {
  const value = block[block.type];
  return plainText(value?.rich_text || []);
}

function plainText(parts) {
  return Array.isArray(parts) ? parts.map((part) => part.plain_text || "").join("") : "";
}

function cleanTitle(value) {
  return value.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim() || "Untitled article";
}

function cleanSubtitle(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function uniqueNotionSlug(title, pageId) {
  const suffix = pageId.replaceAll("-", "").slice(0, 8);
  return `notion-done-${slugify(title).slice(0, 78)}-${suffix}`.replace(/-+$/, "");
}

function slugify(value) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

function loadDotEnv() {
  try {
    const envPath = path.join(PROJECT_ROOT, ".env");
    if (!existsSync(envPath)) return;
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // Dotenv is convenience only. The real contract is process.env.
  }
}
