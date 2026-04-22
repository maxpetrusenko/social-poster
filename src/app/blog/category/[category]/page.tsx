import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getAllPublicBlogPosts } from "@/lib/blog/dynamic";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { getSession } from "@/lib/auth";
import { getCanonicalUrl, getPublicSiteBrandName, normalizeHost } from "@/lib/site-domains";

type Props = {
  params: Promise<{ category: string }>;
};

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function decodeCategory(category: string) {
  return decodeURIComponent(category).trim();
}

async function getBlogHost() {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

export function generateStaticParams() {
  return Array.from(new Set(BLOG_POSTS.map((post) => post.category))).map((category) => ({
    category: category.toLowerCase().replace(/\s+/g, "-"),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const host = await getBlogHost();
  const brandName = getPublicSiteBrandName(host);
  const { category } = await params;
  const categoryName = titleCase(decodeCategory(category));
  const allPosts = await getAllPublicBlogPosts(host);
  const posts = allPosts.filter((post) => post.category.toLowerCase() === categoryName.toLowerCase());

  if (!posts.length) return {};
  const canonicalUrl = getCanonicalUrl(`/blog/category/${category}`, host);
  const description = `Browse ${categoryName.toLowerCase()} posts from the ${brandName} blog.`;

  return {
    title: `${categoryName} Posts — ${brandName}`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${categoryName} Posts — ${brandName}`,
      description,
      url: canonicalUrl,
      siteName: brandName,
    },
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const host = await getBlogHost();
  const brandName = getPublicSiteBrandName(host);
  const { category } = await params;
  const categoryName = titleCase(decodeCategory(category));
  const allPosts = await getAllPublicBlogPosts(host);
  const posts = allPosts.filter((post) => post.category.toLowerCase() === categoryName.toLowerCase()).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  if (!posts.length) notFound();

  const session = await getSession();

  return (
    <>
      <LandingNav isLoggedIn={!!session} brandName={brandName} />
      <main className="pt-28 pb-20 px-6">
        <div className="container">
          <article className="max-w-4xl">
            <Link href="/blog" className="text-sm text-[var(--accent-tech)] hover:underline mb-6 inline-block">
              &larr; All Posts
            </Link>

            <p className="section-eyebrow text-[var(--accent-tech)] mb-4">{categoryName}</p>
            <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
              {categoryName} posts from the {brandName} blog
            </h1>
            <p className="mt-6 text-lg text-[var(--muted)] leading-relaxed max-w-2xl">
              A focused list of posts in this category, arranged for readers looking to compare the same theme across the blog.
            </p>
          </article>

          <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </section>
        </div>
      </main>
      <LandingFooter brandName={brandName} />
    </>
  );
}
