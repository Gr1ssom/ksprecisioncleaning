-- Phase 1: invoice numbers from a sequence, an audit log of sensitive changes, and a log of
-- server errors the owner can see. Idempotent.

-- 1. Invoice numbers: KS-1001, KS-1002… from a sequence, so two invoices made at once never collide.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
SELECT setval('invoice_number_seq', GREATEST(
  1000,
  COALESCE((SELECT MAX(NULLIF(regexp_replace("number", '\D', '', 'g'), '')::bigint) FROM "Invoice"), 1000)
));
ALTER TABLE "Invoice" ALTER COLUMN "number" SET DEFAULT ('KS-' || nextval('invoice_number_seq'));
GRANT USAGE ON SEQUENCE invoice_number_seq TO service_role;

-- 2. Audit log: who changed what (time edits, prices, roles and logins, invoices, stock, SOPs).
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_at_idx" ON "AuditLog"("at" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog"("entity", "entityId");
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- 3. Server errors from production, so the owner sees when something breaks.
CREATE TABLE IF NOT EXISTS "AppError" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "message" TEXT NOT NULL,
  "digest" TEXT,
  "path" TEXT,
  "method" TEXT,
  "kind" TEXT,
  CONSTRAINT "AppError_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AppError_at_idx" ON "AppError"("at" DESC);
ALTER TABLE "AppError" ENABLE ROW LEVEL SECURITY;
