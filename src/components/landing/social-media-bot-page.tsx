import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog/posts";

const FILTERED_CATEGORIES = new Set(["Agent", "Growth", "Features"]);

const BOT_KEYWORDS = [
  "AI social media bot",
  "social media agent",
  "autonomous posting",
  "brand voice automation",
];

export function SocialMediaBotPage() {
  const posts = BLOG_POSTS.filter((post) => FILTERED_CATEGORIES.has(post.category)).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  return (
    <main className="pt-28 pb-20 px-6">
      <div className="container">
        <section className="max-w-4xl">
          <p className="section-eyebrow text-[var(--accent-mindfold)] mb-4">AI social media bot</p>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
            A social media agent that writes, adapts, and publishes like a reliable teammate.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[var(--muted)] leading-relaxed max-w-2xl">
            Searchers looking for an AI social media bot usually want more than a caption toy. They want an agent that understands brand voice, handles distribution, and keeps social activity moving without constant supervision.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {BOT_KEYWORDS.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
              >
                {keyword}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-eyebrow text-[var(--accent-tech)] mb-3">Filtered reading</p>
              <h2 className="text-2xl md:text-3xl font-bold leading-tight">Agent, growth, and feature stories</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
              These posts map directly to the search intent behind social media bot and social media agent queries.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 hover:border-[var(--accent-tech)]/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-tech)]/10 text-[var(--accent-tech)]">
                    {post.category}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{post.publishedAt}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:text-[var(--accent-tech)] transition-colors font-[family-name:var(--font-sans)]">
                  {post.title}
                </h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
