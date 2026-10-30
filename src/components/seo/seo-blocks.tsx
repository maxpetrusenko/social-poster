import Link from "next/link";

export function SeoTldr({ children }: { children: string }) {
  return (
    <p
      data-seo="tldr"
      className="mt-5 max-w-2xl rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-base leading-7 text-[var(--ink-soft)]"
    >
      <strong className="font-semibold">In short: </strong>
      {children}
    </p>
  );
}

export type SeoLink = { href: string; label: string };

export function SeoRelated({ links }: { links: SeoLink[] }) {
  const items = links.slice(0, 5);
  if (items.length < 3) return null;
  return (
    <nav
      aria-label="Related pages"
      data-seo="related"
      className="mt-12 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6"
    >
      <h2 className="text-lg font-semibold font-[family-name:var(--font-sans)]">Related</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[var(--accent-tech)] hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
