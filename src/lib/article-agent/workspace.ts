import "server-only";

import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeArticleKanbanState,
  type ArticleKanbanColumn,
  type ArticleKanbanState,
} from "@/lib/article-agent/kanban";
import {
  mergeArticleEvolutionSummaries,
  parseArticleOverviewMarkdown,
  parseRatingMarkdown,
  summarizeFrameworkEvalRecord,
  summarizeWorkflowRecord,
  summarizeSourceRecord,
  type ArticleEvaluatorScore,
  type ArticleEvolutionPhase,
} from "@/lib/article-agent/evolution";

export type ArticleWorkspaceSection = "articles" | "skills" | "gbrain";

export type ArticleWorkspaceTreeNode = {
  name: string;
  section: ArticleWorkspaceSection;
  relativePath: string;
  openRef: string;
  kind: "directory" | "file";
  depth: number;
  size?: number;
  mtime?: Date;
  children?: ArticleWorkspaceTreeNode[];
};

export type ArticleWorkspaceSectionTree = {
  section: ArticleWorkspaceSection;
  label: string;
  root: string;
  exists: boolean;
  children: ArticleWorkspaceTreeNode[];
};

export type ArticleWorkspacePreview = {
  section: ArticleWorkspaceSection;
  label: string;
  root: string;
  relativePath: string;
  absolutePath: string;
  openRef: string;
  exists: boolean;
  kind: "directory" | "file" | "missing";
  mimeType?: string;
  language?: string;
  size?: number;
  mtime?: Date;
  text?: string;
  truncated?: boolean;
  children?: ArticleWorkspaceTreeNode[];
};

export type ArticleWorkspaceArticleStatus = string;
export type ArticleWorkspaceKanbanColumn = ArticleKanbanColumn;
export type ArticleWorkspaceKanbanState = ArticleKanbanState;

export type ArticleWorkspaceArticleSummary = {
  slug: string;
  title: string;
  subtitle?: string;
  heroImageUrl?: string;
  heroImageProvider?: string;
  heroImageModel?: string;
  heroImageStatus?: string;
  articleRating?: number;
  articleRatingMax?: number;
  articleRatingModel?: string;
  articleRatingProvider?: string;
  iterationCount: number;
  feedbackSummary?: string;
  biggestProblem?: string;
  improvementSummary?: string;
  pros?: string[];
  cons?: string[];
  sourceSummary?: string;
  evidenceCount?: number;
  wordCount?: number;
  totalCost?: number;
  totalTokens?: number;
  evaluatorScores?: ArticleEvaluatorScore[];
  phaseLog?: ArticleEvolutionPhase[];
  notionUrl?: string;
  mediumUrl?: string;
  year: string;
  platform: string;
  context: string;
  status: ArticleWorkspaceArticleStatus;
  statusLabel: string;
  versions: number;
  artifactCount: number;
  importedAt?: string;
  updatedAt?: string;
  folderOpenRef: string;
  openRef: string;
  searchText: string;
};

type SectionConfig = {
  section: ArticleWorkspaceSection;
  label: string;
  root: string;
  maxDepth: number;
  maxEntries: number;
  fileExtensions?: Set<string>;
};

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".csv",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".mjs",
]);

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const SKIPPED_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".next",
  ".next-dev",
  "node_modules",
  "dist",
  "out",
]);

const SECRET_PATTERNS = [
  /^\.env/i,
  /secret/i,
  /client_secret/i,
  /credentials/i,
  /token/i,
  /emails?_\d*/i,
  /subscribers?/i,
];

export function getArticleWorkspaceSections(): SectionConfig[] {
  const articleRoot =
    process.env.ARTICLE_WORKSPACE_DIR || path.join(process.cwd(), "data", "article-workspace");
  const gbrainRoot =
    process.env.GBRAIN_WIKI_DIR || "/Users/maxpetrusenko/Google Drive/Obsidian/LLM Wiki";

  return [
    {
      section: "articles",
      label: "Articles",
      root: path.join(articleRoot, "articles"),
      maxDepth: 6,
      maxEntries: 1400,
    },
    {
      section: "skills",
      label: "Article Skills",
      root: path.join(process.cwd(), "article-agent", "skills"),
      maxDepth: 2,
      maxEntries: 160,
      fileExtensions: new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml"]),
    },
    {
      section: "gbrain",
      label: "GBrain / Wiki",
      root: gbrainRoot,
      maxDepth: 2,
      maxEntries: 260,
      fileExtensions: new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml"]),
    },
  ];
}

export function makeArticleWorkspaceOpenRef(
  section: ArticleWorkspaceSection,
  relativePath = ""
) {
  return `${section}:${encodeURIComponent(normalizeRelativePath(relativePath))}`;
}

export function parseArticleWorkspaceOpenRef(openRef?: string | null) {
  const sections = getArticleWorkspaceSections();
  if (!openRef) {
    const articles = sections.find((section) => section.section === "articles")!;
    return { config: articles, relativePath: "", absolutePath: articles.root, openRef: "articles:" };
  }

  const separator = openRef.indexOf(":");
  const sectionName = (separator === -1 ? openRef : openRef.slice(0, separator)) as ArticleWorkspaceSection;
  const config = sections.find((section) => section.section === sectionName) ?? sections[0];
  const encodedPath = separator === -1 ? "" : openRef.slice(separator + 1);
  const relativePath = normalizeRelativePath(safeDecodeURIComponent(encodedPath));
  const absolutePath = safeResolve(config.root, relativePath);

  return {
    config,
    relativePath,
    absolutePath,
    openRef: makeArticleWorkspaceOpenRef(config.section, relativePath),
  };
}

export async function listArticleWorkspaceTrees(): Promise<ArticleWorkspaceSectionTree[]> {
  const sections = getArticleWorkspaceSections();
  return Promise.all(
    sections.map(async (config) => {
      const exists = await pathExists(config.root);
      return {
        section: config.section,
        label: config.label,
        root: config.root,
        exists,
        children: exists ? await listTree(config, "", 0, { count: 0 }) : [],
      };
    })
  );
}


export async function listArticleWorkspaceArticleSummaries(): Promise<ArticleWorkspaceArticleSummary[]> {
  const config = getArticleWorkspaceSections().find((section) => section.section === "articles")!;
  const entries = await readdir(config.root, { withFileTypes: true }).catch(() => []);
  const directories = entries
    .filter((entry) => entry.isDirectory() && isSafeName(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  const baseSummaries = await Promise.all(
    directories.map(async (entry) => summarizeArticleDirectory(config, entry.name))
  );

  const fallbackAssignments = Object.fromEntries(baseSummaries.map((summary) => [summary.slug, summary.status]));
  const kanbanState = await readArticleWorkspaceKanbanState(
    baseSummaries.map((summary) => summary.slug),
    fallbackAssignments
  );
  const columnLabels = Object.fromEntries(kanbanState.columns.map((column) => [column.id, column.label]));
  const articleBySlug = new Map(
    baseSummaries.map((summary) => {
      const status = kanbanState.assignments[summary.slug] ?? summary.status;
      return [
        summary.slug,
        {
          ...summary,
          status,
          statusLabel: columnLabels[status] ?? humanizeSlug(status),
          searchText: appendSearchText(summary.searchText, columnLabels[status] ?? status),
        },
      ];
    })
  );

  const ordered: ArticleWorkspaceArticleSummary[] = [];
  for (const column of kanbanState.columns) {
    for (const slug of kanbanState.order[column.id] ?? []) {
      const summary = articleBySlug.get(slug);
      if (!summary) continue;
      ordered.push(summary);
      articleBySlug.delete(slug);
    }
  }

  const remaining = Array.from(articleBySlug.values()).sort(sortArticleSummariesByFreshness);
  return [...ordered, ...remaining];
}

export async function getArticleWorkspaceKanbanColumns() {
  const summaries = await listArticleWorkspaceArticleSummaries();
  const state = await readArticleWorkspaceKanbanState(
    summaries.map((summary) => summary.slug),
    Object.fromEntries(summaries.map((summary) => [summary.slug, summary.status]))
  );
  return state.columns;
}

export async function saveArticleWorkspaceKanbanState(input: Partial<ArticleKanbanState>) {
  const summaries = await listArticleWorkspaceArticleSummaries();
  const slugs = summaries.map((summary) => summary.slug);
  const fallbackAssignments = Object.fromEntries(summaries.map((summary) => [summary.slug, summary.status]));
  const state = normalizeArticleKanbanState(
    { ...input, updatedAt: new Date().toISOString() },
    slugs,
    fallbackAssignments
  );
  await writeArticleWorkspaceKanbanState(state);
  return state;
}

export async function getArticleWorkspacePreview(
  openRef?: string | null
): Promise<ArticleWorkspacePreview> {
  const { config, relativePath, absolutePath, openRef: normalizedOpenRef } =
    parseArticleWorkspaceOpenRef(openRef);
  const label = config.label;
  const fileStat = await stat(absolutePath).catch(() => null);

  if (!fileStat) {
    return {
      section: config.section,
      label,
      root: config.root,
      relativePath,
      absolutePath,
      openRef: normalizedOpenRef,
      exists: false,
      kind: "missing",
    };
  }

  if (fileStat.isDirectory()) {
    return {
      section: config.section,
      label,
      root: config.root,
      relativePath,
      absolutePath,
      openRef: normalizedOpenRef,
      exists: true,
      kind: "directory",
      size: fileStat.size,
      mtime: fileStat.mtime,
      children: await listTree(config, relativePath, 0, { count: 0 }, 1),
    };
  }

  const extension = path.extname(relativePath).toLowerCase();
  const mimeType = getArticleWorkspaceMimeType(relativePath);
  const language = detectLanguage(extension);
  const preview: ArticleWorkspacePreview = {
    section: config.section,
    label,
    root: config.root,
    relativePath,
    absolutePath,
    openRef: normalizedOpenRef,
    exists: true,
    kind: "file",
    mimeType,
    language,
    size: fileStat.size,
    mtime: fileStat.mtime,
  };

  if (TEXT_EXTENSIONS.has(extension) && fileStat.size <= 350_000) {
    preview.text = await readFile(absolutePath, "utf8");
    preview.truncated = false;
  } else if (TEXT_EXTENSIONS.has(extension)) {
    const buffer = await readFile(absolutePath);
    preview.text = buffer.subarray(0, 350_000).toString("utf8");
    preview.truncated = true;
  }

  return preview;
}

export async function readArticleWorkspaceBinary(openRef: string) {
  const { absolutePath, relativePath } = parseArticleWorkspaceOpenRef(openRef);
  const fileStat = await stat(absolutePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) return null;
  const mimeType = getArticleWorkspaceMimeType(relativePath);
  if (!mimeType.startsWith("image/")) return null;
  return {
    body: await readFile(absolutePath),
    mimeType,
    size: fileStat.size,
  };
}

export async function writeArticleWorkspaceText(openRef: string, text: string) {
  const { absolutePath, relativePath } = parseArticleWorkspaceOpenRef(openRef);
  const fileStat = await stat(absolutePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    return { ok: false as const, error: "File not found." };
  }

  const extension = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) {
    return { ok: false as const, error: "Only text-like article workspace files are editable." };
  }

  if (Buffer.byteLength(text, "utf8") > 500_000) {
    return { ok: false as const, error: "File is too large for browser editing." };
  }

  await writeFile(absolutePath, text, "utf8");
  return { ok: true as const, size: Buffer.byteLength(text, "utf8") };
}

export async function createArticleWorkspaceEntry(
  parentOpenRef: string,
  input: { name: string; kind: "file" | "directory"; text?: string }
) {
  const { config, absolutePath: parentPath, relativePath: parentRelativePath } =
    parseArticleWorkspaceOpenRef(parentOpenRef);
  const parentStat = await stat(parentPath).catch(() => null);
  if (!parentStat || !parentStat.isDirectory()) {
    return { ok: false as const, error: "Parent folder not found." };
  }

  const name = normalizeEntryName(input.name);
  if (!name) {
    return { ok: false as const, error: "Use a safe file or folder name." };
  }
  if (SECRET_PATTERNS.some((pattern) => pattern.test(name))) {
    return { ok: false as const, error: "That name is blocked for safety." };
  }

  const relativePath = normalizeRelativePath(path.join(parentRelativePath, name));
  const absolutePath = safeResolve(config.root, relativePath);
  if (await pathExists(absolutePath)) {
    return { ok: false as const, error: "A file or folder already exists there." };
  }

  if (input.kind === "directory") {
    await mkdir(absolutePath);
  } else {
    const extension = path.extname(name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) {
      return { ok: false as const, error: "Create text-like files only." };
    }
    await writeFile(absolutePath, input.text ?? "", "utf8");
  }

  return {
    ok: true as const,
    openRef: makeArticleWorkspaceOpenRef(config.section, relativePath),
  };
}

export async function renameArticleWorkspaceEntry(openRef: string, nextNameInput: string) {
  const { config, absolutePath, relativePath } = parseArticleWorkspaceOpenRef(openRef);
  if (!relativePath) {
    return { ok: false as const, error: "Root folders cannot be renamed." };
  }

  const entryStat = await stat(absolutePath).catch(() => null);
  if (!entryStat) {
    return { ok: false as const, error: "File or folder not found." };
  }

  const nextName = normalizeEntryName(nextNameInput);
  if (!nextName) {
    return { ok: false as const, error: "Use a safe file or folder name." };
  }
  if (SECRET_PATTERNS.some((pattern) => pattern.test(nextName))) {
    return { ok: false as const, error: "That name is blocked for safety." };
  }

  const nextRelativePath = normalizeRelativePath(path.join(path.dirname(relativePath), nextName));
  const nextAbsolutePath = safeResolve(config.root, nextRelativePath);
  if (await pathExists(nextAbsolutePath)) {
    return { ok: false as const, error: "A file or folder already exists there." };
  }

  await rename(absolutePath, nextAbsolutePath);
  return {
    ok: true as const,
    openRef: makeArticleWorkspaceOpenRef(config.section, nextRelativePath),
  };
}

export async function deleteArticleWorkspaceEntry(openRef: string) {
  const { config, absolutePath, relativePath } = parseArticleWorkspaceOpenRef(openRef);
  if (!relativePath) {
    return { ok: false as const, error: "Root folders cannot be deleted." };
  }

  const entryStat = await stat(absolutePath).catch(() => null);
  if (!entryStat) {
    return { ok: false as const, error: "File or folder not found." };
  }

  const trashRoot = safeResolve(config.root, ".trash");
  await mkdir(trashRoot, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = path.basename(relativePath);
  const trashedPath = safeResolve(config.root, path.join(".trash", `${stamp}-${basename}`));
  await rename(absolutePath, trashedPath);

  return {
    ok: true as const,
    openRef: makeArticleWorkspaceOpenRef(config.section, path.dirname(relativePath) === "." ? "" : path.dirname(relativePath)),
  };
}

export function getArticleWorkspaceMimeType(relativePath: string) {
  const extension = path.extname(relativePath).toLowerCase();
  return IMAGE_MIME_TYPES[extension] ?? (TEXT_EXTENSIONS.has(extension) ? "text/plain; charset=utf-8" : "application/octet-stream");
}

async function listTree(
  config: SectionConfig,
  relativePath: string,
  depth: number,
  counter: { count: number },
  maxDepthOverride?: number
): Promise<ArticleWorkspaceTreeNode[]> {
  const maxDepth = maxDepthOverride ?? config.maxDepth;
  if (depth >= maxDepth || counter.count >= config.maxEntries) return [];

  const absoluteDir = safeResolve(config.root, relativePath);
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const nodes: ArticleWorkspaceTreeNode[] = [];

  const sorted = entries
    .filter((entry) => isSafeName(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

  for (const entry of sorted) {
    if (counter.count >= config.maxEntries) break;
    const childRelativePath = normalizeRelativePath(path.join(relativePath, entry.name));
    const extension = path.extname(entry.name).toLowerCase();

    if (entry.isFile() && config.fileExtensions && !config.fileExtensions.has(extension)) continue;

    const absolutePath = safeResolve(config.root, childRelativePath);
    const entryStat = await stat(absolutePath).catch(() => null);
    if (!entryStat) continue;

    counter.count += 1;
    const node: ArticleWorkspaceTreeNode = {
      name: entry.name,
      section: config.section,
      relativePath: childRelativePath,
      openRef: makeArticleWorkspaceOpenRef(config.section, childRelativePath),
      kind: entry.isDirectory() ? "directory" : "file",
      depth,
      size: entryStat.size,
      mtime: entryStat.mtime,
    };

    if (entry.isDirectory()) {
      node.children = await listTree(config, childRelativePath, depth + 1, counter, maxDepthOverride);
    }

    nodes.push(node);
  }

  return nodes;
}

function normalizeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === ".")) return "";
  return parts.join("/");
}

function normalizeEntryName(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === "..") {
    return "";
  }
  return isSafeName(trimmed) ? trimmed : "";
}

function safeResolve(root: string, relativePath: string) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, normalizeRelativePath(relativePath));
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes article workspace root.");
  }
  return absolutePath;
}

function isSafeName(name: string) {
  if (SKIPPED_NAMES.has(name)) return false;
  if (name.startsWith(".")) return false;
  return !SECRET_PATTERNS.some((pattern) => pattern.test(name));
}



async function readArticleWorkspaceKanbanState(
  articleSlugs: string[],
  fallbackAssignments: Record<string, string> = {}
) {
  const statePath = getArticleWorkspaceKanbanStatePath();
  const raw = await readJsonRecord(statePath);
  return normalizeArticleKanbanState(raw, articleSlugs, fallbackAssignments);
}

async function writeArticleWorkspaceKanbanState(state: ArticleKanbanState) {
  const statePath = getArticleWorkspaceKanbanStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getArticleWorkspaceKanbanStatePath() {
  const articles = getArticleWorkspaceSections().find((section) => section.section === "articles")!;
  return path.join(path.dirname(articles.root), "kanban-state.json");
}

function sortArticleSummariesByFreshness(a: ArticleWorkspaceArticleSummary, b: ArticleWorkspaceArticleSummary) {
  const aTime = Date.parse(a.updatedAt ?? a.importedAt ?? "") || 0;
  const bTime = Date.parse(b.updatedAt ?? b.importedAt ?? "") || 0;
  if (aTime !== bTime) return bTime - aTime;
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
}

function appendSearchText(searchText: string, value: string) {
  return `${searchText} ${value}`.trim().toLowerCase();
}

async function summarizeArticleDirectory(
  config: SectionConfig,
  directoryName: string
): Promise<ArticleWorkspaceArticleSummary> {
  const relativeDirectory = normalizeRelativePath(directoryName);
  const absoluteDirectory = safeResolve(config.root, relativeDirectory);
  const manifest = await readJsonRecord(path.join(absoluteDirectory, "import-manifest.json"));
  const versionMeta = await readLatestVersionMetadata(absoluteDirectory);
  const evalMeta = await readJsonRecord(path.join(absoluteDirectory, "evals", "framework-check-v1.json"));
  const evolution = await readArticleEvolutionSummary(absoluteDirectory);
  const quality = mergeArticleEvolutionSummaries(summarizeFrameworkEvalRecord(evalMeta), evolution);
  const directoryStat = await stat(absoluteDirectory).catch(() => null);
  const latestArticlePath = await findLatestArticlePath(absoluteDirectory);
  const articleText = latestArticlePath ? await readTextSnippet(latestArticlePath, 8_000) : "";
  const context = extractArticleContext(articleText);
  const title = cleanTitle(stringField(manifest, "title") || stringField(versionMeta, "title") || humanizeSlug(directoryName));
  const slug = stringField(manifest, "slug") || stringField(versionMeta, "slug") || directoryName;
  const sourceRoot = stringField(manifest, "sourceRoot");
  const sourceKind = stringField(manifest, "sourceKind");
  const sourcePath = stringField(manifest, "sourcePath") || stringField(versionMeta, "sourceUrl");
  const subtitle = stringField(manifest, "subtitle") || stringField(versionMeta, "subtitle");
  const heroImagePath =
    stringField(manifest, "heroImageUrl") ||
    firstStringInArrayField(versionMeta, "images") ||
    (await readArticleHeroImageJsonUrl(absoluteDirectory)) ||
    (await findArticleHeroImagePath(absoluteDirectory));
  const heroImageUrl = resolveArticleHeroImageUrl(config, relativeDirectory, heroImagePath);
  const heroImageProvider = stringField(versionMeta, "heroImageProvider") || stringField(versionMeta, "imageProvider") || stringField(manifest, "heroImageProvider");
  const heroImageModel = stringField(versionMeta, "heroImageModel") || stringField(versionMeta, "imageModel") || stringField(manifest, "heroImageModel");
  const heroImageStatus = stringField(versionMeta, "heroImageStatus") || stringField(manifest, "heroImageStatus");
  const articleRating = firstPositiveNumber(
    quality.rating,
    numberField(versionMeta, "rating"),
    numberField(versionMeta, "frameworkScore"),
    numberField(evalMeta, "score"),
    numberField(manifest, "frameworkScore")
  );
  const articleRatingMax = articleRating
    ? firstPositiveNumber(
        evolution.ratingMax,
        quality.ratingMax,
        numberField(versionMeta, "maxScore"),
        numberField(versionMeta, "frameworkMaxScore"),
        numberField(evalMeta, "maxScore"),
        numberField(manifest, "frameworkMaxScore")
      ) ?? 110
    : undefined;
  const articleRatingModel =
    quality.ratingModel ||
    stringField(versionMeta, "ratingModel") ||
    stringField(versionMeta, "frameworkModel") ||
    stringField(evalMeta, "ratingModel") ||
    stringField(evalMeta, "model");
  const articleRatingProvider =
    quality.ratingProvider ||
    stringField(versionMeta, "ratingProvider") ||
    stringField(evalMeta, "ratingProvider") ||
    stringField(evalMeta, "provider");
  const notionUrl = stringField(manifest, "notionUrl");
  const mediumUrl = stringField(manifest, "mediumUrl");
  const manifestStatus = stringField(manifest, "status");
  const importedAt = stringField(manifest, "importedAt") || undefined;
  const latestArticleStat = latestArticlePath ? await stat(latestArticlePath).catch(() => null) : null;
  const updatedAt = latestArticleStat?.mtime.toISOString() ?? directoryStat?.mtime.toISOString();
  const versions = Math.max(numberField(manifest, "versions"), await countArticleVersions(absoluteDirectory));
  const artifactCount = numberField(manifest, "artifactCount") || (await countArticleArtifacts(absoluteDirectory));
  const yearDate = importedAt ?? updatedAt ?? directoryStat?.mtime.toISOString() ?? "";
  const year = yearDate ? String(new Date(yearDate).getFullYear()) : "unknown";
  const platform = detectArticlePlatform([title, slug, sourceRoot, sourceKind, sourcePath, context, notionUrl, mediumUrl]);
  const status = inferArticleStatus({ title, slug, sourcePath, context, versions, manifestStatus, sourceKind });
  const iterationCount =
    firstPositiveNumber(numberField(versionMeta, "iterationCount"), numberField(versionMeta, "iterations"), quality.iterations) ??
    (await countArticleIterations(absoluteDirectory, latestArticlePath));
  const latestRelativePath = latestArticlePath
    ? normalizeRelativePath(path.relative(config.root, latestArticlePath))
    : relativeDirectory;
  const folderOpenRef = makeArticleWorkspaceOpenRef("articles", relativeDirectory);
  const openRef = makeArticleWorkspaceOpenRef("articles", latestRelativePath);
  const statusLabel = status === "todo" ? "Todo" : status === "complete" ? "Complete" : "In progress";
  const searchText = [
    title,
    subtitle,
    heroImageUrl,
    notionUrl,
    mediumUrl,
    slug,
    year,
    platform,
    statusLabel,
    articleRating ? `${articleRating}/${articleRatingMax ?? 110}` : "",
    articleRatingModel,
    articleRatingProvider,
    iterationCount ? `${iterationCount} iterations` : "",
    quality.feedbackSummary,
    quality.biggestProblem,
    quality.improvementSummary,
    quality.pros?.join(" "),
    quality.cons?.join(" "),
    quality.sourceSummary,
    quality.evidenceCount ? `${quality.evidenceCount} evidence` : "",
    quality.wordCount ? `${quality.wordCount} words` : "",
    quality.totalCost ? `$${quality.totalCost}` : "",
    quality.totalTokens ? `${quality.totalTokens} tokens` : "",
    quality.evaluatorScores?.map((score) => `${score.label} ${score.score}/${score.maxScore ?? ""}`).join(" "),
    quality.phaseLog?.map((phase) => [phase.name, phase.status, phase.model, phase.rating, phase.notes].filter(Boolean).join(" ")).join(" "),
    heroImageProvider,
    heroImageModel,
    heroImageStatus,
    sourceRoot,
    sourceKind,
    sourcePath,
    subtitle,
    notionUrl,
    mediumUrl,
    context,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    slug,
    title,
    subtitle,
    heroImageUrl,
    heroImageProvider,
    heroImageModel,
    heroImageStatus,
    articleRating,
    articleRatingMax,
    articleRatingModel,
    articleRatingProvider,
    iterationCount,
    feedbackSummary: quality.feedbackSummary,
    biggestProblem: quality.biggestProblem,
    improvementSummary: quality.improvementSummary,
    pros: quality.pros,
    cons: quality.cons,
    sourceSummary: quality.sourceSummary,
    evidenceCount: quality.evidenceCount,
    wordCount: quality.wordCount,
    totalCost: quality.totalCost,
    totalTokens: quality.totalTokens,
    evaluatorScores: quality.evaluatorScores,
    phaseLog: quality.phaseLog,
    notionUrl,
    mediumUrl,
    year,
    platform,
    context,
    status,
    statusLabel,
    versions,
    artifactCount,
    importedAt,
    updatedAt,
    folderOpenRef,
    openRef,
    searchText,
  };
}

async function findLatestArticlePath(absoluteDirectory: string) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const versionDirectories = entries
    .filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

  for (const version of versionDirectories) {
    const versionPath = path.join(absoluteDirectory, version);
    const preferred = ["article.md", "article-medium.md", "overview.md"];
    for (const filename of preferred) {
      const candidate = path.join(versionPath, filename);
      const candidateStat = await stat(candidate).catch(() => null);
      if (candidateStat?.isFile()) return candidate;
    }

    const files = await readdir(versionPath, { withFileTypes: true }).catch(() => []);
    const markdown = files
      .filter((entry) => entry.isFile() && /\.mdx?$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    if (markdown[0]) return path.join(versionPath, markdown[0]);
  }

  const rootFiles = entries
    .filter((entry) => entry.isFile() && /\.mdx?$/i.test(entry.name))
    .map((entry) => entry.name);
  const preferred = ["article.md", "article-medium.md", "overview.md"];
  for (const filename of preferred) {
    if (rootFiles.includes(filename)) return path.join(absoluteDirectory, filename);
  }

  const versionedRootArticle = rootFiles
    .filter((filename) => /^article-v\d+\.mdx?$/i.test(filename))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }))[0];
  if (versionedRootArticle) return path.join(absoluteDirectory, versionedRootArticle);

  const markdown = rootFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))[0];
  if (markdown) return path.join(absoluteDirectory, markdown);

  return null;
}

async function countArticleVersions(absoluteDirectory: string) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const versionDirectories = entries.filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name)).length;
  const rootArticleVersions = entries.filter((entry) => entry.isFile() && /^article-v\d+\.mdx?$/i.test(entry.name)).length;
  return versionDirectories + rootArticleVersions;
}

async function countArticleIterations(absoluteDirectory: string, latestArticlePath: string | null) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const versionDirectories = entries.filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name)).length;
  const rootArticleVersions = entries.filter((entry) => entry.isFile() && /^article-v\d+\.mdx?$/i.test(entry.name)).length;
  const explicit = versionDirectories + rootArticleVersions;
  return explicit || (latestArticlePath ? 1 : 0);
}

async function countArticleArtifacts(absoluteDirectory: string) {
  const artifactRoots = [
    path.join(absoluteDirectory, "artifacts"),
    path.join(absoluteDirectory, "images"),
    path.join(absoluteDirectory, "sources"),
    path.join(absoluteDirectory, "evals"),
    path.join(absoluteDirectory, "prompts"),
    path.join(absoluteDirectory, "diffs"),
    path.join(absoluteDirectory, "logs"),
  ];
  let total = 0;
  for (const root of artifactRoots) {
    total += await countFilesRecursive(root, 5);
  }
  return total;
}

async function countFilesRecursive(directory: string, depth: number): Promise<number> {
  if (depth < 0) return 0;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    if (!isSafeName(entry.name)) continue;
    if (entry.isFile()) total += 1;
    else if (entry.isDirectory()) total += await countFilesRecursive(path.join(directory, entry.name), depth - 1);
  }
  return total;
}

async function readLatestVersionMetadata(absoluteDirectory: string) {
  const candidates = [path.join(absoluteDirectory, "version.json")];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const versionDirectories = entries
    .filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
  for (const version of versionDirectories) {
    candidates.push(path.join(absoluteDirectory, version, "version.json"));
    candidates.push(path.join(absoluteDirectory, version, "metadata.json"));
  }

  for (const candidate of candidates) {
    const record = await readJsonRecord(candidate);
    if (Object.keys(record).length) return record;
  }
  return {};
}

async function readArticleEvolutionSummary(absoluteDirectory: string) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const versionDirectories = entries
    .filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const overviewPaths = [
    path.join(absoluteDirectory, "overview.md"),
    path.join(absoluteDirectory, "artifacts", "original", "overview.md"),
    path.join(absoluteDirectory, "artifacts", "notes", "overview.md"),
    ...versionDirectories.map((version) => path.join(absoluteDirectory, version, "overview.md")),
  ];
  const ratingPaths = [
    path.join(absoluteDirectory, "rating.md"),
    path.join(absoluteDirectory, "evals", "rating.md"),
    path.join(absoluteDirectory, "artifacts", "evals", "rating.md"),
    ...versionDirectories.flatMap((version) => [
      path.join(absoluteDirectory, version, "rating.md"),
      path.join(absoluteDirectory, version, "evals", "rating.md"),
      path.join(absoluteDirectory, version, "artifacts", "evals", "rating.md"),
    ]),
  ];
  const workflowPaths = [
    path.join(absoluteDirectory, "workflow.json"),
    path.join(absoluteDirectory, "artifacts", "workflow.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "workflow.json"),
    path.join(absoluteDirectory, "artifacts", "logs", "workflow.json"),
    path.join(absoluteDirectory, "artifacts", "runs", "workflow.json"),
    ...versionDirectories.flatMap((version) => [
      path.join(absoluteDirectory, version, "workflow.json"),
      path.join(absoluteDirectory, version, "artifacts", "workflow.json"),
      path.join(absoluteDirectory, version, "artifacts", "logs", "workflow.json"),
    ]),
  ];
  const sourcePaths = [
    path.join(absoluteDirectory, "sources.json"),
    path.join(absoluteDirectory, "evidence.json"),
    path.join(absoluteDirectory, "research.json"),
    path.join(absoluteDirectory, "sources", "sources.json"),
    path.join(absoluteDirectory, "sources", "evidence.json"),
    path.join(absoluteDirectory, "sources", "research.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "sources.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "evidence.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "research.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "web-research.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "notion-page.json"),
    path.join(absoluteDirectory, "artifacts", "sources", "notion-blocks.json"),
    path.join(absoluteDirectory, "artifacts", "original", "sources.json"),
    path.join(absoluteDirectory, "artifacts", "original", "evidence.json"),
    path.join(absoluteDirectory, "artifacts", "original", "research.json"),
    ...versionDirectories.flatMap((version) => [
      path.join(absoluteDirectory, version, "sources.json"),
      path.join(absoluteDirectory, version, "evidence.json"),
      path.join(absoluteDirectory, version, "research.json"),
      path.join(absoluteDirectory, version, "sources", "sources.json"),
      path.join(absoluteDirectory, version, "sources", "evidence.json"),
      path.join(absoluteDirectory, version, "sources", "research.json"),
      path.join(absoluteDirectory, version, "artifacts", "sources", "sources.json"),
      path.join(absoluteDirectory, version, "artifacts", "sources", "evidence.json"),
      path.join(absoluteDirectory, version, "artifacts", "sources", "research.json"),
      path.join(absoluteDirectory, version, "artifacts", "sources", "web-research.json"),
    ]),
  ];

  const overviewSummaries = await Promise.all(
    overviewPaths.map(async (filePath) => {
      const text = await readTextSnippet(filePath, 60_000);
      return text ? parseArticleOverviewMarkdown(text) : {};
    })
  );
  const ratingSummaries = await Promise.all(
    ratingPaths.map(async (filePath) => {
      const text = await readTextSnippet(filePath, 80_000);
      return text ? parseRatingMarkdown(text) : {};
    })
  );
  const workflowSummaries = await Promise.all(
    workflowPaths.map(async (filePath) => summarizeWorkflowRecord(await readJsonRecord(filePath)))
  );
  const sourceSummaries = await Promise.all(
    sourcePaths.map(async (filePath) => summarizeSourceRecord(await readJsonValue(filePath)))
  );

  return mergeArticleEvolutionSummaries(...sourceSummaries, ...workflowSummaries, ...overviewSummaries, ...ratingSummaries);
}

async function readArticleHeroImageJsonUrl(absoluteDirectory: string) {
  const candidates = [
    path.join(absoluteDirectory, "artifacts", "images", "hero-image.json"),
    path.join(absoluteDirectory, "images", "hero-image.json"),
  ];

  for (const candidate of candidates) {
    const record = await readJsonRecord(candidate);
    const value =
      stringField(record, "url") ||
      stringField(record, "imageUrl") ||
      stringField(record, "heroImageUrl") ||
      stringField(record, "externalUrl") ||
      stringField(record, "src");
    if (value) return value;
  }

  return "";
}

async function findArticleHeroImagePath(absoluteDirectory: string) {
  const relativeCandidates = [
    "artifacts/images/img-hero.png",
    "artifacts/images/img-hero.jpg",
    "artifacts/images/img-hero.jpeg",
    "artifacts/images/img-hero.webp",
    "artifacts/images/hero-image.png",
    "artifacts/images/hero-image.jpg",
    "artifacts/images/hero-image.jpeg",
    "artifacts/images/hero-image.webp",
    "images/img-hero.png",
    "images/hero-image.png",
  ];

  for (const relativePath of relativeCandidates) {
    const candidate = path.join(absoluteDirectory, relativePath);
    const candidateStat = await stat(candidate).catch(() => null);
    if (candidateStat?.isFile()) return relativePath;
  }

  const imageDirectories = [
    path.join(absoluteDirectory, "artifacts", "images"),
    path.join(absoluteDirectory, "images"),
  ];

  for (const imageDirectory of imageDirectories) {
    const files = await readdir(imageDirectory, { withFileTypes: true }).catch(() => []);
    const image = files
      .filter((entry) => entry.isFile() && IMAGE_MIME_TYPES[path.extname(entry.name).toLowerCase()])
      .map((entry) => entry.name)
      .sort((a, b) => scoreHeroImageName(b) - scoreHeroImageName(a) || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))[0];
    if (image) return normalizeRelativePath(path.relative(absoluteDirectory, path.join(imageDirectory, image)));
  }

  return "";
}

function scoreHeroImageName(name: string) {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower.includes("hero")) score += 100;
  if (lower.includes("img-hero")) score += 80;
  if (lower.includes("cover")) score += 60;
  if (lower.includes("generated-image")) score += 40;
  if (lower.includes("overlay")) score -= 20;
  if (lower.includes("small")) score -= 10;
  return score;
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = await readJsonValue(filePath);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

async function readJsonValue(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8").catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function readTextSnippet(filePath: string, maxBytes: number) {
  const buffer = await readFile(filePath).catch(() => null);
  if (!buffer) return "";
  return buffer.subarray(0, maxBytes).toString("utf8");
}

function extractArticleContext(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line && !/^!\[/.test(line) && !/^[-*_]{3,}$/.test(line))
    .slice(0, 4)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

function inferArticleStatus(input: {
  title: string;
  slug: string;
  sourcePath: string;
  context: string;
  versions: number;
  manifestStatus: string;
  sourceKind: string;
}): ArticleWorkspaceArticleStatus {
  const haystack = [input.title, input.slug, input.sourcePath, input.context, input.manifestStatus, input.sourceKind].join(" ").toLowerCase();
  if (/\b(posted|published|complete|final)\b/.test(haystack)) return "complete";
  if (input.versions === 0) return "todo";
  return "in_progress";
}

function detectArticlePlatform(values: string[]) {
  const haystack = values.join(" ").toLowerCase();
  if (/\blinkedin\b/.test(haystack)) return "LinkedIn";
  if (/\btwitter\b|\bx\b/.test(haystack)) return "X";
  if (/\binstagram\b/.test(haystack)) return "Instagram";
  if (/\byoutube\b/.test(haystack)) return "YouTube";
  if (/\bmedium\b/.test(haystack)) return "Medium";
  if (/\bblog\b/.test(haystack)) return "Blog";
  return "Medium";
}

function cleanTitle(value: string) {
  return value.replace(/^#+\s*/, "").replace(/\s+-\s+Posted$/i, "").trim() || "Untitled article";
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function firstStringInArrayField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) return "";
  return value.find((item): item is string => typeof item === "string" && item.trim().length > 0) ?? "";
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function firstPositiveNumber(...values: Array<number | undefined>) {
  return values.find((value) => value !== undefined && Number.isFinite(value) && value > 0);
}

function resolveArticleHeroImageUrl(config: SectionConfig, articleRelativeDirectory: string, value: string) {
  if (!value) return "";
  if (/^(https?:|data:|\/api\/)/i.test(value)) return value;
  const imageRelativePath = normalizeRelativePath(path.join(articleRelativeDirectory, value));
  const imageOpenRef = makeArticleWorkspaceOpenRef(config.section, imageRelativePath);
  return `/api/article/fs/blob?open=${encodeURIComponent(imageOpenRef)}`;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

async function pathExists(value: string) {
  return Boolean(await stat(value).catch(() => null));
}

function detectLanguage(extension: string) {
  switch (extension) {
    case ".md":
    case ".mdx":
      return "markdown";
    case ".json":
    case ".jsonl":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".html":
      return "html";
    case ".css":
      return "css";
    case ".js":
    case ".mjs":
      return "javascript";
    case ".ts":
    case ".tsx":
      return "typescript";
    default:
      return "text";
  }
}
