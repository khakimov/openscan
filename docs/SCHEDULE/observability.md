# Monitoring & Observability

> References: `apps/restate-worker/src/device-scanner-service.ts#L140-L520`, `packages/data-ops/src/queries/scan-schedule-limits.ts#L118-L143`, legacy Grafana inputs `legacy/app/back/footprint_app/reporting/assets_counter.py`.

## Logging

- Restate handlers emit structured logs for each lifecycle event (`logger.info('Scheduling device scan'...)`, `logger.info('Executing scheduled scan'...)`). These mirror the legacy Celery logs that powered Kibana dashboards.
- Server functions log every mutation call with schedule/device identifiers (`schedules.ts#L285-L412`).

## Metrics & Dashboards

- `getActiveLeasesByOrganization` exposes per-org concurrency counts for Prometheus-style scraping or scheduled analytics.
- Planned metrics include execution lag, failures, and auto-pause totals—matching the legacy dashboards that tracked `ActiveTask` throughput.

## Alerting Hooks

- Auto-paused events appear both in audit tables and as WARN logs (`handleFailure` paths in `device-scanner-service.ts#L668-L752`). Future work will feed these into the notification router similar to how the legacy `NotificationsController` escalated repeated failures.
