"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, FileText, Loader2, Plus, Save, Send, Settings2, Sparkles, X } from "lucide-react";
import {
  charsToWords,
  normalizeArticleGenerationSettings,
  type ArticleGenerationControl,
  type ArticleGenerationSettings,
} from "@/lib/article-agent/options";

type Message = {
  role: "user" | "assistant";
  content: string;
  articleId?: string;
  dashboardUrl?: string;
};

type CreateResponse = {
  articleId: string;
  slug: string;
  provider: string;
  validation?: { status: string; score: number };
  links?: { dashboard?: string };
  error?: string;
};

type Props = {
  initialGenerationSettings: ArticleGenerationSettings;
};

const STARTER_PROMPTS = [
  "Research this URL and create a Medium-ready source-of-truth article.",
  "Write a formatted article with title, subtitle, hero image, sections, BEI, and sources about...",
  "Turn this rough prompt into a practical article for builders:",
];

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

export function ArticleAgentChat({ initialGenerationSettings }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [settings, setSettings] = useState(() => normalizeArticleGenerationSettings(initialGenerationSettings));
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Paste a URL or prompt. I will use the article controls, prompt, skills, and Medium automation to create a formatted Markdown article.",
    },
  ]);

  const normalizedSettings = useMemo(() => normalizeArticleGenerationSettings(settings), [settings]);
  const controls = normalizedSettings.controls;
  const quickControls = controls.filter((control) => control.enabled && control.quick);
  const targetChars = Number(controls.find((control) => control.id === "length")?.value ?? normalizedSettings.defaults.targetChars);
  const targetWords = charsToWords(targetChars);

  async function createArticle(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || loading) return;

    setMessages((current) => [...current, { role: "user", content: prompt }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/article/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, targetWords, generationSettings: normalizedSettings }),
      });
      const body = (await response.json()) as CreateResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error || "Article generation failed.");
      }

      const score = body.validation ? `${body.validation.status} ${body.validation.score}/110` : "validation pending";
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Article created with ${body.provider}. Validation: ${score}. Saved to the article workspace.`,
          articleId: body.articleId,
          dashboardUrl: body.links?.dashboard,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Article generation failed.",
        },
      ]);
    } finally {
      setLoading(false);
    }
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
        throw new Error(body.error || "Could not save article controls.");
      }
      setSettings(normalizeArticleGenerationSettings(body.generation));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

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
    const id = `custom-${Date.now()}`;
    setSettings((current) => ({
      ...current,
      controls: [...current.controls, { ...DEFAULT_CUSTOM_CONTROL, id, label: "Custom directive", value: "" }],
    }));
    setSettingsOpen(true);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-h-[620px] overflow-hidden rounded-[24px] border border-[#d4c6b1] bg-[#fffaf2] shadow-[0_18px_48px_rgba(23,23,23,0.06)]">
        <header className="border-b border-[#eadfce] bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#171717] text-[#fff8ef]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">SMM Agent</p>
                <h1 className="font-serif text-2xl font-semibold text-[#171717]">New Article</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-[#fffaf2] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#5f523f]"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Generation options
            </button>
          </div>
        </header>

        <div className="border-b border-[#eadfce] bg-[#fbf3e7] px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {quickControls.map((control) => (
              <QuickControl key={control.id} control={control} onChange={(value) => updateControl(control.id, { value })} />
            ))}
            <button
              type="button"
              onClick={addControl}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c8b99f] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f523f]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add menu
            </button>
          </div>
          <p className="mt-2 text-xs text-[#806f58]">
            Target: {Number.isFinite(targetChars) ? targetChars.toLocaleString() : "8,000"} chars ≈ {targetWords.toLocaleString()} words. Controls affect the next generation immediately.
          </p>
        </div>

        {settingsOpen ? (
          <div className="border-b border-[#eadfce] bg-white px-5 py-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Editable generation menus</h2>
                <p className="mt-1 text-sm text-[#5f523f]">Enable, add, remove, and type directives without touching code. Save only if you want this as the default.</p>
              </div>
              <div className="flex items-center gap-2">
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
                  onClick={() => void saveSettings()}
                  disabled={saveStatus === "saving"}
                  className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Save defaults"}
                </button>
              </div>
            </div>
            {saveStatus === "error" ? <p className="mb-3 text-sm font-semibold text-[#a13b2f]">Could not save controls.</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              {controls.map((control) => (
                <ControlEditor
                  key={control.id}
                  control={control}
                  onChange={(updates) => updateControl(control.id, updates)}
                  onRemove={() => removeControl(control.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="h-[360px] space-y-3 overflow-y-auto px-5 py-5">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[78%] rounded-[18px] bg-[#171717] px-4 py-3 text-sm leading-6 text-[#fff8ef]"
                  : "max-w-[82%] rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm leading-6 text-[#3d3328]"
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.articleId ? (
                <Link
                  href={message.dashboardUrl || `/dashboard/articles/${message.articleId}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-[#fffaf2] px-3 py-1.5 text-xs font-semibold text-[#5f523f]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Open article workspace
                </Link>
              ) : null}
            </div>
          ))}
          {loading ? (
            <div className="max-w-[82%] rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#806f58]">
              Researching and writing
            </div>
          ) : null}
        </div>

        <footer className="border-t border-[#eadfce] bg-[#fbf3e7] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="rounded-full border border-[#d8cab5] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f523f]"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void createArticle();
                }
              }}
              rows={4}
              placeholder="Paste URL or prompt. Mention tone, image direction, source URLs, or anything the menus should override."
              className="min-h-24 flex-1 resize-none rounded-[16px] border border-[#d8cab5] bg-white px-4 py-3 text-sm leading-6 text-[#171717] outline-none"
            />
            <button
              type="button"
              onClick={() => void createArticle()}
              disabled={loading || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#171717] text-white disabled:opacity-50"
              aria-label="Create article"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </footer>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[20px] border border-[#d4c6b1] bg-white p-5">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-[#0f7ea9]" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Runtime</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#5f523f]">
            <p>Backend: /api/article/create</p>
            <p>Settings API: /api/article/settings</p>
            <p>Created articles are saved into the filesystem article workspace as the canonical editing path.</p>
          </div>
        </section>
        <section className="rounded-[20px] border border-[#d4c6b1] bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Active format presets</h2>
          <div className="mt-4 space-y-3">
            {normalizedSettings.formatPresets.map((preset) => (
              <div key={preset.id} className="rounded-[16px] border border-[#eadfce] bg-[#fffaf2] p-3">
                <p className="text-sm font-semibold text-[#171717]">{preset.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#5f523f]">{preset.description}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function QuickControl({ control, onChange }: { control: ArticleGenerationControl; onChange: (value: ArticleGenerationControl["value"]) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f523f]">
      <span>{control.label}</span>
      <ControlValueInput control={control} compact onChange={onChange} />
    </label>
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
          Quick
        </label>
      </div>
    </div>
  );
}

function ControlValueInput({
  control,
  compact = false,
  onChange,
}: {
  control: ArticleGenerationControl;
  compact?: boolean;
  onChange: (value: ArticleGenerationControl["value"]) => void;
}) {
  const baseClass = compact
    ? "max-w-36 rounded-full border border-[#d8cab5] bg-[#fffaf2] px-2 py-1 text-xs text-[#171717] outline-none"
    : "w-full rounded-[10px] border border-[#d8cab5] bg-white px-2 py-2 text-sm text-[#171717] outline-none";

  if (control.kind === "boolean") {
    return (
      <button
        type="button"
        onClick={() => onChange(!Boolean(control.value))}
        className={`${baseClass} ${control.value ? "font-semibold" : "text-[#806f58]"}`}
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
