import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { modelProviderCredentials } from "@/db/schema";
import { decryptSecret } from "@/lib/model-provider-secrets";
import { providerDefinition } from "@/lib/model-provider-definitions";
import { resolveWorkspaceModelConfig } from "@/lib/model-providers";
import { storeCampaignMedia } from "@/lib/campaigns/media";

export type CampaignImageGenerationResult = {
  url: string;
  contentType: string;
  width: number;
  height: number;
  model: string;
  provider: "gemini";
  text: string | null;
};

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

export async function generateCampaignImage(input: {
  workspaceId: string;
  campaignId: string;
  prompt: string;
}): Promise<CampaignImageGenerationResult | null> {
  const runtime = await resolveCampaignImageRuntime(input.workspaceId);
  if (!runtime?.apiKey) return null;
  if (runtime.provider !== "gemini") {
    throw new Error(`Campaign image generation requires a Gemini image model. Current image default is ${runtime.provider}.`);
  }

  const url = `${runtime.baseUrl.replace(/\/+$/, "")}/v1beta/models/${runtime.model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": runtime.apiKey,
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
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Gemini image generation failed: ${response.status} ${message.slice(0, 300)}`);
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

  const contentType = inline.mimeType || "image/png";
  const stored = await storeCampaignMedia({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    bytes: Buffer.from(inline.data, "base64"),
    contentType,
    width: 2048,
    height: 2048,
  });

  return {
    url: stored.url,
    contentType,
    width: stored.width,
    height: stored.height,
    model: runtime.model,
    provider: "gemini",
    text,
  };
}

async function resolveCampaignImageRuntime(workspaceId: string) {
  const configured = await resolveWorkspaceModelConfig(workspaceId, "image").catch(() => null);
  if (configured) {
    return {
      provider: configured.provider,
      model: configured.model,
      apiKey: configured.apiKey,
      baseUrl: configured.baseUrl || "https://generativelanguage.googleapis.com",
    };
  }

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

  if (geminiCredential) {
    return {
      provider: "gemini" as const,
      model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview",
      apiKey: decryptSecret(geminiCredential.encryptedApiKey),
      baseUrl: geminiCredential.baseUrl || providerDefinition("gemini").defaultBaseUrl,
    };
  }

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  if (!apiKey) return null;

  return {
    provider: "gemini" as const,
    model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview",
    apiKey,
    baseUrl: "https://generativelanguage.googleapis.com",
  };
}
