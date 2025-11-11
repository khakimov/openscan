# Notification System Testing Guide

This guide walks through validating the end-to-end notification pipeline: scan ingestion, change detection, notification persistence, deduplication, and email routing. It is intended for new team members onboarding onto the security notifications domain as well as experienced developers running focused regression checks.

---

## 1. System Overview

**What we alert on**
- New or closed ports detected on a device.
- Service drift (version or product metadata changes on an existing port).
- CVE lifecycle events: newly discovered CVEs, severity increases, fixes, and regressions.
- Upcoming enhancements reuse the same pipeline (e.g., OS drift) and follow the patterns documented here.

**Key architecture components**
- Change detector modules: `apps/user-application/src/server/notifications/change-detector/*`
  - `diff-ports.ts` for new/closed ports.
  - `diff-service-drift.ts` for service metadata changes.
  - `diff-cves.ts` for CVE lifecycle events.
  - `baseline.ts` for retrieving historical scans via `getScanHistory`.
- Notification catalog & helpers: `packages/data-ops/src/notifications/catalog.ts` and `packages/data-ops/src/notifications/helpers.ts`.
- Database schema: `packages/data-ops/src/schema/notifications.ts`.
- Notification queries: `packages/data-ops/src/queries/notifications/*`.
- Email severity settings: `packages/data-ops/src/queries/notifications/settings.ts`.
- Tests worth scanning before changes:
  - `apps/user-application/src/server/notifications/tests/cve-lifecycle.test.ts`
  - `apps/user-application/src/server/notifications/tests/service-drift.test.ts`
  - `apps/user-application/src/server/__tests__/notifications-integration.test.ts`
  - `packages/data-ops/src/queries/__tests__/notification-settings.test.ts`

**How deduplication works**
- Each notification has a deterministic `fingerprint` (see `utils.ts`) and an `expiresAt`/`suppressUntil` window.
- Ports: 6-hour suppress window (`HOURS_6_MS` constant in helpers).
- CVEs: 24-hour suppress window (`DAY_MS`).
- A new notification with an existing active fingerprint is suppressed until expiration or explicit cleanup.

**Org-wide read state**
- The `notifications.readAt` column is organization-scoped. When any admin marks notifications as read via `markAllNotificationsAsRead` every user in that organization sees them as read.
- This mirrors the legacy footprint implementation (`legacy/app/back/footprint_app/notifications/models.py`).

---

## 2. Test Prerequisites

- Local dev environment with `pnpm` installed (`pnpm install` already executed).
- Seed data or fixtures that create an organization, user, device, and project.
- Ability to run targeted Vitest suites (full DB tests may require resolving the `better-sqlite3` binary mismatch noted in `docs/NOTIFICATIONS/testing.md`).
- Optional: Access to the port scanner / orchestrator for live end-to-end scans. For fast iteration, you can craft `scan_runs` rows manually using fixtures from `change-detector` tests.

> **Tip:** For backend-only testing, leverage the factory helpers in `apps/user-application/src/server/notifications/tests/factories.ts`. They mirror production payloads and keep fixtures consistent.

---

## 3. Core Test Scenarios

Each scenario includes **Goal**, **Steps**, **Validation**, and **Success criteria**. Whenever possible, point QA to concrete files/commands.

### 3.1 New Port Discovery → Notification Created

- **Goal:** Ensure a new open port creates a `NEW_PORT` notification.
- **Steps:**
  1. Baseline scan: create a baseline using `createScanSummary()` (see `port-fingerprints.test.ts`) or trigger a real scan.
  2. Second scan: include a new port (e.g., TCP/22 with `ssh` service).
  3. Run `detectScanChanges()` via the change-detector test harness or allow the orchestrator to process the postback.
- **Validation:**
  - Query: `SELECT type, severity, title, fingerprint FROM notifications WHERE organization_id = 'org_123' ORDER BY created_at DESC LIMIT 5;`
  - Expect type `NEW_PORT`, severity `HIGH` for port 22, and fingerprint `new_port:{deviceId}:tcp:22:openssh`.
  - UI: Notifications badge increments.
- **Success:** Exactly one notification created, message references port/service, duplicate scans within six hours suppress new notifications.

### 3.2 Duplicate Suppression (Deduplication)

- **Goal:** Rescanning inside the suppress window should not emit duplicates.
- **Steps:**
  1. Ensure scenario 3.1 created an active notification.
  2. Run another scan with identical port data within 6 hours.
- **Validation:**
  - Count remains unchanged: `SELECT COUNT(*) FROM notifications WHERE organization_id = 'org_123' AND type = 'NEW_PORT';`
  - Logs (see `logger.info` in helpers) show suppression.
- **Success:** No new rows inserted. If duplicates appear, inspect fingerprint construction in `diff-ports.ts` and ensure suppress window logic is respected.

### 3.3 Email Severity Filtering

- **Goal:** Email worker respects per-organization severity thresholds.
- **Steps:**
  1. Update settings via UI (Account dialog) or server call:
     ```ts
     await updateEmailSeveritiesOrDisable({ organizationId: 'org_123', emailAllowedSeverities: ['CRITICAL'] });
     ```
  2. Verify DB: `SELECT email_allowed_severities FROM organization_notification_settings WHERE organization_id = 'org_123';`
  3. Create two notifications: one `HIGH`, one `CRITICAL` (reuse port changes or CVE events).
  4. Invoke:
     ```ts
     const pending = await getPendingEmailNotifications('org_123');
     ```
- **Validation:** `pending` should contain only the `CRITICAL` notification. Tests exist in `packages/data-ops/src/queries/__tests__/notification-settings.test.ts`.
- **Success:** Filtering matches stored severities; defaults (`['CRITICAL','HIGH']`) apply when no row exists.

### 3.4 Disable All Alerts (Empty Array Contract)

- **Goal:** Confirm that an empty severity array blocks email delivery.
- **Steps:**
  1. Disable via UI (Account dialog toggle) or directly:
     ```ts
     await updateEmailSeveritiesOrDisable({ organizationId: 'org_123', emailAllowedSeverities: [] });
     ```
  2. Verify DB stores `[]`.
  3. Generate any notification.
  4. Call `getPendingEmailNotifications('org_123')`.
- **Validation:** Function returns `[]`. Ensure UI reflects disabled state (toggle off).
- **Success:** No emails queued, enabling later with e.g., `['CRITICAL','HIGH']` restores filtering.

### 3.5 CVE Lifecycle (Fix & Regression)

- **Goal:** Validate CVE fix/regress detection with 3-scan logic.
- **Steps:**
  1. Use test helper `createScanSummary()` to craft three consecutive scans (`scan1`, `scan2`, `scan3`). See `cve-lifecycle.test.ts` for fixtures.
     - `scan1`: CVE present.
     - `scan2`: CVE absent (fixed).
     - `scan3`: CVE returns (regressed).
  2. Run `diffCVEs(scan3.summary, scan2.summary, scan1.summary, ...)`.
- **Validation:** Expect both `CVE_FIXED` (between scan1 & scan2) and `CVE_REGRESSED` (scan3 referencing scan1) notifications. Inspect severity and messages.
- **Success:** Notifications generated with correct fingerprints (`cve_fixed:{deviceId}:{cveId}`, etc.) and severity handling.

### 3.6 Service Drift Detection

- **Goal:** Service version changes yield `SERVICE_DRIFT`.
- **Steps:**
  1. Baseline: service version `1.2.0`.
  2. Next scan: version `1.4.0` (different `service.version`).
  3. Run `diffServiceDrift()` or the full detector.
- **Validation:** Notification data includes `oldVersion`, `newVersion`, `port`, `product`. See tests in `service-drift.test.ts`.
- **Success:** Single `SERVICE_DRIFT` notification with severity `INFO` (current default).

### 3.7 Org-Wide Read State

- **Goal:** Ensure marking as read affects all organization members.
- **Steps:**
  1. Seed notifications.
  2. Call `markAllNotificationsAsRead('org_123')`.
  3. Fetch notifications for another user in the same org (reuse GraphQL/API or DB query).
- **Validation:** `readAt` set for all notifications. UI for other user shows no unread badge.
- **Success:** Behavior matches `docs/NOTIFICATIONS/design-decisions.md` and legacy system.

### 3.8 Suppress Window Expiration & Fingerprint Reuse

- **Goal:** Confirm expired notifications allow new events with same fingerprint.
- **Steps:**
  1. Create notification (e.g., new port).
  2. Manually update `suppress_until` to a past timestamp.
  3. Run `expireNotifications()` (see `packages/data-ops/src/notifications/helpers.ts`).
  4. Re-run scan to emit same event.
- **Validation:** `is_active` flips to `0`, new notification created.
- **Success:** Pipeline reissues notification once previous one is expired.

---

## 4. Targeted Test Suites

Use these commands from repo root (adjust `pnpm` scripts if your shell lacks environment variables):

```bash
# Notification change detector unit tests
pnpm --filter user-application test:run src/server/notifications/tests/cve-lifecycle.test.ts

# Notification query tests (email settings, suppress windows)
pnpm --filter data-ops test:run src/queries/__tests__/notification-settings.test.ts

# End-to-end integration (requires working better-sqlite3 binary)
pnpm --filter user-application test:run src/server/__tests__/notifications-integration.test.ts
```

> **Heads-up:** If you hit the known `better-sqlite3` binary mismatch, follow `docs/NOTIFICATIONS/testing.md` for remediation steps or run the tests inside the CI container.

---

## 5. Troubleshooting Checklist

- **Notification missing**
  - Confirm scan data landed in `scan_runs` (`packages/data-ops/src/schema/orchestration.ts`).
  - Verify change detector executed (look for `[Notifications]` logger output).
  - Ensure notification not suppressed (check `fingerprint` + `suppress_until`).

- **Email worker returning wrong notifications**
  - Double-check `organization_notification_settings` for correct severities.
  - Restart process or wait for 5-minute cache TTL expiry (documented in `settings.ts`).
  - Inspect `packages/data-ops/src/queries/notifications/read.ts` guard for empty array behavior.

- **Regression detection not firing**
  - Ensure you pass `previousPreviousSummary` into `diffCVEs`.
  - CVE regression currently only triggers for severities `HIGH` and `CRITICAL` (matches `diff-cves.ts` logic).

- **UI not reflecting disabled alerts**
  - Confirm backend `getNotificationPreferences()` returns `vulnerabilityAlertsEnabled: false`.
  - Account modal uses `updateEmailSeveritiesOrDisable`; empty array disables alerts.

---

## 6. Additional Resources

- **Design docs:** `docs/NOTIFICATIONS/design-decisions.md` and `docs/NOTIFICATIONS/data-model.md`.
- **Legacy parity:** `legacy/app/back/footprint_app/notifications/` for historical behavior.
- **Feature work trackers:** look for `sec-77`, `sec-1y2`, `sec-mml` in Notion/Jira to understand context and future enhancements.
- **Screenshot pipeline (sec-77):** backend ready (`docs/SCREENSHOTS.md`); front-end tests pending—use this guide as template when adding gallery notifications.

---

## 7. Onboarding Tips

- Start by reading `change-detector/README.md` for module boundaries and flow diagrams.
- Run the unit tests in watch mode (`pnpm vitest --watch`) while editing diff modules; they provide fast feedback.
- When adding a new notification type, follow the existing pattern: catalog builder → helper → change-detector diff → tests → documentation.
- Keep documentation in sync: update `docs/NOTIFICATIONS/*` when behavior changes (suppression windows, new severities, etc.).

With these steps and references, you should be able to validate the notification system comprehensively and confidently iterate on new features.

