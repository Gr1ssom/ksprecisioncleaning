-- Phase 2: a shift clock with breaks, time off and availability, open-shift requests,
-- notifications (in-app + phone push), owner settings, and safe replay of offline actions.
-- Additive and idempotent: every statement can run twice.

-- 1. Owner settings (pay rules, alerts). Read with defaults in src/lib/settings.ts.
CREATE TABLE IF NOT EXISTS "Setting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;

-- Server-only secrets the app makes for itself (cron key, phone-push keys). Never sent to a browser.
CREATE TABLE IF NOT EXISTS "AppSecret" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "AppSecret_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "AppSecret" ENABLE ROW LEVEL SECURITY;
INSERT INTO "AppSecret" ("key", "value") VALUES ('cron', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT ("key") DO NOTHING;

CREATE INDEX IF NOT EXISTS "TimeEntry_userId_clockIn_idx" ON "TimeEntry"("userId", "clockIn");

-- 2. Shift clock: the working day, from first clock-in (or first check-in) to clock-out.
CREATE TABLE IF NOT EXISTS "Shift" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clockIn" TIMESTAMPTZ NOT NULL,
  "clockOut" TIMESTAMPTZ,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "inLat" DOUBLE PRECISION, "inLng" DOUBLE PRECISION,
  "outLat" DOUBLE PRECISION, "outLng" DOUBLE PRECISION,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shift_one_open_per_user" ON "Shift"("userId") WHERE "clockOut" IS NULL;
CREATE INDEX IF NOT EXISTS "Shift_userId_clockIn_idx" ON "Shift"("userId", "clockIn");
ALTER TABLE "Shift" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "Break" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "shiftId" TEXT REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "endedAt" TIMESTAMPTZ,
  CONSTRAINT "Break_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Break_one_open_per_user" ON "Break"("userId") WHERE "endedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Break_userId_startedAt_idx" ON "Break"("userId", "startedAt");
ALTER TABLE "Break" ENABLE ROW LEVEL SECURITY;

-- 3. Time off and weekly availability.
CREATE TABLE IF NOT EXISTS "TimeOff" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
  "decidedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimeOff_dates" CHECK ("endDate" >= "startDate")
);
CREATE INDEX IF NOT EXISTS "TimeOff_userId_idx" ON "TimeOff"("userId", "startDate");
ALTER TABLE "TimeOff" ENABLE ROW LEVEL SECURITY;

-- weekday: 0 = Monday … 6 = Sunday. No row for a day = no limits set for that day.
CREATE TABLE IF NOT EXISTS "Availability" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "weekday" SMALLINT NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
  "available" BOOLEAN NOT NULL DEFAULT true,
  "startTime" TEXT,
  "endTime" TEXT,
  CONSTRAINT "Availability_pkey" PRIMARY KEY ("userId", "weekday")
);
ALTER TABLE "Availability" ENABLE ROW LEVEL SECURITY;

-- 4. Staff asking for an open shift; a manager approves.
CREATE TABLE IF NOT EXISTS "ShiftClaim" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
  "note" TEXT,
  "decidedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ShiftClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShiftClaim_one_pending" ON "ShiftClaim"("assignmentId", "userId") WHERE "status" = 'PENDING';
ALTER TABLE "ShiftClaim" ENABLE ROW LEVEL SECURITY;

-- 5. Notifications: the in-app inbox, and phone-push subscriptions.
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "url" TEXT,
  "dedupe" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readAt" TIMESTAMPTZ,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupe_key" ON "Notification"("userId", "dedupe");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

-- 6. Offline replay: each queued action carries an id, so a retry never applies it twice.
CREATE TABLE IF NOT EXISTS "FieldOp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "op" TEXT NOT NULL,
  "at" TIMESTAMPTZ NOT NULL,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FieldOp_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FieldOp" ENABLE ROW LEVEL SECURITY;

-- 7. All-or-nothing field operations, now shift-aware and given the time the action
--    happened on the phone (p_at), so actions saved offline keep their real time.
DROP FUNCTION IF EXISTS public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.site_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.site_check_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.start_room(TEXT, TEXT, TEXT);

-- Open a shift for the person if none is open (first pickup or site check-in starts the day).
CREATE OR REPLACE FUNCTION public.ensure_shift(p_user TEXT, p_at TIMESTAMPTZ, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Shift" WHERE "userId" = p_user AND "clockOut" IS NULL) THEN
    INSERT INTO "Shift" ("userId", "clockIn", "inLat", "inLng") VALUES (p_user, p_at, p_lat, p_lng)
    ON CONFLICT DO NOTHING;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.supply_pickup(p_user TEXT, p_depot TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT, p_items JSONB, p_at TIMESTAMPTZ DEFAULT now())
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE it JSONB;
BEGIN
  INSERT INTO "Checkin" ("type", "userId", "depotId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note", "at")
  VALUES ('SUPPLY_PICKUP', p_user, p_depot, p_lat, p_lng, p_acc, p_distance, p_within, p_note, p_at);
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    PERFORM public.adjust_stock(it->>'supplyId', p_depot, -((it->>'qty')::int), 'PICKUP', p_user);
  END LOOP;
  PERFORM public.ensure_shift(p_user, p_at, p_lat, p_lng);
END $fn$;

-- Arrive at site: check-in, job in progress, start job time (and the day's shift if not started).
CREATE OR REPLACE FUNCTION public.site_check_in(p_assignment TEXT, p_user TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE loc TEXT;
BEGIN
  SELECT "locationId" INTO loc FROM "Assignment" WHERE "id" = p_assignment;
  INSERT INTO "Checkin" ("type", "userId", "locationId", "assignmentId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note", "at")
  VALUES ('SITE_IN', p_user, loc, p_assignment, p_lat, p_lng, p_acc, p_distance, p_within, p_note, p_at);
  UPDATE "Assignment" SET "status" = 'IN_PROGRESS', "userId" = COALESCE("userId", p_user)
  WHERE "id" = p_assignment AND "status" IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');
  INSERT INTO "TimeEntry" ("userId", "assignmentId", "clockIn") VALUES (p_user, p_assignment, p_at)
  ON CONFLICT ("assignmentId") DO UPDATE SET "clockOut" = NULL;
  UPDATE "Break" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "userId" = p_user AND "endedAt" IS NULL;
  PERFORM public.ensure_shift(p_user, p_at, p_lat, p_lng);
END $fn$;

-- Leave site: check-out, stop room timers, stop job time, job complete.
CREATE OR REPLACE FUNCTION public.site_check_out(p_assignment TEXT, p_user TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE loc TEXT;
BEGIN
  SELECT "locationId" INTO loc FROM "Assignment" WHERE "id" = p_assignment;
  INSERT INTO "Checkin" ("type", "userId", "locationId", "assignmentId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note", "at")
  VALUES ('SITE_OUT', p_user, loc, p_assignment, p_lat, p_lng, p_acc, p_distance, p_within, p_note, p_at);
  UPDATE "RoomSession" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "assignmentId" = p_assignment AND "endedAt" IS NULL;
  UPDATE "TimeEntry" SET "clockOut" = GREATEST("clockIn", p_at) WHERE "assignmentId" = p_assignment AND "clockOut" IS NULL;
  UPDATE "Assignment" SET "status" = 'COMPLETED' WHERE "id" = p_assignment;
END $fn$;

-- Room timer: start a room (stops this person's other open room on the job). p_room NULL = just stop.
CREATE OR REPLACE FUNCTION public.start_room(p_assignment TEXT, p_user TEXT, p_room TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  UPDATE "RoomSession" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "assignmentId" = p_assignment AND "userId" = p_user AND "endedAt" IS NULL;
  IF p_room IS NOT NULL THEN
    INSERT INTO "RoomSession" ("assignmentId", "roomId", "userId", "startedAt") VALUES (p_assignment, p_room, p_user, p_at);
  END IF;
END $fn$;

-- Shift clock. Clocking out while still checked in to a job is refused (check out first).
CREATE OR REPLACE FUNCTION public.shift_clock(p_user TEXT, p_in BOOLEAN, p_at TIMESTAMPTZ, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF p_in THEN
    PERFORM public.ensure_shift(p_user, p_at, p_lat, p_lng);
  ELSE
    IF EXISTS (SELECT 1 FROM "TimeEntry" WHERE "userId" = p_user AND "clockOut" IS NULL AND "assignmentId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Check out of your job before ending your day.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE "Break" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "userId" = p_user AND "endedAt" IS NULL;
    UPDATE "Shift" SET "clockOut" = GREATEST("clockIn", p_at), "outLat" = p_lat, "outLng" = p_lng WHERE "userId" = p_user AND "clockOut" IS NULL;
  END IF;
END $fn$;

-- Breaks: starting one pauses the person's room timer; a break needs an open shift.
CREATE OR REPLACE FUNCTION public.shift_break(p_user TEXT, p_start BOOLEAN, p_at TIMESTAMPTZ)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE sid TEXT;
BEGIN
  IF p_start THEN
    SELECT "id" INTO sid FROM "Shift" WHERE "userId" = p_user AND "clockOut" IS NULL;
    IF sid IS NULL THEN
      RAISE EXCEPTION 'Start your day before taking a break.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE "RoomSession" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "userId" = p_user AND "endedAt" IS NULL;
    INSERT INTO "Break" ("userId", "shiftId", "startedAt") VALUES (p_user, sid, p_at) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE "Break" SET "endedAt" = GREATEST("startedAt", p_at) WHERE "userId" = p_user AND "endedAt" IS NULL;
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.ensure_shift(TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_check_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_room(TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shift_clock(TEXT, BOOLEAN, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shift_break(TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_shift(TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
GRANT EXECUTE ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_check_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_room(TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.shift_clock(TEXT, BOOLEAN, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
GRANT EXECUTE ON FUNCTION public.shift_break(TEXT, BOOLEAN, TIMESTAMPTZ) TO service_role;

-- 8. Live updates for the new tables (same "something changed" ping as the others).
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('public.notify_app_change()') IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['Shift','Break','TimeOff','Availability','ShiftClaim','Notification','Setting']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS app_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER app_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.notify_app_change()', t);
  END LOOP;
END $$;

-- 9. Every 5 minutes the database asks the app to send due reminders and late-check-in alerts.
--     It does nothing until the owner's app address is saved (Setting "appUrl"), so preview
--     databases never call the live app. The key never leaves the database and the app server.
CREATE OR REPLACE FUNCTION public.cron_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE url TEXT; key TEXT;
BEGIN
  SELECT "value" #>> '{}' INTO url FROM "Setting" WHERE "key" = 'appUrl';
  SELECT "value" INTO key FROM "AppSecret" WHERE "key" = 'cron';
  IF url IS NULL OR url = '' OR key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := rtrim(url, '/') || '/api/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', key),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
END $fn$;
REVOKE ALL ON FUNCTION public.cron_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron/pg_net not available here (%); reminders stay off', SQLERRM;
    RETURN;
  END;
  PERFORM cron.schedule('ks-notify', '*/5 * * * *', 'SELECT public.cron_tick()');
END $$;
