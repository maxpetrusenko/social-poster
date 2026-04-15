"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecurrentCategorySummary } from "@/lib/dashboard/recurrent-categories";

type Props = {
  categories: RecurrentCategorySummary[];
  initialCategory?: string;
};

function buildEmptyContent(
  category: RecurrentCategorySummary | undefined
): Record<string, string> {
  return Object.fromEntries(
    (category?.quickAddPlatforms ?? []).map((platform) => [platform.type, ""])
  );
}

export function RecurrentCategoryQuickAdd({
  categories,
  initialCategory,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaultCategory =
    categories.find((category) => category.value === initialCategory) ??
    categories.find((category) => category.primaryScheduleId) ??
    categories[0];
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory?.value ?? "");
  const selected = useMemo(
    () => categories.find((category) => category.value === selectedCategory),
    [categories, selectedCategory]
  );
  const [contentByPlatform, setContentByPlatform] = useState<Record<string, string>>(
    buildEmptyContent(defaultCategory)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContentByPlatform(buildEmptyContent(selected));
    setError(null);
  }, [selected]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!selected?.primaryScheduleId) {
      setError("This category does not have a fixed recurring schedule yet.");
      return;
    }

    const hasAllContent = selected.quickAddPlatforms.every(
      (platform) => contentByPlatform[platform.type]?.trim()
    );

    if (!hasAllContent) {
      setError("Add copy for every target platform before saving.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/categories/variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: selected.primaryScheduleId,
          category: selected.value,
          contentByPlatform,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error || "Failed to add rotation item.");
        return;
      }

      router.push(`/dashboard/categories/manage/${selected.value}`);
      router.refresh();
    });
  }

  return (
    <aside className="rounded-[28px] border border-[#d7cab9] bg-[rgba(255,252,247,0.96)] p-5 shadow-[0_20px_45px_rgba(23,23,23,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
            Create
          </p>
          <h2 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-[#171717]">
            Add Rotation Item
          </h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#171717]">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="mt-2 w-full rounded-[14px] border border-[#d7cab9] bg-white px-4 py-3 text-sm text-[#171717] outline-none"
          >
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          {selected?.primaryScheduleName ? (
            <p className="mt-2 text-xs text-[#6f614d]">
              Writes into: {selected.primaryScheduleName}
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#9b4b39]">
              No fixed schedule yet. Create the schedule first, then add rotation items here.
            </p>
          )}
        </div>

        {selected?.quickAddPlatforms.map((platform) => (
          <div key={platform.type}>
            <label className="block text-sm font-medium text-[#171717]">
              {platform.label}
              {platform.handle ? (
                <span className="ml-2 text-xs font-normal text-[#8d7c64]">
                  {platform.handle}
                </span>
              ) : null}
            </label>
            <textarea
              value={contentByPlatform[platform.type] ?? ""}
              onChange={(event) =>
                setContentByPlatform((current) => ({
                  ...current,
                  [platform.type]: event.target.value,
                }))
              }
              rows={platform.type === "linkedin" ? 7 : 5}
              className="mt-2 w-full rounded-[16px] border border-[#d7cab9] bg-white px-4 py-3 text-sm leading-6 text-[#171717] outline-none"
              placeholder={`New ${platform.label} rotation copy`}
            />
          </div>
        ))}

        {error ? (
          <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-[18px] border border-[#e4dacb] bg-[#f8f2e8] px-4 py-4 text-sm leading-6 text-[#6f614d]">
          This appends one new variant to the category&apos;s existing rotation arrays. Use the
          full schedule editor if you also need media or cadence changes.
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending || !selected?.primaryScheduleId}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[#1777ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(23,119,255,0.24)] transition hover:bg-[#0f64dd] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Add To Rotation"}
          </button>
        </div>
      </form>
    </aside>
  );
}
