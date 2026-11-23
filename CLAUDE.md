# KS Precision Cleaning (field ops app)

The app KS Precision Cleaning staff, managers and the owner use for check-ins, jobs, floor-plan room
maps, SOPs, inventory, Wave invoicing and payroll export.

## Stack
- Next.js 15 (App Router, server components + server actions), React 19, TypeScript, Tailwind v4.
- **Supabase only** (no Prisma, no other database layer):
  - **Auth:** Supabase Auth email + password. `@supabase/ssr` keeps the session in cookies;
    `src/middleware.ts` refreshes it and sends signed-out visitors to `/login`.
  - **Data:** `supabase-js` on the server only. `admin()` in `src/lib/supabase/server.ts` uses
    `SUPABASE_SECRET_KEY`; every page and action calls `requireUser()` (role check) first. Wrap
    results in `must()` so errors are never silent. Row types live in `src/lib/types.ts`.
  - **Storage:** private `media` bucket (floor plans, issue and room photos) via `src/lib/storage.ts`;
    show images with `signedUrls()`, never public URLs.
  - Pages read on the server and mutate through server actions in `src/app/actions/` (`field.ts`
    staff, `manage.ts` manager/owner, `billing.ts` invoices and Wave). No client-side data fetching.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sign-in only; RLS blocks
  it from data), `SUPABASE_SECRET_KEY` (server only, never `NEXT_PUBLIC_`), optional `WAVE_*`.
- Scripts: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`,
  `npm run create-owner`, `npm run demo:seed` (guarded, see below).

## Database (Supabase project `zdmgoysqcudbzbkvxmsz`, "KSPC", us-east-2)
- **RLS is on for every table with no policies, on purpose.** The browser never reads tables
  directly; `anon`/`authenticated` get nothing and the server uses the secret key. Every new table
  gets `ENABLE ROW LEVEL SECURITY` in the same migration. The advisor's "RLS enabled, no policy"
  notice is expected.
- **Migrations live in `supabase/migrations/`** and the Supabase GitHub integration applies new ones
  when a PR merges to `main`. Write them additive and idempotent (`IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`, guarded `DO` blocks). Test on a local Postgres first. If you apply one
  early through the Supabase MCP, rename the file to the version KSPC recorded (`list_migrations`)
  so the integration doesn't run it twice.
- Multi-step writes that must be all-or-nothing are Postgres functions called with `.rpc()`
  (`site_check_in`, `site_check_out`, `supply_pickup`, `adjust_stock`, `start_room`). Grant them to
  `service_role` only.
- `"User"` is the staff profile; its `id` is the Supabase Auth user id. Create logins with
  `auth.admin.createUser` (email confirmed), deactivate by banning the login and setting
  `active = false`. The first owner comes from `/setup` (works only while no users exist).
- **No hard deletes of business records.** Users and locations are deactivated, invoices voided,
  issues resolved. Hard deletes only for things a manager is editing (rooms, room-type tasks).
- `npm run demo:seed` (needs `ALLOW_DEMO_SEED=1`) loads @ks.test demo logins and data;
  `-- --clear` removes all business data. Both refuse once a real team member exists.
- Timezone: `America/Chicago` (`APP_TZ` in `src/lib/format.ts`). Servers run in UTC: filter DATE
  columns with `today(n)`, show times with `fmtTime()`/`fmtDateTime()`, parse inputs with
  `fromLocalInput()`. Never use `new Date().getDate()`/`getDay()` for business dates.

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

## Pricing
- Billing is **per visit**. Every job (`Assignment`) has a `ServiceType` (Standard clean, Deep clean,
  Maintenance clean, and any the owner adds in Settings). Each client has its own price per service
  type in `ClientRate`. There is no per-location price.
- Read prices through `rateBook()` in `src/lib/pricing.ts`. A missing rate means "not priced": show
  it as such and keep the visit out of invoices (never bill it at $0).
- Invoice lines snapshot the price when the invoice is created (`Invoice.lines`), so changing a rate
  later doesn't change old invoices.
- Service types are retired (`active = false`), not deleted, so old jobs keep their label.

## Floor plans and room timers
- A `Layout` belongs to a location; `Room`s are polygons in **percent of the canvas** (`points`).
- A room's checklist = common tasks for its `type` (`RoomTypeTask`) + its own `customTasks`
  (`src/lib/rooms.ts`). Keep both sources when showing tasks.
- Tasks are `{label, serviceTypeIds, minutes}`. Empty `serviceTypeIds` = every visit; otherwise only
  jobs of those services show it (`appliesTo()`). Minutes feed the room estimate.
- `Room.sortOrder` is the cleaning route. The job map numbers rooms in that order and suggests the
  next unfinished one.
- `RoomSession` is the start/stop timer (`start_room` function). One open session per person per
  job: starting a room closes the previous one, checking out closes all. Reports and "usual time"
  read closed sessions only (`src/lib/reports.ts`).
- Editor (`LayoutEditor.tsx`): snapping, undo/redo, zoom via `ZoomPan`. Plan images upload to
  Storage on save.

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
- **Fewer, bigger PRs.** The owner prefers speed: group related work (several features, fixes and
  changes asked for in a sitting) into one substantive PR, named for its main purpose. Don't split
  work into one PR per feature. Once a PR is merged or closed, its branch is done; new work starts a
  new branch from `main`.
- After opening a PR, watch it with `subscribe_pr_activity` without being asked.
- Every PR bumps `version` in `package.json` (shown in the sidebar as `vX.Y.Z`): the middle number
  for a new feature (1.2.0 → 1.3.0), the last for everything else (1.2.0 → 1.2.1). The first number
  changes only when the owner says so.
- If two PRs must be open at once, stack them (start the second from the first, next version up)
  and say the merge order in each description.
- Before a PR: `npm run typecheck`, `npm run lint`, `npm run build` all pass.

## Brand (KS Precision Cleaning LLC logo)
- Black and white. The logo is `src/components/Logo.tsx` (`full` or `mark`), drawn in
  `currentColor`; never use a raster copy in the app. App icons are in `public/` (PNG + maskable).
- `ink` / `paper` are the brand pair and swap in dark mode. Titles and big numbers use the serif
  (`font-serif`, Playfair Display, like "KS"); everything else Montserrat. Small labels use the
  `eyebrow` style (wide-tracked caps, like "RESIDENTIAL | COMMERCIAL"). Thin `rule` lines echo the
  logo's lines. Icons are Lucide, monochrome; no emoji in the UI.
- Colour is for meaning only: status badges, the floor-plan states, money tones.

## Phone first (staff and managers work almost only on phones)
- The app installs to the home screen (manifest, Apple web-app meta, service worker with an offline
  page). Keep `viewportFit: cover` and the `pt-safe`/`pb-safe` safe-area padding on fixed bars.
- Tap targets are at least 44px on phones: use `btn-*`, `input`, `chip`; checklist rows are
  `min-h-12`. Inputs are 16px on phones so iOS doesn't zoom. Compact sizes only from `md:` up.
- The bottom tab bar holds the four staff essentials + More (every other page for the role).
- Run the tap audit (every interactive element ≥ 40px, no sideways scroll at 390px) on screens you
  change, for staff and manager.

## Design rules
- **Dark mode: never put dark text on a dark background.** Dark mode works by mirroring the slate
  scale in `src/app/globals.css`, so `text-slate-*`, `bg-slate-*` and `border-slate-*` flip on their
  own. Cards and panels use `bg-surface` (or the `.card` class), **never `bg-white`**.
- Tinted chips and banners (`bg-amber-50 text-amber-800`, `bg-emerald-100 text-emerald-700`) stay
  light in both themes, so their text must be a fixed dark tint, never `text-slate-*` (which turns
  light in dark mode).
- Text on the floor plan (room labels) sits on a white label with explicit dark text.
- Buttons use the classes in `globals.css`: `btn-primary` (ink) for the one main action on a
  screen, `btn-secondary` for the rest, `btn-success` for start/check-in style actions,
  `btn-danger` for check-out, stop and destructive confirms. Don't hand-roll button colours.
- Status colours come from `Badge` in `src/components/ui.tsx`. The same status is the same colour
  everywhere; add new statuses there.
- Pages start with `PageHeader` (`src/components/ui.tsx`).

## Wording
- Sentence case for titles and buttons. One word per action where it reads naturally ("Save",
  "Add", "Approve"). Errors say what failed and what to do next.

## Showing changes
- Whenever a screen changes, show the owner screenshots of each affected page: light and dark mode,
  and phone width (390px) when layout changed; old-vs-new side by side once `main` exists.
- Take them with Playwright against a build pointed at a project loaded with `npm run demo:seed`,
  and say they use sample data.
