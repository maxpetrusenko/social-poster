import { afterEach, describe, expect, it, vi } from "vitest";
import { generateBlogAutomationPost, hasGeneratedSince, publishBlogAutomationPost } from "@/lib/blog/automation";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/blog/automation", () => ({
  generateBlogAutomationPost: vi.fn(),
  hasGeneratedSince: vi.fn(),
  publishBlogAutomationPost: vi.fn(),
}));

const articleWorkspace = {
  slug: "weekly-article",
  articleRelativePath: "articles/weekly-article/article-v1.md",
  openRef: "article-workspace://weekly-article/article-v1.md",
  folderOpenRef: "article-workspace://weekly-article",
};

describe("blog automation cadence", () => {
  afterEach(() => {
    delete process.env.BLOG_AUTOMATION_CADENCE;
    delete process.env.BLOG_AUTOMATION_DAILY_ENABLED;
    delete process.env.BLOG_AUTOMATION_PUBLISH_MODE;
    vi.clearAllMocks();
  });

  it("defaults to weekly article generation", async () => {
    const { getBlogAutomationCadence } = await import("@/lib/blog/daily");

    expect(getBlogAutomationCadence()).toBe("weekly");
  });

  it("supports an explicit daily override", async () => {
    process.env.BLOG_AUTOMATION_CADENCE = "daily";
    const { getBlogAutomationCadence } = await import("@/lib/blog/daily");

    expect(getBlogAutomationCadence()).toBe("daily");
  });

  it("keeps review mode as the default publish mode", async () => {
    const { getBlogAutomationPublishMode } = await import("@/lib/blog/daily");

    expect(getBlogAutomationPublishMode()).toBe("review");
  });

  it("supports explicit publish mode", async () => {
    process.env.BLOG_AUTOMATION_PUBLISH_MODE = "publish";
    const { getBlogAutomationPublishMode } = await import("@/lib/blog/daily");

    expect(getBlogAutomationPublishMode()).toBe("publish");
  });

  it("uses a seven day window for weekly cadence", async () => {
    const { getBlogAutomationWindowStart } = await import("@/lib/blog/daily");

    expect(getBlogAutomationWindowStart(new Date("2026-06-29T16:20:00.000Z"), "weekly").toISOString()).toBe(
      "2026-06-22T16:20:00.000Z"
    );
  });

  it("skips generation when a weekly draft already exists", async () => {
    process.env.BLOG_AUTOMATION_DAILY_ENABLED = "true";
    vi.mocked(hasGeneratedSince).mockResolvedValueOnce(true);
    const { runDailyBlogAutomation } = await import("@/lib/blog/daily");

    await expect(runDailyBlogAutomation(new Date("2026-06-29T16:20:00.000Z"))).resolves.toEqual({
      skipped: true,
      reason: "already_generated_this_week",
    });
    expect(hasGeneratedSince).toHaveBeenCalledWith(new Date("2026-06-22T16:20:00.000Z"));
    expect(generateBlogAutomationPost).not.toHaveBeenCalled();
  });

  it("generates without publishing in review mode", async () => {
    process.env.BLOG_AUTOMATION_DAILY_ENABLED = "true";
    vi.mocked(hasGeneratedSince).mockResolvedValueOnce(false);
    vi.mocked(generateBlogAutomationPost).mockResolvedValueOnce({
      postId: "post-1",
      slug: "weekly-draft",
      validation: { status: "pass", score: 92, checks: [] },
      provider: "medium-automation",
      articleWorkspace,
      heroImageError: null,
    });
    const { runDailyBlogAutomation } = await import("@/lib/blog/daily");

    await expect(runDailyBlogAutomation(new Date("2026-06-29T16:20:00.000Z"))).resolves.toMatchObject({
      skipped: false,
      publishSkipped: true,
      publishSkipReason: "review_mode",
      postId: "post-1",
    });
    expect(publishBlogAutomationPost).not.toHaveBeenCalled();
  });

  it("publishes validation-passing weekly articles in publish mode", async () => {
    process.env.BLOG_AUTOMATION_DAILY_ENABLED = "true";
    process.env.BLOG_AUTOMATION_PUBLISH_MODE = "publish";
    vi.mocked(hasGeneratedSince).mockResolvedValueOnce(false);
    vi.mocked(generateBlogAutomationPost).mockResolvedValueOnce({
      postId: "post-2",
      slug: "weekly-published",
      validation: { status: "pass", score: 94, checks: [] },
      provider: "medium-automation",
      articleWorkspace,
      heroImageError: null,
    });
    vi.mocked(publishBlogAutomationPost).mockResolvedValueOnce({
      slug: "weekly-published",
      validation: { status: "pass", score: 94, checks: [] },
    });
    const { runDailyBlogAutomation } = await import("@/lib/blog/daily");

    await expect(runDailyBlogAutomation(new Date("2026-06-29T16:20:00.000Z"))).resolves.toMatchObject({
      skipped: false,
      publishSkipped: false,
      postId: "post-2",
      publish: { slug: "weekly-published" },
    });
    expect(publishBlogAutomationPost).toHaveBeenCalledWith("post-2");
  });
});
