export type ArticleEvaluatorScore = {
  label: string;
  score: number;
  maxScore?: number;
};

export type ArticleEvolutionPhase = {
  name: string;
  status?: string;
  model?: string;
  rating?: number;
  notes?: string;
  duration?: number;
  cost?: number;
};

export type ArticleEvolutionSummary = {
  rating?: number;
  ratingMax?: number;
  ratingModel?: string;
  ratingProvider?: string;
  iterations?: number;
  evidenceCount?: number;
  wordCount?: number;
  totalCost?: number;
  totalTokens?: number;
  feedbackSummary?: string;
  biggestProblem?: string;
  improvementSummary?: string;
  pros?: string[];
  cons?: string[];
  sourceSummary?: string;
  evaluatorScores?: ArticleEvaluatorScore[];
  phaseLog?: ArticleEvolutionPhase[];
};

const SCORE_RE = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/;
const FRONTMATTER_FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/;

export function parseArticleOverviewMarkdown(text: string): ArticleEvolutionSummary {
  const fields = parseLooseYamlFrontmatter(text);
  const rating = parseScore(fields.rating);
  const evaluatorScores = ["claude", "gemini", "gpt", "openai", "anthropic"]
    .flatMap((label) => {
      const parsed = parseScore(fields[label]);
      return parsed && parsed.score > 0 ? [{ label, score: parsed.score, maxScore: parsed.maxScore }] : [];
    });

  const phaseLog = parseOverviewPhaseTable(text);
  const totalCost = firstNumber(
    numberFromUnknown(matchFirst(text, /\*\*TOTAL\*\*[^\n]*\$([0-9]+(?:\.[0-9]+)?)/i)),
    numberFromUnknown(fields.total_cost)
  );

  return compactSummary({
    rating: rating?.score,
    ratingMax: rating?.maxScore,
    ratingModel: stringFromUnknown(fields.rating_model ?? fields.ratingModel),
    ratingProvider: stringFromUnknown(fields.rating_provider ?? fields.ratingProvider),
    iterations: numberFromUnknown(fields.iterations),
    evidenceCount: numberFromUnknown(fields.evidence_count ?? fields.evidenceCount),
    wordCount: numberFromUnknown(fields.word_count ?? fields.wordCount),
    totalCost,
    evaluatorScores,
    phaseLog,
  });
}

export function parseRatingMarkdown(text: string): ArticleEvolutionSummary {
  const sections = text
    .split(/\n(?=##\s+V?\d+[^\n]*Rating)/i)
    .map((section) => section.trim())
    .filter(Boolean);
  const latest = sections.at(-1) ?? text.trim();
  const evaluatorScores: ArticleEvaluatorScore[] = [];
  const evaluatorRegex = /###\s+([^\n]+)[\s\S]*?\*\*Score:\*\*\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = evaluatorRegex.exec(latest))) {
    const parsed = parseScore(match[2]);
    if (parsed && parsed.score > 0) {
      evaluatorScores.push({ label: cleanInline(match[1]), score: parsed.score, maxScore: parsed.maxScore });
    }
  }

  const latestScore = evaluatorScores.at(-1);
  const pros = bulletList(extractBoldSection(latest, "Strengths"));
  const cons = bulletList(extractBoldSection(latest, "Weaknesses"));
  return compactSummary({
    rating: latestScore?.score,
    ratingMax: latestScore?.maxScore,
    ratingModel: latestScore?.label,
    feedbackSummary: extractBoldSection(latest, "Overall Feedback"),
    biggestProblem: extractBoldSection(latest, "Biggest Problem"),
    improvementSummary: firstBullet(extractBoldSection(latest, "Improvements")),
    pros,
    cons,
    evaluatorScores,
  });
}

export function summarizeWorkflowRecord(record: unknown): ArticleEvolutionSummary {
  if (!isRecord(record)) return {};
  const phases = Array.isArray(record.phases) ? record.phases : [];
  const phaseLog = phases
    .filter(isRecord)
    .map((phase) =>
      compactPhase({
        name: stringFromUnknown(phase.name),
        status: stringFromUnknown(phase.status),
        model: stringFromUnknown(phase.model),
        rating: numberFromUnknown(phase.rating),
        notes: stringFromUnknown(phase.notes),
        duration: numberFromUnknown(phase.duration),
        cost: numberFromUnknown(phase.cost),
      })
    )
    .filter((phase): phase is ArticleEvolutionPhase => phase !== null && Boolean(phase.name));
  const consensus = parseScore(stringFromUnknown(record.consensus));
  return compactSummary({
    rating: consensus?.score,
    ratingMax: consensus?.maxScore,
    ratingModel: phaseLog.findLast((phase) => phase.rating && phase.model)?.model,
    totalCost: numberFromUnknown(record.totalCost ?? record.total_cost),
    totalTokens: numberFromUnknown(record.totalTokens ?? record.total_tokens),
    phaseLog,
  });
}

export function summarizeSourceRecord(record: unknown): ArticleEvolutionSummary {
  const sourceLabels = collectSourceLabels(record);
  const evidenceCount = countEvidenceItems(record);
  const sourceSummary = sourceLabels.length
    ? `${sourceLabels.slice(0, 6).join(", ")}${sourceLabels.length > 6 ? ` +${sourceLabels.length - 6} more` : ""}`
    : "";
  return compactSummary({
    evidenceCount,
    sourceSummary,
  });
}

export function summarizeFrameworkEvalRecord(record: unknown): ArticleEvolutionSummary {
  if (!isRecord(record)) return {};
  const nestedRating = isRecord(record.rating) ? record.rating : null;
  if (nestedRating) {
    const score = numberFromUnknown(record.score ?? nestedRating.score);
    const maxScore = numberFromUnknown(record.maxScore) ?? 10;
    return compactSummary({
      rating: score,
      ratingMax: maxScore,
      ratingModel: stringFromUnknown(record.ratingModel ?? record.model),
      ratingProvider: stringFromUnknown(record.ratingProvider ?? record.provider),
      feedbackSummary: stringFromUnknown(nestedRating.overallFeedback),
      biggestProblem: stringFromUnknown(nestedRating.biggestProblem),
      improvementSummary: firstStringItem(nestedRating.improvements),
      pros: cleanStringItems(nestedRating.strengths),
      cons: cleanStringItems(nestedRating.weaknesses),
      evaluatorScores: score
        ? [{ label: stringFromUnknown(record.model) || "Article rating", score, maxScore }]
        : [],
    });
  }

  const checks = Array.isArray(record.checks) ? record.checks.filter(isRecord) : [];
  const score = numberFromUnknown(record.score);
  const maxScore = numberFromUnknown(record.maxScore);
  const iterationCount = numberFromUnknown(record.iterationCount);
  const status = cleanInline(stringFromUnknown(record.status).replace(/_/g, " "));
  const passCount = checks.filter((check) => /^pass$/i.test(stringFromUnknown(check.status))).length;
  const warnOrFailChecks = checks.filter((check) => {
    const checkStatus = stringFromUnknown(check.status).toLowerCase();
    return checkStatus === "warn" || checkStatus === "fail";
  });
  const firstProblem = warnOrFailChecks[0];
  const firstProblemNotes = firstProblem ? stringFromUnknown(firstProblem.notes) : "";
  const firstProblemId = firstProblem ? cleanInline(stringFromUnknown(firstProblem.id).replace(/_/g, " ")) : "";
  const feedbackSummary = checks.length
    ? [
        status ? sentenceCase(status) : "Framework eval complete",
        `${passCount}/${checks.length} checks passed`,
        warnOrFailChecks.length ? `${warnOrFailChecks.length} needs review` : "",
      ].filter(Boolean).join(". ")
    : status;

  return compactSummary({
    rating: score,
    ratingMax: maxScore,
    ratingModel: stringFromUnknown(record.ratingModel ?? record.model) || (score ? "Framework" : ""),
    ratingProvider: stringFromUnknown(record.ratingProvider ?? record.provider),
    iterations: iterationCount,
    feedbackSummary,
    biggestProblem: firstProblemNotes,
    improvementSummary: firstProblemNotes
      ? `${firstProblemId ? `${sentenceCase(firstProblemId)}: ` : ""}${firstProblemNotes}`
      : "",
    evaluatorScores: score
      ? [{ label: "Framework", score, maxScore }]
      : [],
    phaseLog: checks.map((check) =>
      compactPhase({
        name: cleanInline(stringFromUnknown(check.id).replace(/_/g, " ")) || "Framework check",
        status: stringFromUnknown(check.status),
        notes: stringFromUnknown(check.notes),
      })
    ).filter((phase): phase is ArticleEvolutionPhase => phase !== null),
  });
}

export function mergeArticleEvolutionSummaries(...summaries: ArticleEvolutionSummary[]): ArticleEvolutionSummary {
  const merged: ArticleEvolutionSummary = {};
  const evaluatorScores: ArticleEvaluatorScore[] = [];
  const phaseLog: ArticleEvolutionPhase[] = [];

  for (const summary of summaries) {
    for (const key of [
      "rating",
      "ratingMax",
      "ratingModel",
      "ratingProvider",
      "iterations",
      "evidenceCount",
      "wordCount",
      "totalCost",
      "totalTokens",
      "feedbackSummary",
      "biggestProblem",
      "improvementSummary",
      "pros",
      "cons",
      "sourceSummary",
    ] as const) {
      const value = summary[key];
      if (value !== undefined && value !== "") {
        (merged as Record<typeof key, typeof value>)[key] = value;
      }
    }
    if (summary.evaluatorScores?.length) evaluatorScores.push(...summary.evaluatorScores);
    if (summary.phaseLog?.length) phaseLog.push(...summary.phaseLog);
  }

  if (evaluatorScores.length) merged.evaluatorScores = dedupeEvaluatorScores(evaluatorScores);
  if (phaseLog.length) merged.phaseLog = phaseLog;
  return merged;
}

function parseLooseYamlFrontmatter(text: string) {
  const trimmed = text.trimStart();
  const frontmatter = trimmed.startsWith("---") ? trimmed.slice(3).split(/\n---\s*\n/)[0] : text;
  const fields: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(FRONTMATTER_FIELD_RE);
    if (!match) continue;
    fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

function parseOverviewPhaseTable(text: string): ArticleEvolutionPhase[] {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[^|]+\s*\|/.test(line) && !/^-+$/.test(line.replace(/[|\s]/g, "")))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cleanInline(cell)))
    .filter((cells) => cells.length >= 7 && !/^step$/i.test(cells[0]))
    .map(([name, status, time, cost, model, rating, notes]) =>
      compactPhase({
        name,
        status,
        model: model === "-" ? "" : model,
        rating: parseScore(rating)?.score,
        notes: notes === "-" ? "" : notes,
        cost: cost.startsWith("$") ? numberFromUnknown(cost.slice(1)) : undefined,
        duration: parseDurationSeconds(time),
      })
    )
    .filter((phase): phase is ArticleEvolutionPhase => phase !== null && Boolean(phase.name));
}

function extractBoldSection(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\*\\*${escaped}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z][^*]{1,80}:\\*\\*|\\n###\\s+|\\n---|$)`, "i");
  const match = text.match(regex);
  return match ? cleanBlock(match[1]) : "";
}

function firstBullet(value: string) {
  const bullet = value.split(/\r?\n/).map((line) => line.replace(/^[-*]\s+/, "").trim()).find(Boolean);
  return bullet ?? "";
}

function bulletList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanStringItems(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringFromUnknown).filter(Boolean).slice(0, 8)
    : [];
}

function firstStringItem(value: unknown) {
  return cleanStringItems(value)[0] ?? "";
}

function parseScore(value: unknown) {
  const text = stringFromUnknown(value);
  if (!text || /^n\/?a$/i.test(text)) return undefined;
  const match = text.match(SCORE_RE);
  if (!match) return undefined;
  const score = Number(match[1]);
  const maxScore = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore)) return undefined;
  return { score, maxScore };
}

function parseDurationSeconds(value: string) {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)(ms|s|min|m)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? "s").toLowerCase();
  if (unit === "ms") return amount / 1000;
  if (unit === "min" || unit === "m") return amount * 60;
  return amount;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function countEvidenceItems(value: unknown): number | undefined {
  const total = countEvidenceItemsDeep(value);
  return total || undefined;
}

function countEvidenceItemsDeep(value: unknown, depth = 0): number {
  if (depth > 4) return 0;
  if (Array.isArray(value)) return value.length;
  if (!isRecord(value)) return 0;
  const knownKeys = [
    "citations",
    "evidence",
    "findings",
    "results",
    "sources",
    "webResearch",
    "research",
    "directQuotes",
    "statistics",
    "powerExamples",
    "personalMoments",
    "examples",
    "references",
    "links",
  ] as const;
  return knownKeys.reduce((sum, key) => sum + countEvidenceItemsDeep(value[key], depth + 1), 0);
}

function collectSourceLabels(value: unknown) {
  const labels = new Set<string>();
  addSourceValues(labels, value);
  return Array.from(labels);
}

function addSourceValues(labels: Set<string>, value: unknown, depth = 0) {
  if (depth > 3) return;

  if (Array.isArray(value)) {
    for (const item of value) addSourceValues(labels, item, depth + 1);
    return;
  }

  if (typeof value === "string") {
    const label = cleanSourceLabel(value);
    if (label) labels.add(label);
    return;
  }

  if (!isRecord(value)) return;

  const directLabel = sourceLabelFromRecord(value);
  if (directLabel) labels.add(directLabel);

  for (const key of [
    "sources",
    "citations",
    "evidence",
    "findings",
    "results",
    "webResearch",
    "research",
    "directQuotes",
    "statistics",
    "powerExamples",
    "personalMoments",
    "examples",
    "references",
    "links",
    "children",
  ] as const) {
    addSourceValues(labels, value[key], depth + 1);
  }
}

function sourceLabelFromRecord(record: Record<string, unknown>) {
  for (const key of ["source", "title", "name", "url", "speaker", "author", "publication", "stat", "finding", "quote", "scenario", "details"] as const) {
    const label = cleanSourceLabel(stringFromUnknown(record[key]));
    if (label) return label;
  }

  const notionText = extractNotionBlockPlainText(record);
  return cleanSourceLabel(notionText);
}

function extractNotionBlockPlainText(record: Record<string, unknown>) {
  const type = stringFromUnknown(record.type);
  const typedBlock = type ? record[type] : undefined;
  if (!isRecord(typedBlock)) return "";
  const richText = typedBlock.rich_text;
  if (!Array.isArray(richText)) return "";
  return richText
    .map((part) => (isRecord(part) ? stringFromUnknown(part.plain_text) : ""))
    .filter(Boolean)
    .join(" ");
}

function cleanSourceLabel(value: string) {
  const cleaned = cleanInline(value.replace(/^https?:\/\//i, ""));
  if (!cleaned || cleaned === "-" || /^n\/?a$/i.test(cleaned)) return "";
  return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned;
}

function firstNumber(...values: Array<number | undefined>) {
  return values.find((value) => value !== undefined && Number.isFinite(value));
}

function matchFirst(text: string, regex: RegExp) {
  return text.match(regex)?.[1];
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanInline(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanBlock(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function sentenceCase(value: string) {
  const cleaned = cleanInline(value);
  return cleaned ? `${cleaned[0].toUpperCase()}${cleaned.slice(1)}` : "";
}

function compactSummary(summary: ArticleEvolutionSummary): ArticleEvolutionSummary {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => {
      if (value == null || value === "") return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  ) as ArticleEvolutionSummary;
}

function compactPhase(phase: ArticleEvolutionPhase): ArticleEvolutionPhase | null {
  if (!phase.name) return null;
  return Object.fromEntries(Object.entries(phase).filter(([, value]) => value != null && value !== "")) as ArticleEvolutionPhase;
}

function dedupeEvaluatorScores(scores: ArticleEvaluatorScore[]) {
  const seen = new Set<string>();
  const deduped: ArticleEvaluatorScore[] = [];
  for (const score of scores) {
    const key = `${score.label}:${score.score}:${score.maxScore ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(score);
  }
  return deduped;
}
