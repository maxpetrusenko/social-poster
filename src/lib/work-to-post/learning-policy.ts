export type LearningScope = "candidate";

export function deriveCandidateLearningPolicy(reasonCodes: string[]): { scope: LearningScope; reasonCodes: string[] } {
  const normalized = [...new Set(reasonCodes.map((code) => code.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("At least one denial reason is required.");
  return { scope: "candidate", reasonCodes: normalized };
}
