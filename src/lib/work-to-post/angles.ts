import {
  type BoardyInspiredMechanism,
  type ReferenceExample,
  validateReferenceExamples,
} from "./reference-examples";

export type AngleReference = ReferenceExample;

export type ContentAngle = {
  candidateId: string;
  revision: number;
  mechanism: BoardyInspiredMechanism;
  title: string;
  provenance: { referenceExampleId: string; sourceUrl: string };
};

const titles: Record<BoardyInspiredMechanism, (summary: string) => string> = {
  compressed_build_log: (summary) => `Build log: ${summary}`,
  counterintuitive_constraint: (summary) => `The constraint that made ${summary}`,
  concrete_before_claim: (summary) => `Start with the artifact behind ${summary}`,
};

export function createAnglesForCandidate(input: {
  candidateId: string;
  revision: number;
  summary: string;
  references: AngleReference[];
}): ContentAngle[] {
  const references = validateReferenceExamples(input.references);
  const summary = input.summary.trim();
  if (!summary) throw new Error("A candidate summary is required.");
  return references.map((reference) => ({
    candidateId: input.candidateId,
    revision: input.revision,
    mechanism: reference.mechanism,
    title: titles[reference.mechanism](summary),
    provenance: { referenceExampleId: reference.id, sourceUrl: reference.sourceUrl },
  }));
}
