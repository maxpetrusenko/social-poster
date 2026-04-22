import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getAllPublicBlogPosts } from "@/lib/blog/dynamic";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { getSession } from "@/lib/auth";
import { getProductCanonicalUrl } from "@/lib/site-domains";

export const metadata: Metadata = {
  title: "Blog — ClawPoster",
  description: "Learn what ClawPoster can do for your social media presence.",
  alternates: {
    canonical: getProductCanonicalUrl("/blog"),
  },
};

export default async function BlogPage() {
  const session = await getSession();
  const posts = await getAllPublicBlogPosts();

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <main className="pt-28 pb-20 px-6">
        <div className="container">
          <p className="section-eyebrow text-[var(--accent-tech)] mb-3">Blog</p>
          <h1 className="text-3xl md:text-4xl font-bold mb-12">What ClawPoster Can Do</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] hover:border-[var(--accent-tech)]/30 transition-colors"
              >
                {post.imageUrl ? (
                  <div className="relative aspect-[16/9] bg-[#f4ebdd]">
                    <Image
                      src={post.imageUrl}
                      alt={post.imageAlt || ""}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 50vw, 100vw"
                      unoptimized
                    />
                  </div>
                ) : null}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-tech)]/10 text-[var(--accent-tech)]">
                      {post.category}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{post.publishedAt}</span>
                  </div>
                  <h2 className="text-lg font-semibold mb-2 group-hover:text-[var(--accent-tech)] transition-colors font-[family-name:var(--font-sans)]">
                    {post.title}
                  </h2>
                  <p className="text-sm text-[var(--muted)] leading-relaxed">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
