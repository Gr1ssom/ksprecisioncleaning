-- Per-client pricing by service type (Standard / Deep / Maintenance clean), replacing the
-- single per-location price. Pre-launch: Location.billingRate held no real data.

CREATE TABLE IF NOT EXISTS "ServiceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceType_name_key" ON "ServiceType"("name");

CREATE TABLE IF NOT EXISTS "ClientRate" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "ClientRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientRate_clientId_serviceTypeId_key" ON "ClientRate"("clientId", "serviceTypeId");

DO $$ BEGIN
  ALTER TABLE "ClientRate" ADD CONSTRAINT "ClientRate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ClientRate" ADD CONSTRAINT "ClientRate_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "serviceTypeId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "ServiceType" ("id", "name", "sortOrder") VALUES
  ('svc_standard', 'Standard clean', 0),
  ('svc_deep', 'Deep clean', 1),
  ('svc_maintenance', 'Maintenance clean', 2)
ON CONFLICT DO NOTHING;

-- Existing jobs default to a standard clean.
UPDATE "Assignment" SET "serviceTypeId" = 'svc_standard' WHERE "serviceTypeId" IS NULL;

ALTER TABLE "Location" DROP COLUMN IF EXISTS "billingRate";

ALTER TABLE "ServiceType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientRate" ENABLE ROW LEVEL SECURITY;
