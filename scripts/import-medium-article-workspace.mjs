#!/usr/bin/env node
import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = process.env.ARTICLE_WORKSPACE_DIR || path.join(PROJECT_ROOT, "data", "article-workspace");
const ARTICLES_ROOT = path.join(WORKSPACE_ROOT, "articles");

const SOURCE_ROOTS = [
  {
    name: "medium-automation",
    root: "/Users/maxpetrusenko/Desktop/Projects/medium-automation/articles",
    kind: "generated",
  },
  {
    name: "medium-automation-test",
    root: "/Users/maxpetrusenko/Desktop/Projects/medium-automation/articles-test",
    kind: "generated-test",
  },
  {
    name: "medium-generator",
    root: "/Users/maxpetrusenko/Desktop/Projects/medium-generator/articles",
    kind: "generated",
  },
  {
    name: "medium-generator-output",
    root: "/Users/maxpetrusenko/Desktop/Projects/medium-generator/output",
    kind: "generated",
  },
];

const SKIP_NAMES = new Set([".DS_Store", ".git", "node_modules", ".next", "dist", "out"]);
const SECRET_PATTERNS = [/^\.env/i, /client_secret/i, /credentials/i, /secret/i, /token/i, /emails?_\d*/i, /subscribers?/i, /audience/i, /my account/i];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const SOURCE_EXTENSIONS = new Set([".json", ".jsonl", ".csv"]);
const EVAL_PATTERNS = [/rating/i, /eval/i, /score/i, /judge/i, /framework/i, /feedback/i, /critique/i, /review/i];
const PROMPT_PATTERNS = [/prompt/i, /system/i, /instruction/i, /brief/i];
const DIFF_PATTERNS = [/diff/i, /patch/i, /changes/i, /revision/i];
const LOG_PATTERNS = [/workflow/i, /run/i, /trace/i, /log/i, /timeline/i, /phase/i];
const NOTE_PATTERNS = [/overview/i, /notes?/i, /readme/i, /plan/i, /strategy/i];

await mkdir(ARTICLES_ROOT, { recursive: true });

let imported = 0;
let skipped = 0;
let rootsSeen = 0;
const details = [];

for (const sourceRoot of SOURCE_ROOTS) {
  if (!(await exists(sourceRoot.root))) {
    details.push(`missing ${sourceRoot.name}: ${sourceRoot.root}`);
    continue;
  }
  rootsSeen += 1;
  const entries = await readdir(sourceRoot.root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeName(entry.name)) {
      skipped += 1;
      continue;
    }

    const sourceDir = path.join(sourceRoot.root, entry.name);
    const articleFiles = await discoverArticleFiles(sourceDir);
    const artifactFiles = await discoverArtifactFiles(sourceDir);

    if (!articleFiles.length && !artifactFiles.length) {
      skipped += 1;
      continue;
    }

    const slug = uniqueSourceSlug(sourceRoot.name, entry.name);
    const targetDir = path.join(ARTICLES_ROOT, slug);
    await mkdir(targetDir, { recursive: true });

    if (articleFiles.length) {
      for (const articleFile of articleFiles) {
        const versionDir = path.join(targetDir, articleFile.version);
        await mkdir(versionDir, { recursive: true });
        await cp(articleFile.absolutePath, path.join(versionDir, "article.md"));
        await writeFile(
          path.join(versionDir, "version.json"),
          JSON.stringify(
            {
              sourceRoot: sourceRoot.name,
              sourceKind: sourceRoot.kind,
              sourcePath: sourceDir,
              sourceFile: articleFile.relativePath,
              importedAt: new Date().toISOString(),
            },
            null,
            2
          ) + "\n"
        );
      }
    }

    for (const artifactFile of artifactFiles) {
      const targetPath = path.join(targetDir, "artifacts", artifactFile.bucket, artifactFile.relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(artifactFile.absolutePath, targetPath, { recursive: true, force: true });
    }

    await writeFile(
      path.join(targetDir, "import-manifest.json"),
      JSON.stringify(
        {
          slug,
          title: entry.name,
          sourceRoot: sourceRoot.name,
          sourceKind: sourceRoot.kind,
          sourcePath: sourceDir,
          versions: articleFiles.map((file) => ({ version: file.version, sourceFile: file.relativePath })),
          artifactCount: artifactFiles.length,
          importedAt: new Date().toISOString(),
        },
        null,
        2
      ) + "\n"
    );

    imported += 1;
  }
}

console.log(`article workspace import complete`);
console.log(`workspace: ${WORKSPACE_ROOT}`);
console.log(`roots seen: ${rootsSeen}`);
console.log(`article folders imported/updated: ${imported}`);
console.log(`entries skipped: ${skipped}`);
for (const detail of details) console.log(detail);

async function discoverArticleFiles(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const versioned = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isSafeName(entry.name)) continue;
    const match = entry.name.match(/^article-v(\d+)\.md$/i);
    if (!match) continue;
    versioned.push({
      number: Number(match[1]),
      version: `v${String(Number(match[1])).padStart(3, "0")}`,
      relativePath: entry.name,
      absolutePath: path.join(sourceDir, entry.name),
    });
  }

  versioned.sort((a, b) => a.number - b.number);
  if (versioned.length) return versioned;

  const articleMd = path.join(sourceDir, "article.md");
  if (await exists(articleMd)) {
    return [{ number: 1, version: "v001", relativePath: "article.md", absolutePath: articleMd }];
  }

  const mediumMd = path.join(sourceDir, "article-medium.md");
  if (await exists(mediumMd)) {
    return [{ number: 1, version: "v001", relativePath: "article-medium.md", absolutePath: mediumMd }];
  }

  return [];
}

async function discoverArtifactFiles(sourceDir, baseDir = sourceDir, depth = 0) {
  if (depth > 4) return [];
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (!isSafeName(entry.name)) continue;
    const absolutePath = path.join(sourceDir, entry.name);
    const relativePath = path.relative(baseDir, absolutePath);

    if (entry.isDirectory()) {
      files.push(...(await discoverArtifactFiles(absolutePath, baseDir, depth + 1)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (/^article-v\d+\.md$/i.test(entry.name)) continue;

    const bucket = artifactBucket(entry.name);
    if (!bucket) continue;
    files.push({ absolutePath, relativePath, bucket });
  }

  return files;
}

function artifactBucket(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "images";
  if (EVAL_PATTERNS.some((pattern) => pattern.test(fileName))) return "evals";
  if (PROMPT_PATTERNS.some((pattern) => pattern.test(fileName))) return "prompts";
  if (DIFF_PATTERNS.some((pattern) => pattern.test(fileName))) return "diffs";
  if (LOG_PATTERNS.some((pattern) => pattern.test(fileName))) return "logs";
  if (NOTE_PATTERNS.some((pattern) => pattern.test(fileName))) return "notes";
  if (SOURCE_EXTENSIONS.has(extension)) return "sources";
  if ([".md", ".txt", ".html", ".yaml", ".yml"].includes(extension)) return "original";
  return null;
}

function uniqueSourceSlug(sourceName, title) {
  const base = slugify(title).slice(0, 90) || "article";
  const prefix = sourceName === "medium-automation" ? "" : `${slugify(sourceName)}-`;
  return `${prefix}${base}`.replace(/-+$/, "");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function isSafeName(name) {
  if (SKIP_NAMES.has(name)) return false;
  if (name.startsWith(".")) return false;
  return !SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

async function exists(filePath) {
  return Boolean(await stat(filePath).catch(() => null));
}
