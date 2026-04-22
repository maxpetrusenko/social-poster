"use client";

import { useState } from "react";

export function CopyInviteLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyInviteLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copyInviteLink()}
      className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]"
    >
      {copied ? "Copied" : "Copy Link"}
    </button>
  );
}
