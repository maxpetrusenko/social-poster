type HonestReviewsProps = {
  accent?: string;
};

export function HonestReviews({ accent = "var(--accent-tech)" }: HonestReviewsProps) {
  return (
    <section className="mt-16 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8">
      <p className="section-eyebrow mb-3" style={{ color: accent }}>
        Reviews
      </p>
      <h2 className="text-2xl md:text-3xl font-bold leading-tight">
        Proof over promises — reviews publish with receipts.
      </h2>
      <p className="mt-4 text-[0.98rem] leading-7 text-[var(--muted)] max-w-2xl">
        We do not fabricate reviews or buy ratings. Every workflow this product ships
        is backed by observable output — published posts, approval receipts, and
        platform confirmation. Client reviews will be published here as they arrive,
        with consent, tied to the campaigns they came from.
      </p>
    </section>
  );
}
