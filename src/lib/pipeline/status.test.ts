import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePipelineRunStatus,
  resolvePublishResultsStatus,
  resolvePostStatusFromTargetResults,
} from "./status.ts";

test("resolvePipelineRunStatus fails skipped steps with errors", () => {
  assert.equal(
    resolvePipelineRunStatus({
      status: "completed",
      steps: [{ name: "platform:tiktok", status: "skipped", error: "Missing account ID" }],
    }),
    "failed"
  );
});

test("resolvePipelineRunStatus preserves clean completed runs", () => {
  assert.equal(
    resolvePipelineRunStatus({
      status: "completed",
      steps: [{ name: "publish", status: "completed" }],
    }),
    "completed"
  );
});

test("resolvePublishResultsStatus requires full success", () => {
  assert.equal(resolvePublishResultsStatus([{ success: true }, { success: true }]), "completed");
  assert.equal(resolvePublishResultsStatus([{ success: true }, { success: false }]), "failed");
  assert.equal(
    resolvePublishResultsStatus([
      { success: true },
      { success: false, classification: "disabled" },
    ]),
    "completed"
  );
});

test("resolvePostStatusFromTargetResults marks mixed delivery as partial failure", () => {
  assert.equal(
    resolvePostStatusFromTargetResults([{ success: true }, { success: false }]),
    "partial_failure"
  );
  assert.equal(
    resolvePostStatusFromTargetResults([
      { success: true },
      { success: false, classification: "disabled" },
    ]),
    "published"
  );
  assert.equal(
    resolvePostStatusFromTargetResults([{ success: false }, { success: false }]),
    "failed"
  );
  assert.equal(
    resolvePostStatusFromTargetResults([{ success: true }, { success: true }]),
    "published"
  );
});
