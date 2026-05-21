import { describe, expect, it } from "vitest";

import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";

describe("fixed schedule content", () => {
  it("maps LinkedIn account variants to linkedin config", () => {
    const content = resolveFixedScheduleContent(
      {
        postMode: "fixed",
        title: "Referral",
        contentVariantsByPlatform: {
          linkedin: ["li1", "li2"],
        },
        mediaUrl: "https://example.com/shared-card.jpg",
        mediaUrlByPlatform: {
          linkedin: "https://example.com/linkedin-card.jpg",
        },
      },
      ["linkedin_personal"],
      1
    );

    expect(content).toBeTruthy();
    expect(content?.contentByPlatform.linkedin).toBe("li2");
    expect(content?.mediaUrlByPlatform.linkedin).toBe(
      "https://example.com/linkedin-card.jpg"
    );
    expect(content?.contentByPlatform.linkedin_personal).toBeUndefined();
  });
});
