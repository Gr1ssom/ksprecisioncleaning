-- 1. SOPs can belong to a client (every location of that client), and can be a link (Google Drive
--    or any web link) or an uploaded file instead of typed steps. Additive and idempotent.
ALTER TABLE "Sop" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Sop" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "Sop" ADD COLUMN IF NOT EXISTS "filePath" TEXT;
ALTER TABLE "Sop" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "Sop" ALTER COLUMN "body" SET DEFAULT '';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sop_clientId_fkey') THEN
    ALTER TABLE "Sop" ADD CONSTRAINT "Sop_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Sop_clientId_idx" ON "Sop"("clientId");

-- 2. Live updates. Every write to an app table sends a tiny "something changed" ping (the table
--    name only, never row data) on the private Realtime topic "app". Open pages hear it and ask the
--    server for fresh data, so reads still go through the server and its role checks.
CREATE OR REPLACE FUNCTION public.notify_app_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'change', 'app', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- a failed ping must never fail the write that caused it
END $$;
REVOKE ALL ON FUNCTION public.notify_app_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Client','ClientRate','ServiceType','Location','SupplyDepot','Sop','SopAck','Layout','Room',
    'RoomTypeTask','RoomSession','RoomTaskCheck','RoomPhoto','Assignment','Checkin','TimeEntry','Supply','StockLevel',
    'StockMovement','Invoice','Issue','Announcement','AuditLog','AppError']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS app_change ON public.%I', t);
      EXECUTE format('CREATE TRIGGER app_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.notify_app_change()', t);
    END IF;
  END LOOP;
END $$;

-- Signed-in team members may listen to the "app" topic. Nobody but the database can send on it
-- (no INSERT policy), and signed-out visitors hear nothing.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "team hears app change pings" ON realtime.messages;
    CREATE POLICY "team hears app change pings" ON realtime.messages FOR SELECT TO authenticated
      USING (realtime.topic() = 'app' AND extension = 'broadcast');
  END IF;
END $$;
