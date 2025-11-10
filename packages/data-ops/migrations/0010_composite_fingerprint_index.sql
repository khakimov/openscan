-- Migration: Reintroduce partial unique index + handle ON CONFLICT manually
-- Purpose: Allow multiple inactive rows while preventing duplicate active notifications
-- Reference: Code Review Finding - Composite index blocks multiple inactive rows
--
-- Problem: Composite index on (org_id, fingerprint, is_active) blocks second inactive row
-- When a notification expires twice:
--   Row 1: (org_123, fingerprint_A, is_active=0) -- First expiry
--   Row 2: (org_123, fingerprint_A, is_active=1) -- New notification
--   Row 2 expires → tries to become is_active=0 → UNIQUE constraint violation!
--
-- Solution: Use partial unique index WHERE is_active = 1 (allows multiple inactive rows)
-- Trade-off: ON CONFLICT cannot target partial indexes, so we use INSERT OR REPLACE
--
-- How it works:
--   1. Partial index enforces: only ONE active row per (org_id, fingerprint)
--   2. Multiple inactive rows allowed (no constraint on is_active = 0)
--   3. Manual expiry sets is_active = false (notifications.ts:212-224)
--   4. INSERT OR REPLACE handles upsert (replaces active row if exists)

-- Step 1: Drop old partial unique index (if exists from previous migration)
DROP INDEX IF EXISTS `notifications_fingerprint_active_idx`;--> statement-breakpoint

-- Step 2: Create partial unique index on active notifications only
-- This allows unlimited inactive rows while preventing duplicate active notifications
CREATE UNIQUE INDEX `notifications_org_fingerprint_active_uq`
ON `notifications` (`organization_id`, `fingerprint`)
WHERE `is_active` = 1;
