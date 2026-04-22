"use client";

import { createElement, useState, useTransition } from "react";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  humanizeApprovalDecision,
  type ApprovalDecision,
} from "@/lib/approvals";

type Props = {
  postId: string;
};

export function PostApprovalRequestActions({ postId }: Props) {
  const router = useRouter();
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submitDecision(nextDecision: ApprovalDecision) {
    setError("");
    setPendingDecision(nextDecision);

    startTransition(async () => {
      const response = await fetch(`/api/posts/${postId}/approval-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision: nextDecision }),
      });

      setPendingDecision(null);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to update approval request.");
        return;
      }

      router.refresh();
    });
  }

  return createElement(
    "div",
    { className: "flex flex-wrap gap-2" },
    (["approved", "changes_requested", "rejected"] as const).map((item) => {
      const isPrimary = item === "approved";
      const isDestructive = item === "rejected";
      const isBusy = pending && pendingDecision === item;

      return createElement(
        "button",
        {
          key: item,
          type: "button",
          onClick: () => submitDecision(item),
          disabled: pending,
          className: [
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
            isPrimary
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : isDestructive
                ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
          ].join(" "),
        },
        isBusy ? createElement(Loader2, { className: "h-4 w-4 animate-spin" }) : null,
        item === "approved" && !isBusy ? createElement(Check, { className: "h-4 w-4" }) : null,
        item === "changes_requested" && !isBusy
          ? createElement(MessageSquare, { className: "h-4 w-4" })
          : null,
        item === "rejected" && !isBusy ? createElement(X, { className: "h-4 w-4" }) : null,
        humanizeApprovalDecision(item)
      );
    }),
    error ? createElement("p", { className: "basis-full text-xs text-red-600" }, error) : null
  );
}
