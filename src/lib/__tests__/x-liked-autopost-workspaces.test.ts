import { describe, expect, it } from "vitest";

import {
  parseXLikedAutopostWorkspaceIds,
  selectXLikedAutopostWorkspaceIds,
  type XLikedAutopostWorkspacePlatform,
} from "../x-liked-autopost-workspace-selection";

const row = (
  workspaceId: string,
  platformType: string,
  provider: string,
  enabled = true
): XLikedAutopostWorkspacePlatform => ({
  workspaceId,
  platformType,
  provider,
  enabled,
});

describe("X liked autopost workspace selection", () => {
  it("parses configured workspace IDs from comma separated input", () => {
    expect(parseXLikedAutopostWorkspaceIds(" primary , secondary,primary ,, ")).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("uses configured workspace IDs when present", () => {
    expect(
      selectXLikedAutopostWorkspaceIds(
        [row("other", "twitter", "bird"), row("other", "linkedin_personal", "direct")],
        ["configured"]
      )
    ).toEqual(["configured"]);
  });

  it("selects only workspaces with enabled Bird X and LinkedIn Personal", () => {
    const rows = [
      row("x-only", "twitter", "bird"),
      row("zernio-x", "twitter", "zernio"),
      row("zernio-x", "linkedin_personal", "direct"),
      row("disabled-linkedin", "twitter", "bird"),
      row("disabled-linkedin", "linkedin_personal", "direct", false),
      row("ready", "twitter", "bird"),
      row("ready", "linkedin_personal", "direct"),
    ];

    expect(selectXLikedAutopostWorkspaceIds(rows, [])).toEqual(["ready"]);
  });
});
