# Super-Admin Dashboard — Implementation Plan

Last updated: 2026-04-20

## Context

ClawPoster needs a platform-wide admin panel at `/admin` so the founder can monitor users, waitlist, and usage across all orgs/workspaces. Currently, all admin-like features are scoped to org settings — there's no cross-org visibility. This is Plan B from the broader Notifications + Admin + Marketing plan.

## Access Control

- Email-gated via `ADMIN_EMAILS` env var (comma-separated)
- Layout-level auth: `requireAdmin()` calls `getSession()`, checks email, redirects to `/dashboard` if not admin
- No middleware.ts needed — layout gate covers all `/admin/*` routes

## Files to Create

### 1. `src/lib/admin-auth.ts` (~30 LOC)
- `isAdmin(email)` — checks against ADMIN_EMAILS env var
- `requireAdmin()` — server-only, gets session + checks isAdmin, redirects if not
- `requireAdminApi()` — for API routes, returns session or throws 401

### 2. `src/components/admin/admin-shell.tsx` (~120 LOC)
- Client component with fixed left sidebar (260px) + main area
- Nav: Overview, Users, Waitlist, Usage (lucide icons: LayoutDashboard, Users, ClipboardList, BarChart3)
- Active link detection via `usePathname()`
- "Back to Dashboard" link in footer
- Same warm palette as dashboard (bg-[#fffaf2] sidebar, border-[#dfd1bc])

### 3. `src/components/admin/admin-search.tsx` (~40 LOC)
- Client component — debounced search input that updates `?q=` URL param
- Reused on users and waitlist pages

### 4. `src/app/admin/layout.tsx` (~15 LOC)
- Server component: `await requireAdmin()` + wraps children in `AdminShell`

### 5. `src/app/admin/page.tsx` — Overview (~100 LOC)
- KPI cards via `Promise.all` Drizzle queries:
  - Total users, active users (7d), new signups (this week)
  - Total orgs, total workspaces
  - Posts published (all time), waitlist signups
- Reuse `MetricCard` from `src/components/dashboard/ui.tsx`
- Quick links to other admin pages

### 6. `src/app/admin/users/page.tsx` (~130 LOC)
- Server component with search (`?q=`) and sort (`?sort=lastSeen|created`)
- Query: users LEFT JOIN orgMemberships + organizations → email, name, authProvider, orgName, plan, lastSeen, createdAt
- Table with warm palette styling, pagination (50/page)

### 7. `src/app/admin/waitlist/page.tsx` (~100 LOC)
- Table: email, source, createdAt
- Total count badge, search
- "Export CSV" button → hits `/api/admin/waitlist/export`

### 8. `src/app/admin/usage/page.tsx` (~120 LOC)
- Posts by platform type (postTargets JOIN platforms, group by type)
- Posts by status (group posts by status)
- Top 10 workspaces by post count
- Pipeline stats: success rate, avg duration

### 9. `src/app/api/admin/waitlist/export/route.ts` (~50 LOC)
- GET handler: admin auth check, query all waitlist, return CSV

### 10. Dashboard admin link
- Pass `isAdmin` prop from dashboard layout to drawer shell
- Show "Admin" link in sidebar footer only for admin emails

## Implementation Order
1. admin-auth.ts → admin-search.tsx (parallel, no deps)
2. admin-shell.tsx → admin/layout.tsx
3. admin/page.tsx (overview)
4. admin/users/page.tsx
5. admin/waitlist/page.tsx + export API
6. admin/usage/page.tsx
7. Dashboard admin link + .env.example

## Verification
- Set `ADMIN_EMAILS=your@email.com` in .env
- Visit `/admin` → see overview with real DB data
- Visit `/admin` as non-admin → redirects to `/dashboard`
- Test CSV export, search/filter on users & waitlist
- Admin link visible only to admin in dashboard sidebar
- `npm run build` passes
