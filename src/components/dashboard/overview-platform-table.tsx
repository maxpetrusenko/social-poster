"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export type OverviewPlatformRow = {
  id: string;
  name: string;
  handle: string | null;
  provider: string;
  enabled: boolean;
  scheduleCount: number;
  deliveryCount30d: number;
  failureCount30d: number;
  lastDeliveredAtLabel: string;
  shortLabel: string;
  accent: string;
};

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] ${
        enabled ? "bg-[#e8f3eb] text-[#2d6a43]" : "bg-[#f4e9e3] text-[#8f4f3c]"
      }`}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

export function OverviewPlatformTable({
  rows,
  totals,
}: {
  rows: OverviewPlatformRow[];
  totals: {
    enabledCount: number;
    accountCount: number;
    scheduleCount: number;
    deliveryCount30d: number;
    failureCount30d: number;
    lastActivityLabel: string;
  };
}) {
  const router = useRouter();
  const [localRows, setLocalRows] = useState(rows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const enabledCount = localRows.filter((row) => row.enabled).length;

  function handleToggle(rowId: string) {
    const row = localRows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }

    const nextEnabled = !row.enabled;

    startTransition(async () => {
      setPendingId(row.id);
      setLocalRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.id === row.id
            ? { ...currentRow, enabled: nextEnabled }
            : currentRow
        )
      );

      try {
        const response = await fetch(`/api/platforms/${row.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextEnabled }),
        });

        if (!response.ok) {
          throw new Error("Failed to update connection status.");
        }

        router.refresh();
      } catch (error) {
        alert(
          error instanceof Error
            ? error.message
            : "Failed to update connection status."
        );
        setLocalRows((currentRows) =>
          currentRows.map((currentRow) =>
            currentRow.id === row.id
              ? { ...currentRow, enabled: row.enabled }
              : currentRow
          )
        );
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-[1.8rem] border border-[#d9cab5] bg-white">
      <div className="min-w-[1260px]">
        <div className="grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center border-b border-[rgba(23,23,23,0.06)] bg-[#f7f1e7] py-4 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[#665843]">
          <div className="px-5">Platform</div>
          <div className="px-5">Account</div>
          <div className="px-5">Provider</div>
          <div className="px-5 text-right">Schedules</div>
          <div className="px-5 text-right">Deliveries</div>
          <div className="px-5 text-right">Failures</div>
          <div className="px-5 text-right">Last activity</div>
          <div className="px-5 text-right">Action</div>
        </div>

        <div className="divide-y divide-[rgba(23,23,23,0.05)]">
          {localRows.map((row, index) => (
            <div
              key={row.id}
              className={`grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center ${
                index % 2 === 1 ? "bg-[#fcf8f1]" : "bg-white"
              }`}
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[0.84rem] font-semibold uppercase tracking-[0.12em] text-white"
                  style={{ background: row.accent }}
                >
                  {row.shortLabel}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#171717]">{row.name}</p>
                  <div className="mt-2">
                    <StatusBadge enabled={row.enabled} />
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 text-[#5f523f]">{row.handle || "No handle"}</div>
              <div className="px-5 py-4 text-[#5f523f]">{row.provider}</div>
              <div className="px-5 py-4 text-right text-[#171717]">{row.scheduleCount}</div>
              <div className="px-5 py-4 text-right text-[#171717]">{row.deliveryCount30d}</div>
              <div className="px-5 py-4 text-right text-[#171717]">{row.failureCount30d}</div>
              <div className="px-5 py-4 text-right text-[#5f523f]">{row.lastDeliveredAtLabel}</div>
              <div className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => handleToggle(row.id)}
                  disabled={pendingId === row.id}
                  className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    row.enabled
                      ? "bg-[#171717] text-[#f7f2e8] hover:bg-[#2a2a2a]"
                      : "border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] hover:border-[#af987b]"
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  {pendingId === row.id ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Saving
                    </span>
                  ) : row.enabled ? (
                    "Disable"
                  ) : (
                    "Enable"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center border-t border-[rgba(23,23,23,0.06)] bg-[#f7f1e7] py-5 text-[1.05rem] font-semibold text-[#171717]">
          <div className="px-5">Totals</div>
          <div className="px-5 text-[#7b6b56]">{enabledCount} enabled</div>
          <div className="px-5 text-[#7b6b56]">{totals.accountCount} accounts</div>
          <div className="px-5 text-right">{totals.scheduleCount}</div>
          <div className="px-5 text-right">{totals.deliveryCount30d}</div>
          <div className="px-5 text-right">{totals.failureCount30d}</div>
          <div className="px-5 text-right">{totals.lastActivityLabel}</div>
          <div />
        </div>
      </div>
    </div>
  );
}
