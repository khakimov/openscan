-- Migration 0011: Fix environments with composite unique index
-- Purpose: Recover from composite index bug in early version of migration 0010
-- Reference: SEC-XP0 code review findings - Medium priority fix
--
-- Problem: If migration 0010 was applied with composite index (before partial index fix),
-- environments will have the broken constraint that blocks multiple inactive rows.
--
-- Solution: Explicitly drop ANY existing index with this name, then rebuild with correct partial index
--
-- How it works:
--   1. Drop index by name (idempotent - works even if already partial)
--   2. Create partial unique index (allows unlimited inactive rows)
--   3. Safe to run on environments that already have correct index (idempotent)
--
-- Deployment safety: This migration is idempotent and safe to run multiple times

-- Step 1: Drop any existing index with this name (composite or partial)
DROP INDEX IF EXISTS `notifications_org_fingerprint_active_uq`;--> statement-breakpoint

-- Step 2: Recreate as partial unique index with correct WHERE clause
-- This allows unlimited inactive rows while preventing duplicate active notifications
CREATE UNIQUE INDEX `notifications_org_fingerprint_active_uq`
ON `notifications` (`organization_id`, `fingerprint`)
WHERE `is_active` = 1;
