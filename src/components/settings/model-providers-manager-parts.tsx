"use client";

import type { Dispatch, SetStateAction } from "react";

export type ProviderCredential = {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  protocol: string;
  keyPrefix: string;
  keySuffix: string;
  status: string;
  statusMessage: string;
  lastSyncedAt: Date | string | null;
};

export type ModelRow = {
  id: string;
  credentialId: string | null;
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: string[] | null;
  contextWindow: number | null;
  inputPrice: string | null;
  outputPrice: string | null;
  status: string;
  source: string;
  updatedAt: Date | string;
};

export type ModelDefaults = {
  writingModelCatalogId: string | null;
  replyModelCatalogId: string | null;
  agentModelCatalogId: string | null;
  fastModelCatalogId: string | null;
  imageModelCatalogId: string | null;
  embeddingModelCatalogId: string | null;
} | null;

export type RowStatus = { state: "success" | "error"; message: string };

export const EMPTY_DEFAULTS: NonNullable<ModelDefaults> = {
  writingModelCatalogId: null, replyModelCatalogId: null, agentModelCatalogId: null,
  fastModelCatalogId: null, imageModelCatalogId: null, embeddingModelCatalogId: null,
};

const DEFAULT_SLOTS: Array<{ key: keyof NonNullable<ModelDefaults>; label: string }> = [
  { key: "writingModelCatalogId", label: "Writing" }, { key: "replyModelCatalogId", label: "Replies" },
  { key: "agentModelCatalogId", label: "Agent" }, { key: "fastModelCatalogId", label: "Fast" },
  { key: "imageModelCatalogId", label: "Image" }, { key: "embeddingModelCatalogId", label: "Embeddings" },
];

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block [&+&]:mt-2">
      <span className="text-xs font-semibold text-[#6f604c]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm"
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#6f604c]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder="model-id-one&#10;model-id-two"
        className="mt-1 w-full resize-none rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm"
      />
    </label>
  );
}

export function DefaultsSection({
  defaults,
  defaultsNotice,
  modelOptions,
  busy,
  setDefaults,
  saveDefaults,
}: {
  defaults: ModelDefaults;
  defaultsNotice: string | null;
  modelOptions: ModelRow[];
  busy: string | null;
  setDefaults: Dispatch<SetStateAction<ModelDefaults>>;
  saveDefaults: () => void;
}) {
  return (
    <section className="rounded-xl border border-[#e5d9c8] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8d704e]">Defaults</h2>
          <p className="mt-1 text-sm text-[#6f604c]">Only models from tested active keys are selectable.</p>
          {defaultsNotice ? <p className="mt-1 text-xs text-[#6f604c]">{defaultsNotice}</p> : null}
        </div>
        <button type="button" onClick={saveDefaults} disabled={busy === "defaults"} className="rounded-lg border border-[#171717] px-3 py-2 text-sm font-semibold text-[#171717] disabled:opacity-60">
          Save defaults
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {DEFAULT_SLOTS.map((slot) => (
          <label key={slot.key} className="block">
            <span className="text-xs font-semibold text-[#6f604c]">{slot.label}</span>
            <select
              value={defaults?.[slot.key] ?? ""}
              onChange={(event) =>
                setDefaults((prev) => ({
                  ...(prev ?? EMPTY_DEFAULTS),
                  [slot.key]: event.target.value || null,
                }))
              }
              className="mt-1 w-full rounded-lg border border-[#e5d9c8] bg-white px-3 py-2 text-sm"
            >
              <option value="">{modelOptions.length ? "No model selected" : "Add and test a provider key first"}</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>{providerLabel(model.provider)} · {model.displayName}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

export function RowMessage({ status, fallback }: { status?: RowStatus; fallback?: string }) {
  const message = status?.message ?? fallback;
  if (!message) return null;
  return <p className={`mt-1 text-xs ${status?.state === "error" ? "text-[#a33a24]" : "text-[#2f6f31]"}`}>{message}</p>;
}

export function testIconClass(status?: RowStatus) {
  const color =
    status?.state === "success"
      ? "border-[#6dae4f] bg-[#e7f4df] text-[#2f6f31]"
      : status?.state === "error"
        ? "border-[#efc9bd] bg-[#fff1ed] text-[#a33a24]"
        : "border-[#d3c4ae] bg-[#fbf7f0] text-[#171717]";
  return `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition disabled:opacity-60 ${color}`;
}

export function savedCredentialForProvider(credentials: ProviderCredential[], provider: string) {
  return credentials.find((credential) => credential.provider === provider && credential.status === "active")
    ?? credentials.find((credential) => credential.provider === provider && credential.status !== "revoked")
    ?? null;
}

export function maskCredential(credential: ProviderCredential) {
  if (credential.keyPrefix || credential.keySuffix) return `${credential.keyPrefix}${"•".repeat(24)}${credential.keySuffix}`;
  return "Saved key";
}

export function newCustomInput(definition: { defaultProtocol: string } | null) {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: "",
    apiKey: "",
    baseUrl: "",
    protocol: definition?.defaultProtocol || "openai_chat",
    manualModels: "",
  };
}

export function parseManualModels(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function providerLabel(provider: string) {
  return {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    xai: "xAI",
    openrouter: "OpenRouter",
    custom: "Custom",
  }[provider] ?? provider;
}
