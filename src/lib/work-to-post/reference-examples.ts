export const BOARDY_INSPIRED_MECHANISMS = [
  "compressed_build_log",
  "counterintuitive_constraint",
  "concrete_before_claim",
] as const;

export type BoardyInspiredMechanism = (typeof BOARDY_INSPIRED_MECHANISMS)[number];

export const BOARDY_VERIFIED_STATUS_ALLOWLIST = {
  version: "2026-07-24.1",
  verifiedOn: "2026-07-24",
  statusIds: [
    "2080349222105416126",
    "2080450390315647056",
    "2080304998823428215",
  ],
} as const;

const verifiedBoardyStatusIds = new Set<string>(
  BOARDY_VERIFIED_STATUS_ALLOWLIST.statusIds
);

export type ReferenceExample = {
  id: string;
  sourceUrl: string;
  mechanism: BoardyInspiredMechanism;
};

export function normalizeVerifiedBoardyStatusUrl(
  sourceUrl: string,
  author: string
): string {
  if (author.trim().toLowerCase() !== "@boardyai") {
    throw new Error("Boardy-inspired references must cite a verified @boardyai status URL.");
  }

  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    throw new Error("Boardy-inspired references must cite a verified @boardyai status URL.");
  }

  const statusMatch = url.pathname.match(/^\/boardyai\/status\/([1-9]\d*)\/?$/i);
  if (
    url.protocol !== "https:" ||
    !["x.com", "www.x.com"].includes(url.hostname.toLowerCase()) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !statusMatch ||
    !verifiedBoardyStatusIds.has(statusMatch[1])
  ) {
    throw new Error("Boardy-inspired references must cite a verified @boardyai status URL.");
  }

  return `https://x.com/boardyai/status/${statusMatch[1]}`;
}

export function validateReferenceExamples(examples: ReferenceExample[]): ReferenceExample[] {
  if (examples.length !== 3) throw new Error("Exactly three reference examples are required.");
  const ids = new Set(examples.map((example) => example.id));
  const mechanisms = new Set(examples.map((example) => example.mechanism));
  if (ids.size !== 3 || mechanisms.size !== 3) throw new Error("Reference examples must have distinct IDs and mechanisms.");
  return examples.map((example) => ({
    ...example,
    sourceUrl: normalizeVerifiedBoardyStatusUrl(example.sourceUrl, "@boardyai"),
  }));
}
