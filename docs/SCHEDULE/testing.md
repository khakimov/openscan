# Testing Strategy

> References: `apps/user-application/src/server/__tests__/security-vulnerabilities.test.ts#L312-L398`, `apps/restate-worker/src/device-scanner-service.ts` (TODO: TestDriver harness), legacy smoke tests `legacy/app/back/footprint_app/celery_app/periodic_tasks_low_frequency_scanner.py`.

## Current Coverage

- **Server authorization:** `security-vulnerabilities.test.ts` ensures schedule deletion requires an organization-scoped request and that cross-org access is blocked.
- **Query helpers:** The data-ops layer is covered indirectly through existing device tests; we plan to add dedicated unit tests using the in-memory SQLite harness once the better-sqlite3 binary mismatch is resolved.

## Planned Work

- **Restate TestDriver:** Implement deterministic timer tests for `device-scanner-service` to exercise reschedule-first, backoff, and auto-pause flows (mirrors legacy Celery integration tests executed in `periodic_tasks_low_frequency_scanner`).
- **Lease limits:** Add tests around `acquireScanSlot` to verify TTL cleanup and concurrency errors under contention.
- **UI hooks:** Vitest/react-testing-library coverage for the optimistic mutation paths in `schedule-queries.ts`.
