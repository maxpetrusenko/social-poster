"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Save, Settings2, X } from "lucide-react";
import {
  charsToWords,
  normalizeArticleGenerationSettings,
  type ArticleGenerationControl,
  type ArticleGenerationSettings,
} from "@/lib/article-agent/options";

type Props = {
  initialGenerationSettings: ArticleGenerationSettings;
};

const DEFAULT_CUSTOM_CONTROL: ArticleGenerationControl = {
  id: "custom-directive",
  label: "Custom directive",
  enabled: true,
  quick: false,
  kind: "text",
  value: "",
  removable: true,
  description: "Extra instruction passed to the article agent prompt.",
};

export function ArticleGenerationSettingsPanel({ initialGenerationSettings }: Props) {
  const [settings, setSettings] = useState(() => normalizeArticleGenerationSettings(initialGenerationSettings));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const normalizedSettings = useMemo(() => normalizeArticleGenerationSettings(settings), [settings]);
  const targetChars = normalizedSettings.defaults.targetChars;
  const targetWords = charsToWords(targetChars);
  const quickControls = normalizedSettings.controls.filter((control) => control.quick && control.enabled);

  function updateControl(controlId: string, updates: Partial<ArticleGenerationControl>) {
    setSaveStatus("idle");
    setSettings((current) => ({
      ...current,
      controls: current.controls.map((control) => (control.id === controlId ? { ...control, ...updates } : control)),
    }));
  }

  function removeControl(controlId: string) {
    setSaveStatus("idle");
    setSettings((current) => ({
      ...current,
      controls: current.controls.filter((control) => control.id !== controlId || !control.removable),
    }));
  }

  function addControl() {
    setSaveStatus("idle");
    setSettings((current) => ({
      ...current,
      controls: [
        ...current.controls,
        {
          ...DEFAULT_CUSTOM_CONTROL,
          id: `custom-${Date.now()}`,
          label: "Custom directive",
          value: "",
        },
      ],
    }));
  }

  function resetLocal() {
    setSaveStatus("idle");
    setSettings(normalizeArticleGenerationSettings(initialGenerationSettings));
  }

  async function saveSettings() {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/article/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedSettings),
      });
      const body = (await response.json()) as { generation?: ArticleGenerationSettings; error?: string };
      if (!response.ok || body.error || !body.generation) {
        throw new Error(body.error || "Could not save article generation settings.");
      }
      setSettings(normalizeArticleGenerationSettings(body.generation));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-1 h-5 w-5 text-[#0f7ea9]" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
              Generation controls
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5f523f]">
              These are the default quick toggles and advanced menus used by New Article. Add/remove custom directives, decide what appears in the quick bar, then save as the workspace default.
            </p>
            <p className="mt-2 text-xs font-semibold text-[#806f58]">
              Current target: {targetChars.toLocaleString()} chars ≈ {targetWords.toLocaleString()} words. Quick bar: {quickControls.map((control) => control.label).join(", ") || "none"}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addControl}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-[#fffaf2] px-3 py-2 text-xs font-semibold text-[#5f523f]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add custom
          </button>
          <button
            type="button"
            onClick={resetLocal}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-white px-3 py-2 text-xs font-semibold text-[#5f523f]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset local
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saveStatus === "saving"}
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Save defaults"}
          </button>
        </div>
      </div>

      {saveStatus === "error" ? (
        <p className="mt-3 rounded-[14px] border border-[#e3c8bd] bg-[#fff4ef] px-3 py-2 text-sm font-semibold text-[#a13b2f]">
          Could not save generation controls.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {normalizedSettings.controls.map((control) => (
          <ControlEditor
            key={control.id}
            control={control}
            onChange={(updates) => updateControl(control.id, updates)}
            onRemove={() => removeControl(control.id)}
          />
        ))}
      </div>

      <div className="mt-6 rounded-[18px] border border-[#eadfce] bg-[#fffaf2] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
          Format presets shown in New Article
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {normalizedSettings.formatPresets.map((preset) => (
            <div key={preset.id} className="rounded-[14px] border border-[#eadfce] bg-white p-3">
              <p className="text-sm font-semibold text-[#171717]">{preset.label}</p>
              <p className="mt-1 text-xs leading-5 text-[#5f523f]">{preset.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ControlEditor({
  control,
  onChange,
  onRemove,
}: {
  control: ArticleGenerationControl;
  onChange: (updates: Partial<ArticleGenerationControl>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#eadfce] bg-[#fffaf2] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={control.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="w-full rounded-[10px] border border-[#d8cab5] bg-white px-2 py-1.5 text-sm font-semibold text-[#171717] outline-none"
          />
          {control.description ? <p className="mt-1 text-xs leading-5 text-[#806f58]">{control.description}</p> : null}
        </div>
        {control.removable ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-[#e3c8bd] bg-white p-1.5 text-[#a13b2f]"
            aria-label={`Remove ${control.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <ControlValueInput control={control} onChange={(value) => onChange({ value })} />
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#5f523f]">
          <input type="checkbox" checked={control.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
          Enabled
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#5f523f]">
          <input type="checkbox" checked={control.quick} onChange={(event) => onChange({ quick: event.target.checked })} />
          Quick bar
        </label>
      </div>
    </div>
  );
}

function ControlValueInput({
  control,
  onChange,
}: {
  control: ArticleGenerationControl;
  onChange: (value: ArticleGenerationControl["value"]) => void;
}) {
  const baseClass = "w-full rounded-[10px] border border-[#d8cab5] bg-white px-2 py-2 text-sm text-[#171717] outline-none";

  if (control.kind === "boolean") {
    return (
      <button
        type="button"
        onClick={() => onChange(!Boolean(control.value))}
        className={`${baseClass} text-left ${control.value ? "font-semibold" : "text-[#806f58]"}`}
      >
        {control.value ? "On" : "Off"}
      </button>
    );
  }

  if (control.kind === "select" && control.options?.length) {
    return (
      <select value={String(control.value)} onChange={(event) => onChange(event.target.value)} className={baseClass}>
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (control.kind === "number") {
    return (
      <input
        type="number"
        value={Number(control.value) || 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className={baseClass}
      />
    );
  }

  return (
    <input
      type="text"
      value={String(control.value ?? "")}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Type directive"
      className={baseClass}
    />
  );
}
