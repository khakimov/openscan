# Scan Operations Reference

**Scan Operations:**

- **Start (Port scan launch)**:
  - Accepts mutation via `trpc.device.startScan` (`apps/user-application/src/trpc/routers/device.ts:475`), enforcing session auth and preset validation.
  - Builds Restate payload with `buildScanInputFromPreset` and delegates to `startPortScanWorkflow` (`apps/user-application/src/server/discovery/workflows/port-scan/start.ts:14`).
  - Service `portScanService.startScan` orchestrates workflow (`apps/user-application/src/server/discovery/services/port-scan-service.ts:28`): generates workflow ID, records the run, links devices, and kicks Restate through the HTTP client.
  - Database tracking happens through `scanRecorder.createRun/markRunRunning/updateWorkflowStatus` (`apps/user-application/src/server/discovery/services/scan-recorder.ts:8`), which wrap `createScanRun` and status updaters in data-ops.
  - UI trigger uses `useStartDeviceScanMutation` for optimistic active-scan rows and cache invalidation (`apps/user-application/src/queries/device-queries.ts:206`).

- **Persist Results (Postback processing)**:
  - Restate posts to `/api/internal/scan-results`, handled by `port-scan` postback (`apps/user-application/src/server/postback/handlers/port-scan.ts:274`).
  - Handler builds unified `portSnapshots`/stats and writes them with `updateScanRunStatus` (`packages/data-ops/src/queries/scans.ts:153`) plus workflow status via `updateScanWorkflowStatus` (`packages/data-ops/src/queries/scans.ts:126`).
  - Success path marks the run `SUCCEEDED` and queues HTTPx follow-up probes; failures fall back to `updateScanRunStatus(..., 'FAILED')` (`apps/user-application/src/server/postback/handlers/port-scan.ts:556`).

- **List (Query + UI consumption)**:
  - `trpc.scan.list` validates project access and pulls data through `getScanRunsWithArtifacts` (`apps/user-application/src/trpc/routers/scan.ts:33`).
  - Data access layer joins runs/devices in `getScanRunsWithArtifacts` (`packages/data-ops/src/queries/scans.ts:11`), supporting optional projectId filtering.
  - React hook `useScanList` wraps the tRPC query with 30s polling when any run is `PENDING`/`RUNNING` (`apps/user-application/src/queries/scan-queries.ts:7`).
  - `ScansTable` renders the dataset with background refetch indicator (`apps/user-application/src/features/scans/components/table/index.tsx:62`).

Use this sheet when adjusting scan lifecycles—update the references above whenever the underlying code moves so onboarding engineers (and future you) have a precise map from UI ➝ tRPC ➝ data-ops ➝ workflow orchestration.
