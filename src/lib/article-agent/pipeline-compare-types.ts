export const COMPARE_BEFORE_STAGES = ["draft", "voice", "frame"] as const;
export type CompareBeforeStage = (typeof COMPARE_BEFORE_STAGES)[number];
export type CompareStage = CompareBeforeStage | "final";

export type CompareStageMeasure = {
  path: string;
  sha256: string;
  n_words: number;
  contract: { composite: number; values: Record<string, number> };
  author: { values: Record<string, number>; distance: Record<string, number> };
};

export type CompareDiffOp = { op: "equal" | "insert" | "delete" | "replace"; a: string[]; b: string[] };

export type FingerprintCompare = {
  schema: number;
  package_sha: string;
  stages: Record<CompareStage, CompareStageMeasure>;
  bad_direction: Record<string, "high" | "low">;
  diffs: Record<CompareBeforeStage, { ops: CompareDiffOp[] }>;
  edits: {
    kept: Array<{ stage: string; sentence: string; reason: string; replacement?: string }>;
    rejected: Array<{ stage: string; at: string; reasons: string[] }>;
  };
};
