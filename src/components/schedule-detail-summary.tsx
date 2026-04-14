"use client";

import Image from "next/image";

type SchedulePreviewPlatform = {
  label: string;
  handle: string | null;
  content: string | null;
  mediaUrl: string | null;
  instagramContentType: "story" | "reel" | null;
};

type ScheduleDetailSummaryProps = {
  nextRunLabels: string[];
  preview:
    | {
        title: string;
        summary: string;
        variantIndex: number;
        platforms: SchedulePreviewPlatform[];
      }
    | null;
};

export function ScheduleDetailSummary({
  nextRunLabels,
  preview,
}: ScheduleDetailSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-900 mb-4">Next Scheduled Runs</p>
        {nextRunLabels.length === 0 ? (
          <p className="text-xs text-gray-500">No upcoming runs found.</p>
        ) : (
          <div className="space-y-3">
            {nextRunLabels.map((label, index) => (
              <div
                key={label}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {index === 0 ? "Next" : `After ${index}`}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Preview</p>
              <p className="mt-1 text-xs text-gray-500">
                Variant {preview.variantIndex + 1} for the next scheduled run
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">{preview.title}</p>
            <p className="mt-2 text-sm leading-6 text-gray-700">{preview.summary}</p>
          </div>

          <div className="mt-4 space-y-4">
            {preview.platforms.map((platform) => (
              <div
                key={`${platform.label}-${platform.handle ?? "none"}`}
                className="rounded-lg border border-gray-100 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{platform.label}</p>
                    {platform.handle ? (
                      <p className="mt-1 text-xs text-gray-500">{platform.handle}</p>
                    ) : null}
                  </div>
                  {platform.instagramContentType ? (
                    <span className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-700">
                      {platform.instagramContentType}
                    </span>
                  ) : null}
                </div>

                {platform.content ? (
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6 text-gray-800">
                    {platform.content}
                  </pre>
                ) : null}

                {platform.mediaUrl ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    <Image
                      src={platform.mediaUrl}
                      alt={`${platform.label} preview`}
                      width={640}
                      height={320}
                      unoptimized
                      className="h-40 w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
