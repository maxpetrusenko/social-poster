import type { CompletedWorkEventInput } from "./contracts";

export interface ProofResolver {
  verify(proof: CompletedWorkEventInput["proof"][number]): Promise<boolean>;
}

// V1 performs no network fetches. Production is fail-closed unless an operator
// has supplied an exact, independently captured official/local proof fixture.
export function createFixtureProofResolver(fixtures = proofFixturesFromEnv()): ProofResolver {
  return { async verify(proof) { return fixtures.has(proofIdentity(proof)); } };
}

export const failClosedProofResolver: ProofResolver = { async verify() { return false; } };

function proofFixturesFromEnv() {
  const configured = process.env.WORK_TO_POST_PROOF_FIXTURES;
  if (!configured) return new Set<string>();
  return new Set(configured.split(",").map((item) => item.trim()).filter(Boolean));
}

export function proofIdentity(proof: CompletedWorkEventInput["proof"][number]) {
  return `${proof.type}:${proof.uri}:${proof.hash ?? ""}`;
}
