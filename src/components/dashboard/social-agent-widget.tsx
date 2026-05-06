"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { Bot, CheckCircle2, ImagePlus, Loader2, Send, Sparkles, X } from "lucide-react";
import type { AgentDockMode, ProductMode } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import type { SocialAgentAttachment } from "@/lib/social-agent/action-intents";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: SocialAgentAttachment[];
};

type AgentContext = Record<string, unknown>;

type AgentResponse = {
  reply: string;
  context: AgentContext;
};

const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
const QUICK_ACTIONS = [
  {
    label: "Check post status",
    prompt: "Did my latest post publish successfully?",
    icon: CheckCircle2,
  },
];

export function SocialAgentWidget({
  placement = "right-widget",
  productMode = "agentic",
}: {
  placement?: AgentDockMode;
  productMode?: ProductMode;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docked = placement !== "right-widget";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<SocialAgentAttachment[]>([]);
  const [uploadingImages, setUploadingImages] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "How can I help?\n\nI can make a post, check connected accounts, or create a support ticket.",
    },
  ]);
  const panelOpen = docked || open;
  const modeLabel = productMode === "agentic" ? "Agentic mode" : "SaaS mode";

  useEffect(() => {
    if (!panelOpen || context) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/social-agent")
      .then((response) => response.json())
      .then((body: AgentResponse | { error?: string }) => {
        if (cancelled) return;
        if (!isAgentResponse(body)) {
          throw new Error(body.error ?? "SMM Agent failed.");
        }
        setContext(body.context);
      })
      .catch(() => {
        if (!cancelled) addAssistant("I could not load workspace context.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, panelOpen]);

  function addAssistant(content: string) {
    setMessages((current) => [...current, { role: "assistant", content }]);
  }

  async function sendMessage(messageOverride?: string) {
    const quickAction = typeof messageOverride === "string";
    const attachments = quickAction ? [] : pendingAttachments;
    const message = (messageOverride ?? input).trim() || (attachments.length > 0 ? "Use the attached image." : "");
    if ((!message && attachments.length === 0) || loading || uploadingImages > 0) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      attachments,
    };
    const nextMessages: ChatMessage[] = [
      ...messages,
      userMessage,
    ];
    setMessages(nextMessages);
    if (!quickAction) {
      setInput("");
      setPendingAttachments([]);
    }
    setUploadError("");
    setLoading(true);

    try {
      const response = await fetch("/api/social-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          messages: nextMessages,
          attachments,
          pageContext: readPageContext(productMode),
        }),
      });
      const body = (await response.json()) as AgentResponse | { error?: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "SMM Agent failed.");
      }
      if (!isAgentResponse(body)) {
        throw new Error("SMM Agent failed.");
      }

      setContext(body.context);
      addAssistant(body.reply);
    } catch (error) {
      addAssistant(error instanceof Error ? error.message : "SMM Agent failed.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadImageFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setUploadError("Use an image file.");
      return;
    }

    const availableSlots = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;
    if (availableSlots <= 0) {
      setUploadError(`Remove an image before adding another.`);
      return;
    }

    const acceptedFiles = imageFiles.slice(0, availableSlots);
    const tooLarge = acceptedFiles.find((file) => file.size > MAX_CHAT_IMAGE_BYTES);
    if (tooLarge) {
      setUploadError("Images must be 10 MB or smaller in chat.");
      return;
    }

    setUploadError("");
    setUploadingImages(acceptedFiles.length);
    try {
      const uploaded: SocialAgentAttachment[] = [];
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.url !== "string") {
          throw new Error(
            typeof result.error === "string" ? result.error : "Image upload failed."
          );
        }
        uploaded.push({
          url: result.url,
          name: file.name,
          contentType: file.type,
          size: file.size,
        });
      }
      setPendingAttachments((current) => [...current, ...uploaded].slice(0, MAX_CHAT_ATTACHMENTS));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploadingImages(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleImageDrag(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setIsDraggingImage(true);
      return;
    }
    setIsDraggingImage(false);
  }

  function handleImageDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImage(false);
    const files = event.dataTransfer.files;
    if (files?.length) void uploadImageFiles(files);
  }

  return (
    <>
      {!docked ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border border-[#d7c8b2] bg-[#171717] px-4 py-3 text-sm font-semibold text-[#fff8ef] shadow-[0_18px_38px_rgba(23,23,23,0.25)]"
        >
          <Bot className="h-4 w-4" />
          SMM Agent
        </button>
      ) : null}

      {panelOpen ? (
        <section
          onDragEnter={handleImageDrag}
          onDragOver={handleImageDrag}
          onDragLeave={handleImageDrag}
          onDrop={handleImageDrop}
          className={cn(
            "z-[60] flex flex-col overflow-hidden border border-[#dccdb8] bg-[#fffaf2]",
            isDraggingImage && "ring-2 ring-[#0f7ea9]",
            docked
              ? "max-h-[calc(100vh-4rem)] w-full rounded-none border-x-0 shadow-none lg:sticky lg:top-[73px] lg:h-[calc(100vh-73px)] lg:max-h-none lg:w-[380px] lg:shrink-0 lg:rounded-none"
              : "fixed bottom-5 right-5 max-h-[calc(100vh-2.5rem)] w-[min(430px,calc(100vw-2rem))] rounded-[1.25rem] shadow-[0_28px_70px_rgba(23,23,23,0.24)]",
            placement === "left-side" && "lg:border-l-0",
            placement === "right-side" && "lg:border-r-0"
          )}
        >
          <header className="flex items-center justify-between gap-4 border-b border-[#eadfce] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#171717] text-[#fff8ef]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#171717]">SMM Agent</p>
                <p className="truncate text-xs text-[#806f58]">
                  {modeLabel}
                </p>
              </div>
            </div>
            {!docked ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8cab5] text-[#5f523f]"
                aria-label="Close SMM Agent"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.slice(-10).map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "whitespace-pre-wrap rounded-[0.95rem] px-3 py-2 text-sm leading-6",
                  message.role === "user"
                    ? "ml-10 bg-[#171717] text-[#fff8ef]"
                    : "mr-10 border border-[#eadfce] bg-white text-[#3d3328]"
                )}
              >
                {message.content}
                {message.attachments?.length ? (
                  <AttachmentStrip attachments={message.attachments} />
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="mr-10 rounded-[0.95rem] border border-[#eadfce] bg-white px-3 py-2 text-sm text-[#806f58]">
                Thinking
              </div>
            ) : null}
          </div>

          <footer className="border-t border-[#eadfce] bg-[#fbf3e7] p-3">
            {pendingAttachments.length > 0 ? (
              <AttachmentStrip
                attachments={pendingAttachments}
                onRemove={(url) =>
                  setPendingAttachments((current) =>
                    current.filter((attachment) => attachment.url !== url)
                  )
                }
              />
            ) : null}
            {uploadError ? (
              <p className="mb-2 text-xs font-medium text-[#9b2f21]">{uploadError}</p>
            ) : null}
            <div className="mb-2 flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.prompt}
                    type="button"
                    onClick={() => void sendMessage(action.prompt)}
                    disabled={loading || uploadingImages > 0}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#d8cab5] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f523f] disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void uploadImageFiles(event.target.files);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploadingImages > 0}
                className="flex w-11 shrink-0 items-center justify-center rounded-[0.9rem] border border-[#d8cab5] bg-white text-[#5f523f] disabled:opacity-50"
                aria-label="Upload image"
              >
                {uploadingImages > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={2}
                placeholder="Ask SMM Agent what to post, check, or fix."
                className="min-h-12 flex-1 resize-none rounded-[0.9rem] border border-[#d8cab5] bg-white px-3 py-2 text-sm leading-6 text-[#171717] outline-none"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={
                  loading ||
                  uploadingImages > 0 ||
                  (!input.trim() && pendingAttachments.length === 0)
                }
                className="flex w-12 items-center justify-center rounded-[0.9rem] bg-[#171717] text-white disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </section>
      ) : null}
    </>
  );
}

function AttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: SocialAgentAttachment[];
  onRemove?: (url: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.url}
          className="relative overflow-hidden rounded-[0.75rem] border border-[#eadfce] bg-[#fffaf2]"
        >
          <Image
            src={attachment.url}
            alt={attachment.name || "Attached image"}
            width={180}
            height={80}
            unoptimized
            className="h-20 w-full object-cover"
          />
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-[#5f523f]">
            <span className="truncate">{attachment.name || "Image"}</span>
            {typeof attachment.size === "number" ? (
              <span className="shrink-0">{formatFileSize(attachment.size)}</span>
            ) : null}
          </div>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(attachment.url)}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#171717] text-white"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function readPageContext(productMode: ProductMode) {
  const url = new URL(window.location.href);
  const path = window.location.pathname;
  const articleOpenRef = path === "/dashboard/articles"
    ? url.searchParams.get("open")
    : null;
  const articleIdMatch = path.match(/^\/dashboard\/articles\/([^/]+)$/);

  return {
    path: window.location.pathname,
    title: document.title,
    heading: document.querySelector("h1")?.textContent?.trim(),
    article: path.startsWith("/dashboard/articles")
      ? {
          articleId: articleIdMatch?.[1] ?? null,
          openRef: articleOpenRef,
          visibleTitle: document.querySelector("h1")?.textContent?.trim() ?? null,
          visiblePath: document.querySelector("h2")?.textContent?.trim() ?? null,
        }
      : null,
    replyLanguage: window.localStorage.getItem("social-poster.replyLanguage"),
    productMode,
  };
}

function isAgentResponse(body: AgentResponse | { error?: string }): body is AgentResponse {
  return (
    typeof (body as AgentResponse).reply === "string" &&
    typeof (body as AgentResponse).context === "object" &&
    (body as AgentResponse).context !== null
  );
}
