"use client";

import { useEffect, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import type { AgentDockMode, ProductMode } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentContext = Record<string, unknown>;

type AgentResponse = {
  reply: string;
  context: AgentContext;
};

export function SocialAgentWidget({
  placement = "right-widget",
  productMode = "agentic",
}: {
  placement?: AgentDockMode;
  productMode?: ProductMode;
}) {
  const docked = placement !== "right-widget";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [input, setInput] = useState("");
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

  async function sendMessage() {
    const message = input.trim();
    if (!message || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: message },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/social-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          messages: nextMessages,
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
          className={cn(
            "z-[60] flex flex-col overflow-hidden border border-[#dccdb8] bg-[#fffaf2]",
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
              </div>
            ))}
            {loading ? (
              <div className="mr-10 rounded-[0.95rem] border border-[#eadfce] bg-white px-3 py-2 text-sm text-[#806f58]">
                Thinking
              </div>
            ) : null}
          </div>

          <footer className="border-t border-[#eadfce] bg-[#fbf3e7] p-3">
            <div className="flex gap-2">
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
                disabled={loading || !input.trim()}
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

function readPageContext(productMode: ProductMode) {
  return {
    path: window.location.pathname,
    title: document.title,
    heading: document.querySelector("h1")?.textContent?.trim(),
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
