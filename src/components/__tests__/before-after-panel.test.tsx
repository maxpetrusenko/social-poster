import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { BeforeAfterPanel, isWorse, parseBeforeStage } from "@/components/articles/before-after-panel";
import type { CompareStageMeasure, FingerprintCompare } from "@/lib/article-agent/pipeline-compare-types";

function stage(file: string, composite: number, burstiness: number): CompareStageMeasure {
  return {
    path: file,
    sha256: file,
    n_words: 100,
    contract: { composite, values: { template_hits: 0, transition_excess: 1, repeated_ngram: 0.01 } },
    author: { values: { sentence_regularity: 0.3, paragraph_regularity: 0.4, burstiness, author_distance: 0.4 }, distance: {} },
  };
}

const data: FingerprintCompare = {
  schema: 1,
  package_sha: "x",
  stages: {
    draft: stage("write-pipeline/artifacts/06-draft.md", 4, 0.5),
    voice: stage("write-pipeline/artifacts/09-voice.md", 4, 0.5),
    frame: stage("write-pipeline/artifacts/13-images.reference-frame.md", 4, 0.5),
    final: stage("FINAL.md", 12, 0.6),
  },
  bad_direction: { composite: "high", burstiness: "low", author_distance: "high" },
  diffs: {
    draft: {
      ops: [
        { op: "equal", a: ["Kept sentence."], b: ["Kept sentence."] },
        { op: "delete", a: ["Removed sentence."], b: [] },
        { op: "insert", a: [], b: ["Added sentence."] },
      ],
    },
    voice: { ops: [] },
    frame: { ops: [] },
  },
  edits: {
    kept: [{ stage: "repair", sentence: "Cut me.", reason: "not in the ledger" }],
    rejected: [{ stage: "repair", at: "t0", reasons: ["claims gate failed"] }],
  },
};

describe("BeforeAfterPanel", () => {
  it("marks a worse AFTER value red and leaves an improved one alone", () => {
    render(createElement(BeforeAfterPanel, { slug: "s", data, before: "draft" }));
    const composite = screen.getByText("12.000");
    expect(composite.getAttribute("data-worse")).toBe("true");
    expect(composite.className).toContain("text-[#a3342a]");
    const burstiness = screen.getByText("0.600");
    expect(burstiness.getAttribute("data-worse")).toBe("false");
    expect(burstiness.className).not.toContain("a3342a");
  });

  it("renders the sentence diff with struck deletions and green insertions", () => {
    const { container } = render(createElement(BeforeAfterPanel, { slug: "s", data, before: "draft" }));
    expect(container.querySelector("del")?.textContent).toBe("Removed sentence.");
    expect(container.querySelector("del")?.className).toContain("line-through");
    expect(container.querySelector("ins")?.textContent).toBe("Added sentence.");
    expect(container.querySelector("ins")?.className).toContain("bg-[#dcefd5]");
  });

  it("labels the stage selector with file names and lists kept and rejected edits with reasons", () => {
    render(createElement(BeforeAfterPanel, { slug: "s", data, before: "voice" }));
    expect(screen.getByText("06-draft.md").getAttribute("href")).toBe("/dashboard/articles/s?before=draft");
    expect(screen.getByText("09-voice.md").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("not in the ledger")).toBeTruthy();
    expect(screen.getByText("claims gate failed")).toBeTruthy();
  });

  it("parses the before param and judges direction", () => {
    expect(parseBeforeStage("frame")).toBe("frame");
    expect(parseBeforeStage("final")).toBe("draft");
    expect(parseBeforeStage(undefined)).toBe("draft");
    expect(isWorse("high", 1)).toBe(true);
    expect(isWorse("low", -1)).toBe(true);
    expect(isWorse("low", 1)).toBe(false);
    expect(isWorse("high", 0)).toBe(false);
  });
});
