export type DemoColumn = "review" | "scheduled" | "published" | "rejected";

export type WorkToPostDemoCard = {
  id: string;
  title: string;
  summary: string;
  column: DemoColumn;
  stage: "Captured" | "Needs proof" | "Angle review" | "Draft review" | "Approved" | "Rejected";
  risk: "low" | "medium" | "blocked";
  freshness: string;
  source: string;
  proof: string;
  privacy: "public_safe" | "needs_review";
  revision: number;
  approved: boolean;
  dispatchLabel?: "simulated_scheduled" | "simulated_published";
};

export const workToPostDemoCards: WorkToPostDemoCard[] = [
  {
    id: "artifact-proof",
    title: "Artifact proof changed the release conversation",
    summary: "A visible local proof loop made a shipping claim inspectable before it reached a post queue.",
    column: "review",
    stage: "Approved",
    risk: "low",
    freshness: "41m fresh",
    source: "Codex completion · local artifact",
    proof: "3 verified artifacts",
    privacy: "public_safe",
    revision: 3,
    approved: true,
  },
  {
    id: "benchmark-note",
    title: "Benchmark note needs a public source check",
    summary: "The claim is useful, but the evaluation context needs one more independently inspectable reference.",
    column: "review",
    stage: "Needs proof",
    risk: "medium",
    freshness: "2h fresh",
    source: "Claude completion · benchmark",
    proof: "1 of 2 proofs verified",
    privacy: "needs_review",
    revision: 1,
    approved: false,
  },
  {
    id: "scheduled-loop",
    title: "A decision log that preserves the learning loop",
    summary: "Scheduled locally after an independent draft review.",
    column: "scheduled",
    stage: "Approved",
    risk: "low",
    freshness: "Yesterday",
    source: "Codex completion · test run",
    proof: "2 verified artifacts",
    privacy: "public_safe",
    revision: 2,
    approved: true,
    dispatchLabel: "simulated_scheduled",
  },
  {
    id: "published-trace",
    title: "The trace makes a small launch legible",
    summary: "Published projection preserved for fixture-only learning analysis.",
    column: "published",
    stage: "Approved",
    risk: "low",
    freshness: "3d old",
    source: "Claude completion · deploy",
    proof: "4 verified artifacts",
    privacy: "public_safe",
    revision: 2,
    approved: true,
    dispatchLabel: "simulated_published",
  },
  {
    id: "rejected-private",
    title: "Client detail without a safe public boundary",
    summary: "Archived because source detail is private-client material.",
    column: "rejected",
    stage: "Rejected",
    risk: "blocked",
    freshness: "5d old",
    source: "Hermes completion · private client",
    proof: "Privacy block",
    privacy: "needs_review",
    revision: 1,
    approved: false,
  },
];

export const workToPostDemoAngles = [
  { title: "Proof is a publishing primitive", provenance: "Artifact manifest · verified 11:42", copy: "A post earns confidence when the reader can follow the claim back to an object." },
  { title: "The draft is only one checkpoint", provenance: "Independent review memo · revision 3", copy: "The useful unit is the trace from completed work through a human decision." },
  { title: "Local simulation reveals the real risk", provenance: "Dispatch fixture · no provider calls", copy: "A visible fake outcome lets the team test intent without turning a review click into a publish." },
] as const;

export const workToPostTrace = [
  ["10:18", "Captured", "Completion event sanitized; raw session excluded."],
  ["10:24", "Proof verified", "Commit, test, and artifact URI passed allowlist checks."],
  ["10:31", "Angles drafted", "Three distinct angles linked to source provenance."],
  ["10:42", "Review passed", "Independent reviewer accepted revision 3."],
  ["10:49", "Decision pending", "No provider, scheduler, or reply integration invoked."],
] as const;

export const workToPostMetrics = {
  captured: 26,
  proofReady: 19,
  angleReady: 15,
  approved: 11,
  simulatedPublished: 7,
  medianReviewHours: "2.4h",
  revisionsPerApproval: "1.8",
  learningProposals: 4,
  reliableProofRate: "86%",
};
