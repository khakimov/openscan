# Legacy Notification System – Architecture Notes

This document captures how the legacy footprint platform handled notifications end‑to‑end. It is based on code review of `legacy/app/back`, with the goal of identifying patterns we might want to adapt in the current SEC application (`apps/user-application`) and its data layer (`packages/data-ops`).

---

## 1. High-Level Flow

```
Scanner completes → result processors normalize data → notification builders
    ↓                                   ↓
 (Celery workers, scanners/*)      Notification.create_* helpers
    ↓                                   ↓
            Notification model (Django ORM, SQLite/Postgres)
                           ↓
                  REST controllers (Django views)
                           ↓
           Front-end adapters format payload for UI
```

### 1.1 Data Path From Scanners to DB

1. **Scan execution**  
   - Scanning tasks (port scans, web scans, advanced scanner jobs) are queued via Celery (`footprint_app/celery_app/task_launcher.py`).  
   - Workers report progress/backpressure through `scanners/status_notifier.py`, which posts messages back to a “console” queue.

2. **Result processors**  
   - After a scan completes, processors such as `scanners/advanced_scanner/advanced_scanner_results_processor.py` compute diffs (new vulns, status changes, etc.).
   - When a change is detected, processors call `Notification.<scenario>()` helpers to request a notification.

3. **Notification creation**  
   - Each helper ultimately calls `Notification.create_notification()` (see §2.1).  
   - `create_notification` is responsible for deduping, timestamp updates, tenant scoping, and persistence.

4. **Storage**  
   - The `Notification` Django model (`footprint_app/notifications/models.py`) writes to the `notifications` table with fields such as `priority`, `module_label`, `type_label`, `message_hashed`, `checked`, `tenant`, and FK references for element/source.

### 1.2 Retrieval and Presentation

1. **API access**  
   - API views (e.g. `footprint_django/api/console/.../technical_context_notifications_view.py`) pull the latest notifications for a tenant/context via ORM filters.

2. **Serialization**  
   - Responses are shaped through `footprint_app/front_interface/common.convert_notifications`, producing a consistent payload (`id`, `refId`, `priority`, `message`, `module`, `type`, `timestamp`, etc.).

3. **UI**  
   - Front-end clients consume this payload to render notification lists, badges, and counts. (The legacy repo does not include the React code, but the REST responses are ready for UI consumption.)

---

## 2. Key Patterns in the Legacy System

### 2.1 Atomic Deduplication

- **Mechanism**: The model defines `unique_together = ('message_hashed', 'elem')`. `Notification.create_notification` hashes the fully rendered message (`Notification.hash_message`) and calls `get_or_create` inside a transaction.
- **Behavior**:
  - On the first event, a row is inserted with the hash, element, tenant, metadata, and initial timestamp.
  - If the same message is emitted again for the same element, the ORM returns the existing row and simply touches `timestamp`, effectively producing “repeat notification” semantics without duplicates.
- **Why it works**: `get_or_create` runs under the database transaction, so even under high concurrency the unique constraint enforces a single row.
- **Transferable?** Yes. In `packages/data-ops` we currently perform read-then-write deduplication. Introducing a unique constraint on `(organizationId, fingerprint)` (or a compound key that includes device/scan context) plus an UPSERT/transaction would give us reliable dedupe without races (§4.2).

### 2.2 Notification Catalog / Template Library

- `footprint_app/notifications/messages.py` centralizes all copy, priority scores (1–100), module labels, and type labels.
- Each helper function (`Notification.critical_new`, `Notification.change_os_version`, etc.) pulls from this catalog, formats the placeholders, and pushes the final tuple into `create_notification`.
- **Benefit**: Enforces a consistent tone, severity mapping, and metadata. Adds new notification types by updating the catalog rather than scattering literals.
- **Transferable?** Yes. Our current SEC implementation builds titles/messages inline inside change detection logic. Porting that text into a catalog module (or at least a typed map) would simplify i18n, re-use, and severity tuning.

### 2.3 Thin Helper API

- Most subsystems (scanners, scheduler, email reports) never touch the ORM fields directly—they call a scenario-specific helper which ultimately funnels down to `create_notification`.
- **Benefit**: Limits the surface area; the helpers encode per-scenario metadata, the underlying dedupe logic remains untouched.
- **Transferable?** Partially. We already expose typed helpers across modules, but the legacy code demonstrates how deep the helper tree can go without chaos. Worth emulating for future notification types.

### 2.4 Read State as Persistent Field

- The `checked` integer indicates whether the notification has been acknowledged.  
  - `Notification.mark_as_fixed()` flips `checked` to `1`.
  - Filtering unread notifications in queries is as simple as `checked=0`.
- **Transferable?** We currently store `readAt` timestamps. The concept matches; their approach confirms persistent storage (not client-only) is important. We should ensure multi-user semantics meet our needs (see §4.3).

### 2.5 Tenant Isolation Everywhere

- Every query filters by `tenant` (`Notification.objects.filter(tenant=...)`). FK relationships (element/source) are tenant-aware.
- **Transferable?** Already implemented in SEC by storing `organizationId`. Good validation that per-tenant scoping has to be enforced at the query level, not just in business logic.

### 2.6 Data Shaping Ahead of the UI

- `convert_notifications` maps ORM fields into the exact shape expected by the front end.
- Reduces redundancy on the client; eliminates the need for the client to understand internal schema quirks.
- **Transferable?** We already map notifications in `NotificationList` higher in the stack, but mirroring this in a server serializer would let multiple clients reuse it (web, CLI, API).

### 2.7 Table Maintenance

- `scripts.delete_old_notifications()` deletes notifications older than a year in batches of 10k (to avoid long locks).
- Scheduled via `celery_periodic.delete_old_notifications`.
- **Transferable?** We have a similar helper (`deleteOldNotifications`) but the legacy approach emphasises batching. If our datasets grow, we should keep the chunked delete pattern.

---

## 3. Event Trigger Points

| Trigger Source | Code Path (Legacy) | Notification Helper | Notes |
| -------------- | ------------------ | ------------------- | ----- |
| Port/vuln scans | `scanners/..._results_processor.py`, `task_launcher.py` | `Notification.new_device`, `Notification.critical_new`, etc. | Called synchronously after processing results. |
| Task lifecycle (start/finish/fail) | `NotificationsController.start_task/finish_task` | `Notification.create_notification` with platform module | Distinguishes between success/failure states, fills templates with device/IP information. |
| Manual edits / revert actions | `NotificationsController.edit_application`, `revert_application` | Generates change notifications referencing user performing the action. |
| Email/Report deliveries | `NotificationsController.remediation_report_on_email_sent`, etc. | Creates audit-friendly notifications when reports are emailed. |
| Context views | `TechnicalContextsController.get_latest_notifications` | Pure retrieval; ensures lists are tenant- and element-scoped. |

Observed side-effect logging indicates dedupe prevented repeat spam while still updating timestamps when the same condition persisted.

---

## 4. Adaptation Recommendations for SEC

### 4.1 Bring the Template Pattern Forward

- Move titles/messages/severity metadata out of `change-detector.ts` into a dedicated catalog (could be a typed map in `packages/data-ops` or `apps/user-application/src/server/notifications/catalog.ts`).  
- Advantages: consistent copy, easier to unit test, simpler to internationalize later.

### 4.2 Strengthen Deduplication

- Add a unique index, e.g. `notifications_unique_idx` over `(organizationId, fingerprint)` in `packages/data-ops/src/schema/notifications.ts`.
- Update `createNotifications` to use `INSERT ... ON CONFLICT DO UPDATE SET suppress_until = EXCLUDED.suppress_until, updated_at = CURRENT_TIMESTAMP` or wrap `checkDuplicateNotification` + `insert` in a transaction.
- This mirrors the legacy `get_or_create` behavior and eliminates potential races we observed in the SEC code review.

### 4.3 Clarify Read Semantics

- Legacy behavior: `mark_all_notifications_as_read` is effectively tenant-wide.  
- SEC behavior today: `markAllNotificationsAsReadData` updates every notification for the organization, regardless of user.  
- If we need per-user read state, the legacy code doesn’t cover it; we would need a join table or JSON field to track user-level acks.

### 4.4 Consider Message Hashing for Fingerprints

- Instead of manually composing fingerprint strings (`new_port:${deviceId}:${port}`), hashing the final message (plus type) guarantees dedupe parity with the UI and protects us from accidental divergence.
- We can still retain structured fingerprint fields for analytics, but using the message hash for the unique constraint is robust.

### 4.5 Soft Catalog of Modules/Types

- Legacy modules (`Agents`, `Availability`, `Vulnerability`, etc.) map to UI filters and color coding.
- SEC currently relies solely on severity + type strings. Introducing a `module` concept would let us group notifications by domain if needed.

### 4.6 Batch Cleanup Jobs

- Reuse their “chunked delete by ID range” when we wire up scheduled retention in the SEC backend. It’s simple but avoids table locks.

---

## 5. Implementation Gaps vs Legacy

| Capability | Legacy | SEC (current) | Notes |
| ---------- | ------ | ------------- | ----- |
| Atomic dedupe | Unique constraint + `get_or_create` | Manual check-then-insert | Needs improvement (§4.2). |
| Template library | Centralized in `messages.py` | Hard-coded in change detector | Opportunity to centralize. |
| Multi-module taxonomy | Modules + types enums | Type enum only | Add modules if future filters require them. |
| Persistent read state | `checked` field | `readAt` timestamp | Equivalent concept; ensure consistent semantics. |
| Tenant scope | `tenant` FK on model | `organizationId` columns & filters | Already implemented. |
| Batch cleanup | Scripted, scheduled | `deleteOldNotifications` helper | Add batching if volume grows. |

---

## 6. Summary

The legacy notification subsystem demonstrates a mature, data-first approach:

1. **Atomic deduplication via DB constraints** prevents duplicate spam and naturally updates timestamps.  
2. **Template-driven messaging** enforces consistent copy and metadata.  
3. **Thin creation helpers** keep business logic clean and reuse dedupe everywhere.  
4. **Tenant-aware retrieval and presentation pipelines** ensure isolation and a consistent API payload.  
5. **Operational hygiene (cleanup scripts, chunked deletes)** keeps the table healthy long-term.

Adapting these ideas in SEC—particularly the unique constraint + template catalog—would strengthen the reliability of our in-app notifications while keeping code paths predictable.

