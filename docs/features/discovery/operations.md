# Discovery Workflow Operations

## Start Discovery (Domain Entry)
- **Render and hydrate onboarding view**: `apps/user-application/src/routes/onboarding.$projectId.discovery.tsx:30` ensures onboarding status + discovery devices are prefetched via `context.trpc.*.queryOptions()` before the page mounts.
- **Collect target + reuse shared hook**: `apps/user-application/src/routes/onboarding.$projectId.discovery.tsx:94` wires the form into `useDiscoveryWorkflow`, which centralizes workflow orchestration.
- **Validate domain input**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:125` runs `validateTarget` guards (RFC length, localhost ban, injection characters) before any network call.
- **Trigger discovery mutation**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:196` calls `startDiscoveryMutation.mutate` once validation passes and resets local selection state.
- **Send request through query factory**: `apps/user-application/src/queries/discovery-queries.ts:55` wraps `startDiscoveryWorkflow` in `useMutationWithToast`, providing consistent success/error handling and cache invalidation.
- **Launch Restate workflow**: `apps/user-application/src/server/discovery/workflows/discovery-handler.ts:26` validates `StartDiscoverySchema`, persists a `scanRun` via `createScanRun`, builds the postback URL, and invokes `getRestateHttpClient().startDiscovery`.
- **Execute workflow & emit postback**: `apps/restate-worker/src/discovery-service.ts:95` runs tool orchestration, deduplicates devices, and `postUniversalPostback` sends a `DISCOVERY` payload back to the app.

## Monitor Workflow Status
- **Poll status in hook**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:146` binds a `useQuery` to `discoveryQueries.workflowStatus` so UI state reacts to Restate progress.
- **Query factory config**: `apps/user-application/src/queries/discovery-queries.ts:13` builds the status query with a 3s refetch interval until `isCompleted`/`isFailed` flips true.
- **Read workflow state from DB**: `apps/user-application/src/server/discovery/workflows/discovery-handler.ts:138` loads the persisted `scanRun`, maps internal workflow states to `RUNNING|COMPLETED|FAILED`, and returns counts for the UI.
- **Persist results on postback**: `apps/user-application/src/server/postback/handlers/discovery.ts:88` receives the worker payload, writes `resultSummary` through `updateScanRunStatus`, and marks the workflow `SUCCEEDED` so polling flips to completed.

## Fetch and Display Results
- **Auto-fetch once completed**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:167` enables the results query only after status reports completion.
- **Retrieve normalized payload**: `apps/user-application/src/queries/discovery-queries.ts:33` calls `getScanWorkflowResultsDB`, which pulls the stored summary and hands it to `normalizeDiscoveryResult`.
- **Normalize for UI contract**: `apps/user-application/src/features/discovery/utils/normalize-workflow-results.ts:72` converts the raw summary into `NormalizedDiscoveryResult`, ensuring consistent `results`, `uniqueSubdomains`, and timestamps for tables/cards.
- **Render selection table**: `apps/user-application/src/routes/onboarding.$projectId.discovery.tsx:187` displays discovery rows sourced from the hook so analysts can cherry-pick assets.

## Promote Discovery Results to Devices
- **Capture selected hosts**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:222` prepares `{host, ip}` tuples (skipping unresolved IPs) before calling the mutation.
- **Mutate through device factory**: `apps/user-application/src/queries/device-queries.ts:259` sends the payload to `trpcClient.device.createFromDiscovery.mutate`, wraps success toast messaging, and invalidates device + onboarding caches.
- **Enforce access + persist devices**: `apps/user-application/src/trpc/routers/device.ts:538` validates project access, derives `organizationId`, and calls `createMultipleDevicesFromDiscovery`.
- **Deduplicate + insert**: `packages/data-ops/src/queries/devices.ts:588` skips existing host/IP combos within the organization/project, inserts new device rows, and attaches primary IP records when present.
- **Refresh onboarding list**: `apps/user-application/src/trpc/routers/onboarding.ts:189` exposes `discoveryDevices` so the onboarding view reflects newly promoted assets on the next query refresh.

## Error & Audit Trail
- **Workflow failures**: `apps/user-application/src/server/postback/handlers/discovery.ts:206` marks the scan `FAILED`, raises analytics events, and bubbles the error message back through status polling.
- **User-facing toasts**: `apps/user-application/src/features/discovery/hooks/use-discovery-workflow.ts:203` and `:255` emit success/failure notifications so analysts see immediate feedback without inspecting logs.
- **Logging & observability**: `apps/restate-worker/src/discovery-service.ts:239` and `apps/user-application/src/server/discovery/workflows/discovery-handler.ts:47` log scan IDs, targets, and counts, enabling tracing from UI action → worker → postback.
