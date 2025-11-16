# Screening Operations

## Launch HTTPx Probe
- **Filter candidate ports**: `apps/user-application/src/server/postback/handlers/port-scan/utils.ts:74` selects open ports with service metadata via `extractPortsForHttpx`, giving the worker only HTTP-leaning targets.
- **Trigger Restate workflow**: `apps/user-application/src/server/postback/handlers/port-scan.ts:355` calls Restate’s `startHttpxProbe`, wiring target, ports, and postback callback so screenshots run asynchronously.

## Process HTTPx Postback
- **Deduplicate probe results**: `apps/user-application/src/server/postback/handlers/httpx.ts:80` collapses http/https duplicates, prioritising HTTPS, success, screenshots, then status code to keep the best evidence.
- **Persist canonical artifact**: `apps/user-application/src/server/postback/handlers/httpx.ts:138` writes a `scan_artifacts` row per surviving probe before any tool-specific inserts.
- **Upload screenshot to R2**: `apps/user-application/src/server/postback/handlers/httpx.ts:164` converts base64 payloads, uploads via `uploadScreenshot`, and logs metadata for observability.
- **Store HTTP metadata**: `apps/user-application/src/server/postback/handlers/httpx.ts:212` inserts `httpx_probes` details (scheme, status, headers, screenshot key) tied back to the artifact.
- **Attach technology detections**: `apps/user-application/src/server/postback/handlers/httpx.ts:232` normalizes Wappalyzer tech hits and records them with `createTechDetection`.

## Resolve Service Evidence for UI
- **Normalize probe evidence**: `packages/contracts/device/resolvers/normalizers.ts:176` maps HTTPx rows to `ServiceEvidence`, scoring confidence/quality based on status, screenshot, and body data.
- **Apply policy weights**: `packages/contracts/device/resolvers/weights.ts:76` defines priority + confidence thresholds (manual > httpx > tls > zgrab > nmap) so low-confidence guesses are ignored.
- **Merge with Nmap data**: `packages/data-ops/src/queries/devices.ts:478` pulls stored port snapshots, adds latest HTTPx probe, runs `resolveService`, and attaches both the winning service string and audit trail.

## Deliver to Frontend
- **Expose via tRPC**: `apps/user-application/src/trpc/routers/device.ts:111` wraps `getDeviceById` and returns the transformed device with resolved port snapshots.
- **Hydrate loaders/components**: `apps/user-application/src/routes/_app.$organizationId.$projectId.assets.$deviceId.tsx:132` prefetches `trpc.device.detail.queryOptions`, and the component reuses it with `useQuery` for Suspense-friendly hydration.
- **Render open ports + screenshots**: `apps/user-application/src/features/assets/components/device-open-ports/index.tsx:15` consumes the resolved `portSnapshots`, while table cells and drawers display HTTPx badges/screenshots using the shared evidence metadata.
