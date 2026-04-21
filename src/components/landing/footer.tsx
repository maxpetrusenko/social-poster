import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--line)] py-12 px-6">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[var(--muted)]">
        <div className="font-semibold text-[var(--ink)] font-[family-name:var(--font-serif)] text-lg">
          ClawPoster
        </div>
        <div className="flex gap-6">
          <Link href="/blog" className="hover:text-[var(--ink)] transition-colors">Blog</Link>
          <a href="#features" className="hover:text-[var(--ink)] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[var(--ink)] transition-colors">How It Works</a>
          <Link href="/privacy" className="hover:text-[var(--ink)] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--ink)] transition-colors">Terms of Service</Link>
        </div>
        <div>&copy; {new Date().getFullYear()} ClawPoster</div>
      </div>
    </footer>
  );
}
