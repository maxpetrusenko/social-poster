import { db } from "@/db";
import { orgMemberships, organizations, users } from "@/db/schema";
import { count, desc, eq, like, or } from "drizzle-orm";
import { Suspense } from "react";
import { AdminSearchInput } from "@/components/admin/admin-search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(d: Date | null) {
  if (!d) return "Never";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

async function UsersTable({
  q,
  sort,
  page,
}: {
  q: string;
  sort: string;
  page: number;
}) {
  const searchCondition = q
    ? or(
        like(users.email, `%${q}%`),
        like(users.fullName, `%${q}%`),
      )
    : undefined;

  const orderBy =
    sort === "created"
      ? desc(users.createdAt)
      : desc(users.lastSeenAt);

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        authProvider: users.authProvider,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
        orgName: organizations.name,
        plan: organizations.plan,
      })
      .from(users)
      .leftJoin(orgMemberships, eq(orgMemberships.userId, users.id))
      .leftJoin(organizations, eq(organizations.id, orgMemberships.organizationId))
      .where(searchCondition)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db
      .select({ count: count() })
      .from(users)
      .where(searchCondition),
  ]);

  const totalPages = Math.ceil(total.count / PAGE_SIZE);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[#e5d9c8] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5d9c8] bg-[#faf4ea]">
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Email
              </th>
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Name
              </th>
              <th className="hidden px-4 py-3 text-left font-semibold text-[#5f523f] md:table-cell">
                Auth
              </th>
              <th className="hidden px-4 py-3 text-left font-semibold text-[#5f523f] lg:table-cell">
                Org
              </th>
              <th className="hidden px-4 py-3 text-left font-semibold text-[#5f523f] lg:table-cell">
                Plan
              </th>
              <th className="px-4 py-3 text-left font-semibold text-[#5f523f]">
                Last Seen
              </th>
              <th className="hidden px-4 py-3 text-left font-semibold text-[#5f523f] md:table-cell">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-[#8d7c64]"
                >
                  {q ? "No users match your search." : "No users yet."}
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
                  <td className="px-4 py-3 text-[#5f523f]">
                    {row.fullName || "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-[#8d7c64] md:table-cell">
                    <span className="rounded-md bg-[#f5f0e6] px-2 py-0.5 text-xs font-medium">
                      {row.authProvider}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-[#5f523f] lg:table-cell">
                    {row.orgName || "—"}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {row.plan ? (
                      <span className="rounded-md bg-[#f5f0e6] px-2 py-0.5 text-xs font-semibold capitalize text-[#5f523f]">
                        {row.plan}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#8d7c64]">
                    {formatRelative(row.lastSeenAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-[#8d7c64] md:table-cell">
                    {formatDate(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#8d7c64]">
          <p>
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total.count)} of {total.count}
          </p>
          <div className="flex gap-2">
            {page > 0 && (
              <a
                href={`?q=${q}&sort=${sort}&page=${page - 1}`}
                className="rounded-lg border border-[#e5d9c8] bg-white px-3 py-1.5 text-sm font-semibold text-[#5f523f] hover:bg-[#faf4ea]"
              >
                Previous
              </a>
            )}
            {page < totalPages - 1 && (
              <a
                href={`?q=${q}&sort=${sort}&page=${page + 1}`}
                className="rounded-lg border border-[#e5d9c8] bg-white px-3 py-1.5 text-sm font-semibold text-[#5f523f] hover:bg-[#faf4ea]"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const sort = params.sort ?? "lastSeen";
  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[#171717]">
          Users
        </h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          All platform users across organizations
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <AdminSearchInput placeholder="Search by email or name…" />
        </Suspense>
        <div className="flex gap-1 rounded-lg border border-[#e5d9c8] bg-white p-0.5">
          <a
            href={`?q=${q}&sort=lastSeen`}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              sort === "lastSeen"
                ? "bg-[#171717] text-white"
                : "text-[#5f523f] hover:bg-[#faf4ea]"
            }`}
          >
            Last Seen
          </a>
          <a
            href={`?q=${q}&sort=created`}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              sort === "created"
                ? "bg-[#171717] text-white"
                : "text-[#5f523f] hover:bg-[#faf4ea]"
            }`}
          >
            Joined
          </a>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-[#e5d9c8] bg-white p-8 text-center text-sm text-[#8d7c64]">
            Loading users…
          </div>
        }
      >
        <UsersTable q={q} sort={sort} page={page} />
      </Suspense>
    </div>
  );
}
