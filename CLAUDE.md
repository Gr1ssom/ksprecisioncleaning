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
- Scripts: `npm run dev`, `npm run build`, `npm run lint` (warnings fail), `npm run typecheck`,
  `npm test` (Vitest, `tests/`), `npm run e2e` (Playwright smoke test against a preview, see
  `e2e/smoke.mjs`), `npm run create-owner`, `npm run demo:seed` (guarded, see below).
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests and build on every PR. Business
  rules (pay weeks, overtime, geofence, permissions, task filters, dates) get a unit test; keep pure
  logic in files without `server-only` (e.g. `src/lib/tasks.ts`) or test it through `computePayroll`-style
  pure functions.

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
  (`site_check_in`, `site_check_out`, `supply_pickup`, `adjust_stock`, `start_room`, `shift_clock`,
  `shift_break`). Grant them to `service_role` only.
- Sign-in extras: "Forgot password?" emails a link to `/auth/confirm` → `/reset`; `/account` lets
  anyone change their password and turn on 2-step sign-in (TOTP). Anyone with a 2-step factor must
  reach `aal2` (`currentUser()` redirects to `/login/verify`).
- `"User"` is the staff profile; its `id` is the Supabase Auth user id. Create logins with
  `auth.admin.createUser` (email confirmed), deactivate by banning the login and setting
  `active = false`. A password someone else set (new login, manager-typed or temporary) sets
  `mustChangePassword`; `currentUser()` then sends them to `/reset?first=1` until they choose their own. The first owner comes from `/setup` (works only while no users exist).
- **No hard deletes of business records.** Users and locations are deactivated, invoices voided,
  issues resolved. Hard deletes only for things a manager is editing (rooms, room-type tasks).
- `npm run demo:seed` (needs `ALLOW_DEMO_SEED=1`) loads @ks.test demo logins and data;
  `-- --clear` removes all business data. Both refuse once a real team member exists.
- Invoice numbers come from the `invoice_number_seq` sequence (column default). Never compute them.
- **Live updates:** every app table has the `app_change` statement trigger (`notify_app_change()`),
  which pings the private Realtime topic `app` with the table name only. `LiveRefresh` (in the app
  layout) hears it and calls `router.refresh()`, so pages stay current while data is still read on
  the server. New tables get the trigger in the same migration. The browser client
  (`src/lib/supabase/browser.ts`) is for that subscription only: never read data with it.
- **Audit log:** every change to hours, prices, roles/logins, invoices, stock, locations, SOPs or job
  status calls `audit()` (`src/lib/audit.ts`) with a one-line summary and `diff()` of the changed
  fields. Never put passwords, codes or keys in it. The owner reads it on the Activity page.
- Production server errors are written to `AppError` by `src/instrumentation.ts` and shown on
  Activity (and as a dashboard warning). Don't catch-and-hide errors that should land there.
- Timezone: `America/Chicago` (`APP_TZ` in `src/lib/format.ts`). Servers run in UTC: filter DATE
  columns with `today(n)`, show times with `fmtTime()`/`fmtDateTime()`, parse inputs with
  `fromLocalInput()`, local dates with `localDate()`, pay weeks with `payWeek()` (Mon–Sun, Chicago).
  Never use `new Date().getDate()`/`getDay()` for business dates.

## Time, pay and alerts (Phase 2)
- **Shift clock:** `Shift` is the working day (start/end), `Break` sits inside it. The day starts by
  itself at the first pickup or site check-in (`ensure_shift`), or with "Start my day". Job time
  (`TimeEntry`, one per job) sits inside shifts. All clock changes go through the RPCs
  (`shift_clock`, `shift_break`, `site_check_in/out`, `start_room`, `supply_pickup`), each taking
  `p_at` (when it happened on the phone).
- **Paid time** comes only from `paidSpans()` in `src/lib/worktime.ts` (pure, tested): whole shifts
  (plus job time outside a shift) when drive time is paid, otherwise job time only; unpaid breaks
  come off; overtime over 40 h per `payWeek`. Payroll, Hours, dashboards all use it. Owner rules
  live in the `Setting` table, read with `getRules()` (`src/lib/settings.ts`), edited in Settings.
- **One person per job** (no crews for now). Staff can't check in on an open shift; they ask for it
  (`ShiftClaim`) and a manager approves. Time off (`TimeOff`) and weekly `Availability` feed
  `clashes()`, shown to managers on the job page.
- **Offline:** field actions (check-in/out, ticks, room timers, shift clock, breaks) go through
  `fieldOp()` (`src/lib/offline.ts`) → `/api/field` → `runFieldOp()` (`src/lib/fieldOps.ts`). Each
  has an id (`FieldOp` table: applied once) and the phone's time (clamped to 7 days). New field
  actions must be added there, not as plain server actions. The service worker keeps field pages
  for offline use and is cleared on the sign-in page.
- **Notifications:** `notify(userIds, {kind, title, body, url, dedupe})` (`src/lib/notify.ts`) writes
  the in-app inbox (`/notifications`, the bell) and sends phone push (Web Push; keys made by the app
  and kept in `AppSecret`, server only). It never throws. Scheduled alerts (reminders 30 min before,
  "not checked in", 12-hour days) run from `/api/cron`, which `pg_cron` calls every 5 minutes with
  a key stored only in the database; it does nothing until the owner saves the app address in
  Settings (so preview databases stay quiet). Use a `dedupe` key for anything that can repeat.
- Mileage = straight-line miles between a person's check-ins per day (`mileageByDay`), shown on
  Payroll and in the CSV; say "straight-line", never claim it's driven distance.

## Quality and clients (Phase 3)
- **Inspections:** a manager scores each room of a job on its floor plan (`/jobs/[id]/inspect`):
  `Inspection` (one per job, keeps `cleanerId`/`locationId` as on the day) + `InspectionRoom`
  (PASS / TOUCH_UP / FAIL, note, photo). Scores and roll-ups come only from `src/lib/quality.ts`
  (pure, tested): pass 100, touch-up 60, fail 0; ratings 5★ = 100, 1★ = 0; Reports shows them by
  cleaner and location.
- **Re-cleans:** `createFollowUp()` (`src/lib/followUps.ts`) makes a job at the same location with
  `followUpOfId` / `inspectionId` / `issueId`, `noCharge = true` by default. `noCharge` visits are
  never invoiced and earn $0 in reports; every unbilled-visit query filters them out.
- **Client links without login:** `/r/<token>` (one visit report, `VisitReport.token`) and
  `/c/<token>` (a client's portal, `Client.portalToken`, the owner can rotate it). They live in
  `src/app/(public)` and are listed in `PUBLIC` in `src/middleware.ts`. Read them only through
  `loadReport()` / `loadPortal()` (`src/lib/clientReports.ts`), which return that visit or client
  and nothing else; photos as signed URLs. `submitFeedback` (`src/app/actions/public.ts`) is the one
  action without `requireUser`: the token is its key. Ratings ≤ 2 open a CLIENT issue and alert managers.
- **Email:** `src/lib/email.ts` sends through Resend only when `RESEND_API_KEY` and `EMAIL_FROM` are
  set; otherwise screens offer "Copy link" / "Text link" (`ShareLink`) and say email isn't set up.
  Visit reports go out after check-out (`afterCheckOut()` in `runFieldOp`) only for clients with
  reports turned on; it never fails the check-out.
- **Billing:** invoices are made only by the `bill_visits` RPC (invoice + visit links in one
  transaction; refuses visits billed meanwhile). Lines come from `invoiceLines()` (`src/lib/billing.ts`).
  On the 1st (Chicago) `/api/cron` makes one draft per client for visits before that month
  (`createMonthlyDrafts`, claimed once per month in `BillingRun`); the Invoices page has the same
  button. About hourly the cron marks SENT invoices PAID when Wave says so (`syncWavePaid`), audited as
  `auto.*` (shown as "Automatic" on Activity).
- **Job templates:** `Location.jobTemplate` (read with `parseTemplate()`): service, usual start/end,
  usual cleaner, checklist, notes. New job fills in from it.

## Roles
- `STAFF` < `MANAGER` < `OWNER` (`src/lib/session.ts`). Pages call `requireUser("MANAGER")` etc.;
  server actions check again themselves. Never rely on hiding a link.
- Owner only: payroll, pay rates, and managing managers/owners. Managers: scheduling, locations,
  floor plans, SOPs, inventory, time approval, clients, invoices, and managing **staff**.
- Team management rules live in `src/lib/team.ts` (`canManage`, `assignableRoles`, `ACCESS_MATRIX`,
  shown on the Team page). Nobody changes their own access level or turns off their own login; the
  last active owner can't be demoted, turned off or removed. "Remove" deletes only people with no
  work history; anyone with history is turned off instead (login banned, `active = false`) so
  payroll and job records stay intact.
- Navigation lives in `src/lib/nav.ts`. Staff get a short flat list. Managers and the owner get nine
  sidebar entries; related pages share one entry and switch with tabs (`SectionTabs`, rendered by
  the app layout): Clients | Locations | SOPs, Hours | Requests | Time off | Payroll, and More
  (Reports | Activity | Issues | Alerts | Settings | My account). The bell (unread alerts) sits in
  the phone top bar and the sidebar footer. A new page goes into the section it belongs to, with the lowest
  role that may see it, and the page itself must call `requireUser` with that same role. Add a new
  top-level entry only when nothing fits.

## Integrations
- **Wave Accounting** (`src/lib/wave.ts`): public GraphQL API. Invoices are created, approved and
  emailed through Wave (`customerCreate`, `invoiceCreate`, `invoiceApprove`, `invoiceSend`). Needs
  `WAVE_ACCESS_TOKEN`, `WAVE_BUSINESS_ID` and `WAVE_PRODUCT_ID` or `WAVE_INCOME_ACCOUNT_ID`. Errors
  are stored on the invoice (`waveError`) and shown, never thrown at the user.
- **Wave Payroll has no public API.** Payroll is a CSV export (`/payroll/export`) of regular and
  overtime hours per employee to enter in Wave. Don't claim it syncs.
- Geofence coordinates come from the US Census geocoder (`src/app/actions/geocode.ts`, free, no key)
  or the manager's phone on site (`GeoFields`).
- Photos go through `PhotoInput` (`src/components/PhotoInput.tsx`), which shrinks them to a
  ~1600 px JPEG on the phone before upload. Never upload a raw camera file.
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

## SOPs
- An SOP applies to the whole company, one client (`clientId`, every location of theirs) or one
  location (`locationId`); `sopApplies()` in `src/lib/sops.ts` is the rule. Its content is any mix
  of typed steps (`body`), a link (`linkUrl`, usually Google Drive) and an uploaded file
  (`filePath` in the `media` bucket, opened through `signedUrls()`).
- Add and edit through `SopForm`; show with `SopContent`. Google Drive is link-only (paste the share
  link): there is no Drive API connection, so don't claim files sync or that access is checked.
- A client and its locations can be created on one form (Clients page). Locations added there are
  geocoded from the address on save (`src/lib/geocode.ts`), best effort.

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
- The bottom tab bar holds four essentials (staff: Locations fourth; managers and owner: Clients)
  + More, a sheet with every other page for the role, one tap each.
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
