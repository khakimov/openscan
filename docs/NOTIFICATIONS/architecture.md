# Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Scheduled/Manual Scan                                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Restate Worker: DeviceScanner.executeScan()                    │
│ - Runs port scan (masscan → rustscan → nmap)                   │
│ - Enriches with CVE data (Necto API)                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Postback
┌─────────────────────────────────────────────────────────────────┐
│ /api/internal/scan-results                                      │
│ - Universal postback router                                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ PortScanHandler.handleSuccess()                                │
│ 1. Update scan_runs.status = 'SUCCEEDED'                       │
│ 2. Persist result_summary (ports + CVEs)                       │
│ 3. ✅ Change Detection                                         │
│    - Load fresh scan data (CRITICAL FIX)                       │
│    - Load previous successful scan for device                  │
│    - Diff current vs previous                                  │
│    - Filter meaningful changes                                 │
│ 4. ✅ Create Notifications with Catalog                        │
│    - Use notification catalog for messages                     │
│    - Atomic check-and-insert with transactions (CRITICAL FIX)  │
│    - Database-level unique constraint (belt-and-suspenders)    │
│    - Persist to notifications table                            │
│ 5. Trigger Delivery                                            │
│    - In-app (stored in DB, shown in UI)                        │
│    - Email (for CRITICAL/HIGH severity) [FUTURE]               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Sees Notification                                          │
│ - Bell icon with badge count                                   │
│ - Notification sheet/dropdown                                  │
│ - Email (future feature)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **PortScanHandler** | Orchestrates change detection after scan persist | `apps/user-application/src/server/postback/handlers/port-scan.ts:491` |
| **ChangeDetector** | Diffs scans, emits normalized change events | `apps/user-application/src/server/notifications/change-detector.ts` |
| **NotificationCatalog** | Centralized message templates and severity maps | `packages/data-ops/src/notifications/catalog.ts` |
| **NotificationQueries** | CRUD operations with atomic deduplication | `packages/data-ops/src/queries/notifications/` |
| **UI Components** | Bell icon, dropdown, notification page | `apps/user-application/src/components/notifications/` |
| **Server Functions** | TanStack Start API layer | `apps/user-application/src/server/notifications.ts` |

---
