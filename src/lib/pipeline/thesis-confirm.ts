export type ConfirmResult = {
  ok: boolean;
  checked: number;
  untraceable: string[];
  reasons: string[];
};

const NUMBER_TOKEN = /\$?\d[\d,]*(?:\.\d+)?\s?%?/g;

function normalizeToken(raw: string): string {
  return raw.replace(/[$,\s]/g, "").toLowerCase();
}

/** Every distinct number that appears in the text, normalised ($ and thousands separators stripped). */
export function extractNumberTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = normalizeToken(match[0]);
    if (!token) continue;
    found.add(token);
  }
  return Array.from(found);
}

function evidenceCorpus(thesis: {
  claim: string;
  stakes: string;
  falsifier: string;
  evidence: { title: string; quote: string; url: string }[];
}): string {
  const parts = [thesis.claim, thesis.stakes, thesis.falsifier];
  for (const item of thesis.evidence) {
    parts.push(item.title, item.quote, item.url);
  }
  return parts.join("\n");
}

/**
 * Phase D. A post may only state numbers that its evidence trail already contains.
 * Cheap, deterministic, and deliberately conservative: it does not judge tone or truth,
 * only whether the digits came from somewhere.
 */
export function confirmPostAgainstThesis(
  postText: string,
  thesis: {
    claim: string;
    stakes: string;
    falsifier: string;
    evidence: { title: string; quote: string; url: string }[];
  }
): ConfirmResult {
  const body = postText ?? "";
  const reasons: string[] = [];
  const corpusTokens = new Set(extractNumberTokens(evidenceCorpus(thesis)));

  const untraceable: string[] = [];
  for (const token of extractNumberTokens(body)) {
    if (!corpusTokens.has(token)) untraceable.push(token);
  }
  if (untraceable.length > 0) {
    reasons.push(`numbers not in evidence: ${untraceable.join(", ")}`);
  }
  if (/https?:\/\//i.test(body)) {
    reasons.push("post contains a raw link; the writer contract puts sources in evidence, not in the post");
  }
  if (/\b(see|per) evidence\b/i.test(body)) {
    reasons.push("post refers to the evidence list instead of stating the fact");
  }

  return {
    ok: reasons.length === 0,
    checked: extractNumberTokens(body).length,
    untraceable,
    reasons,
  };
}
