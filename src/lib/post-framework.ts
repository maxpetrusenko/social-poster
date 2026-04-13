export type HooksBreakdown = {
  hook: number;
  outcome: number;
  originality: number;
  knowledge: number;
  spreadability: number;
};

export type HooksScore = HooksBreakdown & {
  total: number;
  verdict: "weak" | "ok" | "strong";
};

export const SHARABILITY_FRAMEWORK = {
  key: "HOOKS",
  dimensions: {
    hook: "Does the first line stop scroll?",
    outcome: "Is the value or payoff obvious?",
    originality: "Does it sound like a real take instead of brochure copy?",
    knowledge: "Does it show specifics, numbers, or earned context?",
    spreadability: "Is it easy to quote, repost, or reply to?",
  },
} as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

export function scoreHooks(text: string): HooksScore {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstLine = normalized.split(/(?<=[.!?])\s+/)[0] || "";
  const lower = normalized.toLowerCase();

  let hook = 4;
  if (firstLine.length >= 35 && firstLine.length <= 120) hook += 2;
  if (
    /most|almost nobody|few people|the real|not .* but|everyone|wild|pay attention|worth watching/i.test(
      firstLine
    )
  ) {
    hook += 2;
  }
  if (firstLine.includes("?")) hook += 1;

  let outcome = 4;
  if (/\$[\d,.]+[kmb]?/i.test(normalized)) outcome += 2;
  if (/job|role|payoff|path|result|outcome|advantage|faster|better/i.test(lower)) {
    outcome += 2;
  }

  let originality = 4;
  if (/i think|i've seen|the real|what matters|less .* more/i.test(lower)) originality += 2;
  if (/most .* are mostly|not for everyone|more aggressive|compressed reps|compression/i.test(lower)) {
    originality += 2;
  }
  if (/you pay nothing|housing|laundry|ccat|required/i.test(lower)) originality += 1;
  if (/great opportunity|excited to share|thrilled/i.test(lower)) originality -= 2;

  let knowledge = 4;
  if (/\$[\d,.]+[kmb]?/i.test(normalized)) knowledge += 2;
  if (/ccat|austin|housing|laundry|room cleaning|meals/i.test(lower)) knowledge += 2;

  let spreadability = 4;
  if (normalized.length <= 280) spreadability += 1;
  if (/not .* but|the real|what matters|most /i.test(lower)) spreadability += 2;
  if (/\n\n/.test(text)) spreadability += 1;

  const breakdown = {
    hook: clampScore(hook),
    outcome: clampScore(outcome),
    originality: clampScore(originality),
    knowledge: clampScore(knowledge),
    spreadability: clampScore(spreadability),
  };
  const total = Math.round(
    (breakdown.hook +
      breakdown.outcome +
      breakdown.originality +
      breakdown.knowledge +
      breakdown.spreadability) /
      5
  );

  return {
    ...breakdown,
    total,
    verdict: total >= 8 ? "strong" : total >= 6 ? "ok" : "weak",
  };
}
