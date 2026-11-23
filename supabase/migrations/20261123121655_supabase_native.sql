-- Supabase-native schema: the app now talks to Supabase only (Auth + supabase-js + Storage).
-- Removes Prisma leftovers, lets the database fill ids/timestamps, moves images to Storage,
-- and adds floor-plan v2 (cleaning order, per-service tasks, time estimates, room photos).
-- Idempotent: safe to re-run.

-- 1. Prisma leftovers
DROP TABLE IF EXISTS "_prisma_migrations";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kspc_app') THEN
    EXECUTE 'DROP OWNED BY kspc_app';
    EXECUTE 'DROP ROLE kspc_app';
  END IF;
END $$;

-- 2. The database generates ids (Prisma used to do it in the client)
-- 3. Exact instants: timestamp -> timestamptz (values were stored as UTC)
DO $$
DECLARE t TEXT; c RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Client','Location','SupplyDepot','Sop','SopAck','Layout','Room','RoomTypeTask',
    'RoomSession','RoomTaskCheck','Assignment','Checkin','TimeEntry','Supply','StockLevel','StockMovement','Invoice',
    'Issue','Announcement','ServiceType','ClientRate'] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text', t);
  END LOOP;
  FOR c IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND data_type = 'timestamp without time zone' LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''', c.table_name, c.column_name, c.column_name);
  END LOOP;
END $$;

ALTER TABLE "Sop" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "Layout" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- 4. Logins live in Supabase Auth. "User" is the staff profile; its id is the auth user's id.
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";

-- 5. Images in Storage (private bucket, served with short-lived signed URLs)
ALTER TABLE "Layout" DROP COLUMN IF EXISTS "imageData";
ALTER TABLE "Layout" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;
ALTER TABLE "Issue" DROP COLUMN IF EXISTS "photoData";
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "photoPath" TEXT;
ALTER TABLE "Checkin" DROP COLUMN IF EXISTS "photoData";
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

-- 6. Floor plan v2
-- Cleaning order through the location (the route staff follow).
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
-- Common tasks can be limited to some services (empty = every visit) and carry an estimate.
ALTER TABLE "RoomTypeTask" ADD COLUMN IF NOT EXISTS "serviceTypeIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "RoomTypeTask" ADD COLUMN IF NOT EXISTS "minutes" INTEGER;
-- Room.customTasks becomes [{label, serviceTypeIds: [], minutes}] (was ["label"]).
UPDATE "Room" SET "customTasks" = (
  SELECT COALESCE(jsonb_agg(CASE WHEN jsonb_typeof(t) = 'string'
    THEN jsonb_build_object('label', t #>> '{}', 'serviceTypeIds', '[]'::jsonb, 'minutes', NULL) ELSE t END), '[]'::jsonb)
  FROM jsonb_array_elements("customTasks") t)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("customTasks") t WHERE jsonb_typeof(t) = 'string');

CREATE TABLE IF NOT EXISTS "RoomPhoto" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "roomId" TEXT NOT NULL REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('before', 'after')),
  "path" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RoomPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RoomPhoto_assignment_idx" ON "RoomPhoto"("assignmentId");
ALTER TABLE "RoomPhoto" ENABLE ROW LEVEL SECURITY;

-- Indexes for the app's common lookups
CREATE INDEX IF NOT EXISTS "Assignment_date_idx" ON "Assignment"("date");
CREATE INDEX IF NOT EXISTS "Assignment_user_date_idx" ON "Assignment"("userId", "date");
CREATE INDEX IF NOT EXISTS "Checkin_at_idx" ON "Checkin"("at");
CREATE INDEX IF NOT EXISTS "TimeEntry_user_clockIn_idx" ON "TimeEntry"("userId", "clockIn");
CREATE INDEX IF NOT EXISTS "RoomSession_assignment_idx" ON "RoomSession"("assignmentId");
CREATE INDEX IF NOT EXISTS "RoomTaskCheck_assignment_idx" ON "RoomTaskCheck"("assignmentId");

-- 7. All-or-nothing operations (supabase-js has no client-side transactions).
-- Called only by the app server with the secret key; anon/authenticated cannot execute them.

-- Stock change + movement log
CREATE OR REPLACE FUNCTION public.adjust_stock(p_supply TEXT, p_depot TEXT, p_delta INTEGER, p_reason TEXT, p_user TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  INSERT INTO "StockLevel" ("supplyId", "depotId", "quantity") VALUES (p_supply, p_depot, p_delta)
  ON CONFLICT ("supplyId", "depotId") DO UPDATE SET "quantity" = "StockLevel"."quantity" + EXCLUDED."quantity";
  INSERT INTO "StockMovement" ("supplyId", "depotId", "userId", "delta", "reason") VALUES (p_supply, p_depot, p_user, p_delta, p_reason);
END $fn$;

-- Supply pickup: one check-in + one stock change per item. p_items = [{"supplyId": "...", "qty": 2}]
CREATE OR REPLACE FUNCTION public.supply_pickup(p_user TEXT, p_depot TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT, p_items JSONB)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE it JSONB;
BEGIN
  INSERT INTO "Checkin" ("type", "userId", "depotId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note")
  VALUES ('SUPPLY_PICKUP', p_user, p_depot, p_lat, p_lng, p_acc, p_distance, p_within, p_note);
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    PERFORM public.adjust_stock(it->>'supplyId', p_depot, -((it->>'qty')::int), 'PICKUP', p_user);
  END LOOP;
END $fn$;

-- Arrive at site: check-in, job in progress, clock in
CREATE OR REPLACE FUNCTION public.site_check_in(p_assignment TEXT, p_user TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE loc TEXT;
BEGIN
  SELECT "locationId" INTO loc FROM "Assignment" WHERE "id" = p_assignment;
  INSERT INTO "Checkin" ("type", "userId", "locationId", "assignmentId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note")
  VALUES ('SITE_IN', p_user, loc, p_assignment, p_lat, p_lng, p_acc, p_distance, p_within, p_note);
  UPDATE "Assignment" SET "status" = 'IN_PROGRESS', "userId" = COALESCE("userId", p_user) WHERE "id" = p_assignment;
  INSERT INTO "TimeEntry" ("userId", "assignmentId", "clockIn") VALUES (p_user, p_assignment, now())
  ON CONFLICT ("assignmentId") DO UPDATE SET "clockOut" = NULL;
END $fn$;

-- Leave site: check-out, stop room timers, clock out, job complete
CREATE OR REPLACE FUNCTION public.site_check_out(p_assignment TEXT, p_user TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE loc TEXT;
BEGIN
  SELECT "locationId" INTO loc FROM "Assignment" WHERE "id" = p_assignment;
  INSERT INTO "Checkin" ("type", "userId", "locationId", "assignmentId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note")
  VALUES ('SITE_OUT', p_user, loc, p_assignment, p_lat, p_lng, p_acc, p_distance, p_within, p_note);
  UPDATE "RoomSession" SET "endedAt" = now() WHERE "assignmentId" = p_assignment AND "endedAt" IS NULL;
  UPDATE "TimeEntry" SET "clockOut" = now() WHERE "assignmentId" = p_assignment AND "clockOut" IS NULL;
  UPDATE "Assignment" SET "status" = 'COMPLETED' WHERE "id" = p_assignment;
END $fn$;

-- Room timer: start a room (stops this person's other open room on the job). p_room NULL = just stop.
CREATE OR REPLACE FUNCTION public.start_room(p_assignment TEXT, p_user TEXT, p_room TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  UPDATE "RoomSession" SET "endedAt" = now() WHERE "assignmentId" = p_assignment AND "userId" = p_user AND "endedAt" IS NULL;
  IF p_room IS NOT NULL THEN
    INSERT INTO "RoomSession" ("assignmentId", "roomId", "userId") VALUES (p_assignment, p_room, p_user);
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.adjust_stock(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_check_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_room(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_check_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_room(TEXT, TEXT, TEXT) TO service_role;
