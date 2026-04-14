# BrightBean Menu Port Map

Last updated: 2026-04-13

## Purpose

This doc defines the menu-by-menu port target for bringing BrightBean's product shell into `social-poster` while preserving the app-specific automation surfaces that already exist here.

The rule is simple:

- keep BrightBean information architecture
- keep `social-poster` automation primitives
- copy flows and visual hierarchy
- rebuild framework-specific code in Next.js/Drizzle instead of pasting Django/HTMX server code

## Port Rule

Safe to lift:

- menu labels
- shell structure
- route intent
- page composition
- CTA order
- tab structure
- settings grouping
- client-portal flow

Must be rebuilt for this repo:

- Django views and forms
- HTMX endpoints
- Alpine state
- auth/session logic
- ORM queries
- permissions and tenancy wiring

Keep from current app:

- schedule engine
- runtime-vs-DB health checks
- schedule categories
- pipeline run inspection
- X reply engine log
- existing post detail truth view
- new connections drawer patterns where useful

## Target Shells

We will end with 4 shells:

1. workspace shell
2. org settings shell
3. workspace settings shell
4. client portal shell

## Workspace Shell

This is the day-to-day operator shell.

### `Publish`

Flow:
`workspace -> Publish -> Calendar or List -> Queue / Drafts / Approvals / Sent -> open post -> edit / schedule / approve / publish / inspect publish log`

Port target:

- keep BrightBean `Publish` as the primary content operations page
- merge current `Calendar`, `Posts`, and approval-oriented queue states into this shell
- keep current schedule and publish-status truth under the hood
- keep current post detail view as the audit/log side of the open-post experience

Current `social-poster` sources to merge:

- `/dashboard/calendar`
- `/dashboard/posts`
- `/dashboard/posts/[id]`
- `/dashboard/pipeline`

### `Create Idea`

Flow:
`workspace -> Create Idea -> idea landing -> full composer -> channels -> media -> per-channel tweaks -> Save Draft / Submit for Approval / Schedule / Publish Now`

Port target:

- BrightBean composer flow becomes the canonical post-creation surface
- current `Posts -> Create Post` flow becomes secondary and eventually folds into composer
- add queue targeting and approval-aware footer actions
- preserve current direct manual publishing capability where role allows

### `Social Inbox`

Flow:
`workspace -> Social Inbox -> All / My Queue / Unassigned -> thread feed -> open conversation -> assign / label / saved reply / reply / SLA handling`

Port target:

- BrightBean inbox becomes the primary conversation shell
- current `Replies` page survives as an engine/debug lane until full inbox reply transport replaces it

### `Replies`

Flow:
`workspace -> Replies -> X reply engine log -> inspect sent / failed -> open reply URL`

Port target:

- keep as a dedicated operator/debug page
- later connect it to inbox actions and reply drafts
- do not remove until unified inbox has parity

### `Notifications`

Flow:
`global bell or workspace entry -> notification drawer/history -> open item -> deep link to post / inbox / approval / failure`

Port target:

- BrightBean notification drawer/history model
- keep `social-poster` activity and pipeline failure truth as event sources
- expose in-app notification center plus full history page

### `Schedules`

Flow:
`workspace -> Schedules -> list cadence -> enable / disable -> inspect drift / next fire / success rate -> open schedule detail`

Port target:

- keep this page from `social-poster`
- this is not a BrightBean primary shell item, but it is core to your automation product
- treat it as the machine-control companion to `Publish`

### `Categories`

Flow:
`workspace -> Categories -> inspect recurring content buckets -> add slot -> jump into schedule creation`

Port target:

- keep this page from `social-poster`
- it remains the editorial automation planner next to `Schedules`

### `Channels` sidebar section

Flow:
`workspace sidebar -> connected channel row -> social accounts list -> inspect account / queue count / reconnect unhealthy accounts`

Port target:

- copy BrightBean dynamic channel section into the workspace sidebar
- use connected accounts from our `platforms` / future `social_accounts` model
- show unhealthy/reconnect states

### `Connect Channels`

Flow:
`workspace -> Connect -> pick platform -> auth flow / token input / instruction method -> account/page/profile pick -> save -> return to Social Accounts`

Port target:

- keep the new right-drawer connection method model already built here
- place it inside BrightBean-style workspace settings and channel flows
- support direct API, Bird/custom instructions, and relay/provider accounts where required

### Footer actions

Flow:
`org footer -> Manage Team / Settings / Log out`

Port target:

- copy BrightBean footer interaction model
- split `Settings` into org settings shell
- split `Manage Team` into dedicated org members page

## Org Settings Shell

This is the admin shell above any single workspace.

### `Profile`

Flow:
`settings -> profile -> avatar / name / account details`

Port target:

- add proper account page
- current read-only app settings page is not a replacement

### `Preferences`

Flow:
`settings -> preferences -> personal defaults / UX prefs / notification prefs`

Port target:

- add user-level preferences
- include notification delivery preferences and UX density defaults

### `General`

Flow:
`settings -> organization general -> name / logo / timezone / org defaults`

Port target:

- add org identity and org-wide defaults
- include provider posture where appropriate

### `Workspaces`

Flow:
`settings -> workspaces list -> create / archive / open workspace settings`

Port target:

- add real tenancy shell
- this is the control plane for client/brand containers

### `Team Members`

Flow:
`settings -> members -> invite / org role / workspace access`

Port target:

- add org membership and assignments

### `All Calendars`

Flow:
`settings -> cross-workspace calendar -> org-wide scheduled view`

Port target:

- BrightBean org-wide calendar shell
- powered by our schedule engine and workspace scoping

### `Media Library`

Flow:
`settings -> shared media -> folders / assets / reuse`

Port target:

- add org-shared asset surface
- separate from workspace-scoped media

## Workspace Settings Shell

This is the client/brand configuration shell.

### `General`

Flow:
`workspace settings -> brand / timezone / workspace defaults`

### `Social Accounts`

Flow:
`workspace settings -> connected account grid/list -> connect / reconnect / invite client to connect`

Port target:

- merge with the new connections UI already built

### `Media Library`

Flow:
`workspace settings -> workspace asset library`

### `Approvals`

Flow:
`workspace settings -> approval mode / reminders / rules`

Port target:

- use the approvals doc already added in this repo

### `Client Portal`

Flow:
`workspace settings -> invite clients / portal links / pending invites / client access`

## Client Portal Shell

Client-facing, magic-link friendly.

### `Home`

Flow:
`magic link -> portal dashboard -> summary -> jump to approvals / published / activity`

### `Approvals`

Flow:
`client portal -> approvals -> approve / request changes / reject / comment`

### `Published`

Flow:
`client portal -> published -> browse sent posts / links / reports`

### `Activity`

Flow:
`client portal -> activity -> client approval history`

## Target Navigation For This Repo

This is the merged target after the port.

### Workspace shell

- `Publish`
- `Create Idea`
- `Social Inbox`
- `Replies`
- `Schedules`
- `Categories`
- `Notifications`
- dynamic `Channels` section

Optional:

- `Overview`

Use only if you still want the operator cockpit landing page.

### Org footer

- `Manage Team`
- `Settings`
- `Log out`

### Org settings shell

- `Profile`
- `Preferences`
- `General`
- `Workspaces`
- `Team Members`
- `All Calendars`
- `Media Library`

### Workspace settings shell

- `General`
- `Social Accounts`
- `Media Library`
- `Approvals`
- `Client Portal`

### Client portal shell

- `Home`
- `Approvals`
- `Published`
- `Activity`

## Copy vs Rebuild

### Copy exactly in concept

- sidebar grouping
- shell hierarchy
- publish list tabs
- workspace settings grouping
- org settings grouping
- client portal grouping
- footer account popover actions
- channel status section

### Rebuild in Next

- page rendering
- form submission
- auth guards
- role checks
- query layer
- mutations
- notification polling
- inbox threading

### Reuse from current app

- scheduler truth model
- publish service
- pipeline run logs
- category planning
- reply event log
- connection methods and credential forms

## Recommended Build Order

1. tenancy shell and membership primitives
2. workspace shell navigation
3. `Publish` shell with calendar/list/tabs
4. `Create Idea` composer
5. workspace settings + social accounts
6. approvals
7. client portal
8. inbox
9. notifications
10. org settings and cross-workspace views

## Important Constraint

Do not paste BrightBean Django files directly into runtime code.

Use them as:

- reference implementation
- flow source
- UI composition source
- copy/layout source

Then rebuild inside this repo's:

- Next.js routes
- React components
- Drizzle schema
- server actions / API routes
