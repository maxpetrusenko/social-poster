"use client";

import { useRef, useState } from "react";
import { Camera, LifeBuoy, Loader2, Send, X } from "lucide-react";

type SupportSource = "from_user_triage" | "from_bot" | "from_github_issue" | "from_me";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; issue: { identifier: string; url: string } }
  | { status: "error"; message: string };

const SOURCE_OPTIONS: Array<{ value: SupportSource; label: string }> = [
  { value: "from_user_triage", label: "User triage" },
  { value: "from_bot", label: "Bot" },
  { value: "from_github_issue", label: "GitHub issue" },
  { value: "from_me", label: "Max" },
];

export function SupportTicketButton() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<SupportSource>("from_user_triage");
  const [topic, setTopic] = useState("");
  const [explanation, setExplanation] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmedTopic = topic.trim();
    const trimmedExplanation = explanation.trim();
    if (!trimmedTopic || !trimmedExplanation || state.status === "submitting") return;

    const formData = new FormData();
    formData.set("source", source);
    formData.set("topic", trimmedTopic);
    formData.set("explanation", trimmedExplanation);
    formData.set("pageUrl", window.location.href);
    formData.set("pageTitle", document.title);
    const file = fileRef.current?.files?.[0];
    if (file) formData.set("image", file);

    setState({ status: "submitting" });
    try {
      const response = await fetch("/api/support-tickets", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as {
        issue?: { identifier: string; url: string };
        error?: string;
      };
      if (!response.ok || !body.issue) {
        throw new Error(body.error ?? "Support ticket failed.");
      }
      setState({ status: "success", issue: body.issue });
      setTopic("");
      setExplanation("");
      if (fileRef.current) fileRef.current.value = "";
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
          <section className="w-full max-w-[520px] overflow-hidden rounded-[1.1rem] border border-[#dccdb8] bg-[#fffaf2] shadow-[0_24px_70px_rgba(23,23,23,0.22)]">
            <header className="flex items-center justify-between gap-4 border-b border-[#eadfce] px-5 py-4">
              <div>
                <p className="text-base font-semibold text-[#171717]">Support Ticket</p>
                <p className="text-sm text-[#806f58]">Send context to Linear.</p>
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
                  Type
                </span>
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value as SupportSource)}
                  className="h-11 w-full rounded-[0.85rem] border border-[#d8cab5] bg-white px-3 text-sm font-semibold text-[#171717] outline-none"
                >
                  {SOURCE_OPTIONS.map((option) => (
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
                  rows={5}
                  placeholder="What happened, expected result, steps to reproduce."
                  className="min-h-[8rem] w-full resize-none rounded-[0.85rem] border border-[#d8cab5] bg-white px-3 py-2 text-sm leading-6 text-[#171717] outline-none placeholder:text-[#a5947d]"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-[0.85rem] border border-dashed border-[#d8cab5] bg-white px-3 py-3 text-sm font-semibold text-[#5f523f]">
                <Camera className="h-4 w-4" />
                <span>Attach image</span>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" />
              </label>

              {state.status === "success" ? (
                <p className="rounded-[0.85rem] border border-[#b7ddc2] bg-[#e8f6ed] px-3 py-2 text-sm font-semibold text-[#2f7b4f]">
                  Created{" "}
                  <a
                    href={state.issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {state.issue.identifier}
                  </a>
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
