"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DefaultsSection,
  TextArea,
  TextInput,
  RowMessage,
  EMPTY_DEFAULTS,
  maskCredential,
  newCustomInput,
  omitKey,
  parseManualModels,
  providerLabel,
  savedCredentialForProvider,
  testIconClass,
  type ModelRow,
  type ModelDefaults,
  type ProviderCredential,
  type RowStatus,
} from "./model-providers-manager-parts";

type ProviderDefinition = { id: string; label: string; defaultBaseUrl: string; defaultProtocol: string; description: string };

type SettingsPayload = { providers: ProviderCredential[]; models: ModelRow[]; defaults: ModelDefaults; definitions: ProviderDefinition[] };

type ProviderInput = { label: string; apiKey: string; baseUrl: string; protocol: string; manualModels: string };

type CustomInput = ProviderInput & { id: string };

export function ModelProvidersManager({ initialSettings }: { initialSettings: SettingsPayload }) {
  const [settings, setSettings] = useState(initialSettings);
  const [providerInputs, setProviderInputs] = useState<Record<string, ProviderInput>>(() =>
    Object.fromEntries(
      initialSettings.definitions
        .filter((definition) => definition.id !== "custom")
        .map((definition) => [
          definition.id,
          {
            label: definition.label,
            apiKey: "",
            baseUrl: definition.defaultBaseUrl,
            protocol: definition.defaultProtocol,
            manualModels: "",
          },
        ])
    )
  );
  const customDefinition =
    initialSettings.definitions.find((definition) => definition.id === "custom") ?? null;
  const [customInputs, setCustomInputs] = useState<CustomInput[]>(() => [
    newCustomInput(customDefinition),
  ]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowStatuses, setRowStatuses] = useState<Record<string, RowStatus>>({});
  const [defaultsNotice, setDefaultsNotice] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<ModelDefaults>(
    initialSettings.defaults ?? EMPTY_DEFAULTS
  );

  const builtInDefinitions = settings.definitions.filter((definition) => definition.id !== "custom");
  const activeCredentialIds = useMemo(
    () =>
      new Set(
        settings.providers
          .filter((credential) => credential.status === "active")
          .map((credential) => credential.id)
      ),
    [settings.providers]
  );

  const modelOptions = useMemo(
    () =>
      settings.models
        .filter(
          (model) =>
            model.status !== "deprecated" &&
            model.credentialId &&
            activeCredentialIds.has(model.credentialId)
        )
        .sort(
          (a, b) =>
            providerLabel(a.provider).localeCompare(providerLabel(b.provider)) ||
            a.displayName.localeCompare(b.displayName)
        ),
    [activeCredentialIds, settings.models]
  );

  async function refreshSettings() {
    const response = await fetch("/api/model-providers");
    if (!response.ok) return;
    const data = (await response.json()) as SettingsPayload;
    setSettings(data);
    setDefaults(data.defaults ?? EMPTY_DEFAULTS);
  }

  function updateProviderInput(provider: string, patch: Partial<ProviderInput>) {
    setRowStatuses((current) => omitKey(current, `connect:${provider}`));
    setProviderInputs((current) => ({
      ...current,
      [provider]: { ...current[provider], ...patch },
    }));
  }

  function updateCustomInput(id: string, patch: Partial<ProviderInput>) {
    setRowStatuses((current) => omitKey(current, `connect:${id}`));
    setCustomInputs((current) =>
      current.map((input) => (input.id === id ? { ...input, ...patch } : input))
    );
  }

  async function connectProvider(input: {
    busyKey: string;
    provider: string;
    label: string;
    apiKey: string;
    baseUrl: string;
    protocol: string;
    manualModels: string;
    onSaved: () => void;
  }) {
    if (!input.apiKey.trim()) return;
    if (input.provider === "custom" && !input.baseUrl.trim()) {
      setRowStatuses((current) => ({
        ...current,
        [input.busyKey]: { state: "error", message: "Custom endpoint URL required" },
      }));
      return;
    }

    setBusy(input.busyKey);
    setRowStatuses((current) => omitKey(current, input.busyKey));
    const response = await fetch("/api/model-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: input.provider,
        label: input.label,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        protocol: input.protocol,
        manualModelIds: parseManualModels(input.manualModels),
      }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setRowStatuses((current) => ({
        ...current,
        [input.busyKey]: { state: "error", message: data?.error || "Provider connection failed" },
      }));
      return;
    }

    input.onSaved();
    setRowStatuses((current) => ({
      ...current,
      [input.busyKey]:
        data?.ok === false
          ? { state: "error", message: data.error || "Provider test failed" }
          : { state: "success", message: "Saved" },
    }));
    await refreshSettings();
  }

  async function syncProvider(id: string, statusKey?: string) {
    setBusy(`sync:${id}`);
    const response = await fetch(`/api/model-providers/${id}/sync`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (statusKey) {
      setRowStatuses((current) => ({
        ...current,
        [statusKey]:
          data?.ok === false
            ? { state: "error", message: data.error || "Key test failed" }
            : { state: "success", message: "Saved" },
      }));
    } else {
      setDefaultsNotice(data?.ok === false ? data.error || "Key test failed" : "Key tested and models refreshed");
    }
    await refreshSettings();
  }

  async function revokeProvider(id: string) {
    if (!confirm("Revoke this model provider key?")) return;
    setBusy(`delete:${id}`);
    await fetch(`/api/model-providers/${id}`, { method: "DELETE" });
    setBusy(null);
    await refreshSettings();
  }

  async function saveDefaults() {
    setBusy("defaults");
    const response = await fetch("/api/model-providers/defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaults),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setDefaultsNotice(data?.error || "Model defaults could not be saved");
      return;
    }
    setDefaultsNotice("Model defaults saved");
    await refreshSettings();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#171717]">Model API Keys</h1>
        </div>
      </div>

      <section className="rounded-xl border border-[#e5d9c8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5d9c8] px-4 py-3">
          <div>
            <h2 className="font-semibold text-[#171717]">Main Model APIs</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-[#fffaf1] text-left text-xs uppercase tracking-[0.14em] text-[#8d704e]">
              <tr>
                <th className="px-4 py-3 font-semibold">Provider</th>
                <th className="px-4 py-3 font-semibold">API key</th>
              </tr>
            </thead>
            <tbody>
              {builtInDefinitions.map((definition) => {
                const input = providerInputs[definition.id];
                const busyKey = `connect:${definition.id}`;
                const rowStatus = rowStatuses[busyKey];
                const savedCredential = savedCredentialForProvider(settings.providers, definition.id);
                const newKeyReady = Boolean(input?.apiKey.trim());
                const activeBusyKey = newKeyReady ? busyKey : savedCredential ? `sync:${savedCredential.id}` : busyKey;
                const visibleStatus =
                  rowStatus ??
                  (savedCredential
                    ? {
                        state: savedCredential.status === "active" ? "success" : "error",
                        message: savedCredential.status === "active" ? "Saved" : savedCredential.statusMessage,
                      } as RowStatus
                    : undefined);
                return (
                  <tr key={definition.id} className="border-t border-[#e5d9c8]">
                    <td className="w-[190px] px-4 py-3">
                      <p className="font-semibold text-[#171717]">{definition.label}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={input?.apiKey ?? ""}
                          onChange={(event) =>
                            updateProviderInput(definition.id, { apiKey: event.target.value })
                          }
                          placeholder={savedCredential ? maskCredential(savedCredential) : "Paste key"}
                          className="w-full rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Test ${definition.label} key`}
                          title={`Test ${definition.label} key`}
                          onClick={() => {
                            if (newKeyReady) {
                              void connectProvider({
                                busyKey,
                                provider: definition.id,
                                label: input?.label || definition.label,
                                apiKey: input?.apiKey ?? "",
                                baseUrl: definition.defaultBaseUrl,
                                protocol: definition.defaultProtocol,
                                manualModels: "",
                                onSaved: () =>
                                  updateProviderInput(definition.id, {
                                    apiKey: "",
                                  }),
                              });
                              return;
                            }
                            if (savedCredential) void syncProvider(savedCredential.id, busyKey);
                          }}
                          disabled={(!newKeyReady && !savedCredential) || busy === activeBusyKey}
                          className={testIconClass(visibleStatus)}
                        >
                          {busy === activeBusyKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        {savedCredential ? (
                          <button
                            type="button"
                            aria-label={`Remove ${definition.label} key`}
                            title={`Remove ${definition.label} key`}
                            onClick={() => revokeProvider(savedCredential.id)}
                            disabled={busy === `delete:${savedCredential.id}`}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#efc9bd] bg-white text-[#a33a24] transition disabled:opacity-60"
                          >
                            {busy === `delete:${savedCredential.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </div>
                      <RowMessage status={rowStatus} fallback={savedCredential ? visibleStatus?.message : undefined} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[#e5d9c8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5d9c8] px-4 py-3">
          <div>
            <h2 className="font-semibold text-[#171717]">Custom Endpoints</h2>
            <p className="text-sm text-[#6f604c]">Add OpenAI-compatible endpoints and the model IDs they expose.</p>
          </div>
          <button
            type="button"
            onClick={() => setCustomInputs((current) => [...current, newCustomInput(customDefinition)])}
            className="inline-flex items-center gap-2 rounded-lg border border-[#171717] px-3 py-2 text-sm font-semibold text-[#171717]"
          >
            <Plus className="h-4 w-4" />
            Add custom endpoint
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-[#fffaf1] text-left text-xs uppercase tracking-[0.14em] text-[#8d704e]">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Endpoint</th>
                <th className="px-4 py-3 font-semibold">API key</th>
                <th className="px-4 py-3 font-semibold">Models</th>
              </tr>
            </thead>
            <tbody>
              {settings.providers
                .filter((credential) => credential.provider === "custom" && credential.status !== "revoked")
                .map((credential) => {
                  const statusKey = `saved:${credential.id}`;
                  const rowStatus = rowStatuses[statusKey];
                  const visibleStatus =
                    rowStatus ??
                    ({
                      state: credential.status === "active" ? "success" : "error",
                      message: credential.status === "active" ? "Saved" : credential.statusMessage,
                    } as RowStatus);
                  return (
                    <tr key={credential.id} className="border-t border-[#e5d9c8]">
                      <td className="w-[190px] px-4 py-4">
                        <p className="font-semibold text-[#171717]">{credential.label}</p>
                      </td>
                      <td className="w-[250px] px-4 py-4">
                        <p className="font-mono text-xs text-[#6f604c]">{credential.baseUrl || "Custom endpoint"}</p>
                      </td>
                      <td className="w-[260px] px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value=""
                            readOnly
                            placeholder={maskCredential(credential)}
                            className="w-full rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            aria-label={`Test ${credential.label} key`}
                            title={`Test ${credential.label} key`}
                            onClick={() => syncProvider(credential.id, statusKey)}
                            disabled={busy === `sync:${credential.id}`}
                            className={testIconClass(visibleStatus)}
                          >
                            {busy === `sync:${credential.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${credential.label} key`}
                            title={`Remove ${credential.label} key`}
                            onClick={() => revokeProvider(credential.id)}
                            disabled={busy === `delete:${credential.id}`}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#efc9bd] bg-white text-[#a33a24] transition disabled:opacity-60"
                          >
                            {busy === `delete:${credential.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                        <RowMessage status={rowStatus} fallback={visibleStatus.message} />
                      </td>
                      <td className="w-[220px] px-4 py-4" />
                    </tr>
                  );
                })}
              {customInputs.map((input, index) => {
                const busyKey = `connect:${input.id}`;
                const rowStatus = rowStatuses[busyKey];
                return (
                  <tr key={input.id} className="border-t border-[#e5d9c8] align-top">
                    <td className="w-[190px] px-4 py-4">
                      <TextInput
                        label="Custom label"
                        value={input.label}
                        onChange={(value) => updateCustomInput(input.id, { label: value })}
                        placeholder={`Custom ${index + 1}`}
                      />
                      {customInputs.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomInputs((current) =>
                              current.filter((customInput) => customInput.id !== input.id)
                            )
                          }
                          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#efc9bd] px-3 py-2 text-sm font-semibold text-[#a33a24]"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      ) : null}
                    </td>
                    <td className="w-[250px] px-4 py-4">
                      <TextInput
                        label="Endpoint"
                        value={input.baseUrl}
                        onChange={(value) => updateCustomInput(input.id, { baseUrl: value })}
                        placeholder="https://api.example.com"
                      />
                      <TextInput
                        label="Protocol"
                        value={input.protocol}
                        onChange={(value) => updateCustomInput(input.id, { protocol: value })}
                      />
                    </td>
                    <td className="w-[260px] px-4 py-4">
                      <div className="flex items-end gap-2">
                        <TextInput
                          label="Key"
                          value={input.apiKey}
                          onChange={(value) => updateCustomInput(input.id, { apiKey: value })}
                          placeholder="Paste key"
                          type="password"
                        />
                        <button
                          type="button"
                          aria-label={`Test custom endpoint ${index + 1}`}
                          title={`Test custom endpoint ${index + 1}`}
                          onClick={() =>
                            connectProvider({
                              busyKey,
                              provider: "custom",
                              label: input.label || `Custom ${index + 1}`,
                              apiKey: input.apiKey,
                              baseUrl: input.baseUrl,
                              protocol: input.protocol || customDefinition?.defaultProtocol || "openai_chat",
                              manualModels: input.manualModels,
                              onSaved: () =>
                                setCustomInputs((current) =>
                                  current.filter((customInput) => customInput.id !== input.id)
                                ),
                            })
                          }
                          disabled={!input.apiKey.trim() || busy === busyKey}
                          className={testIconClass(rowStatus)}
                        >
                          {busy === busyKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                      </div>
                      <RowMessage status={rowStatus} />
                    </td>
                    <td className="w-[220px] px-4 py-4">
                      <TextArea
                        label="Manual model IDs"
                        value={input.manualModels}
                        onChange={(value) => updateCustomInput(input.id, { manualModels: value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <DefaultsSection
        defaults={defaults}
        defaultsNotice={defaultsNotice}
        modelOptions={modelOptions}
        busy={busy}
        setDefaults={setDefaults}
        saveDefaults={saveDefaults}
      />

    </div>
  );
}
