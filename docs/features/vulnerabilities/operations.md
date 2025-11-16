# Vulnerabilities Operations

## Enrichment Pipeline
- **Request Necto mapping**: `apps/user-application/src/server/discovery/services/necto-api-client.ts:182` builds the vulnerability-mapping payload from filtered open ports + OS info, normalizing product/version pairs before hitting the Necto API.
- **Map CVE details**: `necto-api-client.ts:233` converts Necto responses into `CVEDetail` objects, deriving severity from CVSS scores and trimming long descriptions.
- **Store enrichment on postback**: `apps/user-application/src/server/postback/handlers/port-scan.ts:209` calls `getNectoAPIClient().enrichScanResults(...)`, validates using `safeParseCVEEnrichment`, and attaches the resulting `cveEnrichment` blob to the scan run summary (`port-scan.ts:259`).
- **Feed change detector**: `apps/user-application/src/server/notifications/change-detector/diff-cves.ts:41` compares current vs. prior enrichment to emit NEW/SEVERITY_UP/DOWN/REGRESSED notifications so analysts are alerted whenever severity badges should shift.

## Data Access & Cache Keys
- **Database query**: `packages/data-ops/src/queries/devices.ts:818` selects recent `scanRuns` plus `resultSummary`, giving the UI direct access to the persisted `cveEnrichment`.
- **tRPC exposure**: `apps/user-application/src/trpc/routers/device.ts:192` wraps `getDeviceScanHistory`, returning `{ success, history }` without leaking tenant logic.
- **Query key factory**: `apps/user-application/src/queries/device-queries.ts:63` defines `deviceQueries.scanHistory.key({ deviceId, limit })`, ensuring loaders, components, and invalidations all share the same tuple key.
- **Loader hydration**: `apps/user-application/src/routes/_app.$organizationId.$projectId.assets.$deviceId.vulnerabilities.tsx:21` prefetches `context.trpc.device.scanHistory.queryOptions(...)` during SSR so client renders with cached enrichment (no flash of empty badges).

## UI Rendering & Badges
- **Fetch latest enrichment**: `...vulnerabilities.tsx:35` reuses the same query options in `useQuery`, guaranteeing consistency with SSR data.
- **Derive summary**: `...vulnerabilities.tsx:40` extracts `cveEnrichment.summary`, `applications`, and `os` to drive counts and port-level breakdowns.
- **Render severity badges**: `...vulnerabilities.tsx:93` prints Critical/High counts using `<Badge>` components whose values come directly from enrichment totals—no duplication or client-side recomputation.
- **Empty-state handling**: `...vulnerabilities.tsx:52` falls back to a “Run a scan” message if enrichment is absent, preventing stale badges when scans haven’t completed.

## Keeping Data Fresh
- **Cache invalidation**: Any mutation or postback that updates scan runs (e.g., new port scan) calls `context.trpc.device.scanHistory.queryOptions()` during loaders, so TanStack Query sees the tuple key and refreshes cached enrichment automatically.
- **Notification parity**: Because change detection reads the same `cveEnrichment` structure (`diff-cves.ts:49`), severity badges in the UI stay aligned with notification severities after every enrichment run.
