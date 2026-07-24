#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_SITE_ROOT = "/Users/maxpetrusenko/Desktop/Projects/maxpetrusenko.com/nextjs";
const DEFAULT_PUBLIC_BASE_URL = "https://www.maxpetrusenko.com";

function usage() {
  console.error(`Usage:
  node scripts/export-medium-public-preview.mjs \\
    --package data/article-workspace/articles/<slug> \\
    [--article article-v12.md] \\
    [--site-root /Users/maxpetrusenko/Desktop/Projects/maxpetrusenko.com/nextjs] \\
    [--public-base-url https://www.maxpetrusenko.com] \\
    [--publish] \\
    [--allow-low-rating]`);
}

function parseArgs(argv) {
  const args = {
    siteRoot: DEFAULT_SITE_ROOT,
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--package") {
      args.packageDir = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--article") {
      args.article = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--site-root") {
      args.siteRoot = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--public-base-url") {
      args.publicBaseUrl = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--allow-low-rating") {
      args.allowLowRating = true;
    } else if (arg === "--publish") {
      args.publish = true;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function imageSrcForPreview(src, assetBasePath = "") {
  if (/^https?:\/\//.test(src) || src.startsWith("/") || src.startsWith("#")) {
    return src;
  }

  return `${assetBasePath.replace(/\/$/, "")}/${src.replace(/^\.\//, "")}`;
}

function renderMarkdown(markdown, { assetBasePath = "" } = {}) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let listOpen = false;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listOpen) return;
    output.push("</ul>");
    listOpen = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      closeList();
      const alt = escapeHtml(image[1] || "Article image");
      const src = escapeHtml(imageSrcForPreview(image[2], assetBasePath));
      output.push(`<figure><img src="${src}" alt="${alt}"></figure>`);
      continue;
    }

    if (line === "---" || line === "***") {
      flushParagraph();
      closeList();
      output.push("<hr>");
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      closeList();
      output.push(`<blockquote><p>${renderInline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${renderInline(listItem[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return output.join("\n");
}

function assertMaxVoiceAntiFormulaGate(markdown, articleFile) {
  const failures = [];

  if (/^(?:A|The)\s+(?:useful|simple|practical|quick)\s+test:\s*$/gim.test(markdown)) {
    failures.push("diagnostic signpost");
  }

  if (/\b[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2}(?:[’']s|[’'])\s+strongest\s+(?:line|point|claim|argument)\b/giu.test(markdown)) {
    failures.push("attributed critic spotlight");
  }

  const paragraphs = markdown
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const pairedAphorism = paragraphs.some((paragraph) =>
    /^[A-Z][A-Za-z'’-]+\s+([a-z]+)\s+[^.!?]{1,50}\.\s+[A-Z][A-Za-z'’-]+\s+\1\s+[^.!?]{1,50}\.$/i.test(paragraph)
  );
  if (pairedAphorism) {
    failures.push("paired aphorism");
  }

  const lines = markdown.split(/\r?\n/);
  let labelDefinitionRun = 0;
  let maxLabelDefinitionRun = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[A-Z][A-Za-z -]{1,24}:\s+\S/.test(line)) {
      labelDefinitionRun += 1;
      maxLabelDefinitionRun = Math.max(maxLabelDefinitionRun, labelDefinitionRun);
    } else {
      labelDefinitionRun = 0;
    }
  }
  if (maxLabelDefinitionRun >= 3) {
    failures.push("unbulleted label-definition pseudo-list");
  }

  if (failures.length > 0) {
    throw new Error(
      `Refusing to export preview for ${articleFile}: Max Voice Anti-Formula Gate failed: ${failures.join(", ")}.`
    );
  }
}

function pickTitle(markdown, version) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || version.title || "Medium article preview";
}

function readArticleEval(packageDir, prefix, articleFile) {
  const match = /^article-v(\d+)\.md$/.exec(articleFile);
  if (!match) return null;
  const filePath = path.join(packageDir, "evals", `${prefix}v${match[1]}.json`);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, data: readJson(filePath) };
}

function normalizeArticleFile(value) {
  return typeof value === "string" ? path.basename(value) : "";
}

function assertSameArticleFile(evalName, evalData, articleFile) {
  const evalArticleFile = normalizeArticleFile(evalData.articleFile || evalData.article || evalData.articlePath);
  if (evalArticleFile && evalArticleFile !== articleFile) {
    throw new Error(`${evalName} belongs to ${evalArticleFile}, not ${articleFile}.`);
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertTitleGate({ packageDir, articleFile, articleHash }) {
  const titleEval = readArticleEval(packageDir, "title-", articleFile);
  if (!titleEval) {
    throw new Error(`Refusing to export preview for ${articleFile}: missing evals/title-vN.json.`);
  }

  assertSameArticleFile(path.relative(packageDir, titleEval.filePath), titleEval.data, articleFile);
  if (titleEval.data.articleHash !== articleHash) {
    throw new Error(`Refusing to export preview for ${articleFile}: title gate article hash mismatch.`);
  }

  const gate = titleEval.data.titleGate || titleEval.data;
  const selected = gate.selected || titleEval.data.selected || {};
  const candidateCount = numberOrNull(gate.candidateCount)
    ?? (Array.isArray(gate.candidates) ? gate.candidates.length : null)
    ?? (Array.isArray(titleEval.data.candidates) ? titleEval.data.candidates.length : null)
    ?? (Array.isArray(titleEval.data.titleCandidates) ? titleEval.data.titleCandidates.length : null);
  const titleScore = numberOrNull(gate.chosenTitleScore ?? gate.titleScore ?? gate.selectedTitleScore ?? selected.titleScore);
  const subtitleScore = numberOrNull(gate.chosenSubtitleScore ?? gate.subtitleScore ?? gate.selectedSubtitleScore ?? selected.subtitleScore);
  const minimumScore = 9.2;

  if ((candidateCount ?? 0) < 10) {
    throw new Error(`Refusing to export preview for ${articleFile}: title gate has ${candidateCount ?? 0} candidates, expected at least 10.`);
  }

  if ((titleScore ?? 0) < minimumScore || (subtitleScore ?? 0) < minimumScore) {
    throw new Error(
      `Refusing to export preview for ${articleFile}: title/subtitle gate failed. ` +
      `Need ${minimumScore}/10, got title ${titleScore ?? "missing"} and subtitle ${subtitleScore ?? "missing"}.`
    );
  }
}

function assertPrepublishGate({ packageDir, articleFile, articleHash }) {
  const prepublishEval = readArticleEval(packageDir, "prepublish-", articleFile);
  if (!prepublishEval) {
    throw new Error(`Refusing to export preview for ${articleFile}: missing evals/prepublish-vN.json from the reliability reviewer.`);
  }

  assertSameArticleFile(path.relative(packageDir, prepublishEval.filePath), prepublishEval.data, articleFile);
  if (prepublishEval.data.articleHash !== articleHash) {
    throw new Error(`Refusing to export preview for ${articleFile}: prepublish gate article hash mismatch.`);
  }

  const status = String(
    prepublishEval.data.status ||
    prepublishEval.data.reviewerStatus ||
    prepublishEval.data.consensusStatus ||
    ""
  ).toLowerCase();
  const proofGates = prepublishEval.data.proofGates || {};
  const vetoCleared =
    proofGates.qualityReviewerVetoCleared === true ||
    prepublishEval.data.qualityReviewerVetoCleared === true ||
    prepublishEval.data.veto === false ||
    ["passed", "approved", "review_ready", "ready"].includes(status);
  const reviewableBlocker =
    prepublishEval.data.reviewableBlocker === true ||
    prepublishEval.data.blockerWorthReview === true ||
    status.startsWith("blocked_review");

  if (!vetoCleared && !reviewableBlocker) {
    throw new Error(`Refusing to export preview for ${articleFile}: reliability reviewer did not clear veto or record a reviewable blocker.`);
  }

  const requiredTarget = numberOrNull(prepublishEval.data.requiredTarget) ?? 9.5;
  const minimumCategoryTarget = numberOrNull(prepublishEval.data.minimumCategoryTarget) ?? requiredTarget;
  const overallScore = numberOrNull(
    prepublishEval.data.overallScore ??
    prepublishEval.data.consensusRating ??
    prepublishEval.data.rating
  );
  const dimensions = prepublishEval.data.dimensions || {};
  const criticalScores = Object.entries(dimensions)
    .filter(([name]) => !["seo", "aeoGeo"].includes(name))
    .map(([name, score]) => [name, numberOrNull(score)])
    .filter(([, score]) => score !== null);
  const failedCritical = criticalScores.filter(([, score]) => score < minimumCategoryTarget);

  if (overallScore !== null && overallScore < requiredTarget && !reviewableBlocker) {
    throw new Error(
      `Refusing to export preview for ${articleFile}: overall score ${overallScore}/10 is below ${requiredTarget}/10.`
    );
  }

  if (failedCritical.length > 0 && !reviewableBlocker) {
    throw new Error(
      `Refusing to export preview for ${articleFile}: prepublish gates below ${minimumCategoryTarget}/10: ` +
      failedCritical.map(([name, score]) => `${name}=${score}`).join(", ")
    );
  }
}

function assertPreviewGate({ packageDir, articleFile, articleHash, allowLowRating }) {
  if (allowLowRating) return;

  assertTitleGate({ packageDir, articleFile, articleHash });
  assertPrepublishGate({ packageDir, articleFile, articleHash });

  const ratingEval = readArticleEval(packageDir, "rating-", articleFile);
  if (!ratingEval) {
    throw new Error(`Refusing to export preview for ${articleFile}: missing evals/rating-vN.json.`);
  }
  assertSameArticleFile(path.relative(packageDir, ratingEval.filePath), ratingEval.data, articleFile);
  const score = numberOrNull(ratingEval.data.score);
  const target = numberOrNull(ratingEval.data.requiredTarget) ?? 9.5;
  if (ratingEval.data.articleHash !== articleHash) {
    throw new Error(`Refusing to export preview for ${articleFile}: rating gate article hash mismatch.`);
  }
  if (ratingEval.data.blockers?.length || (score ?? 0) < target) {
    throw new Error(`Refusing to export preview for ${articleFile}: exact rating gate failed. Need ${target}/10 with no blockers, got ${score ?? "missing"}.`);
  }
}

function buildHtml({ markdown, version, publicUrl, slug, publish, articleHash }) {
  const title = pickTitle(markdown, version);
  const robots = publish ? "" : '  <meta name="robots" content="noindex,nofollow">\n';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${robots}  <meta name="article:status" content="${publish ? "published" : "preview"}">
  <meta name="source-article-sha256" content="${articleHash}">
  <link rel="canonical" href="${escapeHtml(publicUrl)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f1e7;
      --ink: #221f1a;
      --muted: #6d6255;
      --rule: #d9cbbb;
      --accent: #8a3f1b;
      --panel: #fffaf2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, #fff7e6 0, #f7f1e7 34%, #eee5d7 100%);
      color: var(--ink);
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.66;
    }
    main {
      max-width: 780px;
      margin: 0 auto;
      padding: 48px 22px 84px;
    }
    h1 {
      margin: 0 0 22px;
      font-size: clamp(38px, 7vw, 58px);
      line-height: 0.98;
      letter-spacing: 0;
    }
    h2 {
      margin: 48px 0 14px;
      font-size: clamp(25px, 4vw, 33px);
      line-height: 1.13;
      letter-spacing: 0;
    }
    h3 {
      margin: 34px 0 12px;
      font-size: 23px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p, li {
      font-size: 20px;
      margin: 0 0 20px;
    }
    ul { padding-left: 24px; margin: 0 0 28px; }
    li { margin-bottom: 8px; }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    blockquote {
      margin: 30px 0;
      padding: 4px 0 4px 22px;
      border-left: 4px solid var(--accent);
      color: #433b32;
      font-style: italic;
      background: linear-gradient(90deg, rgba(138,63,27,0.06), rgba(138,63,27,0));
    }
    blockquote p { margin: 0; font-size: 22px; }
    figure { margin: 0 0 34px; }
    img { display: block; width: 100%; height: auto; border-radius: 6px; box-shadow: 0 18px 44px rgba(42, 32, 20, 0.16); }
    hr { border: 0; border-top: 1px solid var(--rule); margin: 42px 0; }
    code { background: #eadfce; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    em { color: #4a4138; }
    @media (max-width: 620px) {
      main { padding: 28px 18px 64px; }
      p, li { font-size: 18px; }
      blockquote p { font-size: 19px; }
    }
  </style>
</head>
<body>
  <main>
${renderMarkdown(markdown, { assetBasePath: `/medium/${slug}` })}
  </main>
</body>
</html>
`;
}

function isLocalImageReference(src) {
  return !/^(https?:)?\/\//i.test(src) && !src.startsWith("/") && !src.startsWith("data:");
}

function copyReferencedLocalImages(markdown, packageDir, outputDir) {
  const imageRegex = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  const copied = [];
  let match;

  while ((match = imageRegex.exec(markdown))) {
    const src = match[1];
    if (!isLocalImageReference(src)) continue;

    const normalized = path.normalize(src);
    if (normalized.startsWith("..")) {
      throw new Error(`Refusing to copy image outside package: ${src}`);
    }

    const sourcePath = path.join(packageDir, normalized);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Referenced image not found: ${sourcePath}`);
    }

    const destinationPath = path.join(outputDir, normalized);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push({ src, sourcePath, destinationPath });
  }

  return copied;
}

function publishPreviewDirAtomically(tempDir, outputDir) {
  const backupDir = `${outputDir}.backup-${Date.now()}`;
  let backupCreated = false;

  try {
    if (fs.existsSync(outputDir)) {
      fs.renameSync(outputDir, backupDir);
      backupCreated = true;
    }
    fs.renameSync(tempDir, outputDir);
    if (backupCreated) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (!fs.existsSync(outputDir) && backupCreated && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, outputDir);
    }
    throw error;
  }
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
  const articleFile = args.article || version.articleFile || "article-v1.md";
  const articlePath = path.join(packageDir, articleFile);
  if (!fs.existsSync(articlePath)) {
    throw new Error(`Article file not found: ${articlePath}`);
  }
  const articleBytes = fs.readFileSync(articlePath);
  const articleHash = createHash("sha256").update(articleBytes).digest("hex");
  assertPreviewGate({ packageDir, articleFile, articleHash, allowLowRating: args.allowLowRating });
  const markdown = articleBytes.toString("utf8");
  assertMaxVoiceAntiFormulaGate(markdown, articleFile);
  const siteRoot = path.resolve(args.siteRoot);
  const outputDir = path.join(siteRoot, "public", "medium", slug);
  const tempDir = path.join(siteRoot, "public", "medium", `.tmp-${slug}-${Date.now()}`);
  const outputPath = path.join(outputDir, "index.html");
  const publicUrl = `${args.publicBaseUrl.replace(/\/$/, "")}/medium/${slug}/`;
  const html = buildHtml({ markdown, version, publicUrl, slug, publish: args.publish, articleHash });
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  const copiedImages = copyReferencedLocalImages(markdown, packageDir, tempDir);
  const manifest = {
    slug,
    title: pickTitle(markdown, version),
    publicUrl,
    outputPath,
    sourceUrl: version.sourceUrl || workflow.source?.url || null,
    articlePath,
    articleHash,
    exportedAt: new Date().toISOString(),
    status: args.publish ? "published" : version.consensusStatus || workflow.status || "needs_review",
    publishMode: args.publish ? "published" : "preview",
    copiedImages,
    ratings: {
      gemini: version.rating ?? null,
      gpt: version.gptRating ?? null,
      consensus: version.consensusRating ?? null,
    },
  };

  fs.writeFileSync(path.join(tempDir, "index.html"), html);
  fs.writeFileSync(path.join(tempDir, "preview-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  publishPreviewDirAtomically(tempDir, outputDir);

  console.log(`exported ${publicUrl}`);
  console.log(outputPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
