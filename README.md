# KS Precision Cleaning

Field operations app for KS Precision Cleaning: GPS check-ins, job scheduling, tap-a-room floor
plans with room timers, SOPs, supply inventory, Wave invoicing and payroll export, with separate
staff, manager and owner views.

## Features

| Area | Staff | Manager | Owner |
| --- | --- | --- | --- |
| **Check-in**: GPS-verified at supply pickup and on site, with geofence flags | ✓ | ✓ | ✓ |
| **Jobs**: today's jobs, job checklist, check in/out, open shifts | own | schedule, assign, repeat weekly | ✓ |
| **Room map**: tap a room for its tasks, start/stop room timers | ✓ | ✓ | ✓ |
| **Floor plans**: upload a plan, trace rooms, set room type and custom tasks | view | edit | edit |
| **SOPs**: company and per-location, versioned, "I've read this" tracking | read | edit, see who read | ✓ |
| **Issues**: report with photo, resolve | report | resolve | ✓ |
| **Hours**: time from check-in/out | own | approve, edit | ✓ |
| **Inventory**: stock per pickup location, auto-deducted on pickup, low-stock alerts | — | ✓ | ✓ |
| **Reports**: time by room (client-ready), margin per location, on-time rate | — | ✓ | ✓ |
| **Clients and invoices**: bill completed visits, send through Wave | — | ✓ | ✓ |
| **Payroll**: regular/overtime hours CSV for Wave Payroll | — | — | ✓ |
| **Team**: logins, roles, pay rates | — | add staff | ✓ |

## Local development

Needs Node 20+ and Postgres.

```bash
cp .env.example .env        # set DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate
npm run db:seed             # demo data; password for all: password123
npm run dev
```

Demo logins: `owner@ks.test`, `manager@ks.test`, `staff@ks.test`, `devon@ks.test`.

## Production (Supabase project "KSPC" + Vercel)

The schema is already applied to the KSPC Supabase project.

1. In Supabase, open **Project Settings → Database → Connection string** and copy the pooled URI
   (port 6543). Add `?pgbouncer=true&connection_limit=1` for serverless.
2. In Vercel, import this repo and set the environment variables:
   - `DATABASE_URL`: the pooled connection string
   - `AUTH_SECRET`: output of `openssl rand -base64 32`
   - `WAVE_ACCESS_TOKEN`, `WAVE_BUSINESS_ID`, and `WAVE_PRODUCT_ID` or `WAVE_INCOME_ACCOUNT_ID` (optional, for Wave)
3. Create the first owner login (from your machine, with `DATABASE_URL` pointing at Supabase):

   ```bash
   npm run create-owner -- "Your Name" you@example.com 'a-strong-password'
   ```

4. Sign in, then add clients, locations (with coordinates for the geofence), pickup locations,
   supplies and your team.

## Wave

- **Invoices:** create a Wave API token at https://developer.waveapps.com (Full Access token for
  your own business). Find your business ID with the API playground's `businesses` query. Invoices
  are created in Wave, approved and emailed to the client's billing email.
- **Payroll:** Wave Payroll has no public API for hours. The Payroll page exports a CSV of regular
  and overtime hours per employee (overtime = over 40 h in a Monday–Sunday week) to enter on Wave's
  *Run payroll* screen.
