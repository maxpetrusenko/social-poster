"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, LifeBuoy, Loader2, Send, X } from "lucide-react";

type SupportCategory = "bug" | "account_access" | "billing" | "feature_request";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | {
      status: "success";
      issue: { identifier: string };
      attachment?: {
        status: "skipped" | "linked" | "failed";
        attachment?: { url: string };
        reason?: string;
      };
      imageUrl?: string | null;
    }
  | { status: "error"; message: string };

type SupportTicketResponse = {
  issue?: { identifier: string };
  attachment?: Extract<SubmitState, { status: "success" }>["attachment"];
  imageUrl?: string | null;
  error?: string;
};

const CATEGORY_OPTIONS: Array<{ value: SupportCategory; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "account_access", label: "Account access" },
  { value: "billing", label: "Billing" },
  { value: "feature_request", label: "Feature request" },
];

export function SupportTicketButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [topic, setTopic] = useState("");
  const [explanation, setExplanation] = useState("");
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    name: string;
    size: number;
    previewUrl: string;
  } | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    };
  }, [selectedImage]);

  function selectImage(file: File | null) {
    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "Attachment must be an image." });
      return;
    }
    setSelectedImage({
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
    });
    setState({ status: "idle" });
  }

  function clearImage() {
    if (fileRef.current) fileRef.current.value = "";
    selectImage(null);
  }

  function handleImageDrag(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setIsDraggingImage(true);
      return;
    }
    setIsDraggingImage(false);
  }

  function handleImageDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImage(false);
    selectImage(event.dataTransfer.files?.[0] ?? null);
  }

  async function submit() {
    const trimmedTopic = topic.trim();
    const trimmedExplanation = explanation.trim();
    if (!trimmedTopic || !trimmedExplanation || state.status === "submitting") return;

    const formData = new FormData();
    formData.set("category", category);
    formData.set("topic", trimmedTopic);
    formData.set("explanation", trimmedExplanation);
    formData.set("pageUrl", window.location.href);
    formData.set("pageTitle", document.title);
    const file = selectedImage?.file ?? fileRef.current?.files?.[0];
    if (file) formData.set("image", file);

    setState({ status: "submitting" });
    try {
      const response = await fetch("/api/support-tickets", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as SupportTicketResponse;
      if (!response.ok || !body.issue) {
        throw new Error(body.error ?? "Support ticket failed.");
      }
      setState({
        status: "success",
        issue: body.issue,
        attachment: body.attachment,
        imageUrl: body.imageUrl ?? null,
      });
      setTopic("");
      setExplanation("");
      clearImage();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Support ticket failed.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState({ status: "idle" });
        }}
        aria-label="Open support ticket"
        title="Open support ticket"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b]"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-[rgba(23,23,23,0.34)] px-4 py-5 backdrop-blur-sm md:py-12">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-dialog-title"
            className="w-full max-w-[520px] overflow-hidden rounded-[1.1rem] border border-[#dccdb8] bg-[#fffaf2] shadow-[0_24px_70px_rgba(23,23,23,0.22)]"
          >
            <header className="flex items-center justify-between gap-4 border-b border-[#eadfce] px-5 py-4">
              <div>
                <h2 id="support-dialog-title" className="text-base font-semibold text-[#171717]">
                  Contact support
                </h2>
                <p className="text-sm text-[#806f58]">
                  Tell us what happened. We include the current page for context.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8cab5] text-[#5f523f]"
                aria-label="Close support ticket"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b6b54]">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SupportCategory)}
                  className="h-11 w-full rounded-[0.85rem] border border-[#d8cab5] bg-white px-3 text-sm font-semibold text-[#171717] outline-none"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b6b54]">
                  Topic
                </span>
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  maxLength={120}
                  placeholder="What broke?"
                  className="h-11 w-full rounded-[0.85rem] border border-[#d8cab5] bg-white px-3 text-sm text-[#171717] outline-none placeholder:text-[#a5947d]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b6b54]">
                  Explanation
                </span>
                <textarea
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="What happened, expected result, steps to reproduce."
                  className="min-h-[8rem] w-full resize-none rounded-[0.85rem] border border-[#d8cab5] bg-white px-3 py-2 text-sm leading-6 text-[#171717] outline-none placeholder:text-[#a5947d]"
                />
              </label>

              <label
                data-testid="support-image-dropzone"
                onDragEnter={handleImageDrag}
                onDragOver={handleImageDrag}
                onDragLeave={handleImageDrag}
                onDrop={handleImageDrop}
                className={`flex cursor-pointer items-center gap-3 rounded-[0.85rem] border border-dashed px-3 py-3 text-sm font-semibold transition ${
                  isDraggingImage
                    ? "border-[#171717] bg-[#f4ead9] text-[#171717]"
                    : "border-[#d8cab5] bg-white text-[#5f523f]"
                }`}
              >
                <Camera className="h-4 w-4" />
                <span>{isDraggingImage ? "Drop image" : "Attach image"}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => selectImage(event.target.files?.[0] ?? null)}
                />
              </label>

              {selectedImage ? (
                <div className="rounded-[0.85rem] border border-[#d8cab5] bg-white p-3">
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedImage.previewUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-[0.65rem] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#171717]">
                        {selectedImage.name}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b7a63]">
                        Ready to attach - {formatFileSize(selectedImage.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearImage}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8cab5] text-[#5f523f]"
                      aria-label="Remove attached image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              {state.status === "success" ? (
                <p className="rounded-[0.85rem] border border-[#b7ddc2] bg-[#e8f6ed] px-3 py-2 text-sm font-semibold text-[#2f7b4f]">
                  Created <span>{state.issue.identifier}</span>
                  {state.attachment?.status === "linked" ? " with image attached" : null}
                </p>
              ) : null}
              {state.status === "success" && state.attachment?.status === "failed" ? (
                <p className="rounded-[0.85rem] border border-[#eadfce] bg-white px-3 py-2 text-sm font-semibold text-[#7b6b54]">
                  Image uploaded, but Linear attachment card failed. The image URL is still in
                  the ticket description.
                </p>
              ) : null}
              {state.status === "error" ? (
                <p className="rounded-[0.85rem] border border-[#efc1b7] bg-[#fff0ec] px-3 py-2 text-sm font-semibold text-[#9b3f2f]">
                  {state.message}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[#eadfce] bg-[#fbf3e7] px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#d8cab5] px-4 py-2 text-sm font-semibold text-[#5f523f]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                aria-label={
                  state.status === "submitting"
                    ? "Sending support request"
                    : "Send support request"
                }
                disabled={
                  state.status === "submitting" || !topic.trim() || !explanation.trim()
                }
                className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {state.status === "submitting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
