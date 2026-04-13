import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAbandonedSteps } from "./recovery.ts";

test("finalizeAbandonedSteps marks running steps failed", () => {
  const steps = finalizeAbandonedSteps(
    [
      { name: "reply:discover", status: "completed", startedAt: "2026-04-08T03:00:00.000Z" },
      { name: "publish", status: "running", startedAt: "2026-04-08T03:00:05.000Z" },
    ],
    "Run interrupted by app restart before completion"
  );

  assert.equal(steps[0].status, "completed");
  assert.equal(steps[1].status, "failed");
  assert.equal(steps[1].error, "Run interrupted by app restart before completion");
  assert.ok(steps[1].completedAt);
  assert.ok(typeof steps[1].durationMs === "number");
});

test("finalizeAbandonedSteps handles empty input", () => {
  assert.deepEqual(finalizeAbandonedSteps([], "x"), []);
  assert.deepEqual(finalizeAbandonedSteps(undefined, "x"), []);
});
