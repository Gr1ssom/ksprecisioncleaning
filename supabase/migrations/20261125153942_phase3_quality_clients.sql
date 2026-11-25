-- Phase 3: inspections, re-cleans, client visit reports and feedback, a client portal, monthly
-- draft invoices, paid status from Wave, and job templates per location.
-- Additive and idempotent: every statement can run twice.

-- 1. Inspections: a manager scores each room of a finished job pass / touch-up / fail.
CREATE TABLE IF NOT EXISTS "Inspection" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inspectorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Who cleaned and where, kept as they were on the day so scores roll up correctly later.
  "cleanerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "note" TEXT,
  "score" NUMERIC(5,1),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Inspection_assignmentId_key" ON "Inspection"("assignmentId");
CREATE INDEX IF NOT EXISTS "Inspection_cleanerId_idx" ON "Inspection"("cleanerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Inspection_locationId_idx" ON "Inspection"("locationId", "createdAt");
ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "InspectionRoom" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "inspectionId" TEXT NOT NULL REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Rooms can be redrawn (hard-deleted) later; the name stays for the record.
  "roomId" TEXT REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "roomName" TEXT NOT NULL,
  "result" TEXT NOT NULL CHECK ("result" IN ('PASS', 'TOUCH_UP', 'FAIL')),
  "note" TEXT,
  "photoPath" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "InspectionRoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InspectionRoom_room_key" ON "InspectionRoom"("inspectionId", "roomId");
ALTER TABLE "InspectionRoom" ENABLE ROW LEVEL SECURITY;

-- 2. Re-clean loop: a follow-up job points back at the job, inspection or issue it fixes.
--    Re-cleans are free by default ("noCharge"), so they never land on an invoice.
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "followUpOfId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "inspectionId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "issueId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "noCharge" BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_followUpOfId_fkey') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_inspectionId_fkey') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_issueId_fkey') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Assignment_followUpOfId_idx" ON "Assignment"("followUpOfId");
CREATE INDEX IF NOT EXISTS "Assignment_issueId_idx" ON "Assignment"("issueId");

-- Client complaints arrive as issues with no staff reporter; they can point at the visit.
ALTER TABLE "Issue" ALTER COLUMN "reportedById" DROP NOT NULL;
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "assignmentId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Issue_source_check') THEN
    ALTER TABLE "Issue" ADD CONSTRAINT "Issue_source_check" CHECK ("source" IN ('STAFF', 'CLIENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Issue_assignmentId_fkey') THEN
    ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Client settings: visit reports (off by default), where they go, and the portal link token.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "reportsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "reportEmail" TEXT;
-- Two random UUIDs = 244 random bits: unguessable. Existing clients each get their own.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "portalToken" TEXT NOT NULL
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS "Client_portalToken_key" ON "Client"("portalToken");

-- 4. Visit reports (one per job, opened by token, no login) and the client's rating of the visit.
CREATE TABLE IF NOT EXISTS "VisitReport" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sentAt" TIMESTAMPTZ,
  "sentTo" TEXT,
  "emailError" TEXT,
  CONSTRAINT "VisitReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisitReport_assignmentId_key" ON "VisitReport"("assignmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "VisitReport_token_key" ON "VisitReport"("token");
ALTER TABLE "VisitReport" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "VisitFeedback" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "rating" SMALLINT NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" TEXT,
  "cleanerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "VisitFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisitFeedback_assignmentId_key" ON "VisitFeedback"("assignmentId");
ALTER TABLE "VisitFeedback" ENABLE ROW LEVEL SECURITY;

-- 5. Monthly draft invoices: one row per month claims the run, so the 5-minute tick and the
--    manual button never make the same month twice by accident.
CREATE TABLE IF NOT EXISTS "BillingRun" (
  "month" DATE NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "invoices" INTEGER NOT NULL DEFAULT 0,
  "byId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BillingRun_pkey" PRIMARY KEY ("month")
);
ALTER TABLE "BillingRun" ENABLE ROW LEVEL SECURITY;

-- 6. Job template per location: service, usual times and cleaner, standard checklist.
--    {"serviceTypeId","startTime","endTime","userId","tasks":[...],"notes"}
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "jobTemplate" JSONB;

-- 7. Create an invoice and link its visits in one step. Refuses if any visit was billed meanwhile,
--    is not complete, is a free re-clean or belongs to another client.
CREATE OR REPLACE FUNCTION public.bill_visits(p_client TEXT, p_visits TEXT[], p_lines JSONB, p_total NUMERIC,
  p_issue DATE, p_due DATE, p_memo TEXT)
RETURNS TABLE ("id" TEXT, "number" TEXT) LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE wanted INT := COALESCE(cardinality(p_visits), 0); ok INT; inv_id TEXT; inv_no TEXT;
BEGIN
  PERFORM 1 FROM "Assignment" a WHERE a."id" = ANY(p_visits) FOR UPDATE;
  SELECT count(*) INTO ok FROM "Assignment" a JOIN "Location" l ON l."id" = a."locationId"
  WHERE a."id" = ANY(p_visits) AND a."invoiceId" IS NULL AND a."status" = 'COMPLETED' AND NOT a."noCharge" AND l."clientId" = p_client;
  IF ok <> wanted THEN
    RAISE EXCEPTION 'Some of these visits were just billed or changed. Reload and try again.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO "Invoice" ("clientId", "issueDate", "dueDate", "lines", "total", "memo")
  VALUES (p_client, p_issue, p_due, p_lines, p_total, p_memo)
  RETURNING "Invoice"."id", "Invoice"."number" INTO inv_id, inv_no;
  IF wanted > 0 THEN
    UPDATE "Assignment" SET "invoiceId" = inv_id WHERE "Assignment"."id" = ANY(p_visits);
  END IF;
  RETURN QUERY SELECT inv_id, inv_no;
END $fn$;
REVOKE ALL ON FUNCTION public.bill_visits(TEXT, TEXT[], JSONB, NUMERIC, DATE, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bill_visits(TEXT, TEXT[], JSONB, NUMERIC, DATE, DATE, TEXT) TO service_role;

-- 8. Live updates for the new tables.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('public.notify_app_change()') IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['Inspection','InspectionRoom','VisitReport','VisitFeedback','BillingRun']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS app_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER app_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.notify_app_change()', t);
  END LOOP;
END $$;
