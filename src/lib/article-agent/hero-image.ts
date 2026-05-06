import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { modelCatalog, modelProviderCredentials } from "@/db/schema";
import { decryptSecret } from "@/lib/model-provider-secrets";
import { providerDefinition } from "@/lib/model-provider-definitions";
import { resolveWorkspaceModelConfig } from "@/lib/model-providers";
import { uploadImageAsset } from "@/lib/storage/r2";
import {
  makeArticleWorkspaceOpenRef,
  parseArticleWorkspaceOpenRef,
} from "@/lib/article-agent/workspace";

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

type ArticleImageProvider = "openai" | "gemini";

type ArticleImageRuntime = {
  provider: ArticleImageProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type ArticleHeroImageResult = {
  text: string;
  markdownImage: string;
  imageOpenRef: string;
  imageRelativePath: string;
  imageAbsolutePath: string;
  publicImageUrl: string | null;
  evalRelativePath: string;
  evalOpenRef: string;
  model: string;
  provider: ArticleImageProvider;
  contentType: string;
  prompt: string;
  responseText: string | null;
};

export async function generateAndInsertArticleHeroImage(input: {
  workspaceId: string;
  openRef: string;
  provider?: ArticleImageProvider;
  prompt?: string;
}) {
  const parsed = parseArticleWorkspaceOpenRef(input.openRef);
  if (parsed.config.section !== "articles") {
    throw new Error("Hero images can only be generated for article workspace files.");
  }

  const extension = path.extname(parsed.relativePath).toLowerCase();
  if (![".md", ".mdx"].includes(extension)) {
    throw new Error("Open an article Markdown file before generating a hero image.");
  }

  const fileStat = await stat(parsed.absolutePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error("Article file not found.");
  }

  const articleLocation = resolveArticleLocation(parsed.config.root, parsed.relativePath, parsed.absolutePath);
  const markdown = await readFile(parsed.absolutePath, "utf8");
  const title = extractArticleTitle(markdown) || path.basename(articleLocation.articleRootRelativePath);
  const imagePrompt = buildHeroImagePrompt({ title, markdown, userPrompt: input.prompt });
  const runtime = await resolveArticleImageRuntime(input.workspaceId, input.provider);
  if (!runtime?.apiKey) {
    throw new Error(`${articleImageProviderLabel(input.provider)} image generation is not configured. Add a model provider key or set the provider API key env var.`);
  }

  const image = runtime.provider === "openai"
    ? await generateOpenAIImage({ runtime, prompt: imagePrompt })
    : await generateGeminiImage({ runtime, prompt: imagePrompt });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const contentExtension = extensionForContentType(image.contentType);
  const imageFileName = `hero-${articleLocation.versionSlug}-${timestamp}${contentExtension}`;
  const imageAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "artifacts", "images", imageFileName);
  const imageRelativePath = normalizeSlashes(path.relative(parsed.config.root, imageAbsolutePath));
  const imageArticleRelativePath = normalizeSlashes(path.relative(articleLocation.articleRootAbsolutePath, imageAbsolutePath));
  const imageMarkdownRelativePath = normalizeSlashes(path.relative(path.dirname(parsed.absolutePath), imageAbsolutePath));

  await mkdir(path.dirname(imageAbsolutePath), { recursive: true });
  await writeFile(imageAbsolutePath, image.bytes);

  const storedImage = await uploadImageAsset({
    bytes: image.bytes,
    contentType: image.contentType,
    keyPrefix: `article-heroes/${articleLocation.articleRootRelativePath}`,
    sourceName: imageFileName,
  }).catch(() => null);
  const publicImageUrl = storedImage?.url ?? null;
  const markdownImageSrc = publicImageUrl ?? imageMarkdownRelativePath;
  const markdownImage = `![${escapeAltText(title)} hero image](${markdownImageSrc})`;

  const updatedText = insertHeroImageMarkdown(markdown, markdownImage);
  await writeFile(parsed.absolutePath, updatedText, "utf8");

  const evalFileName = `hero-image-${articleLocation.versionSlug}-${timestamp}.json`;
  const evalAbsolutePath = path.join(articleLocation.articleRootAbsolutePath, "artifacts", "evals", evalFileName);
  const evalRelativePath = normalizeSlashes(path.relative(parsed.config.root, evalAbsolutePath));
  await mkdir(path.dirname(evalAbsolutePath), { recursive: true });
  await writeFile(
    evalAbsolutePath,
    `${JSON.stringify(
      {
        kind: "hero-image-generation",
        provider: runtime.provider,
        model: runtime.model,
        generatedAt: new Date().toISOString(),
        articleOpenRef: parsed.openRef,
        articleRelativePath: parsed.relativePath,
        imageRelativePath,
        publicImageUrl,
        storage: storedImage,
        insertedMarkdown: markdownImage,
        title,
        prompt: imagePrompt,
        responseText: image.text,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await updateArticleVersionMetadata({
    articleRootAbsolutePath: articleLocation.articleRootAbsolutePath,
    imageArticleRelativePath,
    publicImageUrl,
    provider: runtime.provider,
    model: runtime.model,
  });

  return {
    text: updatedText,
    markdownImage,
    imageOpenRef: makeArticleWorkspaceOpenRef("articles", imageRelativePath),
    imageRelativePath,
    imageAbsolutePath,
    publicImageUrl,
    evalRelativePath,
    evalOpenRef: makeArticleWorkspaceOpenRef("articles", evalRelativePath),
    model: runtime.model,
    provider: runtime.provider,
    contentType: image.contentType,
    prompt: imagePrompt,
    responseText: image.text,
  } satisfies ArticleHeroImageResult;
}

export function insertHeroImageMarkdown(markdown: string, markdownImage: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  removeExistingTopHeroImage(lines);

  let insertAt = 1;
  if (lines[0]?.trim() === "---") {
    const closingFrontmatter = lines.findIndex((line, index) => index > 0 && index < 40 && line.trim() === "---");
    if (closingFrontmatter > 0) {
      const firstContentAfterFrontmatter = lines.findIndex(
        (line, index) => index > closingFrontmatter && isArticleContentLine(line)
      );
      insertAt = firstContentAfterFrontmatter >= 0 ? firstContentAfterFrontmatter + 1 : closingFrontmatter + 1;
    } else {
      const firstContent = lines.findIndex((line, index) => index > 0 && isArticleContentLine(line));
      insertAt = firstContent >= 0 ? firstContent + 1 : lines.length;
    }
  } else {
    const firstContent = lines.findIndex(isArticleContentLine);
    insertAt = firstContent >= 0 ? firstContent + 1 : 0;
  }

  lines.splice(insertAt, 0, "", markdownImage, "");
  collapseExcessBlankLines(lines);
  return lines.join("\n");
}

export function resolveArticleLocation(root: string, relativePath: string, absolutePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const versionIndex = parts.findIndex((part) => /^v\d+$/i.test(part));
  if (versionIndex > 0) {
    const articleRootRelativePath = parts.slice(0, versionIndex).join("/");
    const articleRootAbsolutePath = path.resolve(root, articleRootRelativePath);
    assertInsideArticleRoot(articleRootAbsolutePath, absolutePath);

    return {
      articleRootRelativePath,
      articleRootAbsolutePath,
      versionSlug: parts[versionIndex],
    };
  }

  if (parts.length === 2 && isFlatArticleMarkdown(parts[1])) {
    const articleRootRelativePath = parts[0];
    const articleRootAbsolutePath = path.resolve(root, articleRootRelativePath);
    assertInsideArticleRoot(articleRootAbsolutePath, absolutePath);

    return {
      articleRootRelativePath,
      articleRootAbsolutePath,
      versionSlug: flatArticleVersionSlug(parts[1]),
    };
  }

  throw new Error("Open an article file such as articles/<slug>/article-v1.md or articles/<slug>/v001/article.md before generating a hero image.");
}

function assertInsideArticleRoot(articleRootAbsolutePath: string, absolutePath: string) {
  const articleRelativeToRoot = path.relative(articleRootAbsolutePath, absolutePath);
  if (articleRelativeToRoot.startsWith("..") || path.isAbsolute(articleRelativeToRoot)) {
    throw new Error("Article path escapes its workspace root.");
  }
}

function isFlatArticleMarkdown(filename: string) {
  return /^article(?:-v\d+|-medium)?\.mdx?$/i.test(filename);
}

function flatArticleVersionSlug(filename: string) {
  return filename.match(/^article-(v\d+)\.mdx?$/i)?.[1]?.toLowerCase() ?? "root";
}

function buildHeroImagePrompt(input: { title: string; markdown: string; userPrompt?: string }) {
  const articleBrief = input.markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400);
  const userPrompt = input.userPrompt?.trim();

  return [
    "Create a premium Medium hero image using the configured image generation model.",
    "Aspect ratio: 16:9 wide hero image.",
    "Style: editorial, high-signal, modern, cinematic, warm natural light, subtle texture, no stock-photo cheese.",
    "Important: do not include readable text, captions, logos, UI chrome, watermarks, or typography inside the image.",
    `Article title: ${input.title}`,
    `Article brief: ${articleBrief}`,
    userPrompt ? `Additional direction from editor: ${userPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateGeminiImage(input: { runtime: ArticleImageRuntime; prompt: string }) {
  const url = `${input.runtime.baseUrl.replace(/\/+$/, "")}/v1beta/models/${input.runtime.model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.runtime.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: input.prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Gemini hero image generation failed: ${response.status} ${message.slice(0, 500)}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const parts = data.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const imagePart = parts.find((part) => Boolean(part.inlineData?.data || part.inline_data?.data));
  const text = parts.map((part) => part.text).filter(Boolean).join("\n").trim() || null;
  const inline = imagePart?.inlineData ?? (
    imagePart?.inline_data
      ? { mimeType: imagePart.inline_data.mime_type, data: imagePart.inline_data.data }
      : undefined
  );

  if (!inline?.data) {
    throw new Error("Gemini response did not include image bytes.");
  }

  return {
    bytes: Buffer.from(inline.data, "base64"),
    contentType: inline.mimeType || "image/png",
    text,
  };
}

async function generateOpenAIImage(input: { runtime: ArticleImageRuntime; prompt: string }) {
  const response = await fetch(`${input.runtime.baseUrl.replace(/\/+$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.runtime.model,
      prompt: input.prompt,
      n: 1,
      size: "1536x1024",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`OpenAI hero image generation failed: ${response.status} ${message.slice(0, 500)}`);
  }

  const data = (await response.json()) as OpenAIImageResponse;
  const firstImage = data.data?.[0];
  if (firstImage?.b64_json) {
    return {
      bytes: Buffer.from(firstImage.b64_json, "base64"),
      contentType: "image/png",
      text: null,
    };
  }

  if (firstImage?.url) {
    const imageResponse = await fetch(firstImage.url, { signal: AbortSignal.timeout(120_000) });
    if (!imageResponse.ok) {
      throw new Error(`OpenAI generated image download failed: ${imageResponse.status}`);
    }
    return {
      bytes: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") || "image/png",
      text: null,
    };
  }

  throw new Error("OpenAI response did not include image bytes.");
}

async function resolveArticleImageRuntime(workspaceId: string, preferredProvider?: ArticleImageProvider): Promise<ArticleImageRuntime | null> {
  if (preferredProvider === "gemini") {
    return resolveGeminiArticleImageRuntime(workspaceId);
  }
  if (preferredProvider === "openai") {
    return resolveOpenAIArticleImageRuntime(workspaceId);
  }

  const configured = await resolveWorkspaceModelConfig(workspaceId, "image").catch(() => null);
  if (configured) {
    if (!isArticleImageProvider(configured.provider)) {
      return resolveSavedGeminiImageRuntime(workspaceId, configured.baseUrl);
    }
    if (configured.provider === "gemini" && !isGeminiGenerateContentImageModel(configured.model)) {
      return resolveSavedGeminiImageRuntime(workspaceId, configured.baseUrl);
    }
    return {
      provider: configured.provider,
      model: configured.model,
      apiKey: configured.apiKey,
      baseUrl: configured.baseUrl || "https://generativelanguage.googleapis.com",
    };
  }

  const savedGemini = await resolveSavedGeminiImageRuntime(workspaceId);
  if (savedGemini) return savedGemini;

  const savedOpenAI = await resolveSavedOpenAIImageRuntime(workspaceId);
  if (savedOpenAI) return savedOpenAI;

  return resolveGeminiArticleImageRuntime(workspaceId);
}

async function resolveGeminiArticleImageRuntime(workspaceId: string): Promise<ArticleImageRuntime | null> {
  const configured = await resolveWorkspaceModelConfig(workspaceId, "image").catch(() => null);
  if (configured?.provider === "gemini") {
    if (!isGeminiGenerateContentImageModel(configured.model)) {
      return resolveSavedGeminiImageRuntime(workspaceId, configured.baseUrl);
    }
    return {
      provider: "gemini",
      model: configured.model,
      apiKey: configured.apiKey,
      baseUrl: configured.baseUrl || providerDefinition("gemini").defaultBaseUrl,
    };
  }

  const savedGemini = await resolveSavedGeminiImageRuntime(workspaceId);
  if (savedGemini) return savedGemini;

  const apiKey = geminiApiKeyFromEnv();
  if (!apiKey) return null;

  return {
    provider: "gemini",
    model: process.env.GEMINI_ARTICLE_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview",
    apiKey,
    baseUrl: "https://generativelanguage.googleapis.com",
  };
}

function isArticleImageProvider(provider: string): provider is ArticleImageProvider {
  return provider === "openai" || provider === "gemini";
}

function articleImageProviderLabel(provider: ArticleImageProvider | undefined) {
  if (provider === "openai") return "OpenAI";
  return "Gemini";
}

function geminiApiKeyFromEnv() {
  return providerDefinition("gemini").envKeys.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";
}

function openAIApiKeyFromEnv() {
  return providerDefinition("openai").envKeys.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";
}

async function resolveOpenAIArticleImageRuntime(workspaceId: string): Promise<ArticleImageRuntime | null> {
  const configured = await resolveWorkspaceModelConfig(workspaceId, "image").catch(() => null);
  if (configured?.provider === "openai") {
    return {
      provider: "openai",
      model: configured.model,
      apiKey: configured.apiKey,
      baseUrl: configured.baseUrl || providerDefinition("openai").defaultBaseUrl,
    };
  }

  const savedOpenAI = await resolveSavedOpenAIImageRuntime(workspaceId);
  if (savedOpenAI) return savedOpenAI;

  const apiKey = openAIApiKeyFromEnv();
  if (!apiKey) return null;

  return {
    provider: "openai",
    model: process.env.OPENAI_ARTICLE_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    apiKey,
    baseUrl: providerDefinition("openai").defaultBaseUrl,
  };
}

async function resolveSavedOpenAIImageRuntime(workspaceId: string): Promise<ArticleImageRuntime | null> {
  const openAICredential = await db
    .select()
    .from(modelProviderCredentials)
    .where(
      and(
        eq(modelProviderCredentials.workspaceId, workspaceId),
        eq(modelProviderCredentials.provider, "openai"),
        ne(modelProviderCredentials.status, "revoked")
      )
    )
    .orderBy(desc(modelProviderCredentials.updatedAt))
    .then((rows) => rows[0] ?? null);

  if (!openAICredential) return null;

  return {
    provider: "openai",
    model: await selectSavedOpenAIImageModel(workspaceId, openAICredential.id),
    apiKey: decryptSecret(openAICredential.encryptedApiKey),
    baseUrl: openAICredential.baseUrl || providerDefinition("openai").defaultBaseUrl,
  };
}

async function selectSavedOpenAIImageModel(workspaceId: string, credentialId: string) {
  const envModel = process.env.OPENAI_ARTICLE_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL;
  if (envModel) return envModel;

  const models = await db
    .select({
      modelId: modelCatalog.modelId,
      capabilities: modelCatalog.capabilities,
    })
    .from(modelCatalog)
    .where(
      and(
        eq(modelCatalog.workspaceId, workspaceId),
        eq(modelCatalog.credentialId, credentialId),
        eq(modelCatalog.provider, "openai")
      )
    );

  return models.find((model) => model.capabilities?.includes("image"))?.modelId ?? "gpt-image-1";
}

async function resolveSavedGeminiImageRuntime(workspaceId: string, baseUrlOverride?: string): Promise<ArticleImageRuntime | null> {
  const geminiCredential = await db
    .select()
    .from(modelProviderCredentials)
    .where(
      and(
        eq(modelProviderCredentials.workspaceId, workspaceId),
        eq(modelProviderCredentials.provider, "gemini"),
        ne(modelProviderCredentials.status, "revoked")
      )
    )
    .orderBy(desc(modelProviderCredentials.updatedAt))
    .then((rows) => rows[0] ?? null);

  if (!geminiCredential) return null;

  const model = await selectSavedGeminiImageModel(workspaceId, geminiCredential.id);

  return {
    provider: "gemini",
    model,
    apiKey: decryptSecret(geminiCredential.encryptedApiKey),
    baseUrl: baseUrlOverride || geminiCredential.baseUrl || providerDefinition("gemini").defaultBaseUrl,
  };
}

async function selectSavedGeminiImageModel(workspaceId: string, credentialId: string) {
  const envModel = process.env.GEMINI_ARTICLE_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODEL;
  if (envModel && isGeminiGenerateContentImageModel(envModel)) return envModel;

  const models = await db
    .select({
      modelId: modelCatalog.modelId,
      capabilities: modelCatalog.capabilities,
    })
    .from(modelCatalog)
    .where(
      and(
        eq(modelCatalog.workspaceId, workspaceId),
        eq(modelCatalog.credentialId, credentialId),
        eq(modelCatalog.provider, "gemini")
      )
    );
  const imageModels = models
    .filter((model) => model.capabilities?.includes("image"))
    .map((model) => model.modelId)
    .filter(isGeminiGenerateContentImageModel);

  return pickPreferredGeminiImageModel(imageModels) ?? "gemini-3.1-flash-image-preview";
}

function pickPreferredGeminiImageModel(models: string[]) {
  const preferred = [
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
  ];
  return preferred.find((model) => models.includes(model)) ?? models[0] ?? null;
}

function isGeminiGenerateContentImageModel(model: string) {
  const id = model.toLowerCase();
  return id.startsWith("gemini-") && id.includes("image");
}

async function updateArticleVersionMetadata(input: {
  articleRootAbsolutePath: string;
  imageArticleRelativePath: string;
  publicImageUrl: string | null;
  provider: ArticleImageProvider;
  model: string;
}) {
  const versionPath = path.join(input.articleRootAbsolutePath, "version.json");
  const raw = await readFile(versionPath, "utf8").catch(() => "");
  const metadata = parseJsonRecord(raw);
  const existingImages = Array.isArray(metadata.images)
    ? metadata.images.filter((item): item is string => typeof item === "string")
    : [];
  const images = [
    input.imageArticleRelativePath,
    ...existingImages.filter((item) => item !== input.imageArticleRelativePath),
  ];

  await writeFile(
    versionPath,
    `${JSON.stringify(
      {
        ...metadata,
        images,
        heroImageUrl: input.publicImageUrl ?? input.imageArticleRelativePath,
        heroImageProvider: input.provider,
        heroImageModel: input.model,
        heroImageStatus: "generated",
        heroImageGeneratedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function removeExistingTopHeroImage(lines: string[]) {
  const imageLine = /^!\[[^\]]*]\([^)]+\)\s*$/;
  for (let index = Math.min(lines.length - 1, 12); index >= 0; index -= 1) {
    if (imageLine.test(lines[index]?.trim() ?? "")) {
      lines.splice(index, 1);
    }
  }
}

function collapseExcessBlankLines(lines: string[]) {
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (lines[index]?.trim() === "" && lines[index - 1]?.trim() === "") {
      lines.splice(index, 1);
    }
  }
}

function isArticleContentLine(line: string) {
  const trimmed = line.trim();
  return Boolean(trimmed && trimmed !== "---" && !trimmed.startsWith("![](") && !trimmed.startsWith("<!--"));
}

function extractArticleTitle(markdown: string) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return cleanTitle(heading);

  const line = markdown
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && item !== "---" && !item.startsWith("![") && !item.startsWith(">"));
  return line ? cleanTitle(line) : null;
}

function cleanTitle(title: string) {
  return title.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
}

function escapeAltText(value: string) {
  return value.replace(/[\]\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Article";
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  return ".png";
}

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}
