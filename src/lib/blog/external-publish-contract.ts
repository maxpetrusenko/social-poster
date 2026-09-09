import { createHash } from "node:crypto";

export type ExternalBlogPublishPayload = {
  contractVersion?: 1 | 2 | 3 | 4;
  runId: string;
  packageId: string;
  publicationDate?: string;
  article: string;
  articleSha256: string;
  review: string;
  framework?: FrameworkIdentity;
  readiness?: PublishReadiness;
  researchEvidence?: ResearchEvidence;
  image?: CommonsImageEvidence;
};

export type ValidatedExternalBlogArticle = {
  title: string;
  visibleWordCount: number;
  inlineUrls: string[];
  articleSha256: string;
  warnings: string[];
  framework?: FrameworkIdentity;
  readiness?: PublishReadiness;
  researchEvidence?: ResearchEvidence;
  image?: CommonsImageEvidence;
};

export type FrameworkIdentity = {
  id: string;
  version: string;
  sha256: string;
};

export type ReadinessGate = {
  status: "pass";
  articleSha256: string;
  proof: string;
};

export type PublishReadiness = {
  status: "pass";
  articleSha256: string;
  factual: ReadinessGate;
  editorial: ReadinessGate;
  semantic: ReadinessGate;
  format: ReadinessGate;
};

export type ResearchEvidence = {
  producer: "hermes-weekly-app-articles";
  status: "research_ready";
  manifest: Record<string, unknown>;
  manifestSha256: string;
  manifestJson?: string;
};

export type CommonsImageEvidence = {
  provider: "wikimedia_commons";
  imageUrl: string;
  sourceUrl: string;
  alt: string;
  author: string;
  license: string;
  licenseUrl: string;
};

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]{6,160}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const INLINE_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const COMMONS_IMAGE_PATTERN = /^!\[[^\]]+\]\(https:\/\/upload\.wikimedia\.org\/[^\s)]+\)$/m;
const COMMONS_SOURCE_PATTERN = /\[[^\]]+\]\(https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s)]+\)/i;
const COMMONS_LICENSE_PATTERN = /\[(?:CC BY(?:-SA)? \d\.\d|CC0(?: 1\.0)?|Public domain)\]\(https:\/\/(?:www\.)?creativecommons\.org\/[^\s)]+\)/i;
const FRAMEWORK_ID = "research-enriched-article-prompt";
const FRAMEWORK_VERSION = "v6";
const FRAMEWORK_SHA256 =
  "00e870819bc1a02aa28e86e49162f7ca93c5f3a05bde072c8b4679c00d5b43af";
const RESEARCH_PRODUCER = "hermes-weekly-app-articles";
const INSPECTION_TOOLS = new Set([
  "hermes.web.open",
  "browse.get",
  "scrapling.extract.get",
]);

export function isBlogPublishAuthorized(
  authorizationHeader: string | null,
  expectedToken: string | undefined,
) {
  return Boolean(expectedToken && authorizationHeader === `Bearer ${expectedToken}`);
}

export function validateExternalBlogPublishPayload(
  value: unknown,
): ValidatedExternalBlogArticle {
  if (!value || typeof value !== "object") {
    throw new Error("Publish payload must be an object.");
  }
  const payload = value as Partial<ExternalBlogPublishPayload>;
  const contractVersion = payload.contractVersion ?? 1;
  if (![1, 2, 3, 4].includes(contractVersion)) {
    throw new Error("Article contract version must be 1, 2, 3, or 4.");
  }
  if (!payload.runId || !RUN_ID_PATTERN.test(payload.runId)) {
    throw new Error("A valid Hermes run ID is required.");
  }
  if (!payload.packageId || !RUN_ID_PATTERN.test(payload.packageId)) {
    throw new Error("A valid Hermes package ID is required.");
  }
  if (
    contractVersion >= 3 &&
    (!payload.publicationDate ||
      !DATE_PATTERN.test(payload.publicationDate) ||
      !Number.isFinite(Date.parse(`${payload.publicationDate}T00:00:00Z`)))
  ) {
    throw new Error(
      "Version " + contractVersion + " articles require a valid publication date.",
    );
  }
  if (!payload.article || payload.article.length > 150_000) {
    throw new Error("Article content is required and must be under 150 KB.");
  }
  if (!payload.review || payload.review.length > 100_000) {
    throw new Error("Review evidence is required and must be under 100 KB.");
  }
  if (!payload.articleSha256 || !SHA256_PATTERN.test(payload.articleSha256)) {
    throw new Error("A lowercase SHA-256 article hash is required.");
  }

  const articleSha256 = createHash("sha256").update(payload.article).digest("hex");
  if (articleSha256 !== payload.articleSha256) {
    throw new Error("Article SHA-256 does not match the supplied hash.");
  }
  if (!payload.review.includes(articleSha256)) {
    throw new Error("Review is not bound to the exact article SHA-256.");
  }
  if (!reviewHasPassingOutcome(payload.review, contractVersion)) {
    throw new Error("Review outcome must be pass.");
  }

  if (contractVersion === 4) {
    return validateV4Payload(payload, articleSha256);
  }

  const title = payload.article.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title || title.length > 180) {
    throw new Error("Article must have one valid H1 title.");
  }
  const inlineUrls = [...payload.article.matchAll(INLINE_LINK_PATTERN)].map((match) => match[2]);
  const uniqueInlineUrls = [...new Set(inlineUrls)];
  if (uniqueInlineUrls.length < 5) {
    throw new Error("Article must include at least five unique inline source links.");
  }
  if (
    contractVersion >= 2 &&
    !(
      COMMONS_IMAGE_PATTERN.test(payload.article) &&
      COMMONS_SOURCE_PATTERN.test(payload.article) &&
      COMMONS_LICENSE_PATTERN.test(payload.article)
    )
  ) {
    throw new Error("Version 2 articles require one licensed Wikimedia Commons image and attribution.");
  }

  const visibleText = payload.article
    .replace(INLINE_LINK_PATTERN, "$1")
    .replace(/https?:\/\/\S+/g, "");
  const visibleWordCount = visibleText.match(/\b[\p{L}\p{N}_’'-]+\b/gu)?.length ?? 0;
  if (visibleWordCount < 1500) {
    throw new Error("Article visible word count must be at least 1500 words.");
  }
  const warnings = visibleWordCount > 2000 ? ["article_over_2000_words"] : [];
  return { title, visibleWordCount, inlineUrls: uniqueInlineUrls, articleSha256, warnings };
}

function validateV4Payload(
  payload: Partial<ExternalBlogPublishPayload>,
  articleSha256: string,
): ValidatedExternalBlogArticle {
  const article = payload.article;
  const review = payload.review;
  if (typeof article !== "string" || typeof review !== "string") {
    throw new Error("Version 4 article and review are required.");
  }

  validateV4Framework(payload.framework);
  validateV4Readiness(payload.readiness, articleSha256);
  validateV4ReviewContract(review, articleSha256);
  const researchEvidence = validateV4ResearchEvidence(payload.researchEvidence);
  const structure = inspectMarkdownStructure(article);
  if (structure.unclosedFence) {
    throw new Error("Version 4 article contains an unclosed code fence.");
  }
  if (structure.hasTable) {
    throw new Error("Version 4 articles do not support Markdown tables.");
  }
  if (
    structure.h1s.length !== 1 ||
    structure.h1s[0].lineIndex !== structure.firstContentIndex
  ) {
    throw new Error("Version 4 articles require one actual H1 title at the start.");
  }
  if (structure.h3s.length === 0) {
    throw new Error("Version 4 articles require an H3 subtitle immediately below the H1.");
  }
  const nextContent = structure.lines
    .slice(structure.h1s[0].lineIndex + 1)
    .find((line) => line.trim());
  if (!nextContent || !/^###\s+\S/.test(nextContent.trim())) {
    throw new Error("Version 4 articles require the H3 subtitle immediately below the H1.");
  }

  const image = validateV4ImageContract(article, payload.image);
  const inlineUrls = [...article.matchAll(INLINE_LINK_PATTERN)].map((match) => match[2]);
  return {
    title: structure.h1s[0].title,
    visibleWordCount: visibleText(article).match(/\b[\p{L}\p{N}_’'-]+\b/gu)?.length ?? 0,
    inlineUrls: [...new Set(inlineUrls)],
    articleSha256,
    warnings: [],
    framework: payload.framework,
    readiness: payload.readiness,
    researchEvidence,
    image,
  };
}

function validateV4Framework(
  framework: FrameworkIdentity | undefined,
): asserts framework is FrameworkIdentity {
  if (
    !framework ||
    framework.id !== FRAMEWORK_ID ||
    framework.version !== FRAMEWORK_VERSION ||
    !SHA256_PATTERN.test(framework.sha256) ||
    framework.sha256 !== FRAMEWORK_SHA256
  ) {
    throw new Error("Version 4 publisher framework identity is not approved.");
  }
}

function validateV4Gate(
  gate: ReadinessGate | undefined,
  articleSha256: string,
  name: string,
): asserts gate is ReadinessGate {
  if (
    !gate ||
    gate.status !== "pass" ||
    gate.articleSha256 !== articleSha256 ||
    !gate.proof.trim()
  ) {
    throw new Error(
      "Version 4 " + name + " readiness is missing or not hash-bound.",
    );
  }
}

function validateV4Readiness(
  readiness: PublishReadiness | undefined,
  articleSha256: string,
): asserts readiness is PublishReadiness {
  if (
    !readiness ||
    readiness.status !== "pass" ||
    readiness.articleSha256 !== articleSha256
  ) {
    throw new Error("Version 4 readiness is missing or not hash-bound.");
  }
  for (const name of ["factual", "editorial", "semantic", "format"] as const) {
    validateV4Gate(readiness[name], articleSha256, name);
  }
}

function reviewHasPassingOutcome(review: string, contractVersion: number): boolean {
  if (/^outcome:\s*['"]?pass['"]?\s*$/im.test(review)) return true;
  if (contractVersion !== 4) return false;
  try {
    const parsed = JSON.parse(review) as Record<string, unknown>;
    return parsed.outcome === "pass";
  } catch {
    return false;
  }
}

function validateV4ReviewContract(review: string, articleSha256: string) {
  let parsed: Record<string, unknown> | undefined;
  try {
    const value = JSON.parse(review) as unknown;
    parsed = isRecord(value) ? value : undefined;
  } catch {
    parsed = undefined;
  }
  if (parsed) {
    if (parsed.article_sha256 !== articleSha256 || parsed.outcome !== "pass") {
      throw new Error("Version 4 independent review is not exact-hash bound.");
    }
    const gates = isRecord(parsed.gates) ? parsed.gates : undefined;
    for (const name of ["factual", "editorial", "semantic"]) {
      const gate = gates?.[name];
      const status = typeof gate === "string"
        ? gate
        : isRecord(gate)
          ? gate.status ?? gate.outcome
          : undefined;
      if (!["pass", "passed"].includes(asText(status).toLowerCase())) {
        throw new Error(
          "Version 4 independent review lacks a passing " + name + " gate.",
        );
      }
    }
    if (reviewHasUnresolvedJsonFindings(parsed)) {
      throw new Error("Version 4 independent review contains unresolved findings.");
    }
    return;
  }
  if (!review.includes(articleSha256)) {
    throw new Error("Version 4 independent review is not bound to the article hash.");
  }
  const declaredHash = review.match(
    /^\s*article_sha256:\s*["']?([a-f0-9]{64})["']?\s*$/im,
  )?.[1];
  if (declaredHash !== articleSha256) {
    throw new Error("Version 4 independent review is not exact-hash bound.");
  }
  for (const name of ["factual", "editorial", "semantic"]) {
    const gate = review.split(/\r?\n/).some((line) => {
      const match = line.match(
        /^[ \t]{2,}([a-z_]+):[ \t]*["']?(pass|passed)["']?[ \t]*$/i,
      );
      return match?.[1] === name;
    });
    if (!gate) {
      throw new Error(
        "Version 4 independent review lacks a passing " + name + " gate.",
      );
    }
  }
  if (reviewHasUnresolvedYamlFindings(review)) {
    throw new Error("Version 4 independent review contains unresolved findings.");
  }
}

function reviewHasUnresolvedYamlFindings(review: string): boolean {
  for (const line of review.split(/\r?\n/)) {
    const blocker = line.match(
      /^\s*(?:blockers|unresolved_findings|blocking_findings):\s*(.*)$/i,
    );
    if (blocker && !/^(?:\[\s*\]|\{\s*\}|null|none)$/i.test(blocker[1].trim())) {
      return true;
    }
    if (
      /^\s*(?:status|outcome):\s*(?:open|blocked|failed|fail|revise|unresolved)\b/i.test(line) ||
      /^\s*severity:\s*(?:blocker|blocking)\b/i.test(line)
    ) {
      return true;
    }
  }
  return false;
}

function reviewHasUnresolvedJsonFindings(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(reviewHasUnresolvedJsonFindings);
  if (typeof value === "string") return Boolean(value.trim());
  if (!isRecord(value)) return false;
  const status = asText(value.status ?? value.outcome).toLowerCase();
  const severity = asText(value.severity).toLowerCase();
  if (
    ["open", "blocked", "fail", "failed", "unresolved", "revise"].includes(status) ||
    ["blocker", "blocking"].includes(severity) ||
    (value.required_fix && !["resolved", "pass", "passed"].includes(status))
  ) {
    return true;
  }
  return ["findings", "blockers", "unresolved_findings", "blocking_findings"].some(
    (key) => reviewHasUnresolvedJsonFindings(value[key]),
  );
}

function validateV4ResearchEvidence(
  evidence: ResearchEvidence | undefined,
): ResearchEvidence {
  if (
    !evidence ||
    evidence.producer !== RESEARCH_PRODUCER ||
    evidence.status !== "research_ready" ||
    !isRecord(evidence.manifest) ||
    !SHA256_PATTERN.test(evidence.manifestSha256)
  ) {
    throw new Error("Version 4 research evidence is missing or not ready.");
  }
  let serializedManifest = canonicalJson(evidence.manifest);
  if (typeof evidence.manifestJson === "string") {
    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(evidence.manifestJson);
    } catch {
      throw new Error("Version 4 research manifest JSON is malformed.");
    }
    if (canonicalJson(parsedManifest) !== canonicalJson(evidence.manifest)) {
      throw new Error("Version 4 research manifest JSON disagrees with its object.");
    }
    serializedManifest = evidence.manifestJson;
  }
  const manifestHash = createHash("sha256")
    .update(serializedManifest)
    .digest("hex");
  if (manifestHash !== evidence.manifestSha256) {
    throw new Error("Version 4 research manifest hash does not match its content.");
  }
  const manifest = evidence.manifest;
  const sources = manifest.inspected_sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("Version 4 research evidence requires inspected sources.");
  }
  const sourceIds = new Set<string>();
  for (const [index, value] of sources.entries()) {
    if (!isRecord(value)) {
      throw new Error("Version 4 inspected source " + (index + 1) + " is incomplete.");
    }
    const source = value;
    const sourceId = asText(source.id);
    const url = asText(source.url);
    const proof = isRecord(source.inspection_proof)
      ? source.inspection_proof
      : isRecord(source.capture_receipt)
        ? source.capture_receipt
        : undefined;
    if (
      !sourceId ||
      sourceIds.has(sourceId) ||
      !url ||
      !asText(source.title) ||
      source.inspected !== true ||
      !asText(source.locator) ||
      !asText(source.evidence_type) ||
      !asText(source.limitations)
    ) {
      throw new Error("Version 4 inspected source " + (index + 1) + " is incomplete.");
    }
    const proofLocator = asText(proof?.locator) || asText(proof?.content_locator) || asText(source.locator);
    if (
      !proof ||
      proof.url !== url ||
      !INSPECTION_TOOLS.has(asText(proof.tool)) ||
      !["captured", "extracted", "verified"].includes(asText(proof.status)) ||
      !SHA256_PATTERN.test(asText(proof.content_sha256)) ||
      !proofLocator
    ) {
      throw new Error(
        "Version 4 inspected source " + (index + 1) + " lacks capture proof.",
      );
    }
    if (/search_result|snippet/i.test(asText(source.inspection_status))) {
      throw new Error("Version 4 research evidence cannot use search snippets as inspection.");
    }
    sourceIds.add(sourceId);
  }

  const ledger = manifest.evidence_ledger;
  if (!Array.isArray(ledger) || ledger.length === 0) {
    throw new Error("Version 4 research evidence requires an evidence ledger.");
  }
  for (const [index, value] of ledger.entries()) {
    if (!isRecord(value)) {
      throw new Error(
        "Version 4 evidence ledger entry " + (index + 1) + " is unsupported.",
      );
    }
    const claim = value;
    const sourceRefs = claim.source_ids;
    if (
      !asText(claim.claim_id) ||
      !asText(claim.claim) ||
      !asText(claim.locator) ||
      !asText(claim.classification) ||
      !asText(claim.support) ||
      !asText(claim.limitations) ||
      !Array.isArray(sourceRefs) ||
      sourceRefs.length === 0 ||
      sourceRefs.some((sourceId) => !sourceIds.has(asText(sourceId))) ||
      /^(?:unsupported|unsupported_claim|unresolved|unverified)$/i.test(
        asText(claim.classification),
      )
    ) {
      throw new Error(
        "Version 4 evidence ledger entry " + (index + 1) + " is unsupported.",
      );
    }
  }

  const delta = manifest.research_delta;
  if (
    !isRecord(delta) ||
    !Array.isArray(delta.added) ||
    !Array.isArray(delta.corrected) ||
    !Array.isArray(delta.ruled_out) ||
    ![
      delta.materially_improves_decision,
      delta.materially_improves_explanation,
      delta.materially_improves_explanation_or_decision,
    ].some((value) => value === true)
  ) {
    throw new Error("Version 4 research delta lacks a material improvement.");
  }
  if (
    hasMeaningfulValue(manifest.blockers) ||
    hasMeaningfulValue(manifest.unresolved_findings) ||
    hasMeaningfulValue(manifest.blocking_findings) ||
    (isRecord(manifest.research_gate) &&
      manifest.research_gate.gate_result !== "research_ready")
  ) {
    throw new Error("Version 4 research evidence contains unresolved blockers.");
  }
  return evidence;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  if (typeof value === "string") return Boolean(value.trim());
  return Boolean(value);
}

function validateV4ImageContract(
  article: string,
  image: CommonsImageEvidence | undefined,
): CommonsImageEvidence {
  if (
    !image ||
    image.provider !== "wikimedia_commons" ||
    !image.imageUrl ||
    !image.sourceUrl ||
    !image.alt ||
    !image.author ||
    !image.license ||
    !image.licenseUrl ||
    !image.imageUrl.startsWith("https://upload.wikimedia.org/") ||
    !image.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:") ||
    (!image.licenseUrl.startsWith("https://creativecommons.org/") &&
      !image.licenseUrl.startsWith("https://www.creativecommons.org/"))
  ) {
    throw new Error("Version 4 licensed Commons image evidence is missing.");
  }
  const renderedArticle = articleOutsideFences(article);
  if (
    !renderedArticle.includes("![" + image.alt + "](" + image.imageUrl + ")") ||
    !renderedArticle.includes(image.sourceUrl) ||
    !renderedArticle.includes(image.licenseUrl) ||
    !renderedArticle.includes(image.author) ||
    !renderedArticle.includes(image.license)
  ) {
    throw new Error("Version 4 article is missing the verified image attribution.");
  }
  return image;
}

function articleOutsideFences(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let fence: { char: string; length: number } | undefined;
  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (!fence) kept.push(line);
  }
  return kept.join("\n");
}

function inspectMarkdownStructure(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let fence: { char: string; length: number } | undefined;
  let hasTable = false;
  const h1s: Array<{ title: string; lineIndex: number }> = [];
  const h3s: Array<{ title: string; lineIndex: number }> = [];
  let firstContentIndex = -1;
  for (const [lineIndex, line] of lines.entries()) {
    const fenceMatch = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (fence) continue;
    if (firstContentIndex === -1 && line.trim()) firstContentIndex = lineIndex;
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h1) h1s.push({ title: h1[1].trim(), lineIndex });
    if (h3) h3s.push({ title: h3[1].trim(), lineIndex });
    if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) {
      hasTable = true;
    }
  }
  return {
    lines,
    h1s,
    h3s,
    firstContentIndex,
    hasTable,
    unclosedFence: Boolean(fence),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

function visibleText(article: string): string {
  return article.replace(INLINE_LINK_PATTERN, "$1").replace(/https?:\/\/\S+/g, "");
}
