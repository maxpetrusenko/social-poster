import "server-only";

import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  modelCatalog,
  modelProviderCredentials,
  workspaceModelDefaults,
} from "@/db/schema";
import {
  CURATED_MODELS,
  MODEL_PROVIDERS,
  type DiscoveredModel,
  type ModelCapability,
  type ModelProviderId,
  providerDefinition,
} from "@/lib/model-provider-definitions";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/model-provider-secrets";
export { isModelProviderId } from "@/lib/model-provider-definitions";

export async function listModelSettings(workspaceId: string) {
  const [credentials, models, defaults] = await Promise.all([
    db
      .select()
      .from(modelProviderCredentials)
      .where(eq(modelProviderCredentials.workspaceId, workspaceId))
      .orderBy(desc(modelProviderCredentials.createdAt)),
    db
      .select()
      .from(modelCatalog)
      .where(eq(modelCatalog.workspaceId, workspaceId))
      .orderBy(desc(modelCatalog.updatedAt)),
    db
      .select()
      .from(workspaceModelDefaults)
      .where(eq(workspaceModelDefaults.workspaceId, workspaceId))
      .then((rows) => rows[0] ?? null),
  ]);

  return {
    providers: credentials.map((credential) => ({
      ...credential,
      encryptedApiKey: undefined,
      encryptedManagementKey: undefined,
    })),
    models,
    defaults,
    definitions: MODEL_PROVIDERS,
    curated: CURATED_MODELS,
  };
}

export async function createModelProvider(input: {
  workspaceId: string;
  userId: string;
  provider: ModelProviderId;
  label?: string;
  apiKey: string;
  managementKey?: string;
  baseUrl?: string;
  protocol?: string;
  manualModelIds?: string[];
}) {
  const definition = providerDefinition(input.provider);
  const now = new Date();
  const keyMask = maskSecret(input.apiKey);
  const id = crypto.randomUUID();
  const discovered = await discoverModels({
    provider: input.provider,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl?.trim() || definition.defaultBaseUrl,
  });
  const models = mergeModels(CURATED_MODELS[input.provider] ?? [], discovered);

  await db.insert(modelProviderCredentials).values({
    id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    label: input.label?.trim() || definition.label,
    baseUrl: input.baseUrl?.trim() || definition.defaultBaseUrl || null,
    protocol: input.protocol?.trim() || definition.defaultProtocol,
    encryptedApiKey: encryptSecret(input.apiKey),
    encryptedManagementKey: input.managementKey ? encryptSecret(input.managementKey) : null,
    keyPrefix: keyMask.prefix,
    keySuffix: keyMask.suffix,
    status: "active",
    statusMessage: models.length ? `${models.length} models synced` : "Provider connected",
    lastTestedAt: now,
    lastSyncedAt: now,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });

  await upsertModels({
    workspaceId: input.workspaceId,
    credentialId: id,
    provider: input.provider,
    models: [
      ...models,
      ...(input.manualModelIds ?? []).map((modelId) => ({
        modelId,
        displayName: modelId,
        capabilities: ["text"] as ModelCapability[],
        source: "manual" as const,
      })),
    ],
  });

  return { ok: true, count: models.length + (input.manualModelIds?.length ?? 0) };
}

export async function importEnvModelProviders(input: {
  workspaceId: string;
  userId: string;
}) {
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const definition of MODEL_PROVIDERS) {
    if (definition.id === "custom") continue;
    const key = definition.envKeys.map((name) => process.env[name]?.trim()).find(Boolean);
    if (!key) {
      skipped.push(definition.label);
      continue;
    }
    const existing = await db
      .select({ id: modelProviderCredentials.id })
      .from(modelProviderCredentials)
      .where(
        and(
          eq(modelProviderCredentials.workspaceId, input.workspaceId),
          eq(modelProviderCredentials.provider, definition.id)
        )
      )
      .then((rows) => rows[0] ?? null);
    if (existing) {
      skipped.push(definition.label);
      continue;
    }
    await createModelProvider({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: definition.id,
      apiKey: key,
    });
    imported.push(definition.label);
  }

  return { imported, skipped };
}

export async function syncModelProvider(workspaceId: string, credentialId: string) {
  const credential = await db
    .select()
    .from(modelProviderCredentials)
    .where(
      and(
        eq(modelProviderCredentials.id, credentialId),
        eq(modelProviderCredentials.workspaceId, workspaceId)
      )
    )
    .then((rows) => rows[0] ?? null);

  if (!credential) throw new Error("Model provider not found");

  const provider = credential.provider as ModelProviderId;
  const apiKey = decryptSecret(credential.encryptedApiKey);
  const now = new Date();

  try {
    const discovered = await discoverModels({
      provider,
      apiKey,
      baseUrl: credential.baseUrl || providerDefinition(provider).defaultBaseUrl,
    });
    const models = mergeModels(CURATED_MODELS[provider] ?? [], discovered);
    await upsertModels({
      workspaceId,
      credentialId,
      provider,
      models,
    });
    await db
      .update(modelProviderCredentials)
      .set({
        status: "active",
        statusMessage: models.length ? `${models.length} models synced` : "Provider connected",
        lastTestedAt: now,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(modelProviderCredentials.id, credentialId));
    return { ok: true, count: models.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model sync failed";
    await db
      .update(modelProviderCredentials)
      .set({
        status: "error",
        statusMessage: message,
        lastTestedAt: now,
        updatedAt: now,
      })
      .where(eq(modelProviderCredentials.id, credentialId));
    return { ok: false, error: message, count: 0 };
  }
}

async function discoverModels(input: {
  provider: ModelProviderId;
  apiKey: string;
  baseUrl: string;
}): Promise<DiscoveredModel[]> {
  if (input.provider === "gemini") return discoverGemini(input);
  if (input.provider === "anthropic") return discoverAnthropic(input);
  if (input.provider === "openrouter") return discoverOpenRouter(input);
  return discoverOpenAICompatible(input);
}

async function discoverOpenAICompatible(input: {
  provider: ModelProviderId;
  apiKey: string;
  baseUrl: string;
}) {
  const url = `${trimTrailingSlash(input.baseUrl)}/v1/models`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${input.provider} model list failed: ${response.status}`);
  const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? [])
    .map((item) => String(item.id ?? ""))
    .filter(Boolean)
    .map((modelId) => ({
      modelId,
      displayName: displayName(modelId),
      capabilities: inferCapabilities(modelId),
      source: "discovered" as const,
    }));
}

async function discoverAnthropic(input: { apiKey: string; baseUrl: string }) {
  const response = await fetch(`${trimTrailingSlash(input.baseUrl)}/v1/models`, {
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Anthropic model list failed: ${response.status}`);
  const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? [])
    .map((item) => String(item.id ?? ""))
    .filter(Boolean)
    .map((modelId) => ({
      modelId,
      displayName: displayName(modelId),
      capabilities: inferCapabilities(modelId),
      source: "discovered" as const,
    }));
}

async function discoverGemini(input: { apiKey: string; baseUrl: string }) {
  const url = new URL(`${trimTrailingSlash(input.baseUrl)}/v1beta/models`);
  url.searchParams.set("key", input.apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Gemini model list failed: ${response.status}`);
  const data = (await response.json()) as { models?: Array<Record<string, unknown>> };
  return (data.models ?? [])
    .map((item) => ({
      rawId: String(item.name ?? ""),
      displayName: String(item.displayName ?? ""),
      methods: Array.isArray(item.supportedGenerationMethods)
        ? item.supportedGenerationMethods.map(String)
        : [],
    }))
    .filter((item) => item.rawId)
    .map((item) => {
      const modelId = item.rawId.replace(/^models\//, "");
      return {
        modelId,
        displayName: item.displayName || displayName(modelId),
        capabilities: item.methods.includes("embedContent")
          ? (["embeddings"] as ModelCapability[])
          : inferCapabilities(modelId),
        source: "discovered" as const,
        metadata: { supportedGenerationMethods: item.methods },
      };
    });
}

async function discoverOpenRouter(input: { apiKey: string; baseUrl: string }) {
  const response = await fetch(`${trimTrailingSlash(input.baseUrl)}/v1/models`, {
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenRouter model list failed: ${response.status}`);
  const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? [])
    .map((item) => {
      const modelId = String(item.id ?? "");
      const pricing = item.pricing as Record<string, unknown> | undefined;
      return {
        modelId,
        displayName: String(item.name ?? "") || displayName(modelId),
        capabilities: inferCapabilities(modelId),
        inputPrice: pricing?.prompt != null ? String(pricing.prompt) : null,
        outputPrice: pricing?.completion != null ? String(pricing.completion) : null,
        contextWindow:
          typeof item.context_length === "number" ? item.context_length : null,
        source: "discovered" as const,
      };
    })
    .filter((model) => model.modelId);
}

function mergeModels(curatedModels: DiscoveredModel[], discoveredModels: DiscoveredModel[]) {
  const byId = new Map<string, DiscoveredModel>();
  for (const model of curatedModels) byId.set(model.modelId, model);
  for (const model of discoveredModels) byId.set(model.modelId, model);
  return Array.from(byId.values());
}

async function upsertModels(input: {
  workspaceId: string;
  credentialId: string;
  provider: ModelProviderId;
  models: DiscoveredModel[];
}) {
  const now = new Date();
  for (const model of input.models) {
    const existing = await db
      .select({ id: modelCatalog.id })
      .from(modelCatalog)
      .where(
        and(
          eq(modelCatalog.workspaceId, input.workspaceId),
          eq(modelCatalog.provider, input.provider),
          eq(modelCatalog.modelId, model.modelId)
        )
      )
      .then((rows) => rows[0] ?? null);
    const values = {
      workspaceId: input.workspaceId,
      credentialId: input.credentialId,
      provider: input.provider,
      modelId: model.modelId,
      displayName: model.displayName || displayName(model.modelId),
      capabilities: model.capabilities,
      contextWindow: model.contextWindow ?? null,
      inputPrice: model.inputPrice ?? null,
      outputPrice: model.outputPrice ?? null,
      status: model.source === "manual" ? "manual" : "available",
      source: model.source,
      lastSeenAt: now,
      metadata: model.metadata ?? null,
      updatedAt: now,
    };
    if (existing) {
      await db.update(modelCatalog).set(values).where(eq(modelCatalog.id, existing.id));
    } else {
      await db.insert(modelCatalog).values({
        id: crypto.randomUUID(),
        ...values,
        createdAt: now,
      });
    }
  }
}

export async function revokeModelProvider(workspaceId: string, credentialId: string) {
  await db
    .update(modelProviderCredentials)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(modelProviderCredentials.id, credentialId),
        eq(modelProviderCredentials.workspaceId, workspaceId)
      )
    );
}

export async function saveModelDefaults(input: {
  workspaceId: string;
  writingModelCatalogId?: string | null;
  replyModelCatalogId?: string | null;
  agentModelCatalogId?: string | null;
  fastModelCatalogId?: string | null;
  imageModelCatalogId?: string | null;
  embeddingModelCatalogId?: string | null;
}) {
  const now = new Date();
  const requestedCatalogIds = Array.from(
    new Set(
      [
        input.writingModelCatalogId,
        input.replyModelCatalogId,
        input.agentModelCatalogId,
        input.fastModelCatalogId,
        input.imageModelCatalogId,
        input.embeddingModelCatalogId,
      ].filter((id): id is string => Boolean(id))
    )
  );

  if (requestedCatalogIds.length) {
    const activeModels = await db
      .select({ id: modelCatalog.id })
      .from(modelCatalog)
      .innerJoin(
        modelProviderCredentials,
        eq(modelCatalog.credentialId, modelProviderCredentials.id)
      )
      .where(
        and(
          eq(modelCatalog.workspaceId, input.workspaceId),
          eq(modelProviderCredentials.workspaceId, input.workspaceId),
          eq(modelProviderCredentials.status, "active"),
          inArray(modelCatalog.id, requestedCatalogIds)
        )
      );
    const activeModelIds = new Set(activeModels.map((model) => model.id));
    const invalidCatalogIds = requestedCatalogIds.filter((id) => !activeModelIds.has(id));
    if (invalidCatalogIds.length) {
      throw new Error("Only models from tested active keys can be selected.");
    }
  }

  const existing = await db
    .select({ workspaceId: workspaceModelDefaults.workspaceId })
    .from(workspaceModelDefaults)
    .where(eq(workspaceModelDefaults.workspaceId, input.workspaceId))
    .then((rows) => rows[0] ?? null);
  const values = {
    writingModelCatalogId: input.writingModelCatalogId ?? null,
    replyModelCatalogId: input.replyModelCatalogId ?? null,
    agentModelCatalogId: input.agentModelCatalogId ?? null,
    fastModelCatalogId: input.fastModelCatalogId ?? null,
    imageModelCatalogId: input.imageModelCatalogId ?? null,
    embeddingModelCatalogId: input.embeddingModelCatalogId ?? null,
    updatedAt: now,
  };
  if (existing) {
    await db
      .update(workspaceModelDefaults)
      .set(values)
      .where(eq(workspaceModelDefaults.workspaceId, input.workspaceId));
  } else {
    await db.insert(workspaceModelDefaults).values({
      workspaceId: input.workspaceId,
      ...values,
      createdAt: now,
    });
  }
}

export async function resolveWorkspaceModelConfig(
  workspaceId: string,
  slot: "writing" | "reply" | "agent" | "fast" | "image" | "embedding"
) {
  const defaults = await db
    .select()
    .from(workspaceModelDefaults)
    .where(eq(workspaceModelDefaults.workspaceId, workspaceId))
    .then((rows) => rows[0] ?? null);
  const catalogId =
    slot === "writing"
      ? defaults?.writingModelCatalogId
      : slot === "reply"
        ? defaults?.replyModelCatalogId
        : slot === "agent"
          ? defaults?.agentModelCatalogId
          : slot === "fast"
            ? defaults?.fastModelCatalogId
            : slot === "image"
              ? defaults?.imageModelCatalogId
              : defaults?.embeddingModelCatalogId;

  if (!catalogId) return null;

  const row = await db
    .select({
      model: modelCatalog,
      credential: modelProviderCredentials,
    })
    .from(modelCatalog)
    .innerJoin(modelProviderCredentials, eq(modelCatalog.credentialId, modelProviderCredentials.id))
    .where(and(eq(modelCatalog.id, catalogId), eq(modelCatalog.workspaceId, workspaceId)))
    .then((rows) => rows[0] ?? null);

  if (!row || row.credential.status !== "active") return null;

  return {
    provider: row.model.provider as ModelProviderId,
    model: row.model.modelId,
    apiKey: decryptSecret(row.credential.encryptedApiKey),
    baseUrl: row.credential.baseUrl || providerDefinition(row.model.provider).defaultBaseUrl,
    protocol: row.credential.protocol,
  };
}

function inferCapabilities(modelId: string): ModelCapability[] {
  const id = modelId.toLowerCase();
  const caps = new Set<ModelCapability>(["text"]);
  if (/(vision|gpt-4o|gpt-5|claude|gemini|grok|llava)/.test(id)) caps.add("vision");
  if (/(gpt|claude|gemini|grok|tool|function)/.test(id)) caps.add("tools");
  if (/(image|dall-e|imagen|flux|sdxl|stable-diffusion)/.test(id)) caps.add("image");
  if (/(audio|tts|whisper|transcribe)/.test(id)) caps.add("audio");
  if (/(embed|embedding)/.test(id)) caps.add("embeddings");
  return Array.from(caps);
}

function displayName(modelId: string) {
  return modelId
    .split(/[/:_-]/)
    .filter(Boolean)
    .map((part) => part.toUpperCase() === part ? part : part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
