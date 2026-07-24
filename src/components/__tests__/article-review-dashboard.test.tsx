import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleReviewDashboard } from "@/components/articles/article-review-dashboard";

describe("ArticleReviewDashboard", () => {
  it("shows review links for every generated article and website links only when public", () => {
    const html = renderToStaticMarkup(
      <ArticleReviewDashboard
        generated={[
          {
            id: "published-1",
            title: "Published article",
            slug: "published-article",
            status: "published",
            validationStatus: "pass",
            validationScore: 102,
            reviewHref: "/dashboard/articles/published-1",
            publicUrl: "https://smmagent.app/blog/published-article",
          },
          {
            id: "draft-1",
            title: "Draft article",
            slug: "draft-article",
            status: "needs_review",
            validationStatus: "needs_review",
            validationScore: 88,
            reviewHref: "/dashboard/articles/draft-1",
            publicUrl: null,
          },
        ]}
        publicArticles={[]}
      />
    );

    expect(html).toContain('href="/dashboard/articles/published-1"');
    expect(html).toContain('href="/dashboard/articles/draft-1"');
    expect(html).toContain(
      'href="https://smmagent.app/blog/published-article"'
    );
    expect(html).not.toContain(
      'href="https://smmagent.app/blog/draft-article"'
    );
    expect(html.match(/Review draft/g)).toHaveLength(2);
    expect(html.match(/View on smmagent.app/g)).toHaveLength(1);
    expect(html.match(/opens in new tab/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the authoritative public article inventory as clickable live links", () => {
    const html = renderToStaticMarkup(
      <ArticleReviewDashboard
        generated={[]}
        publicArticles={[
          {
            title: "SMM Agent Should Draft Before It Publishes",
            slug: "smm-agent-draft-before-publish",
            excerpt: "Review before publishing.",
            category: "Agent",
            publishedAt: "2026-06-29",
            imageUrl: null,
            publicUrl:
              "https://smmagent.app/blog/smm-agent-draft-before-publish",
          },
        ]}
      />
    );

    expect(html).toContain("Published on SMM Agent");
    expect(html).toContain("SMM Agent Should Draft Before It Publishes");
    expect(html).toContain(
      'href="https://smmagent.app/blog/smm-agent-draft-before-publish"'
    );
    expect(html).toContain('href="/dashboard/articles/preview"');
    expect(html.match(/opens in new tab/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });
});
