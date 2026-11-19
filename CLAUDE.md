# KS Precision Cleaning (field ops app)

The app KS Precision Cleaning staff, managers and the owner use for check-ins, jobs, floor-plan room
maps, SOPs, inventory, Wave invoicing and payroll export.

## Stack
- Next.js 15 (App Router, server components + server actions), React 19, TypeScript, Tailwind v4.
- Prisma 6 on Postgres. No client-side data fetching: pages read with Prisma on the server and
  mutate through server actions in `src/app/actions/` (`field.ts` for staff actions, `manage.ts`
  for manager/owner, `billing.ts` for invoices and Wave).
- Scripts: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`,
  `npm run db:migrate`, `npm run db:seed` (local demo data only), `npm run create-owner`.

## Database (Supabase project `zdmgoysqcudbzbkvxmsz`, "KSPC", us-east-2)
- Only Supabase's Postgres is used: no Supabase Auth, Storage or client SDK. The server connects with
  `DATABASE_URL` through Prisma as the table owner.
- **RLS is on for every table with no policies, on purpose.** Nothing in the browser may read the
  database directly, so `anon`/`authenticated` get nothing. Every new table gets
  `ENABLE ROW LEVEL SECURITY` in the same migration. The advisor's "RLS enabled, no policy" notice
  is expected.
- **Migrations live in `prisma/migrations/`** and are the source of truth. Change `schema.prisma`,
  create the migration locally (`prisma migrate dev --create-only`), check the SQL, then apply it.
  Migrations must be additive and idempotent where possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
  When applying through the Supabase MCP instead of `prisma migrate deploy`, also insert the row into
  `_prisma_migrations` (name + sha256 of `migration.sql`) so Prisma doesn't try to run it again.
- **No hard deletes of business records.** Users and locations are deactivated (`active = false`),
  invoices are voided, issues resolved. Hard deletes are only for things a manager is editing
  (rooms in the floor-plan editor, room-type tasks).
- `npm run db:seed` wipes every table and loads demo data. It refuses to run against a hosted
  database; never bypass that with `ALLOW_DEMO_SEED=1` on production.
- Timezone: `America/Chicago` (`APP_TZ` in `src/lib/format.ts`). Servers run in UTC, so "today",
  clock times and datetime inputs must go through `todayUTC()`, `fmtTime()`, `fromLocalInput()` etc.
  Never use `new Date().getDate()`/`getDay()` for business dates.

## Roles
- `STAFF` < `MANAGER` < `OWNER` (`src/lib/session.ts`). Pages call `requireUser("MANAGER")` etc.;
  server actions check again themselves. Never rely on hiding a link.
- Owner only: payroll, pay rates, changing roles, editing team members. Managers: scheduling,
  locations, floor plans, SOPs, inventory, time approval, clients, invoices; they can add staff.
- New sidebar pages go in `ITEMS` in `src/components/Nav.tsx` with the lowest role that may see them,
  and the page itself must call `requireUser` with that same role.

## Integrations
- **Wave Accounting** (`src/lib/wave.ts`): public GraphQL API. Invoices are created, approved and
  emailed through Wave (`customerCreate`, `invoiceCreate`, `invoiceApprove`, `invoiceSend`). Needs
  `WAVE_ACCESS_TOKEN`, `WAVE_BUSINESS_ID` and `WAVE_PRODUCT_ID` or `WAVE_INCOME_ACCOUNT_ID`. Errors
  are stored on the invoice (`waveError`) and shown, never thrown at the user.
- **Wave Payroll has no public API.** Payroll is a CSV export (`/payroll/export`) of regular and
  overtime hours per employee to enter in Wave. Don't claim it syncs.
- GPS check-ins use the browser Geolocation API (`src/components/GeoForm.tsx`). A check-in without
  GPS still saves and is flagged; distance is checked against the site's geofence (`src/lib/geo.ts`).

## Floor plans and room timers
- A `Layout` belongs to a location; `Room`s are polygons in **percent of the canvas** (`points`).
- A room's checklist = common tasks for its `type` (`RoomTypeTask`) + its own `customTasks`
  (`src/lib/rooms.ts`). Keep both sources when showing tasks.
- `RoomSession` is the start/stop timer. Only one open session per person per job: starting a room
  closes the previous one, and checking out closes all. Reports read closed sessions only
  (`src/lib/reports.ts`).
- Images are stored as data URLs (resized to 1600px in the editor). Move them to Supabase Storage
  before they get large.

## Workflow
- Changes reach `main` only through pull requests. Don't commit or push to `main` directly.
- **Branch names say what the branch does.** Never open a PR from an auto-assigned name like
  `claude/keen-babbage-lpfpty`. If the session started on one, create the typed branch below and push
  there instead (this is the owner's standing permission to do so):
  - `claude/feature/<name>`: a new feature.
  - `claude/fix/<name>`: a hotfix for something broken.
  - `claude/change/<name>`: updating or changing something that already exists.
  - `claude/remove/<name>`: removing a feature or code.
  - `claude/audit/<name>`: auditing or reviewing a PR branch or part of the app.

  `<name>` is short kebab-case (`claude/fix/geofence-accuracy`).
- **One branch, one PR, one job.** Once a branch's PR is merged or closed, don't push new work to it.
  New work gets a new branch.
- After opening a PR, watch it with `subscribe_pr_activity` without being asked.
- Every PR bumps `version` in `package.json` (shown in the sidebar as `vX.Y.Z`): the middle number
  for a new feature (1.2.0 → 1.3.0), the last for everything else (1.2.0 → 1.2.1). The first number
  changes only when the owner says so.
- Several PRs in one sitting are stacked, not parallel: start the next branch from the previous one
  and give it the next version up. Say the merge order in each PR description.
- Before a PR: `npm run typecheck`, `npm run lint`, `npm run build` all pass.

## Design rules
- **Dark mode: never put dark text on a dark background.** Dark mode works by mirroring the slate
  scale in `src/app/globals.css`, so `text-slate-*`, `bg-slate-*` and `border-slate-*` flip on their
  own. Cards and panels use `bg-surface` (or the `.card` class), **never `bg-white`**.
- Tinted chips and banners (`bg-amber-50 text-amber-800`, `bg-emerald-100 text-emerald-700`) stay
  light in both themes, so their text must be a fixed dark tint, never `text-slate-*` (which turns
  light in dark mode).
- Text on the floor plan (room labels) sits on a white label with explicit dark text.
- Buttons use the classes in `globals.css`: `btn-primary` (brand blue) for the one main action on a
  screen, `btn-secondary` for the rest, `btn-success` for start/check-in style actions,
  `btn-danger` for check-out, stop and destructive confirms. Don't hand-roll button colours.
- Status colours come from `Badge` in `src/components/ui.tsx`. The same status is the same colour
  everywhere; add new statuses there.
- Pages start with `PageHeader` (`src/components/ui.tsx`).
- Everything must work at phone width (390px): staff use this on their phones on site. The bottom
  nav shows the five staff essentials.

## Wording
- Sentence case for titles and buttons. One word per action where it reads naturally ("Save",
  "Add", "Approve"). Errors say what failed and what to do next.

## Showing changes
- Whenever a screen changes, show the owner screenshots of each affected page: light and dark mode,
  and phone width (390px) when layout changed; old-vs-new side by side once `main` exists.
- Take them with Playwright against a local build with the demo seed (`npm run db:seed`), and say
  they use sample data.
