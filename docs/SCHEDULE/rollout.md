# Rollout & Open Items

> References: deployment checklist in `apps/restate-worker/README.md#L400-L470`, server feature flag wiring in `apps/user-application/src/server/schedules.ts`.

## Rollout Plan

1. **Feature flag:** keep schedule creation behind an organization-scoped flag until Restate infrastructure is stable.
2. **Backfill:** migrate any legacy schedules by translating Celery `Task` entries into `scan_schedules` rows (script TBD).
3. **Shadow mode:** run Restate timers alongside legacy cron for a week, verifying parity via audit events.
4. **Cutover:** disable legacy scheduler queries once shadow metrics match.

## Outstanding Questions

- Migration tooling for existing Celery schedules (depends on legacy data export).
- SLA for lease TTL extensions—should long-running scans extend beyond 30 minutes automatically or page operators?
- Restate object lifecycle cleanup to handle deleted schedules (garbage collect state after retention window).
