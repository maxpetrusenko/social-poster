import { describe, expect, it } from "vitest";

import { humanizeAction, statusTone, traceFromMetadata } from "../dashboard/action-log-format.ts";

describe("action log formatting", () => {
  it("formats post delete audit events as a deleted activity row", () => {
    expect(humanizeAction("post.delete")).toBe("Post deleted");
    expect(statusTone("deleted")).toBe("danger");
  });

  it("formats approval publish blocks as warning activity", () => {
    expect(humanizeAction("post.publish.blocked")).toBe("Post publish blocked");
    expect(statusTone("blocked")).toBe("warning");
    expect(humanizeAction("post.approval.requested")).toBe("Approval requested");
    expect(humanizeAction("post.approval.decided")).toBe("Approval decided");
    expect(statusTone("requested")).toBe("warning");
  });

  it("reads LangSmith trace metadata from audit and activity rows", () => {
    expect(
      traceFromMetadata({
        langsmithTrace: {
          runId: "trace-123",
          url: "https://smith.langchain.com/o/project/r/trace-123",
        },
      })
    ).toEqual({
      traceId: "trace-123",
      traceUrl: "https://smith.langchain.com/o/project/r/trace-123",
    });
  });
});
