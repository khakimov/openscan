# Comparison: SEC vs Legacy Footprint

### Pipeline Architecture

#### SEC (Modern) Pipeline

```
Restate worker → port scan postback handler
    ↓ normalize resultSummary (ports + CVE enrichment)
persist scanRuns.resultSummary
    ↓
detectScanChanges(deviceId, currentScan, orgId)
    ↳ getBaselineScan(...) → previous SUCCEEDED scan run
    ↳ diffPorts(...) → NEW_PORT / CLOSED_PORT
    ↳ diffCVEs(...) → NEW_CVE / CVE_SEVERITY_INCREASE (only HIGH/CRITICAL)
    ↓
createNotifications([...changes]) → fingerprint dedupe + suppress windows
    ↓
notifications table
    ↓
NotificationBell / NotificationList render in UI
```

**Key Points**:
- Baseline is the last stored `scanRuns.resultSummary`
- Change detector produces normalized change objects before hitting the DB
- Messages are centralized in notification catalog
- Dedupe uses transactions + unique index

#### Legacy Footprint Pipeline

```
Celery results processor → parse per-device JSON (ports, OS, vulns)
    ↓
OperatingSystem.update_daemons(newDaemons)
    ↳ daemon.compare_to(newDaemon)
        • New daemon? insert_daemon → Notification.new_device / new_webapp
        • Status flip? Notification.up_status_app / down_status_app
        • Parameter change? Notification.change_daemon_product/version
        • First-time up? search_vulnerabilities()
            ↳ vulnerability_scanner.compare(...) → added/fixed/unfixed CVEs
                • Send Notification.critical_new / fix / unfix etc.
    ↓
Notification.create_notification()
    ↳ hash(message) + elem unique constraint
    ↳ store tenant/module/priority, bump timestamp on duplicate
    ↓
REST view → convert_notifications(...) → front end
```

**Key Points**:
- Baseline is the live ORM state (daemons/vulnerabilities)
- Notification templates live in `notifications/messages.py`
- Dedup is enforced at the DB layer via unique index and `get_or_create`

### Feature Comparison

| Feature | SEC (Modern) | Legacy Footprint |
|---------|-------------|------------------|
| **Raw ingest** | Snapshot recorded to `scanRuns.resultSummary` | Merge into persisted device/app models |
| **Baseline lookup** | Explicit `getBaselineScan` (previous SUCCEEDED run) | Implicit current state in DAOs |
| **Port diff** | Functional diff of JSON arrays | Application logic in `OperatingSystem.update_daemons` |
| **CVE diff** | `diffCVEs` against enrichment JSON | `vulnerability_scanner.compare` against ORM |
| **Notification text** | Centralized catalog module | `notifications/messages.py` |
| **Dedup** | Transactions + unique index | `message_hashed` + element unique constraint with `get_or_create` |
| **Presentation** | React components render API response | Django converts ORM objects to response dicts |

### Patterns Adopted from Legacy

1. ✅ **Template/Catalog Pattern**: Centralized messaging in `catalog.ts` (like `messages.py`)
2. ✅ **Unique Constraint**: Database-level deduplication (like `message_hashed` + `elem`)
3. ✅ **Atomic Creation**: Transaction-based check-and-insert (like `get_or_create`)
4. ✅ **Tenant Scoping**: Org-wide filtering (like `tenant` FK)
5. ✅ **Suppress Windows**: Time-based deduplication
6. ✅ **Severity Mapping**: Centralized port severity map

### Improvements Over Legacy

1. ✅ **Snapshot-Based Baselines**: Explicit scan history (not live state mutation)
2. ✅ **Functional Change Detection**: Pure functions (not ORM side effects)
3. ✅ **Type Safety**: Zod validation + TypeScript (not Django ORM)
4. ✅ **Modern Stack**: TanStack Query + React 19 (not Django templates)
5. ✅ **Drizzle ORM**: Type-safe queries (not raw SQL)
6. ✅ **Structured Fingerprints**: Explicit fingerprint format (not message hashing)

---
