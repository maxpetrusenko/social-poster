"use client";

import { createElement, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";

export function PostApprovalRequestButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function requestApproval() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/posts/${postId}/approval-request`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to request approval.");
        return;
      }

      router.refresh();
    });
  }

  return createElement(
    "div",
    { className: "space-y-2" },
    createElement(
      "button",
      {
        type: "button",
        onClick: requestApproval,
        disabled: pending,
        className:
          "inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60",
      },
      pending ? createElement(Loader2, { className: "h-4 w-4 animate-spin" }) : null,
      !pending ? createElement(Send, { className: "h-4 w-4" }) : null,
      "Request approval"
    ),
    error ? createElement("p", { className: "text-xs text-red-600" }, error) : null
  );
}
