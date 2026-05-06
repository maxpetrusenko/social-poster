import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { modelCatalog, modelProviderCredentials } from "@/db/schema";
import { decryptSecret } from "@/lib/model-provider-secrets";
import { providerDefinition, type ModelProviderId } from "@/lib/model-provider-definitions";
import { resolveWorkspaceModelConfig } from "@/lib/model-providers";
import {
  makeArticleWorkspaceOpenRef,
  parseArticleWorkspaceOpenRef,
} from "@/lib/article-agent/workspace";
import { resolveArticleLocation } from "@/lib/article-agent/hero-image";

type RatingProvider = "openai" | "gemini";

type RatingRuntime = {
  provider: RatingProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  protocol: string;
};

type RawRatingResult = {
  score?: number;
  strengths?: string[];
  weaknesses?: string[];
  improvements?: string[];
  biggestProblem?: string | null;
  overallFeedback?: string | null;
  criteria?: Array<{ label?: string; score?: number; maxScore?: number; notes?: string }>;
};

type RatingPrompt = {
  system: string;
  user: string;
  userTemplate: string;
  title: string;
  articleCharacterLimit: number;
  articleCharactersUsed: number;
};

export type ArticleRatingResult = {
  score: number;
  maxScore: number;
  model: string;
  provider: RatingProvider;
  ratingRelativePath: string;
  overviewRelativePath: string;
  workflowRelativePath: string;
  evalRelativePath: string;
  ratingOpenRef: string;
  overviewOpenRef: string;
};

export async function rateArticleWorkspaceFile(input: {
  workspaceId: string;
  openRef: string;
  provider?: RatingProvider;
}): Promise<ArticleRatingResult> {
  const parsed = parseArticleWorkspaceOpenRef(input.openRef);
  if (parsed.config.section !== "articles") {
    throw new Error("Article rating can only run for article workspace files.");
  }

  const fileStat = await stat(parsed.absolutePath).catch(() => null);
  if (!fileStat?.isFile() || !/\.mdx?$/i.test(parsed.relativePath)) {
    throw new Error("Open an article Markdown file before rating.");
  }

  const articleLocation = resolveArticleLocation(parsed.config.root, parsed.relativePath, parsed.absolutePath);
  const markdown = await readFile(parsed.absolutePath, "utf8");
  const title = extractTitle(markdown) || path.basename(articleLocation.articleRootRelativePath);
  const runtime = await resolveRatingRuntime(input.workspaceId, input.provider);
  if (!runtime?.apiKey) {
    throw new Error("No supported rating model is configured. Add OpenAI or Gemini keys in model settings.");
  }

  const started = Date.now();
  const prompt = buildRatingPrompt({ title, markdown });
  const rawRating = await callRatingModel({ runtime, prompt });
  const rating = normalizeRating(rawRating);
  const durationSeconds = (Date.now() - started) / 1000;
  const timestamp = new Date().toISOString();
  const wordCount = countWords(markdown);
  const evidenceCount = countEvidenceLinks(markdown);
  const phaseName = "5_rate";
  const versionNumber = articleLocation.versionSlug.match(/\d+/)?.[0] ?? "1";
  const ratingAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "rating.md");
  const overviewAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "overview.md");
  const workflowAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "workflow.json");
  const evalAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "evals", `rating-${articleLocation.versionSlug}.json`);

  await mkdir(path.dirname(evalAbsolutePath), { recursive: true });
  await writeFile(ratingAbsolutePath, renderRatingMarkdown({
    versionNumber,
    timestamp,
    model: runtime.model,
    provider: runtime.provider,
    rating,
  }), "utf8");
  await writeFile(overviewAbsolutePath, renderOverviewMarkdown({
    title,
    timestamp,
    rating,
    model: runtime.model,
    provider: runtime.provider,
    wordCount,
    evidenceCount,
    durationSeconds,
    phaseName,
  }), "utf8");
  await writeFile(workflowAbsolutePath, `${JSON.stringify({
    kind: "article-rating-workflow",
    generatedAt: timestamp,
    articleOpenRef: parsed.openRef,
    articleRelativePath: parsed.relativePath,
    rating: rating.score,
    ratingMax: 10,
    ratingModel: runtime.model,
    ratingProvider: runtime.provider,
    wordCount,
    evidenceCount,
    phases: [
      { name: "1_source", status: "completed", notes: "Article source package already existed." },
      { name: phaseName, status: "completed", duration: Number(durationSeconds.toFixed(1)), model: runtime.model, rating: rating.score, notes: rating.overallFeedback ?? "Article rating" },
    ],
  }, null, 2)}\n`, "utf8");
  await writeFile(evalAbsolutePath, `${JSON.stringify({
    kind: "article-rating",
    generatedAt: timestamp,
    provider: runtime.provider,
    model: runtime.model,
    prompt: {
      system: prompt.system,
      userTemplate: prompt.userTemplate,
      title: prompt.title,
      articleCharacterLimit: prompt.articleCharacterLimit,
      articleCharactersUsed: prompt.articleCharactersUsed,
    },
    score: rating.score,
    maxScore: 10,
    pros: rating.strengths,
    cons: rating.weaknesses,
    rating,
    articleOpenRef: parsed.openRef,
    articleRelativePath: parsed.relativePath,
  }, null, 2)}\n`, "utf8");
  await updateVersionMetadata({
    versionPath: path.join(articleLocation.articleRootAbsolutePath, "version.json"),
    timestamp,
    runtime,
    rating,
    wordCount,
    evidenceCount,
  });

  const ratingRelativePath = normalizeSlashes(path.relative(parsed.config.root, ratingAbsolutePath));
  const overviewRelativePath = normalizeSlashes(path.relative(parsed.config.root, overviewAbsolutePath));
  const workflowRelativePath = normalizeSlashes(path.relative(parsed.config.root, workflowAbsolutePath));
  const evalRelativePath = normalizeSlashes(path.relative(parsed.config.root, evalAbsolutePath));

  return {
    score: rating.score,
    maxScore: 10,
    model: runtime.model,
    provider: runtime.provider,
    ratingRelativePath,
    overviewRelativePath,
    workflowRelativePath,
    evalRelativePath,
    ratingOpenRef: makeArticleWorkspaceOpenRef("articles", ratingRelativePath),
    overviewOpenRef: makeArticleWorkspaceOpenRef("articles", overviewRelativePath),
  };
}

function buildRatingPrompt(input: { title: string; markdown: string }): RatingPrompt {
  const articleCharacterLimit = 55_000;
  const system = [
    "You are a severe Medium article rating editor.",
    "Rate the article for human resonance, source-of-truth authority, evidence quality, structure, SEO/AEO/GEO answerability, originality, and Medium publish readiness.",
    "Return only JSON with keys: score, strengths, weaknesses, improvements, biggestProblem, overallFeedback, criteria.",
    "score is 0-10 with one decimal. criteria items have label, score, maxScore, notes.",
  ].join(" ");
  const article = input.markdown.slice(0, articleCharacterLimit);
  return {
    system,
    user: `TITLE: ${input.title}\n\nARTICLE MARKDOWN:\n${article}`,
    userTemplate: "TITLE: {{title}}\n\nARTICLE MARKDOWN:\n{{article_markdown}}",
    title: input.title,
    articleCharacterLimit,
    articleCharactersUsed: article.length,
  };
}

async function callRatingModel(input: { runtime: RatingRuntime; prompt: RatingPrompt }) {
  const text = input.runtime.provider === "gemini"
    ? await callGeminiRating(input.runtime, input.prompt.system, input.prompt.user)
    : await callOpenAIRating(input.runtime, input.prompt.system, input.prompt.user);
  return parseJsonFromText(text) as RawRatingResult;
}

async function callOpenAIRating(runtime: RatingRuntime, system: string, user: string) {
  const response = await fetch(`${runtime.baseUrl.replace(/\/+$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_object" } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`OpenAI rating failed: ${response.status} ${body.slice(0, 500)}`);
  }
  const data = await response.json() as Record<string, unknown>;
  return extractOpenAIText(data);
}

async function callGeminiRating(runtime: RatingRuntime, system: string, user: string) {
  const response = await fetch(`${runtime.baseUrl.replace(/\/+$/, "")}/v1beta/models/${runtime.model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": runtime.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Gemini rating failed: ${response.status} ${body.slice(0, 500)}`);
  }
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text).filter(Boolean).join("\n") ?? "";
}

async function resolveRatingRuntime(workspaceId: string, preferredProvider?: RatingProvider): Promise<RatingRuntime | null> {
  if (preferredProvider) {
    const preferred = await resolveSavedProviderRuntime(workspaceId, preferredProvider);
    if (preferred) return preferred;
  }

  for (const slot of ["writing", "fast", "agent"] as const) {
    const configured = await resolveWorkspaceModelConfig(workspaceId, slot).catch(() => null);
    if (configured && isRatingProvider(configured.provider)) {
      return {
        provider: configured.provider,
        model: configured.model,
        apiKey: configured.apiKey,
        baseUrl: configured.baseUrl || providerDefinition(configured.provider).defaultBaseUrl,
        protocol: configured.protocol,
      };
    }
  }

  return (await resolveSavedProviderRuntime(workspaceId, "openai")) ?? (await resolveSavedProviderRuntime(workspaceId, "gemini"));
}

async function resolveSavedProviderRuntime(workspaceId: string, provider: RatingProvider): Promise<RatingRuntime | null> {
  const credential = await db
    .select()
    .from(modelProviderCredentials)
    .where(and(eq(modelProviderCredentials.workspaceId, workspaceId), eq(modelProviderCredentials.provider, provider), ne(modelProviderCredentials.status, "revoked")))
    .orderBy(desc(modelProviderCredentials.updatedAt))
    .then((rows) => rows[0] ?? null);
  if (!credential) return null;

  const model = await db
    .select({ modelId: modelCatalog.modelId, capabilities: modelCatalog.capabilities })
    .from(modelCatalog)
    .where(and(eq(modelCatalog.workspaceId, workspaceId), eq(modelCatalog.credentialId, credential.id), eq(modelCatalog.provider, provider)))
    .then((rows) => selectRatingModel(provider, rows));

  return {
    provider,
    model: model || (provider === "openai" ? "gpt-5.4" : "gemini-3.1-pro-preview"),
    apiKey: decryptSecret(credential.encryptedApiKey),
    baseUrl: credential.baseUrl || providerDefinition(provider).defaultBaseUrl,
    protocol: credential.protocol || providerDefinition(provider).defaultProtocol,
  };
}

function normalizeRating(raw: RawRatingResult) {
  const score = clampScore(Number(raw.score));
  return {
    score,
    strengths: cleanStringArray(raw.strengths),
    weaknesses: cleanStringArray(raw.weaknesses),
    improvements: cleanStringArray(raw.improvements),
    biggestProblem: cleanOptionalString(raw.biggestProblem),
    overallFeedback: cleanOptionalString(raw.overallFeedback),
    criteria: (raw.criteria ?? []).map((criterion) => ({
      label: cleanOptionalString(criterion.label) || "Criterion",
      score: clampScore(Number(criterion.score), Number(criterion.maxScore) || 10),
      maxScore: Number(criterion.maxScore) || 10,
      notes: cleanOptionalString(criterion.notes) || "",
    })).slice(0, 8),
  };
}

function renderRatingMarkdown(input: {
  versionNumber: string;
  timestamp: string;
  model: string;
  provider: string;
  rating: ReturnType<typeof normalizeRating>;
}) {
  return `## V${input.versionNumber} Rating

**Timestamp:** ${input.timestamp}

### ${input.model}

**Provider:** ${input.provider}

**Score:** ${input.rating.score}/10

**Strengths:**
${renderBullets(input.rating.strengths)}

**Weaknesses:**
${renderBullets(input.rating.weaknesses)}

**Improvements:**
${renderBullets(input.rating.improvements)}

**Overall Feedback:** ${input.rating.overallFeedback || "No overall feedback returned."}

**Biggest Problem:** ${input.rating.biggestProblem || "None identified."}
`;
}

function renderOverviewMarkdown(input: {
  title: string;
  timestamp: string;
  rating: ReturnType<typeof normalizeRating>;
  model: string;
  provider: string;
  wordCount: number;
  evidenceCount: number;
  durationSeconds: number;
  phaseName: string;
}) {
  return `---
title: ${input.title.replace(/\n/g, " ")}
source: article-workspace
published: false
created: ${input.timestamp.slice(0, 10)}
rating: ${input.rating.score}/10
rating_model: ${input.model}
rating_provider: ${input.provider}
word_count: ${input.wordCount}
evidence_count: ${input.evidenceCount}
iterations: 1
mode: filesystem
---

# Article Overview

${input.rating.overallFeedback || "Rating completed."}

## Phase Log

| Step | Status | Time | Cost | LLM/Tool | Rating | Notes |
|------|--------|------|------|----------|--------|-------|
| 1_source | completed | 0.0s | - | article-workspace | - | Source package already existed |
| ${input.phaseName} | completed | ${input.durationSeconds.toFixed(1)}s | - | ${input.model} | ${input.rating.score}/10 | Rating phase |
| TOTAL | completed | ${input.durationSeconds.toFixed(1)}s | - | - | ${input.rating.score}/10 | Consensus rating |
`;
}

async function updateVersionMetadata(input: {
  versionPath: string;
  timestamp: string;
  runtime: RatingRuntime;
  rating: ReturnType<typeof normalizeRating>;
  wordCount: number;
  evidenceCount: number;
}) {
  const raw = await readFile(input.versionPath, "utf8").catch(() => "");
  const metadata = parseRecord(raw);
  await writeFile(input.versionPath, `${JSON.stringify({
    ...metadata,
    rating: input.rating.score,
    ratingMax: 10,
    ratingModel: input.runtime.model,
    ratingProvider: input.runtime.provider,
    ratingStatus: "completed",
    ratingGeneratedAt: input.timestamp,
    wordCount: input.wordCount,
    evidenceCount: input.evidenceCount,
    overviewFile: "overview.md",
    ratingFile: "rating.md",
    workflowFile: "workflow.json",
  }, null, 2)}\n`, "utf8");
}

function extractOpenAIText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  return output.flatMap((item) => {
    if (!isRecord(item)) return [];
    const content = Array.isArray(item.content) ? item.content : [];
    return content.map((part) => {
      if (!isRecord(part)) return "";
      return typeof part.text === "string" ? part.text : "";
    });
  }).filter(Boolean).join("\n");
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)?.[1];
  return JSON.parse(fenced || trimmed);
}

function extractTitle(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function countWords(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
}

function countEvidenceLinks(markdown: string) {
  return new Set(markdown.match(/https?:\/\/[^)\s]+/g) ?? []).size;
}

function clampScore(value: number, max = 10) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Number(value.toFixed(1))));
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(cleanOptionalString).filter((item): item is string => Boolean(item)).slice(0, 8) : [];
}

function cleanOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function renderBullets(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function parseRecord(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRatingProvider(provider: ModelProviderId | string): provider is RatingProvider {
  return provider === "openai" || provider === "gemini";
}

function selectRatingModel(
  provider: RatingProvider,
  rows: Array<{ modelId: string; capabilities: string[] | null }>
) {
  const textModels = rows.filter((row) => row.capabilities?.includes("text"));
  if (provider === "gemini") {
    const preferred = [
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-pro-latest",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-2.0-flash",
    ];
    return (
      preferred.find((modelId) => textModels.some((row) => row.modelId === modelId)) ??
      textModels.find((row) => /^gemini-/.test(row.modelId) && !/embedding|image|tts/.test(row.modelId))?.modelId
    );
  }

  return textModels[0]?.modelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}
