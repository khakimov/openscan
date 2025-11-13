# Database Migrations

## Current Migration Sequence

```
0000 → Initial schema (devices, users, auth)
0001 → Additional tables
0002 → Schema updates
0003 → HTTPx probes simplification
0004 → Additional updates
0005 → Notifications table (CONSOLIDATED) ⭐
0012 → Organization notification settings
```

## Migration 0005: Notifications (Consolidated)

**Purpose:** Creates the complete notifications table with all columns in final state.

**Key features:**
- Fingerprint-based deduplication
- Time-based suppress windows (6h for ports, 24h for CVEs)
- Partial unique index (`WHERE is_active = 1`)
- Module categorization (NETWORK_SECURITY, VULNERABILITY_MANAGEMENT, GENERAL)
- Email delivery tracking
- Message hash for secondary deduplication

**Replaces:** Original migrations 0005-0011 (consolidated for MVP simplicity)

## Fresh Deployment

To deploy to a new environment:

```bash
# From project root
cd apps/user-application

# Apply all migrations
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0000_gigantic_alex_wilder.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0001_mushy_gertrude_yorkes.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0002_material_madripoor.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0003_httpx_probes_simplification.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0004_needy_sleepwalker.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0005_notifications_consolidated.sql
wrangler d1 execute sec-db --remote --file=../../packages/data-ops/migrations/0012_org_notification_settings.sql
```

## Schema Verification

Verify notifications table schema:

```bash
wrangler d1 execute sec-db --remote --command="SELECT name FROM pragma_table_info('notifications');"
```

Expected columns:
- id, organization_id, user_id, device_id, scan_run_id
- type, severity, **module** ⭐
- title, message, data
- fingerprint, suppress_until, message_hash, is_active
- read_at, email_sent, email_sent_at
- created_at, updated_at

## Notes

- **Module column** (added in consolidated migration): Categorizes notifications by domain
  - `NETWORK_SECURITY`: Port changes, network events
  - `VULNERABILITY_MANAGEMENT`: CVE discoveries, severity changes
  - `GENERAL`: Service drift, misc. events

- **Partial unique index**: Allows fingerprint reuse after suppress window expires
  - Index only applies when `is_active = 1`
  - Scheduled cleanup job sets `is_active = 0` after suppress window

- **Migration gap (0006-0011)**: Intentionally skipped - consolidated into 0005 for MVP simplicity
