#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_PUBLIC_BASE_URL = "https://www.maxpetrusenko.com";

function usage() {
  console.error(`Usage:
  node scripts/verify-medium-public-preview.mjs \\
    --package data/article-workspace/articles/<slug> \\
    [--public-base-url https://www.maxpetrusenko.com] \\
    [--published] \\
    [--marker "unique source marker"]`);
}

function parseArgs(argv) {
  const args = {
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--package") {
      args.packageDir = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--public-base-url") {
      args.publicBaseUrl = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--marker") {
      args.marker = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--published") {
      args.published = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pickTitle(markdown, version) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || version.title || "";
}

function stripHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function assertContains(haystack, needle, label) {
  if (!needle) return;
  if (!stripHtmlEntities(haystack).includes(needle)) {
    throw new Error(`Public preview missing ${label}: ${needle}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (stripHtmlEntities(haystack).includes(needle)) {
    throw new Error(`Public preview contains forbidden ${label}: ${needle}`);
  }
}

function readSourceArticleHash(html) {
  const match = html.match(/<meta\s+name=["']source-article-sha256["']\s+content=["']([0-9a-fA-F]+)["'][^>]*>/i);
  if (!match) {
    throw new Error('Public preview missing source article hash meta: <meta name="source-article-sha256" content="<64hex>">');
  }
  if (!/^[0-9a-f]{64}$/i.test(match[1])) {
    throw new Error(`Public preview source article hash is not a valid SHA256: ${match[1]}`);
  }
  return match[1].toLowerCase();
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!args.packageDir) {
    usage();
    throw new Error("Missing --package");
  }

  const packageDir = path.resolve(args.packageDir);
  const version = readJson(path.join(packageDir, "version.json"));
  const workflow = readJson(path.join(packageDir, "workflow.json"));
  const slug = version.slug || path.basename(packageDir);
  const articleFile = version.articleFile || workflow.publicPreview?.articleFile || "article-v1.md";
  const articlePath = path.join(packageDir, articleFile);
  if (!fs.existsSync(articlePath)) {
    throw new Error(`Local source article not found for preview hash verification: ${articlePath}`);
  }
  const articleBytes = fs.readFileSync(articlePath);
  const expectedArticleHash = createHash("sha256").update(articleBytes).digest("hex");
  const markdown = articleBytes.toString("utf8");
  const title = pickTitle(markdown, version);
  const marker = args.marker || workflow.source?.title || version.sourceUrl || workflow.source?.url || "";
  const publicUrl = `${args.publicBaseUrl.replace(/\/$/, "")}/medium/${slug}/`;

  const response = await fetch(publicUrl, { redirect: "follow" });
  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`Public preview returned HTTP ${response.status}: ${publicUrl}`);
  }

  const actualArticleHash = readSourceArticleHash(body);
  if (actualArticleHash !== expectedArticleHash) {
    throw new Error(
      `Public preview source article hash mismatch: expected ${expectedArticleHash}, received ${actualArticleHash}`
    );
  }

  if (args.published) {
    assertContains(body, 'article:status" content="published"', "published marker");
    assertNotContains(body, "noindex", "noindex marker");
  } else {
    assertContains(body, "noindex", "noindex marker");
  }
  assertContains(body, title, "final title");
  assertContains(body, marker, "source/research marker");
  assertNotContains(body, "Draft status:", "workflow status text");
  assertNotContains(body, "Needs review", "workflow status text");
  assertNotContains(body, "noindex preview", "workflow status text");

  console.log(`verified ${publicUrl}`);
  console.log(`status=200 title=${title} articleHash=${expectedArticleHash}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
