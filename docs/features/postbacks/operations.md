# Postbacks Operations

## Universal Handler (`/api/internal/scan-results`)
- **Authenticate worker call**: `apps/user-application/src/server/postback/auth.ts:29` checks the `Authorization` header against `WORKER_API_KEY` and rejects unauthenticated requests up front.
- **Parse and discriminate payload**: `apps/user-application/src/server/postback/index.ts:46` validates the minimal shape (`type`, `scanId`) before logging, so malformed JSON never reaches handlers.
- **Resolve handler from registry**: `apps/user-application/src/server/postback/handlers/registry.ts:166` registers PORT_SCAN, DISCOVERY, HTTPX, and schedule handlers; `postbackRegistry.get()` (`index.ts:134`) picks the correct implementation.
- **Delegate with analytics context**: `apps/user-application/src/server/postback/index.ts:232` invokes `handler.handle(...)`, then records success/failure metrics and returns a JSON response to the worker.

## Port Scan Postback (`type: PORT_SCAN`)
- **Locate scan run**: `apps/user-application/src/server/postback/handlers/port-scan.ts:121` looks up the Restate workflow ID via `getScanRunByRestateWorkflowId`; missing scans short-circuit with a 404-style response.
- **Filter noisy ports**: `port-scan.ts:144` keeps only `state === 'open'` ports with service metadata, then `normalizeServiceDetections` (`port-scan.ts:176`) drops low-confidence Nmap guesses using contracts policy.
- **Compute enrichment inputs**: `port-scan.ts:209` calls `getNectoAPIClient().enrichScanResults`, validating via `safeParseCVEEnrichment` before storing CVE summaries.
- **Persist result summary**: `port-scan.ts:259` builds canonical `portSnapshots`/`portScanStats` and writes them with `updateScanRunStatus(scanRun.id, 'SUCCEEDED', resultSummary)` (`port-scan.ts:305`), followed by `updateScanWorkflowStatus` (`port-scan.ts:319`) and a non-fatal `updateDevice` flag (`port-scan.ts:339`).
- **Queue follow-up probes**: `port-scan.ts:355` derives HTTP-capable ports via `extractPortsForHttpx` and dispatches Restate `startHttpxProbe`, wiring the same postback endpoint as callback.
- **Detect drift & notify**: `port-scan.ts:409` imports `detectScanChanges` after persisting the fresh summary, then calls `createNotifications` with suppress windows so downstream alerts stay in sync.
- **Return analytics**: `port-scan.ts:432` emits `buildSuccessAnalytics(AnalyticsEventTypes.PORTSCAN_SUCCESS, …)` to drive dashboards and retries.

## HTTPx Postback (`type: HTTPX`)
- **Deduplicate probe data**: `apps/user-application/src/server/postback/handlers/httpx.ts:80` collapses per-port duplicates, preferring HTTPS, successful status, screenshots, then higher status codes.
- **Normalize ports & artifacts**: `httpx.ts:85` coerces port numbers and logs invalid entries; `httpx.ts:138` creates/updates the canonical `scan_artifacts` row (using data-ops upsert).
- **Persist rich probe details**: `httpx.ts:164` uploads base64 screenshots to R2 via `uploadScreenshot`, `httpx.ts:212` stores scheme/status/title in `createHttpxProbe`, and `httpx.ts:232` records Wappalyzer detections with `createTechDetection`.
- **Handle failures gracefully**: `httpx.ts:268` marks the artifact `failed` with error messages instead of aborting the whole batch; outer catch logs full Drizzle error context (`httpx.ts:276`).
- **Summarize results**: `httpx.ts:290` logs success/failure counts and builds analytics payloads so downstream monitoring matches probe throughput.

## Result Merge & Exposure
- **Canonicalize snapshots**: `apps/user-application/src/server/postback/handlers/port-scan/utils.ts:95` constructs `PortSnapshot` entries (service, enrichment, timestamps) that feed both change detection and UI.
- **Share evidence resolver**: `packages/contracts/device/resolvers/normalizers.ts:176` normalizes HTTPx rows into scoring evidence; `packages/data-ops/src/queries/devices.ts:478` merges Nmap + HTTPx evidence via `resolveService`, attaches audit trails, and surfaces results to the device detail route.
- **Change detection inputs**: `apps/user-application/src/server/notifications/change-detector/index.ts:53` compares the freshly stored summary against the baseline to raise port/CVE/service drift notifications in one pass.
