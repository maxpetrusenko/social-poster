import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { getSession } from "@/lib/auth";
import { getCanonicalUrl } from "@/lib/site-domains";
import { isSiteFlagOn } from "@/lib/seo-flags";
import { BUYER_PAGES, getBuyerPage } from "@/lib/seo/buyer-pages";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return BUYER_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getBuyerPage(slug);
  if (!page || !isSiteFlagOn("seo_h006")) return {};
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: getCanonicalUrl(`/for/${page.slug}`) },
  };
}

export default async function BuyerPageRoute({ params }: Props) {
  const { slug } = await params;
  const page = getBuyerPage(slug);
  if (!page || !isSiteFlagOn("seo_h006")) notFound();
  const session = await getSession();
  const others = BUYER_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <main className="pt-28 pb-20 px-6">
        <div className="container max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold leading-[1.1]">{page.h1}</h1>
          <p className="mt-5 text-lg text-[var(--muted)] leading-relaxed">{page.intro}</p>
          <div className="mt-8 max-w-md" data-seo="buyer-cta">
            <p className="mb-3 text-sm font-semibold">{page.cta}</p>
            <WaitlistForm source={`for-${page.slug}`} />
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {page.points.map((pt) => (
              <section key={pt.heading} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
                <h2 className="text-lg font-semibold">{pt.heading}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{pt.body}</p>
              </section>
            ))}
          </div>
          <nav aria-label="Other use cases" className="mt-12 text-sm">
            <ul className="space-y-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/for/${o.slug}`} className="text-[var(--accent-tech)] hover:underline">
                    {o.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
