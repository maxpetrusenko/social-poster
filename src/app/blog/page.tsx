import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { getAllPublicBlogPosts } from "@/lib/blog/dynamic";
import { LandingNav } from "@/components/landing/nav";
import { SeoRelated, SeoTldr } from "@/components/seo/seo-blocks";
import { isVariant } from "@/lib/seo-flags";
import { getSession } from "@/lib/auth";
import { getCanonicalUrl, getPublicSiteBrandName, normalizeHost } from "@/lib/site-domains";

const PATH = "/blog";

async function getBlogHost() {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  const host = await getBlogHost();
  const brandName = getPublicSiteBrandName(host);
  const canonicalUrl = getCanonicalUrl("/blog", host);
  const description = `Learn what ${brandName} can do for your social media presence.`;

  const variantTitle = isVariant("seo_h003_titles", PATH);
  const title = variantTitle
    ? `Social Media Automation Blog | ${brandName}`
    : `Blog — ${brandName}`;

  return {
    title: variantTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: brandName,
    },
  };
}

export default async function BlogPage() {
  const host = await getBlogHost();
  const brandName = getPublicSiteBrandName(host);
  const session = await getSession();
  const posts = await getAllPublicBlogPosts(host);
  const keywordFirst = isVariant("seo_h013_keyword_placement", PATH);
  const categories = Array.from(new Set(posts.map((post) => post.category))).slice(0, 4);
  const related = isVariant("seo_h022_internal_links", PATH)
    ? [
        ...categories.map((category) => ({
          href: `/blog/category/${category.toLowerCase().replace(/\s+/g, "-")}`,
          label: `${category} posts on ${brandName}`,
        })),
        { href: "https://clawposter.app/social-media-bot", label: "AI social media bot overview" },
      ]
    : [];

  return (
    <>
      <LandingNav
        isLoggedIn={!!session}
        brandName={brandName}
        accessMode={brandName === "SMM Agent" ? "login" : "waitlist"}
      />
      <main className="pt-28 pb-20 px-6">
        <div className="container">
          <p className="section-eyebrow text-[var(--accent-tech)] mb-3">Blog</p>
          <h1 className={`text-3xl md:text-4xl font-bold ${keywordFirst ? "mb-4" : "mb-12"}`}>
            {keywordFirst ? `Social media automation with ${brandName}` : `What ${brandName} Can Do`}
          </h1>
          {keywordFirst ? (
            <p className="mb-12 max-w-2xl text-base leading-7 text-[var(--muted)]">
              Social media automation only works when a person can still review what goes out. These posts cover how {brandName} handles that.
            </p>
          ) : null}
          {isVariant("seo_h014_tldr", PATH) ? (
            <div className="mb-12 -mt-6">
              <SeoTldr>
                {`This blog covers how ${brandName} drafts, schedules, and publishes social posts: source-backed writing, approval steps, platform formatting, and running an agent without constant supervision. Posts are grouped by category, and each one links back to the product feature it describes. Start with the newest, or filter by category.`}
              </SeoTldr>
            </div>
          ) : null}

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
          <SeoRelated links={related} />
        </div>
      </main>
    </>
  );
}
