import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { findPublicBlogPost } from "@/lib/blog/dynamic";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { getSession } from "@/lib/auth";
import { getProductCanonicalUrl } from "@/lib/site-domains";
import { BlogMarkdownRenderer } from "@/components/blog/markdown-renderer";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await findPublicBlogPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — ClawPoster`,
    description: post.excerpt,
    alternates: {
      canonical: getProductCanonicalUrl(`/blog/${post.slug}`),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await findPublicBlogPost(slug);
  if (!post) notFound();

  const session = await getSession();

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <main className="pt-28 pb-20 px-6">
        <article className="container max-w-2xl">
          <Link href="/blog" className="text-sm text-[var(--accent-tech)] hover:underline mb-6 inline-block">
            &larr; All Posts
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-tech)]/10 text-[var(--accent-tech)]">
              {post.category}
            </span>
            <span className="text-xs text-[var(--muted)]">{post.publishedAt}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-8">{post.title}</h1>

          {post.imageUrl ? (
            <figure className="mb-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
              <Image
                src={post.imageUrl}
                alt={post.imageAlt || ""}
                width={1200}
                height={675}
                className="h-auto w-full object-cover"
                unoptimized
              />
            </figure>
          ) : null}

          {post.isMarkdown ? (
            <BlogMarkdownRenderer markdown={post.content} />
          ) : (
            <div className="prose prose-lg max-w-none text-[var(--ink-soft)] leading-relaxed">
              {post.content.split("\n\n").map((paragraph, i) => (
                <p key={i} className="mb-5 text-[0.95rem] leading-[1.75]">{paragraph}</p>
              ))}
            </div>
          )}

          {/* Inline waitlist CTA */}
          <div className="mt-16 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8 text-center">
            <h3 className="text-xl font-semibold mb-2 font-[family-name:var(--font-sans)]">
              Ready to automate your social posting?
            </h3>
            <p className="text-sm text-[var(--muted)] mb-6">Join the waitlist for early access to ClawPoster.</p>
            <div className="max-w-sm mx-auto">
              <WaitlistForm source="blog" />
            </div>
          </div>
        </article>
      </main>
      <LandingFooter />
    </>
  );
}
