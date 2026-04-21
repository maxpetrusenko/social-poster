import Link from "next/link";
import { Check, Clock, Search, TriangleAlert, XCircle } from "lucide-react";
import { getLatestActionLogRows, type ActionLogRow } from "@/lib/dashboard/action-log";
import { getTenantContext } from "@/lib/tenancy";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatusBadge({ row }: { row: ActionLogRow }) {
  const Icon =
    row.statusTone === "success"
      ? Check
      : row.statusTone === "danger"
        ? XCircle
        : row.statusTone === "warning"
          ? Clock
          : TriangleAlert;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        row.statusTone === "success" && "border-[#b7d8ad] bg-[#edf8e9] text-[#397227]",
        row.statusTone === "warning" && "border-[#e4d0a2] bg-[#fff6dc] text-[#7a5b12]",
        row.statusTone === "danger" && "border-[#e4afa2] bg-[#fff0ec] text-[#94351f]",
        row.statusTone === "neutral" && "border-[#d8cab5] bg-[#f7efe2] text-[#5f523f]"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {row.status}
    </span>
  );
}

function EndpointCell({ row }: { row: ActionLogRow }) {
  const target = row.endpoint;
  const endpoint = target.length > 42 ? `${target.slice(0, 39)}...` : target;

  return (
    <div className="space-y-1">
      {target.startsWith("/") ? (
        <Link href={target} className="font-mono text-xs text-[#4f4435] underline-offset-4 hover:underline">
          {endpoint}
        </Link>
      ) : target.startsWith("http") ? (
        <a href={target} className="font-mono text-xs text-[#4f4435] underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
          {endpoint}
        </a>
      ) : (
        <span className="font-mono text-xs text-[#6d5d49]">{endpoint}</span>
      )}
      {row.traceId ? (
        row.traceUrl ? (
          <a href={row.traceUrl} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-[#80613d] underline-offset-4 hover:underline">
            LangSmith trace {row.traceId.slice(0, 8)}
          </a>
        ) : (
          <span className="block text-xs font-semibold text-[#80613d]">
            LangSmith trace {row.traceId.slice(0, 8)}
          </span>
        )
      ) : null}
    </div>
  );
}

export default async function LogsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;

  const rows = await getLatestActionLogRows({
    workspaceId: tenant.currentWorkspace.id,
    organizationId: tenant.organization.id,
  });

  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-8 md:px-8 xl:px-10">
      <section className="rounded-[1.5rem] border border-[#d8cab5] bg-[#fbf7f0] p-5 shadow-[0_18px_40px_rgba(23,23,23,0.05)]">
        <div className="flex flex-col gap-4 border-b border-[#e2d4c0] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8e7556]">
              Workspace activity
            </p>
            <h1 className="mt-2 font-serif text-[2.7rem] leading-none tracking-[-0.05em] text-[#171717]">
              Logs
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f604c]">
              Latest user actions, publish events, schedules, replies, pipeline runs, and LangSmith traces.
            </p>
          </div>
          <label className="flex h-11 min-w-0 items-center gap-3 rounded-full border border-[#ded2c0] bg-white px-4 text-[#8a7861] lg:min-w-[22rem]">
            <Search className="h-4 w-4 shrink-0" />
            <input
              aria-label="Search logs"
              placeholder="Search logs"
              className="w-full bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#9b8c78]"
              type="search"
            />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d6a52]">
                <th className="border-b border-[#e2d4c0] px-4 py-3">Action</th>
                <th className="border-b border-[#e2d4c0] px-4 py-3">Status</th>
                <th className="border-b border-[#e2d4c0] px-4 py-3">Endpoint</th>
                <th className="border-b border-[#e2d4c0] px-4 py-3">Platform</th>
                <th className="border-b border-[#e2d4c0] px-4 py-3">Account</th>
                <th className="border-b border-[#e2d4c0] px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group border-b border-[#eee3d4] transition hover:bg-[#fffaf2]">
                  <td className="border-b border-[#eee3d4] px-4 py-4">
                    <p className="text-sm font-semibold text-[#171717]">{row.action}</p>
                  </td>
                  <td className="border-b border-[#eee3d4] px-4 py-4">
                    <StatusBadge row={row} />
                  </td>
                  <td className="border-b border-[#eee3d4] px-4 py-4">
                    <EndpointCell row={row} />
                  </td>
                  <td className="border-b border-[#eee3d4] px-4 py-4 text-sm text-[#4f4435]">
                    {row.platform}
                  </td>
                  <td className="border-b border-[#eee3d4] px-4 py-4 text-sm text-[#4f4435]">
                    {row.account}
                  </td>
                  <td className="border-b border-[#eee3d4] px-4 py-4">
                    <p className="text-sm font-semibold text-[#171717]">{row.createdLabel}</p>
                    <p className="mt-1 text-xs text-[#8a7861]">{formatDate(row.createdAt)}</p>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#7d6a52]">
                    No logs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
