-- Migration: Add module field to notifications table
-- Purpose: Add notification taxonomy for filtering (NETWORK_SECURITY, VULNERABILITY_MANAGEMENT, GENERAL)
-- Reference: sec-xp0

-- Step 1: Add module column with default value 'GENERAL' to handle existing rows
ALTER TABLE "notifications" ADD COLUMN "module" TEXT NOT NULL DEFAULT 'GENERAL';

-- Step 2: Update existing rows to correct module based on type
UPDATE "notifications" SET "module" = 'NETWORK_SECURITY' WHERE "type" IN ('NEW_PORT', 'CLOSED_PORT');
UPDATE "notifications" SET "module" = 'VULNERABILITY_MANAGEMENT' WHERE "type" IN ('NEW_CVE', 'CVE_SEVERITY_INCREASE');

-- Note: SQLite doesn't support removing DEFAULT constraint, but new inserts will use catalog-provided values
-- The DEFAULT is only for backwards compatibility with existing rows
