# Implementation Status

### ✅ Completed Features

#### Core Infrastructure
- [x] Database schema with `now()` and `updatedAt()` helpers
- [x] Unique index on `(organizationId, fingerprint)` for atomic deduplication
- [x] Suppress windows: 6h for ports, 24h for CVEs
- [x] Data-ops CRUD helpers (create, list, markRead, getUnreadCount)
- [x] Drizzle migration workflow (`pnpm drizzle:generate`, `pnpm drizzle:migrate`)

#### Change Detection
- [x] Port diffing logic (NEW_PORT, CLOSED_PORT)
- [x] CVE diffing logic (NEW_CVE, CVE_SEVERITY_INCREASE)
- [x] Baseline selection (last successful scan for device)
- [x] **Bug Fix**: Use `cveId` field (not `id`) for CVE map keys
- [x] **Bug Fix**: Join on `runId` (not `scanRunId`) in baseline query
- [x] **Bug Fix**: Extract service names from objects (not `[object Object]`)
- [x] **Critical Fix**: Pass fresh scan data with updated `resultSummary` to change detector

#### Notification Catalog
- [x] Centralized message templates (`PORT_SECURITY_MESSAGES`)
- [x] Port severity mapping (`PORT_SEVERITY_MAP`)
- [x] Builder functions: `createNewPortNotification()`, `createClosedPortNotification()`, `createNewCVENotification()`, `createCVESeverityIncreaseNotification()`
- [x] Helper functions: `mapCVESeverityToNotificationSeverity()`, `getSeverityOrder()`

#### Deduplication & Race Conditions
- [x] **Critical Fix**: Atomic check-and-insert with database transactions
- [x] **Belt-and-Suspenders**: Unique constraint on `(organizationId, fingerprint)`
- [x] Suppress window enforcement (skips duplicate notifications)

#### In-App Notifications
- [x] Server functions (getNotifications, markAsRead, markAllAsRead, getUnreadCount)
- [x] TanStack Query hooks with 30-second polling
- [x] Bell icon UI with unread badge
- [x] Notification sheet/dropdown
- [x] **Design Decision**: Org-wide read state (not per-user) for security events

#### Integration
- [x] Port scan postback handler integration
- [x] Change detection invoked after result persist
- [x] **Critical Fix**: Stale scan data bug resolved (pass fresh `resultSummary`)

### 📋 Pending Features (Future Phases)

- [ ] Email delivery for CRITICAL/HIGH notifications
- [ ] Refactor change detector to use catalog functions (currently uses inline messages)
- [ ] Partial unique index with `WHERE suppressUntil > CURRENT_TIMESTAMP` (currently full index)
- [ ] Message hashing for secondary deduplication (fingerprints are structured strings)
- [ ] Module taxonomy (currently only type + severity)
- [ ] Batch cleanup jobs for expired notifications
- [ ] Per-device rate limiting (10/day cap)
- [ ] Webhook integrations (Slack, Discord, PagerDuty)
- [ ] User preference system

---
