import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { count, desc, like } from "drizzle-orm";
import { Suspense } from "react";
import { AdminSearchInput } from "@/components/admin/admin-search";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ExportButton() {
  return (
    <a
      href="/api/admin/waitlist/export"
      download
      className="rounded-lg border border-[#e5d9c8] bg-white px-4 py-2 text-sm font-semibold text-[#5f523f] transition hover:bg-[#faf4ea]"
    >
      Export CSV
    </a>
  );
}

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";

  const searchCondition = q
    ? like(waitlistSignups.email, `%${q}%`)
    : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(waitlistSignups)
      .where(searchCondition)
      .orderBy(desc(waitlistSignups.createdAt))
      .limit(200),
    db
      .select({ count: count() })
      .from(waitlistSignups)
      .where(searchCondition),
  ]);

  const sourceColors: Record<string, string> = {
    landing: "#0f7ea9",
    blog: "#22c55e",
    social: "#a855f7",
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold text-[#171717]">
              Signup History
            </h1>
            <span className="rounded-full bg-[#171717] px-3 py-0.5 text-xs font-bold text-white">
              {total.count.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#8d7c64]">
            Legacy SMM Agent signups and access lists for other brands
          </p>
        </div>
        <ExportButton />
      </div>

      <div className="mb-4">
        <Suspense>
          <AdminSearchInput placeholder="Search by email…" />
        </Suspense>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e5d9c8] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5d9c8] bg-[#faf4ea]">
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Email
              </th>
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Source
              </th>
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Signed Up
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-[#8d7c64]"
                >
                  {q ? "No signups match your search." : "No signups yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#e5d9c8] last:border-0 hover:bg-[#faf4ea]/50"
                >
                  <td className="px-4 py-3 font-medium text-[#171717]">
                    {row.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{
                        color: sourceColors[row.source] ?? "#5f523f",
                        background: `${sourceColors[row.source] ?? "#8d7c64"}18`,
                      }}
                    >
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#8d7c64]">
                    {formatDate(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
