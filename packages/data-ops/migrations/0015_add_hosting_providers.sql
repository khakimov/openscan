-- Migration: Add hosting provider detection tables and columns
-- Created: 2026-03-01

-- Create hosting_providers table for normalized provider data
CREATE TABLE IF NOT EXISTS "hosting_providers" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT 'UNKNOWN' NOT NULL,
  "asn" text,
  "as_organization" text,
  "icon_key" text,
  "created_at" integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for hosting_providers
CREATE INDEX IF NOT EXISTS "hosting_providers_name_idx" ON "hosting_providers" ("name");
CREATE INDEX IF NOT EXISTS "hosting_providers_asn_idx" ON "hosting_providers" ("asn");

-- Add hosting provider columns to device_ips table
ALTER TABLE "device_ips" ADD COLUMN "hosting_provider_id" text REFERENCES "hosting_providers"("id");
ALTER TABLE "device_ips" ADD COLUMN "hosting_detected_at" integer;
ALTER TABLE "device_ips" ADD COLUMN "hosting_detection_source" text;
ALTER TABLE "device_ips" ADD COLUMN "hosting_raw_data" text;

-- Create index for hosting provider lookups on device_ips
CREATE INDEX IF NOT EXISTS "device_ips_hosting_provider_idx" ON "device_ips" ("hosting_provider_id");

-- Seed known hosting providers
INSERT INTO "hosting_providers" ("id", "name", "category", "asn", "as_organization", "icon_key") VALUES
  ('cloudflare', 'Cloudflare', 'CDN', 'AS13335', 'Cloudflare, Inc.', 'cloudflare'),
  ('aws', 'AWS', 'CLOUD', 'AS14618', 'Amazon.com, Inc.', 'aws'),
  ('gcp', 'GCP', 'CLOUD', 'AS396982', 'Google LLC', 'gcp'),
  ('azure', 'Azure', 'CLOUD', 'AS8075', 'Microsoft Corporation', 'azure'),
  ('digitalocean', 'DigitalOcean', 'HOSTING', 'AS14061', 'DigitalOcean, LLC', 'digitalocean'),
  ('linode', 'Linode', 'HOSTING', 'AS63949', 'Linode, LLC', 'linode'),
  ('vultr', 'Vultr', 'HOSTING', 'AS20473', 'Vultr Holdings, LLC', 'vultr'),
  ('hetzner', 'Hetzner', 'HOSTING', 'AS24940', 'Hetzner Online GmbH', 'hetzner'),
  ('ovh', 'OVH', 'HOSTING', 'AS16276', 'OVH SAS', 'ovh'),
  ('fastly', 'Fastly', 'CDN', 'AS54113', 'Fastly, Inc.', 'fastly'),
  ('imperva', 'Imperva', 'CDN', 'AS19551', 'Imperva, Inc.', 'imperva'),
  ('alibaba', 'Alibaba Cloud', 'CLOUD', 'AS45102', 'Alibaba Cloud LLC', 'alibaba'),
  ('oracle', 'Oracle Cloud', 'CLOUD', 'AS31898', 'Oracle Corporation', 'oracle'),
  ('ibm', 'IBM Cloud', 'CLOUD', 'AS36351', 'IBM Cloud', 'ibm'),
  ('rackspace', 'Rackspace', 'HOSTING', 'AS19994', 'Rackspace Hosting', 'rackspace')
ON CONFLICT ("id") DO NOTHING;
