-- Phase 4: run the business on it. Recurring job series, supplies tied to jobs, draft purchase
-- orders when stock runs low. Additive and idempotent: every statement can run twice.

-- 1. Recurring series. A series makes its visits ahead of time (Assignment rows with seriesId and
--    seriesDate, the slot in the pattern). A visit changed on its own is "detached": series edits
--    leave it alone. Skipping a date = that visit is cancelled (the slot stays taken).
CREATE TABLE IF NOT EXISTS "JobSeries" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "serviceTypeId" TEXT REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT,
  "notes" TEXT,
  "tasks" JSONB NOT NULL DEFAULT '[]',
  -- 'weekly' (every everyWeeks weeks on the start date's weekday) or 'monthly' (the nth weekday of
  -- each month, nth 5 = the last one).
  "pattern" TEXT NOT NULL DEFAULT 'weekly' CHECK ("pattern" IN ('weekly', 'monthly')),
  "everyWeeks" SMALLINT NOT NULL DEFAULT 1 CHECK ("everyWeeks" BETWEEN 1 AND 8),
  "nth" SMALLINT CHECK ("nth" BETWEEN 1 AND 5),
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "JobSeries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobSeries_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);
ALTER TABLE "JobSeries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "seriesDate" DATE;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "detached" BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_seriesId_fkey') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "JobSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
-- One visit per slot (NULLs are distinct, so one-off jobs are unaffected). Not partial, so the
-- app can upsert on it.
CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_series_slot_key" ON "Assignment"("seriesId", "seriesDate");

-- 2. Supplies per job: a pickup can name the job it is for; its stock movements carry the job.
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "assignmentId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_assignmentId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "StockMovement_assignmentId_idx" ON "StockMovement"("assignmentId") WHERE "assignmentId" IS NOT NULL;

DROP FUNCTION IF EXISTS public.adjust_stock(TEXT, TEXT, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.adjust_stock(p_supply TEXT, p_depot TEXT, p_delta INTEGER, p_reason TEXT, p_user TEXT, p_assignment TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  INSERT INTO "StockLevel" ("supplyId", "depotId", "quantity") VALUES (p_supply, p_depot, p_delta)
  ON CONFLICT ("supplyId", "depotId") DO UPDATE SET "quantity" = "StockLevel"."quantity" + EXCLUDED."quantity";
  INSERT INTO "StockMovement" ("supplyId", "depotId", "userId", "delta", "reason", "assignmentId")
  VALUES (p_supply, p_depot, p_user, p_delta, p_reason, p_assignment);
END $fn$;

DROP FUNCTION IF EXISTS public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.supply_pickup(p_user TEXT, p_depot TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_acc DOUBLE PRECISION, p_distance DOUBLE PRECISION, p_within BOOLEAN, p_note TEXT, p_items JSONB,
  p_at TIMESTAMPTZ DEFAULT now(), p_assignment TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE it JSONB;
BEGIN
  INSERT INTO "Checkin" ("type", "userId", "depotId", "assignmentId", "latitude", "longitude", "accuracyM", "distanceM", "withinFence", "note", "at")
  VALUES ('SUPPLY_PICKUP', p_user, p_depot, p_assignment, p_lat, p_lng, p_acc, p_distance, p_within, p_note, p_at);
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    PERFORM public.adjust_stock(it->>'supplyId', p_depot, -((it->>'qty')::int), 'PICKUP', p_user, p_assignment);
  END LOOP;
  PERFORM public.ensure_shift(p_user, p_at, p_lat, p_lng);
END $fn$;

-- 3. Purchase orders. Low stock fills one draft order per pickup location; the owner edits it,
--    marks it ordered, then received (which adds the stock).
CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1001;
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "number" TEXT NOT NULL DEFAULT ('PO-' || nextval('purchase_order_seq')::text),
  "depotId" TEXT NOT NULL REFERENCES "SupplyDepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED')),
  "vendor" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "orderedAt" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ,
  "orderedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "receivedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_number_key" ON "PurchaseOrder"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_one_draft_per_depot" ON "PurchaseOrder"("depotId") WHERE "status" = 'DRAFT';
ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "supplyId" TEXT NOT NULL REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "qty" INTEGER NOT NULL CHECK ("qty" > 0),
  "unitCost" NUMERIC(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderLine_order_supply_key" ON "PurchaseOrderLine"("orderId", "supplyId");
ALTER TABLE "PurchaseOrderLine" ENABLE ROW LEVEL SECURITY;

-- Put everything at or below its reorder point at a depot on the depot's draft order (made if
-- needed). Only items stocked there count. Items already on an open (draft or ordered) order there are left alone. Suggested
-- quantity tops the item up to twice its reorder point. Returns the draft (if any) and whether it
-- was made just now.
CREATE OR REPLACE FUNCTION public.reorder_low_stock(p_depot TEXT)
RETURNS TABLE (order_id TEXT, created BOOLEAN, added INTEGER)
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_order TEXT; made BOOLEAN := false; n INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Supply" s JOIN "StockLevel" l ON l."supplyId" = s."id" AND l."depotId" = p_depot
    WHERE COALESCE(l."quantity", 0) <= s."reorderAt"
      AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderLine" pl JOIN "PurchaseOrder" po ON po."id" = pl."orderId"
                      WHERE pl."supplyId" = s."id" AND po."depotId" = p_depot AND po."status" IN ('DRAFT', 'ORDERED'))
  ) THEN
    RETURN;
  END IF;
  SELECT "id" INTO v_order FROM "PurchaseOrder" WHERE "depotId" = p_depot AND "status" = 'DRAFT';
  IF v_order IS NULL THEN
    INSERT INTO "PurchaseOrder" ("depotId") VALUES (p_depot) ON CONFLICT DO NOTHING RETURNING "id" INTO v_order;
    IF v_order IS NULL THEN
      SELECT "id" INTO v_order FROM "PurchaseOrder" WHERE "depotId" = p_depot AND "status" = 'DRAFT';
    ELSE
      made := true;
    END IF;
  END IF;
  INSERT INTO "PurchaseOrderLine" ("orderId", "supplyId", "qty", "unitCost")
  SELECT v_order, s."id", GREATEST(1, s."reorderAt" * 2 - COALESCE(l."quantity", 0)), s."unitCost"
  FROM "Supply" s JOIN "StockLevel" l ON l."supplyId" = s."id" AND l."depotId" = p_depot
  WHERE COALESCE(l."quantity", 0) <= s."reorderAt"
    AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderLine" pl JOIN "PurchaseOrder" po ON po."id" = pl."orderId"
                    WHERE pl."supplyId" = s."id" AND po."depotId" = p_depot AND po."status" IN ('DRAFT', 'ORDERED'))
  ON CONFLICT ("orderId", "supplyId") DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT v_order, made, n;
END $fn$;

-- Received: every line's quantity goes into stock (logged as RECEIVED), all or nothing.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order TEXT, p_user TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE po RECORD; ln RECORD;
BEGIN
  SELECT * INTO po FROM "PurchaseOrder" WHERE "id" = p_order FOR UPDATE;
  IF NOT FOUND OR po."status" NOT IN ('DRAFT', 'ORDERED') THEN
    RAISE EXCEPTION 'This order was already received or cancelled.' USING ERRCODE = 'P0001';
  END IF;
  FOR ln IN SELECT * FROM "PurchaseOrderLine" WHERE "orderId" = p_order LOOP
    PERFORM public.adjust_stock(ln."supplyId", po."depotId", ln."qty", 'RECEIVED', p_user, NULL);
  END LOOP;
  UPDATE "PurchaseOrder" SET "status" = 'RECEIVED', "receivedAt" = now(), "receivedById" = p_user,
    "orderedAt" = COALESCE("orderedAt", now()), "orderedById" = COALESCE("orderedById", p_user)
  WHERE "id" = p_order;
END $fn$;

REVOKE ALL ON FUNCTION public.adjust_stock(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reorder_low_stock(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.supply_pickup(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_low_stock(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(TEXT, TEXT) TO service_role;

-- 4. Live updates for the new tables.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('public.notify_app_change()') IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['JobSeries','PurchaseOrder','PurchaseOrderLine']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS app_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER app_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.notify_app_change()', t);
  END LOOP;
END $$;
