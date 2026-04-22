import Link from "next/link";

const networkLinks = [
  { label: "ClawPoster", href: "https://clawposter.app" },
  { label: "SMMClaw", href: "https://smmclaw.app" },
  { label: "SMMAgent", href: "https://smmagent.app" },
  { label: "App", href: "https://social.maxpetrusenko.com" },
  { label: "Max Tech", href: "https://www.maxpetrusenko.com/tech" },
];

export function LandingFooter({ brandName = "ClawPoster" }: { brandName?: string }) {
  return (
    <footer className="border-t border-[var(--line)] py-12 px-6">
      <div className="container flex flex-col items-center justify-between gap-6 text-sm text-[var(--muted)] md:flex-row">
        <div className="font-semibold text-[var(--ink)] font-[family-name:var(--font-serif)] text-lg">
          {brandName}
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/blog" className="hover:text-[var(--ink)] transition-colors">Blog</Link>
          <a href="#features" className="hover:text-[var(--ink)] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[var(--ink)] transition-colors">How It Works</a>
          <Link href="/privacy" className="hover:text-[var(--ink)] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--ink)] transition-colors">Terms of Service</Link>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {networkLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[var(--ink)] transition-colors">
              {link.label}
            </a>
          ))}
        </div>
        <div>&copy; {new Date().getFullYear()} {brandName}</div>
      </div>
    </footer>
  );
}
