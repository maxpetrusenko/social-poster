"use client";

/* eslint-disable @next/next/no-img-element -- Markdown previews render arbitrary archived local/external artifact images; next/image domain allowlists break the file-system viewer. */

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Code2, Copy, Eye, Loader2, Save, Sparkles } from "lucide-react";
import { formatArticleForMediumClipboard } from "@/lib/article-agent/medium-rich-text";
import { formatArticleMarkdownForMedium, splitMediumMarkdownBlocks } from "@/lib/article-agent/medium-format";
import type { ArticleWorkspaceSection } from "@/lib/article-agent/workspace";
import { cn } from "@/lib/utils";

type ArticleWorkspaceTextPanelProps = {
  openRef: string;
  section: ArticleWorkspaceSection;
  relativePath: string;
  language?: string;
  text: string;
  truncated?: boolean;
};

type ArticleHeroImageProvider = "openai" | "gemini";

type ArticleHeroImageOption = {
  provider: ArticleHeroImageProvider;
  label: string;
  modelLabel: string;
  configured: boolean;
};

type ModelProviderSettingsPayload = {
  providers?: Array<{ provider?: string; status?: string | null }>;
  models?: Array<{
    id?: string;
    provider?: string;
    modelId?: string;
    displayName?: string | null;
    capabilities?: string[] | null;
  }>;
  defaults?: { imageModelCatalogId?: string | null } | null;
};

type ArticleWorkspaceReadPayload = {
  ok?: boolean;
  error?: string;
  text?: string;
  truncated?: boolean;
};

const fallbackHeroImageOptions: ArticleHeroImageOption[] = [
  {
    provider: "openai",
    label: "GPT",
    modelLabel: "gpt-image-1",
    configured: false,
  },
  {
    provider: "gemini",
    label: "Gemini",
    modelLabel: "Nano Banana / Gemini image",
    configured: false,
  },
];

export function ArticleWorkspaceTextPanel({
  openRef,
  section,
  relativePath,
  language,
  text,
  truncated,
}: ArticleWorkspaceTextPanelProps) {
  const [content, setContent] = useState(text);
  const [savedContent, setSavedContent] = useState(text);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [generatingHero, setGeneratingHero] = useState(false);
  const [heroImageMenuOpen, setHeroImageMenuOpen] = useState(false);
  const [heroImageOptions, setHeroImageOptions] = useState<ArticleHeroImageOption[]>(fallbackHeroImageOptions);
  const [loadingHeroImageOptions, setLoadingHeroImageOptions] = useState(false);
  const [copiedRichText, setCopiedRichText] = useState(false);
  const [status, setStatus] = useState("");
  const isMarkdown = language === "markdown" || /\.mdx?$/i.test(relativePath);
  const canGenerateHero = isArticleMarkdownPath(relativePath);
  const dirty = content !== savedContent;

  useEffect(() => {
    setContent(text);
    setSavedContent(text);
    setStatus("");
    setMode(isMarkdown ? "preview" : "edit");
  }, [openRef, text, isMarkdown]);

  useEffect(() => {
    if (!canGenerateHero) {
      setHeroImageMenuOpen(false);
      return;
    }

    let cancelled = false;
    async function loadHeroImageOptions() {
      setLoadingHeroImageOptions(true);
      try {
        const response = await fetch("/api/model-providers");
        if (!response.ok) throw new Error("Model providers unavailable.");
        const payload = (await response.json()) as ModelProviderSettingsPayload;
        const configuredOptions = resolveConfiguredHeroImageOptions(payload);
        if (!cancelled) {
          setHeroImageOptions(configuredOptions.length ? configuredOptions : fallbackHeroImageOptions);
        }
      } catch {
        if (!cancelled) setHeroImageOptions(fallbackHeroImageOptions);
      } finally {
        if (!cancelled) setLoadingHeroImageOptions(false);
      }
    }

    void loadHeroImageOptions();
    return () => {
      cancelled = true;
    };
  }, [canGenerateHero]);

  async function save(textToSave = content) {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/article/fs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openRef, text: textToSave }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok || body.error) throw new Error(body.error || "Save failed.");
      setContent(textToSave);
      setSavedContent(textToSave);
      setStatus("Saved to filesystem.");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function generateHeroImage(provider: ArticleHeroImageProvider) {
    if (!canGenerateHero || truncated || generatingHero) return;
    setHeroImageMenuOpen(false);
    setGeneratingHero(true);
    setStatus("");

    try {
      if (dirty) {
        const saved = await save(content);
        if (!saved) return;
      }

      const response = await fetch("/api/article/fs/hero-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openRef, provider }),
      });
      const body = (await response.json()) as {
        error?: string;
        text?: string;
        model?: string;
        provider?: string;
        imageRelativePath?: string;
      };
      if (!response.ok || body.error || !body.text) {
        throw new Error(body.error || "Hero image generation failed.");
      }

      setContent(body.text);
      setSavedContent(body.text);
      setMode("preview");
      setStatus(`Hero image inserted with ${body.provider || provider} ${body.model || "image model"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Hero image generation failed.");
    } finally {
      setGeneratingHero(false);
    }
  }

  async function copyRichTextForMedium() {
    try {
      let markdownToCopy = content;

      if (!dirty) {
        const latest = await fetch(`/api/article/fs?open=${encodeURIComponent(openRef)}`, {
          cache: "no-store",
        });
        const body = (await latest.json().catch(() => ({}))) as ArticleWorkspaceReadPayload;
        if (latest.ok && body.text != null && !body.truncated) {
          markdownToCopy = body.text;
          if (body.text !== content) {
            setContent(body.text);
            setSavedContent(body.text);
          }
        }
      }

      const clipboardContent = formatArticleForMediumClipboard(markdownToCopy);
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([clipboardContent.html], { type: "text/html" }),
            "text/plain": new Blob([clipboardContent.plainText], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(clipboardContent.plainText);
      }
      setCopiedRichText(true);
      setStatus("Copied rich text for Medium.");
      window.setTimeout(() => setCopiedRichText(false), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Copy failed.");
    }
  }

  return (
    <div className="p-5">
      {truncated ? (
        <p className="mb-3 rounded-[14px] border border-[#eadfce] bg-[#fffaf2] px-3 py-2 text-xs text-[#806f58]">
          Large file preview truncated. Save is still disabled for oversized previews; open locally for full edits.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-[#d8cab5] bg-white p-1 text-xs font-semibold text-[#5f523f]">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
              mode === "edit" ? "bg-[#171717] text-white" : "hover:bg-[#fffaf2]"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
              mode === "preview" ? "bg-[#171717] text-white" : "hover:bg-[#fffaf2]"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            MD Preview
          </button>
        </div>

        <div data-testid="article-workspace-actions" className="flex flex-wrap items-center justify-end gap-3">
          {isMarkdown ? (
            <button
              type="button"
              onClick={() => void copyRichTextForMedium()}
              disabled={truncated}
              aria-label="Copy rich text for Medium"
              title="Copy rich text for Medium"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition",
                copiedRichText
                  ? "border-[#2f8f5b] bg-[#e9f8ef] text-[#1f7a4b]"
                  : "border-[#d8cab5] bg-white text-[#5f523f] hover:bg-[#fffaf2]",
                truncated && "opacity-45"
              )}
            >
              {copiedRichText ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {canGenerateHero ? (
            <HeroImageDropdown
              open={heroImageMenuOpen}
              options={heroImageOptions}
              disabled={saving || generatingHero || !!truncated}
              loading={loadingHeroImageOptions || generatingHero}
              onOpenChange={setHeroImageMenuOpen}
              onGenerate={(provider) => void generateHeroImage(provider)}
            />
          ) : null}
          {status ? <span className="max-w-[320px] text-xs font-medium text-[#5f523f]">{status}</span> : null}
          {dirty && !status ? <span className="text-xs font-medium text-[#9c6b2f]">Unsaved</span> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || generatingHero || truncated || !dirty}
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-xs font-semibold text-white disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setStatus("");
          }}
          spellCheck={isMarkdown}
          className="min-h-[650px] w-full resize-y overflow-auto rounded-[18px] border border-[#eadfce] bg-[#f8f4ee] p-5 font-mono text-[12px] leading-6 text-[#171717] outline-none focus:border-[#c6b292]"
        />
      ) : (
        <div className="max-h-[650px] overflow-auto rounded-[18px] border border-[#eadfce] bg-[#f8f4ee] p-5 text-sm leading-7 text-[#171717]">
          {isMarkdown ? (
            <MarkdownPreview markdown={content} section={section} relativePath={relativePath} />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-6">{content}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function HeroImageDropdown({
  open,
  options,
  disabled,
  loading,
  onOpenChange,
  onGenerate,
}: {
  open: boolean;
  options: ArticleHeroImageOption[];
  disabled: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (provider: ArticleHeroImageProvider) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Open hero image generator menu"
        className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-white px-4 py-2 text-xs font-semibold text-[#5f523f] shadow-sm hover:bg-[#fffaf2] disabled:opacity-45"
        title="Generate a hero image, save it under artifacts/images, and insert it after the article title."
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Nano Banana hero
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[310px] overflow-hidden rounded-[18px] border border-[#d8cab5] bg-white p-1.5 shadow-[0_18px_38px_rgba(23,23,23,0.14)]">
          {options.map((option) => (
            <button
              key={option.provider}
              type="button"
              onClick={() => onGenerate(option.provider)}
              disabled={disabled}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-[#fffaf2] disabled:opacity-45"
            >
              <HeroImageProviderIcon provider={option.provider} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold text-[#171717]">
                  <span>{option.label}</span>
                  <span>Generate image</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[#806f58]">
                  {option.configured ? option.modelLabel : `Default / env: ${option.modelLabel}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeroImageProviderIcon({ provider }: { provider: ArticleHeroImageProvider }) {
  if (provider === "openai") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#171717] text-white">
        <Bot className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5b7cff,#b85cff,#ffb14a)] text-white">
      <Sparkles className="h-4 w-4" />
    </span>
  );
}

function resolveConfiguredHeroImageOptions(payload: ModelProviderSettingsPayload) {
  const activeProviders = new Set(
    (payload.providers ?? [])
      .filter((provider) => isArticleHeroImageProvider(provider.provider))
      .filter((provider) => provider.status !== "revoked")
      .map((provider) => provider.provider as ArticleHeroImageProvider)
  );
  const imageModels = (payload.models ?? []).filter((model) => {
    if (!isArticleHeroImageProvider(model.provider)) return false;
    if (activeProviders.size && !activeProviders.has(model.provider)) return false;
    return model.capabilities?.includes("image");
  });

  return (["openai", "gemini"] as ArticleHeroImageProvider[]).flatMap((provider) => {
    const providerModels = imageModels.filter((model) => model.provider === provider);
    if (!providerModels.length) return [];
    const preferredModel =
      providerModels.find((model) => model.id && model.id === payload.defaults?.imageModelCatalogId) ??
      providerModels[0];
    return [
      {
        provider,
        label: provider === "openai" ? "GPT" : "Gemini",
        modelLabel: preferredModel.displayName || preferredModel.modelId || provider,
        configured: true,
      },
    ];
  });
}

function isArticleHeroImageProvider(provider: string | undefined): provider is ArticleHeroImageProvider {
  return provider === "openai" || provider === "gemini";
}

function isArticleMarkdownPath(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] ?? "";
  if (!/\.mdx?$/i.test(filename)) return false;
  if (/^article-v\d+\.mdx?$/i.test(filename)) return true;
  if (/^article(-medium)?\.mdx?$/i.test(filename)) return true;
  return parts.some((part) => /^v\d+$/i.test(part)) && /^article(-medium)?\.mdx?$/i.test(filename);
}

function MarkdownPreview({
  markdown,
  section,
  relativePath,
}: {
  markdown: string;
  section: ArticleWorkspaceSection;
  relativePath: string;
}) {
  const blocks = useMemo(
    () => splitMediumMarkdownBlocks(formatArticleMarkdownForMedium(markdown)),
    [markdown]
  );

  if (!blocks.length) {
    return <p className="text-sm text-[#806f58]">Empty markdown.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {blocks.map((block, index) => renderMarkdownBlock(block, index, section, relativePath))}
    </div>
  );
}

function renderMarkdownBlock(
  block: string,
  index: number,
  section: ArticleWorkspaceSection,
  relativePath: string
) {
  const image = block.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
  if (image?.[2]) {
    const src = resolveMarkdownAssetSrc(section, relativePath, image[2]);
    return (
      <figure key={index} className="my-6 overflow-hidden rounded-[18px] border border-[#eadfce] bg-white">
        <img
          src={src}
          alt={image[1] || "Article image"}
          className="h-auto max-h-[520px] w-full object-contain"
        />
        {image[1] ? <figcaption className="px-4 py-3 text-xs text-[#806f58]">{image[1]}</figcaption> : null}
      </figure>
    );
  }

  if (/^```/.test(block)) {
    return (
      <pre key={index} className="my-5 overflow-auto rounded-[14px] bg-[#171717] p-4 font-mono text-xs leading-6 text-[#fff8ef]">
        {block.replace(/^```\w*\n?/, "").replace(/```$/, "")}
      </pre>
    );
  }

  if (block.startsWith("# ")) {
    return (
      <h1 key={index} className="mb-5 mt-2 font-serif text-4xl font-semibold leading-tight text-[#171717]">
        {renderInline(block.slice(2))}
      </h1>
    );
  }

  if (block.startsWith("## ")) {
    return (
      <h2 key={index} className="mb-3 mt-8 font-serif text-2xl font-semibold text-[#171717]">
        {renderInline(block.slice(3))}
      </h2>
    );
  }

  if (block.startsWith("### ")) {
    return (
      <h3 key={index} className="mb-3 mt-6 text-lg font-semibold text-[#171717]">
        {renderInline(block.slice(4))}
      </h3>
    );
  }

  if (block.startsWith("#### ")) {
    return (
      <h4 key={index} className="mb-3 mt-5 text-base font-semibold text-[#171717]">
        {renderInline(block.slice(5))}
      </h4>
    );
  }

  if (block.startsWith(">")) {
    const quote = block
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join(" ");
    return (
      <blockquote key={index} className="my-5 border-l-4 border-[#0f7ea9] bg-white px-4 py-3 text-[#3d3328]">
        {renderInline(quote)}
      </blockquote>
    );
  }

  if (block.startsWith("- ") || block.includes("\n- ")) {
    const items = block
      .split("\n")
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.trim().slice(2));
    return (
      <ul key={index} className="mb-5 list-disc space-y-2 pl-6">
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }

  if (/^\d+\.\s/.test(block) || /\n\d+\.\s/.test(block)) {
    const items = block
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line.trim()))
      .map((line) => line.trim().replace(/^\d+\.\s/, ""));
    return (
      <ol key={index} className="mb-5 list-decimal space-y-2 pl-6">
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }

  return (
    <p key={index} className="mb-5 leading-8 text-[#3d3328]">
      {renderInline(block.replace(/\n/g, " "))}
    </p>
  );
}

function renderInline(text: string) {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    if (match[1] && match[2]) {
      parts.push(
        <a key={`${match.index}-link`} href={match[2]} target="_blank" rel="noreferrer" className="text-[#0f7ea9] underline-offset-4 hover:underline">
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={`${match.index}-strong`} className="font-semibold text-[#171717]">
          {match[3]}
        </strong>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function resolveMarkdownAssetSrc(section: ArticleWorkspaceSection, relativePath: string, src: string) {
  if (/^(https?:|data:|blob:)/i.test(src) || src.startsWith("/api/")) return src;
  const baseParts = relativePath.split("/").slice(0, -1);
  const parts = [...baseParts, src]
    .join("/")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return `/api/article/fs/blob?open=${encodeURIComponent(`${section}:${encodeURIComponent(normalized.join("/"))}`)}`;
}
