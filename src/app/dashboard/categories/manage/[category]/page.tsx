import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { getRecurrentCategoryDetail } from "@/lib/dashboard/recurrent-categories";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function RecurrentCategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categoryValue } = await params;
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const detail = await getRecurrentCategoryDetail(
    tenant.currentWorkspace.id,
    categoryValue
  );

  if (!detail) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fffdf7_0%,transparent_26%),linear-gradient(180deg,#f6efe4_0%,#efe5d7_100%)]">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-6 md:px-8 xl:px-10">
        <section className="rounded-[30px] border border-[#d8cab5] bg-[rgba(255,250,242,0.94)] p-6 shadow-[0_22px_55px_rgba(23,23,23,0.05)] md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href="/dashboard/categories/manage"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#6f614d] transition hover:text-[#171717]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back To Categories
              </Link>
              <div className="mt-4 flex items-center gap-3">
                <span
                  className="inline-flex h-4 w-4 rounded-full"
                  style={{ background: detail.category.accent }}
                />
                <h1 className="text-[2.3rem] font-semibold tracking-[-0.05em] text-[#171717]">
                  {detail.category.label}
                </h1>
              </div>
              <p className="mt-3 max-w-[760px] text-sm leading-7 text-[#6f614d]">
                {detail.category.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#ddd2c3] bg-[#f7f1e7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f614d]">
                {detail.entries.length} rotation items
              </span>
              <Link
                href={`/dashboard/categories/manage?category=${detail.category.value}`}
                className="inline-flex items-center gap-2 rounded-full bg-[#1777ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(23,119,255,0.24)] transition hover:bg-[#0f64dd]"
              >
                <Plus className="h-4 w-4" />
                Add Rotation Item
              </Link>
            </div>
          </div>

          {detail.schedules.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {detail.schedules.map((schedule) => (
                <Link
                  key={schedule.id}
                  href={`/dashboard/schedules/${schedule.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9cebf] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#5e5242]"
                >
                  {schedule.name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {detail.entries.length === 0 ? (
          <section className="mt-6 rounded-[28px] border border-[#d8cab5] bg-[rgba(255,250,242,0.94)] p-8 text-center shadow-[0_18px_45px_rgba(23,23,23,0.05)]">
            <p className="text-sm leading-7 text-[#6f614d]">
              No fixed rotation items exist in this category yet.
            </p>
            <div className="mt-5 flex justify-center">
              <Link
                href={`/dashboard/categories/manage?category=${detail.category.value}`}
                className="inline-flex items-center gap-2 rounded-full bg-[#1777ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(23,119,255,0.24)] transition hover:bg-[#0f64dd]"
              >
                <Plus className="h-4 w-4" />
                Add First Rotation Item
              </Link>
            </div>
          </section>
        ) : (
          <div className="mt-6 grid gap-5">
            {detail.entries.map((entry) => (
              <article
                key={entry.id}
                className="overflow-hidden rounded-[28px] border border-[#d8cab5] bg-[rgba(255,250,242,0.96)] shadow-[0_18px_45px_rgba(23,23,23,0.05)]"
              >
                <div className="border-b border-[#e6ddd0] bg-[#f8f2e8] px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d7c64]">
                        Rotation {entry.variantIndex + 1}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#171717]">
                        {entry.title}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/schedules/${entry.scheduleId}`}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d9cebf] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#5e5242]"
                    >
                      {entry.scheduleName}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-sm leading-7 text-[#6f614d]">{entry.summary}</p>

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    {entry.platforms.map((platform) => (
                      <section
                        key={`${entry.id}-${platform.type}`}
                        className="rounded-[22px] border border-[#e3d7c7] bg-white/86 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#171717]">
                              {platform.label}
                            </p>
                            {platform.handle ? (
                              <p className="mt-1 text-xs text-[#8d7c64]">
                                {platform.handle}
                              </p>
                            ) : null}
                          </div>
                          {platform.instagramContentType ? (
                            <span className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-700">
                              {platform.instagramContentType}
                            </span>
                          ) : null}
                        </div>

                        {platform.content ? (
                          <pre className="mt-4 whitespace-pre-wrap break-words rounded-[18px] bg-[#f8f2e8] p-4 text-xs leading-6 text-[#3f352a]">
                            {platform.content}
                          </pre>
                        ) : null}

                        {platform.mediaUrl ? (
                          <div className="mt-4 overflow-hidden rounded-[18px] border border-[#eadfce]">
                            <Image
                              src={platform.mediaUrl}
                              alt={`${platform.label} media preview`}
                              width={640}
                              height={360}
                              unoptimized
                              className="h-44 w-full object-cover"
                            />
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
