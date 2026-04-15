import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { RecurrentCategoryQuickAdd } from "@/components/dashboard/recurrent-category-quick-add";
import { getRecurrentCategorySummaries } from "@/lib/dashboard/recurrent-categories";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function ManageRecurrentCategoriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedCategory =
    typeof params.category === "string" ? params.category : undefined;
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const categories = await getRecurrentCategorySummaries(tenant.currentWorkspace.id);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fffdf7_0%,transparent_26%),linear-gradient(180deg,#f6efe4_0%,#efe5d7_100%)]">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-5 py-6 md:px-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:px-10">
        <section className="rounded-[30px] border border-[#d8cab5] bg-[rgba(255,250,242,0.94)] p-6 shadow-[0_22px_55px_rgba(23,23,23,0.05)] md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href="/dashboard/categories"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#6f614d] transition hover:text-[#171717]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back To Recurrent Posts
              </Link>
              <h1 className="mt-4 text-[2.3rem] font-semibold tracking-[-0.05em] text-[#171717]">
                Manage Categories
              </h1>
              <p className="mt-3 max-w-[720px] text-sm leading-7 text-[#6f614d]">
                Categories stay lightweight here. Each one points at one or more recurring schedules,
                and fixed schedules expose the rotation items behind them.
              </p>
            </div>

            <Link
              href="/dashboard/schedules/new"
              className="inline-flex items-center gap-2 rounded-full bg-[#1777ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(23,119,255,0.24)] transition hover:bg-[#0f64dd]"
            >
              <Plus className="h-4 w-4" />
              New Schedule
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {categories.map((category) => (
              <Link
                key={category.value}
                href={`/dashboard/categories/manage/${category.value}`}
                className="flex items-center justify-between gap-4 rounded-[20px] border border-[#e3d7c7] bg-white/88 px-5 py-4 transition hover:-translate-y-0.5 hover:border-[#c9b69d] hover:shadow-[0_16px_30px_rgba(23,23,23,0.06)]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ background: category.accent }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[#171717]">
                      {category.label}
                    </p>
                    <p className="mt-1 truncate text-sm text-[#6f614d]">
                      {category.rotationCount} rotation items • {category.liveScheduleCount} live schedules
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-[#ddd2c3] bg-[#f7f1e7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f614d]">
                    {category.cadenceHint}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[#8d7c64]" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <RecurrentCategoryQuickAdd
            categories={categories}
            initialCategory={selectedCategory}
          />
        </div>
      </div>
    </div>
  );
}
