# KS Precision Cleaning

Field operations app for KS Precision Cleaning: GPS check-ins, job scheduling, tap-a-room floor
plans with room timers, SOPs, supply inventory, Wave invoicing and payroll export, with separate
staff, manager and owner views.

## Features

| Area | Staff | Manager | Owner |
| --- | --- | --- | --- |
| **Check-in**: GPS-verified at supply pickup and on site, with geofence flags | ✓ | ✓ | ✓ |
| **Jobs**: today's jobs, job checklist, check in/out, open shifts | own | schedule, assign, repeat weekly | ✓ |
| **Room map**: numbered route, tap a room for its tasks, room timers vs usual time, finish room, before/after photos | ✓ | ✓ | ✓ |
| **Floor plans**: upload a plan, draw rooms with snapping, set the cleaning route, room types and per-room tasks (by service, with time estimates) | view | edit | edit |
| **SOPs**: company and per-location, versioned, "I've read this" tracking | read | edit, see who read | ✓ |
| **Issues**: report with photo, resolve | report | resolve | ✓ |
| **Hours**: time from check-in/out | own | approve, edit | ✓ |
| **Inventory**: stock per pickup location, auto-deducted on pickup, low-stock alerts | — | ✓ | ✓ |
| **Reports**: floor-plan heat map and time by room (client-ready), margin per location and per service, on-time rate | — | ✓ | ✓ |
| **Clients and pricing**: each client's per-visit price for Standard, Deep and Maintenance clean (and any service you add) | — | ✓ | ✓ |
| **Invoices**: bill completed visits at the client's price for that service, send through Wave | — | ✓ | ✓ |
| **Payroll**: regular/overtime hours CSV for Wave Payroll | — | — | ✓ |
| **Team**: logins, roles, pay rates | — | add staff | ✓ |

## How it's built

Next.js 15 on Vercel, with **Supabase** for everything else: Auth (logins), Postgres (data, locked
down with RLS so only the app server can read it) and Storage (floor plans and photos).
Migrations in `supabase/migrations/` are applied by the Supabase GitHub integration when a PR
merges to `main`.

## Setup

1. **Vercel environment variables** (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (already set)
   - `SUPABASE_SECRET_KEY`: Supabase → Project Settings → API Keys → Secret keys. Mark it
     Sensitive. Server only.
   - `WAVE_ACCESS_TOKEN`, `WAVE_BUSINESS_ID`, and `WAVE_PRODUCT_ID` or `WAVE_INCOME_ACCOUNT_ID`
     when you're ready to send invoices through Wave.
2. **First owner:** open `https://<your app>/setup` and create the owner login. It works only while
   the app has no users. Then add managers and staff on the Team page.
3. **Set up:** clients and their prices per service, locations (with coordinates for the geofence),
   floor plans, pickup locations, supplies and your team.

**Install on phones:** open the app in Safari (iPhone) and choose *Share → Add to Home Screen*, or in
Chrome (Android) choose *Install app*. It opens full screen like a native app.

## Local development

```bash
cp .env.example .env.local   # fill in the Supabase keys
npm install
npm run dev
```

Demo data (only in a project with no real users yet):

```bash
ALLOW_DEMO_SEED=1 npm run demo:seed            # logins: owner@ks.test etc., password123
ALLOW_DEMO_SEED=1 npm run demo:seed -- --clear # remove it again
```

## Wave

- **Invoices:** create a Wave API token at https://developer.waveapps.com (Full Access token for
  your own business). Find your business ID with the API playground's `businesses` query. Invoices
  are created in Wave, approved and emailed to the client's billing email.
- **Payroll:** Wave Payroll has no public API for hours. The Payroll page exports a CSV of regular
  and overtime hours per employee (overtime = over 40 h in a Monday–Sunday week) to enter on Wave's
  *Run payroll* screen.
