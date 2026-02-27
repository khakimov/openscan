# Schedules Operations

## Organization Schedule List
- **Prefetch in device route loader**: `apps/user-application/src/routes/_app.$organizationId.$projectId.assets.$deviceId.index.tsx:6` renders `DeviceScheduleList`, which relies on the shared hooks so TanStack Router loaders only need to ensure device context.
- **Fetch via query factory**: `apps/user-application/src/queries/schedule-queries.ts:55` calls `trpc.schedule.list.queryOptions(params)` to keep cache keys aligned with tRPC and support SSR hydration.
- **tRPC list procedure**: `apps/user-application/src/trpc/routers/schedule.ts:71` validates session org, loads schedules with `getSchedulesForOrganization`, and returns `normalizeScheduleList` so clients get ISO timestamps.
- **Data access**: `packages/data-ops/src/queries/scan-schedules.ts:142` filters by organization/status flags and orders recent-first, ensuring list + detail share identical data source.

## Device Schedule Panel
- **Reusable component**: `apps/user-application/src/components/shared/device-schedule-list.tsx:37` pulls schedules for a specific device using `useScheduleListByDevice`.
- **Device-scoped query**: `apps/user-application/src/queries/schedule-queries.ts:71` reuses `trpc.schedule.listByDevice.queryOptions({ deviceId })` so list + mutations stay in sync.
- **tRPC resolver**: `apps/user-application/src/trpc/routers/schedule.ts:108` verifies org ownership, calls `getSchedulesForDevice`, and normalizes the results before returning to the component.

## Schedule Detail View
- **Detail hook**: `apps/user-application/src/queries/schedule-queries.ts:84` exposes `useScheduleDetail`, returning `trpc.schedule.detail.queryOptions({ scheduleId })`.
- **Router logic**: `apps/user-application/src/trpc/routers/schedule.ts:138` fetches the DB record, hydrates Restate runtime state via `restateScheduleClient.getScheduleState`, and merges into the normalized response.
- **Normalization helper**: `apps/user-application/src/features/schedules/utils/normalize-schedule.ts:77` converts Date fields to ISO strings so UI tables never juggle `Date` objects.

## Create Schedule
- **Modal submission**: `apps/user-application/src/modals/CreateSchedule.tsx:83` invokes `useCreateScheduleMutation` with preset/frequency/dailyTime payload, defaulting to `startImmediately`.
- **Mutation wrapper**: `apps/user-application/src/queries/schedule-queries.ts:98` calls `trpcClient.schedule.create.mutate`, invalidates `scheduleQueries.list.base`, and refreshes the device-specific list.
- **tRPC create pipeline**: `apps/user-application/src/trpc/routers/schedule.ts:187` validates payload, guards device existence, resolves interval config, and persists via `createScanSchedule`.
- **Database write**: `packages/data-ops/src/queries/scan-schedules.ts:32` inserts or upserts schedule metadata, records an audit event, and returns the stored record.
- **Restate timer start**: `apps/user-application/src/trpc/routers/schedule.ts:249` calls `restateScheduleClient.scheduleDeviceScan` to arm the durable timer, surfacing partial failure if Restate call fails.
- **Queue orchestration**: `apps/restate-worker/src/device-scanner-service.ts:142` stores schedule config, schedules the first execution, and keeps the next invocation ID so cancellation/resume works.

## Pause Schedule
- **UI trigger**: `apps/user-application/src/components/shared/device-schedule-list.tsx:58` routes pause actions through `usePauseScheduleMutation`.
- **Inline optimistic update**: `apps/user-application/src/queries/schedule-queries.ts` swaps `status` → `PAUSED` in both list and detail caches before the server responds (Pattern 2 from `docs/optimistic-ui.md`), rolling back on error.
- **tRPC pause handler**: `apps/user-application/src/trpc/routers/schedule.ts:313` updates DB via `pauseScanSchedule`, then tells Restate to pause timers with `restateScheduleClient.pauseSchedule`.
- **Data-ops audit**: `packages/data-ops/src/queries/scan-schedules.ts:203` flips `isActive` false, stamps `pausedAt`, and writes a `PAUSED` event for history.

## Resume Schedule
- **UI trigger**: `apps/user-application/src/components/shared/device-schedule-list.tsx:73` calls `useResumeScheduleMutation` when analysts hit “Resume”.
- **Inline optimistic update**: `apps/user-application/src/queries/schedule-queries.ts` restores `status: 'ACTIVE'` with failure counters cleared (Pattern 2 from `docs/optimistic-ui.md`), giving instant feedback.
- **tRPC resume workflow**: `apps/user-application/src/trpc/routers/schedule.ts:349` runs `resumeScanSchedule`, then `restateScheduleClient.resumeSchedule` to restart timers and return the next run timestamp.
- **DB update**: `packages/data-ops/src/queries/scan-schedules.ts:237` resets pause metadata and logs a `RESUMED` event so auditors know why the schedule restarted.

## Delete Schedule
- **UI confirm**: `apps/user-application/src/components/shared/device-schedule-list.tsx:93` opens a confirmation dialog before calling `useDeleteScheduleMutation`.
- **Simple invalidation**: `apps/user-application/src/queries/schedule-queries.ts` performs the delete and invalidates the schedule list on success. No optimistic delete needed—cleaner and less error-prone.
- **tRPC deletion**: `apps/user-application/src/trpc/routers/schedule.ts:394` soft-deletes via `deleteScanSchedule` and instructs Restate to purge timers with `deleteSchedule`.
- **Data-ops logging**: `packages/data-ops/src/queries/scan-schedules.ts:318` marks status `DELETED`, clears activity, and records an audit event.

## Execution & Concurrency Pipeline
- **Concurrency gate (allow)**: `apps/user-application/src/routes/api/internal/schedules/can-execute.tsx:66` authenticates worker calls, validates payload, and tries `acquireScanSlot` to enforce per-org limits.
- **Lease release**: `apps/user-application/src/routes/api/internal/schedules/release-slot.tsx:58` frees concurrency slots after Restate finishes a scan by calling `releaseScanSlot`.
- **Worker execute**: `apps/restate-worker/src/device-scanner-service.ts:211` schedules the next run, acquires concurrency via the HTTP API, triggers the port scan, and posts results back to the app.
- **Auto-pause logic**: `apps/restate-worker/src/device-scanner-service.ts:385` (not shown above) increments `STATE_KEYS.CONSECUTIVE_FAILURES`, classifies errors, and issues `AUTO_PAUSE` postbacks when thresholds trip.
- **Runtime state inspection**: `apps/restate-worker/src/device-scanner-service.ts:460` exposes `getScheduleState`, which the tRPC detail handler surfaces alongside normalized DB data for diagnostics.
