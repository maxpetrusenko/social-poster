import crypto from "node:crypto";

import type { SourceEvidenceCandidate } from "./types";

export type ManualEvidenceInput = {
  title?: string;
  summary: string;
  url?: string;
  eventAt?: Date;
  metadata?: Record<string, unknown>;
};

export function createManualEvidenceCandidate(
  input: ManualEvidenceInput
): SourceEvidenceCandidate {
  const title = cleanValue(input.title) || "Manual note";
  const summary = cleanValue(input.summary) || title;
  const url = cleanOptionalValue(input.url);

  return {
    type: "note",
    title,
    summary,
    url: url ?? undefined,
    externalId: url ?? undefined,
    eventAt: input.eventAt,
    dedupeKey: `manual:${hashString([title, summary, url ?? ""].join("|"))}`,
    metadata: input.metadata,
  };
}

function cleanValue(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanOptionalValue(value: string | undefined) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : null;
}

function hashString(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

