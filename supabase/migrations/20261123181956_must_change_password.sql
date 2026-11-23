-- Ask someone to choose their own password the next time they sign in (new logins and
-- temporary passwords). Cleared when they save a new one. Idempotent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
