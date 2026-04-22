"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
import { PlatformBrandIcon } from "./platform-brand-icon";

export type OverviewPlatformRow = {
  id: string;
  type: string;
  name: string;
  accountCount: number;
  enabledCount: number;
  disabledCount: number;
  providers: string;
  enabled: boolean;
  scheduleCount: number;
  postCount30d: number;
  commentCount30d: number;
  dmCount30d: number;
  impressionCount30d: number | null;
  deliveryCount30d: number;
  failureCount30d: number;
  lastDeliveredAtLabel: string;
  accent: string;
  accounts: OverviewPlatformAccountRow[];
};

export type OverviewPlatformAccountRow = {
  id: string;
  accountIds: string[];
  name: string;
  handle: string | null;
  provider: string;
  enabled: boolean;
  scheduleCount: number;
  postCount30d: number;
  commentCount30d: number;
  dmCount30d: number;
  impressionCount30d: number | null;
  deliveryCount30d: number;
  failureCount30d: number;
  lastDeliveredAtLabel: string;
};

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
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const enabledCount = localRows.reduce((sum, row) => sum + row.enabledCount, 0);

  function toggleExpanded(rowId: string) {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function toggleAccountExpanded(accountId: string) {
    setExpandedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  function handleToggle(accountId: string) {
    const account = localRows
      .flatMap((row) => row.accounts)
      .find((item) => item.id === accountId);
    if (!account) {
      return;
    }

    const nextEnabled = !account.enabled;

    startTransition(async () => {
      setPendingId(account.id);
      setLocalRows((currentRows) =>
        updateAccountEnabled(currentRows, account.id, nextEnabled)
      );

      try {
        await Promise.all(
          account.accountIds.map(async (sourceId) => {
            const response = await fetch(`/api/platforms/${sourceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: nextEnabled }),
            });

            if (!response.ok) {
              throw new Error("Failed to update connection status.");
            }
          })
        );

        router.refresh();
      } catch (error) {
        alert(
          error instanceof Error
            ? error.message
            : "Failed to update connection status."
        );
        setLocalRows((currentRows) =>
          updateAccountEnabled(currentRows, account.id, account.enabled)
        );
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="rounded-[1.8rem] border border-[#d9cab5] bg-white">
      <div className="overflow-x-auto">
      <div className="min-w-[1260px]">
        <div className="grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center border-b border-[rgba(23,23,23,0.06)] bg-[#f7f1e7] py-4 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[#665843]">
          <div className="px-5">Platform</div>
          <div className="px-5">Connected accounts</div>
          <div className="px-5">Providers</div>
          <div className="px-5 text-right">Schedules</div>
          <div className="px-5 text-right">Deliveries</div>
          <div className="px-5 text-right">Failures</div>
          <div className="px-5 text-right">Last activity</div>
          <div className="px-5 text-right">Action</div>
        </div>

        <div className="divide-y divide-[rgba(23,23,23,0.05)]">
          {localRows.map((row, index) => {
            const expanded = expandedRowIds.has(row.id);
            return (
              <Fragment key={row.id}>
                <div
                  className={`grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center ${
                    index % 2 === 1 ? "bg-[#fcf8f1]" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    <PlatformBadge row={row} />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.id)}
                      className="group flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={expanded}
                    >
                      <span className="truncate font-medium text-[#171717]">{row.name}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-[#8b7963] transition-transform group-hover:text-[#171717] ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                  <div className="px-5 py-4 text-[#5f523f]">
                    {row.accountCount} {row.accountCount === 1 ? "account" : "accounts"}
                    <span className="ml-2 text-[#9b8a72]">
                      {row.enabledCount} enabled
                    </span>
                  </div>
                  <div className="px-5 py-4 text-[#5f523f]">{row.providers}</div>
                  <div className="px-5 py-4 text-right text-[#171717]">{row.scheduleCount}</div>
                  <div className="px-5 py-4 text-right text-[#171717]">{row.deliveryCount30d}</div>
                  <div className="px-5 py-4 text-right text-[#171717]">{row.failureCount30d}</div>
                  <div className="px-5 py-4 text-right text-[#5f523f]">{row.lastDeliveredAtLabel}</div>
                  <div className="px-5 py-4 text-right text-[#9b8a72]">
                    expand
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-[#eadfce] bg-[#fffaf2]">
                    {row.accounts.map((account) => {
                      const accountExpanded = expandedAccountIds.has(account.id);

                      return (
                      <Fragment key={account.id}>
                        <div className="grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center border-b border-[#f0e6d7] text-sm">
                          <div className="min-w-0 px-5 py-3 pl-[5.75rem]">
                            <button
                              type="button"
                              onClick={() => toggleAccountExpanded(account.id)}
                              className="group flex min-w-0 items-center gap-2 text-left"
                              aria-expanded={accountExpanded}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-[#171717]">{account.name}</span>
                                <span className="block truncate text-xs text-[#7b6b56]">{account.handle || "No handle"}</span>
                              </span>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-[#8b7963] transition-transform group-hover:text-[#171717] ${
                                  accountExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </div>
                          <div className="px-5 py-3 text-[#7b6b56]">
                            {account.provider}
                          </div>
                          <div className="px-5 py-3 text-[#7b6b56]">{accountExpanded ? "stats" : ""}</div>
                          <div className="px-5 py-3 text-right text-[#171717]">{account.scheduleCount}</div>
                          <div className="px-5 py-3 text-right text-[#171717]">{account.deliveryCount30d}</div>
                          <div className="px-5 py-3 text-right text-[#171717]">{account.failureCount30d}</div>
                          <div className="px-5 py-3 text-right text-[#7b6b56]">{account.lastDeliveredAtLabel}</div>
                          <div className="px-5 py-3 text-right">
                            <AccountToggleButton
                              account={account}
                              pending={pendingId === account.id}
                              onToggle={() => handleToggle(account.id)}
                            />
                          </div>
                        </div>
                        {accountExpanded ? metricRows(account).map((metric) => (
                          <div
                            key={`${account.id}-${metric.label}`}
                            className="grid grid-cols-[1.45fr_1.1fr_0.9fr_0.75fr_0.8fr_0.8fr_0.95fr_0.9fr] items-center text-sm"
                          >
                            <div className="px-5 py-3 pl-[7.25rem] font-medium text-[#171717]">
                              {metric.label}
                            </div>
                            <div className="px-5 py-3 text-[#7b6b56]">{metric.period}</div>
                            <div className="px-5 py-3 text-[#7b6b56]">{metric.source}</div>
                            <div className="px-5 py-3 text-right text-[#7b6b56]">{metric.scheduleLabel}</div>
                            <div className="px-5 py-3 text-right font-semibold text-[#171717]">{metric.value}</div>
                            <div className="px-5 py-3 text-right text-[#7b6b56]">{metric.status}</div>
                            <div className="px-5 py-3 text-right text-[#7b6b56]">{metric.lastActivityLabel}</div>
                            <div />
                          </div>
                        )) : null}
                      </Fragment>
                      );
                    })}
                  </div>
                ) : null}
              </Fragment>
            );
          })}
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
    </div>
  );
}

function PlatformBadge({ row }: { row: OverviewPlatformRow }) {
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-full text-[0.84rem] font-semibold uppercase tracking-[0.12em] text-white"
      style={{ background: row.accent }}
    >
      <PlatformBrandIcon type={row.type} className="h-5 w-5" />
    </span>
  );
}

function AccountToggleButton({
  account,
  pending,
  onToggle,
}: {
  account: OverviewPlatformAccountRow;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        account.enabled
          ? "bg-[#171717] text-[#f7f2e8] hover:bg-[#2a2a2a]"
          : "border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] hover:border-[#af987b]"
      } disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Saving
        </span>
      ) : account.enabled ? (
        "Disable"
      ) : (
        "Enable"
      )}
    </button>
  );
}

function updateAccountEnabled(
  rows: OverviewPlatformRow[],
  accountId: string,
  enabled: boolean
) {
  return rows.map((row) => {
    let changed = false;
    const accounts = row.accounts.map((account) => {
      if (account.id !== accountId) {
        return account;
      }

      changed = true;
      return { ...account, enabled };
    });

    if (!changed) {
      return row;
    }

    const enabledCount = accounts.filter((account) => account.enabled).length;

    return {
      ...row,
      accounts,
      enabled: enabledCount > 0,
      enabledCount,
      disabledCount: accounts.length - enabledCount,
    };
  });
}

function metricRows(row: OverviewPlatformAccountRow) {
  return [
    {
      label: "Posts",
      period: "30d",
      source: "published targets",
      scheduleLabel: `${row.scheduleCount} schedules`,
      value: formatCompactNumber(row.postCount30d),
      status: `${row.failureCount30d} failures`,
      lastActivityLabel: row.lastDeliveredAtLabel,
    },
    {
      label: "Comments",
      period: "30d",
      source: "inbox",
      scheduleLabel: "",
      value: formatCompactNumber(row.commentCount30d),
      status: "incoming",
      lastActivityLabel: "",
    },
    {
      label: "DMs",
      period: "30d",
      source: "inbox",
      scheduleLabel: "",
      value: formatCompactNumber(row.dmCount30d),
      status: "incoming",
      lastActivityLabel: "",
    },
    {
      label: "Views",
      period: "30d",
      source: "analytics",
      scheduleLabel: "",
      value: row.impressionCount30d === null ? "N/A" : formatCompactNumber(row.impressionCount30d),
      status: row.impressionCount30d === null ? "not wired yet" : "impressions",
      lastActivityLabel: "",
    },
  ];
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}
