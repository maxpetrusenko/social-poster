#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = process.env.ARTICLE_WORKSPACE_DIR || path.join(PROJECT_ROOT, "data", "article-workspace");
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, "youtube-medium-playlist-queue.json");
const DEFAULT_PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLOgmJw9hZGS8";
const DEFAULT_MEDIUM_RSS_URL = "https://medium.com/feed/@max.petrusenko";
const RATING_TARGET = 9.5;

const playlistUrl = process.env.YOUTUBE_MEDIUM_PLAYLIST_URL || DEFAULT_PLAYLIST_URL;
const mediumRssUrl = process.env.MEDIUM_RSS_URL || DEFAULT_MEDIUM_RSS_URL;

const packageSearchRoots = [
  path.join(WORKSPACE_ROOT, "articles"),
  "/Users/maxpetrusenko/Desktop/Projects/medium-automation/articles",
  "/Users/maxpetrusenko/Desktop/Projects/medium-generator/articles",
  "/Users/maxpetrusenko/Documents/Codex",
].filter((root, index, roots) => existsSync(root) && roots.indexOf(root) === index);

const generatedAt = new Date().toISOString();
const playlist = await fetchPlaylist(playlistUrl);
const mediumPosts = await fetchMediumPosts(mediumRssUrl);
const articleRecords = await findArticleRecords(playlist.items.map((item) => item.videoId));

const items = playlist.items.map((item) => {
  const record = articleRecords.get(item.videoId);
  const matchingMediumPost = findMatchingMediumPost(record, mediumPosts);
  return buildQueueItem(item, record, matchingMediumPost);
});

const historical = buildHistoricalPostedItems(articleRecords, mediumPosts, new Set(items.map((item) => item.videoId)));
const summary = summarizeQueue(items, historical);

const queue = {
  generatedAt,
  playlistUrl,
  playlistId: playlist.playlistId,
  playlistTitle: playlist.playlistTitle,
  mediumRssUrl,
  packageSearchRoots,
  summary,
  items,
  historical,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(PROJECT_ROOT, OUTPUT_PATH)} (${items.length} playlist items, ${historical.length} historical posted).`);
console.log(`Approval needed: ${summary.needsApproval}. Missing article packages: ${summary.missingArticle}. Posted: ${summary.posted}.`);

async function fetchPlaylist(url) {
  const output = execFileSync("yt-dlp", ["--flat-playlist", "--dump-json", url], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const lines = output.split(/\r?\n/).filter(Boolean);
  const parsed = lines.map((line) => JSON.parse(line));
  const items = parsed
    .filter((entry) => entry.id)
    .map((entry, index) => ({
      position: index + 1,
      videoId: String(entry.id),
      title: String(entry.title || entry.fulltitle || "Untitled YouTube video"),
      channel: String(entry.channel || entry.uploader || ""),
      sourceUrl: `https://www.youtube.com/watch?v=${entry.id}`,
    }));
  return {
    playlistId: extractPlaylistId(url),
    playlistTitle: parsed.find((entry) => entry.playlist_title)?.playlist_title || "medium",
    items,
  };
}

async function fetchMediumPosts(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 SocialPosterQueue/1.0",
      accept: "application/rss+xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Medium RSS ${response.status}: ${await response.text().then((text) => text.slice(0, 240))}`);
  }
  const xml = await response.text();
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return itemMatches.map((match) => {
    const item = match[1] || "";
    const title = decodeXml(readXmlTag(item, "title"));
    const link = decodeXml(readXmlTag(item, "link"));
    const pubDate = decodeXml(readXmlTag(item, "pubDate"));
    const guid = decodeXml(readXmlTag(item, "guid"));
    return {
      title,
      link,
      guid,
      postId: extractMediumPostId(link) || extractMediumPostId(guid),
      pubDate,
    };
  });
}

async function findArticleRecords(videoIds) {
  const records = new Map();
  if (!videoIds.length || !packageSearchRoots.length) return records;

  const pattern = videoIds.map(escapeRegExp).join("|");
  let files = [];
  try {
    const output = execFileSync(
      "rg",
      [
        "-l",
        pattern,
        ...packageSearchRoots,
        "--glob",
        "version.json",
        "--glob",
        "workflow.json",
        "--glob",
        "import-manifest.json",
        "--glob",
        "overview.md",
        "--glob",
        "article*.md",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!.next/**",
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    );
    files = output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  const packageDirs = new Set(files.map(inferPackageDirectory).filter(Boolean));
  for (const packageDir of await findHistoricalYouTubePackageDirs()) {
    packageDirs.add(packageDir);
  }
  for (const packageDir of packageDirs) {
    const record = await readArticleRecord(packageDir);
    if (!record.videoId) continue;
    const existing = records.get(record.videoId);
    if (!existing || scoreArticleRecord(record) > scoreArticleRecord(existing)) {
      records.set(record.videoId, record);
    }
  }
  return records;
}

async function findHistoricalYouTubePackageDirs() {
  const articlesRoot = path.join(WORKSPACE_ROOT, "articles");
  if (!existsSync(articlesRoot)) return [];
  try {
    const output = execFileSync(
      "rg",
      [
        "-l",
        "youtube|youtu\\.be|medium.com",
        articlesRoot,
        "--glob",
        "version.json",
        "--glob",
        "workflow.json",
        "--glob",
        "import-manifest.json",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!.next/**",
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    );
    return output.split(/\r?\n/).filter(Boolean).map(inferPackageDirectory).filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

async function readArticleRecord(packageDir) {
  const version = await readJson(path.join(packageDir, "version.json"));
  const workflow = await readJson(path.join(packageDir, "workflow.json"));
  const manifest = await readJson(path.join(packageDir, "import-manifest.json"));
  const overview = await readText(path.join(packageDir, "overview.md"));
  const combined = JSON.stringify({ version, workflow, manifest, overview, packageDir });
  const sourceUrl = firstString(version.sourceUrl, workflow.source?.url, manifest.sourceUrl);
  const videoId = firstString(workflow.source?.videoId, extractYouTubeVideoId(sourceUrl), extractYouTubeVideoId(combined));
  const articleFilePath = firstString(
    version.articleFile,
    workflow.articleFile,
    workflow.articlePath,
    manifest.articleFile,
    findLatestRootArticle(packageDir)
  );
  const title = firstString(version.title, workflow.title, manifest.title, extractMarkdownTitle(overview), path.basename(packageDir));
  const mediumUrl = firstString(
    manifest.mediumUrl,
    version.mediumUrl,
    version.mediumPostUrl,
    workflow.mediumUrl,
    workflow.mediumDraft?.url,
    workflow.mediumDraft?.editUrl,
    workflow.titleGate?.mediumEditUrl,
    version.titleGate?.mediumEditUrl
  );
  const postId = extractMediumPostId(mediumUrl) || extractMediumPostId(combined);
  return {
    videoId,
    slug: firstString(version.slug, manifest.slug, path.basename(packageDir)),
    title,
    subtitle: firstString(version.subtitle, manifest.subtitle),
    packagePath: packageDir,
    articleFilePath,
    rating: firstNumber(version.consensusRating, version.rating, workflow.rating, workflow.consensusRating),
    ratingTarget: firstNumber(version.ratingTarget, workflow.ratingTarget) || RATING_TARGET,
    status: firstString(workflow.status, version.status, manifest.status),
    scheduledStatus: firstString(version.scheduledStatus, workflow.scheduledStatus),
    publicPreviewUrl: firstString(
      workflow.publicPreviewUrl,
      version.publicPreviewUrl,
      workflow.preview?.url,
      version.hostedPreviewUrl
    ),
    mediumUrl,
    mediumPostId: postId,
    mediumDraftStatus: firstString(workflow.mediumDraft?.status, version.mediumDraft?.status),
    updatedAt: firstString(version.updatedAt, workflow.updatedAt, manifest.importedAt),
  };
}

function buildQueueItem(video, record, mediumPost) {
  if (!record) {
    return {
      ...video,
      status: "missing_article",
      statusLabel: "Missing article",
      needsApproval: false,
      articleTitle: null,
      articleSlug: null,
      articlePackagePath: null,
      articleFilePath: null,
      dashboardUrl: null,
      publicPreviewUrl: null,
      mediumUrl: null,
      mediumPublishedAt: null,
      rating: null,
      ratingTarget: RATING_TARGET,
      nextAction: "Generate article package from this playlist video.",
      proof: ["Live YouTube playlist item found.", "No local article package found for this video ID."],
    };
  }

  if (mediumPost) {
    return {
      ...video,
      status: "posted",
      statusLabel: "Posted",
      needsApproval: false,
      articleTitle: record.title,
      articleSlug: record.slug,
      articlePackagePath: record.packagePath,
      articleFilePath: record.articleFilePath,
      dashboardUrl: dashboardUrlForPackage(record.packagePath),
      publicPreviewUrl: record.publicPreviewUrl || null,
      mediumUrl: mediumPost.link,
      mediumPublishedAt: mediumPost.pubDate || null,
      rating: record.rating || null,
      ratingTarget: record.ratingTarget || RATING_TARGET,
      nextAction: "No approval needed. Public Medium RSS contains this article.",
      proof: [
        "Local package found for this YouTube video ID.",
        `Public Medium RSS matched ${mediumPost.postId ? `post ${mediumPost.postId}` : "the article title"}.`,
      ],
    };
  }

  const rating = record.rating || null;
  const ratingTarget = record.ratingTarget || RATING_TARGET;
  const draftStatus = record.mediumDraftStatus || record.scheduledStatus || record.status || "";
  const reviewNeeded = !rating || rating < ratingTarget || /review|approval|blocked|waiting|not_created|low_rating/i.test(draftStatus);
  return {
    ...video,
    status: reviewNeeded ? "needs_review" : "generated_not_posted",
    statusLabel: reviewNeeded ? "Needs approval" : "Generated",
    needsApproval: reviewNeeded,
    articleTitle: record.title,
    articleSlug: record.slug,
    articlePackagePath: record.packagePath,
    articleFilePath: record.articleFilePath,
    dashboardUrl: dashboardUrlForPackage(record.packagePath),
    publicPreviewUrl: record.publicPreviewUrl || null,
    mediumUrl: record.mediumUrl || null,
    mediumPublishedAt: null,
    rating,
    ratingTarget,
    nextAction: reviewNeeded
      ? "Review package and fix blockers before Medium mutation."
      : "Approve, create Medium draft, add tags, schedule through visible browser.",
    proof: [
      "Local package found for this YouTube video ID.",
      rating ? `Recorded rating ${rating}/${ratingTarget}.` : "No rating found.",
      draftStatus ? `Workflow status: ${draftStatus}.` : "No Medium draft or schedule proof found.",
    ],
  };
}

function buildHistoricalPostedItems(articleRecords, mediumPosts, currentVideoIds) {
  const historical = [];
  for (const record of articleRecords.values()) {
    if (!record.videoId || currentVideoIds.has(record.videoId)) continue;
    const post = findMatchingMediumPost(record, mediumPosts);
    if (!post) continue;
    historical.push({
      videoId: record.videoId,
      title: record.title,
      articleSlug: record.slug,
      articlePackagePath: record.packagePath,
      dashboardUrl: dashboardUrlForPackage(record.packagePath),
      mediumUrl: post.link,
      mediumPublishedAt: post.pubDate || null,
      status: "posted_not_in_current_playlist",
      statusLabel: "Posted, not in playlist",
    });
  }
  return historical;
}

function summarizeQueue(items, historical) {
  return {
    totalCurrentPlaylist: items.length,
    posted: items.filter((item) => item.status === "posted").length,
    needsApproval: items.filter((item) => item.needsApproval).length,
    missingArticle: items.filter((item) => item.status === "missing_article").length,
    generatedNotPosted: items.filter((item) => item.status === "generated_not_posted").length,
    historicalPostedNotInPlaylist: historical.length,
  };
}

function findMatchingMediumPost(record, mediumPosts) {
  if (!record) return null;
  const postId = record.mediumPostId || extractMediumPostId(record.mediumUrl);
  if (postId) {
    const byId = mediumPosts.find((post) => post.postId === postId);
    if (byId) return byId;
  }
  const recordTitle = normalizeTitle(record.title);
  if (!recordTitle) return null;
  return mediumPosts.find((post) => normalizeTitle(post.title) === recordTitle) || null;
}

function inferPackageDirectory(filePath) {
  const normalized = path.resolve(filePath);
  const parts = normalized.split(path.sep);
  const articleIndex = parts.lastIndexOf("articles");
  if (articleIndex >= 0 && parts[articleIndex + 1]) {
    return parts.slice(0, articleIndex + 2).join(path.sep);
  }
  const basename = path.basename(normalized);
  if (/^(version|workflow|import-manifest)\.json$/i.test(basename) || /^overview\.md$/i.test(basename)) {
    return path.dirname(normalized);
  }
  if (/^article.*\.mdx?$/i.test(basename)) return path.dirname(normalized);
  return null;
}

function dashboardUrlForPackage(packagePath) {
  const articlesRoot = path.join(WORKSPACE_ROOT, "articles");
  const relative = path.relative(articlesRoot, packagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const slug = relative.split(path.sep)[0];
  return `/dashboard/articles?open=${encodeURIComponent(`articles:${encodeURIComponent(slug)}`)}`;
}

function findLatestRootArticle(packageDir) {
  try {
    const output = execFileSync("find", [packageDir, "-maxdepth", "1", "-type", "f", "-name", "article*.md"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }))[0];
  } catch {
    return "";
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function readXmlTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() || "";
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractPlaylistId(url) {
  return new URL(url).searchParams.get("list") || "";
}

function extractYouTubeVideoId(value) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
    /\b([a-zA-Z0-9_-]{11})\b/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractMediumPostId(value = "") {
  const match = String(value).match(/(?:\/p\/|[-])([0-9a-f]{12})(?:\/|$|[?#])/i);
  return match?.[1]?.toLowerCase() || "";
}

function extractMarkdownTitle(value) {
  const match = value.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function normalizeTitle(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreArticleRecord(record) {
  return [
    record.mediumPostId ? 50 : 0,
    record.publicPreviewUrl ? 20 : 0,
    record.rating ? 10 : 0,
    record.articleFilePath ? 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
