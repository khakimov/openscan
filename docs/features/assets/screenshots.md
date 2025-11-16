# Screenshots (sec-77)

## Overview
- Goal: surface httpx-derived webpage screenshots inside the device detail experience.
- Architecture: restate worker captures → user-application postback persists R2 key → UI fetches via `/api/screenshots`.

---

## Problem Statement
- Port scans currently expose only service banners/version strings; analysts must manually browse each HTTP port to confirm what’s actually running.
- Manual verification is slow, especially when dozens of ports are detected per scan.
- Visual context (branding, login pages, exposed debug consoles) dramatically improves triage speed and accuracy.

## Goals
1. **Automate** screenshot capture for HTTP/HTTPS ports discovered during scans.
2. **Store** screenshots efficiently with minimal cost.
3. **Display** captures within device detail panels alongside port metadata.
4. **Avoid latency** in existing port scan workflows (screenshotting runs asynchronously).
5. **Gracefully handle** failures (timeouts, auth walls, non-HTTP services).

## Non-Goals
- Non-web protocol screenshots (SSH, SMTP, etc.).
- Video capture or interactive automation.
- OCR / automated screenshot analysis (potential future work).

---

## Architecture Options (Historical Analysis)

### Option 1 – Cloudflare Browser Rendering API *(Recommended)*
- **Pros:** Fully managed, serverless pricing, integrates with Workers, simple API, hardened security.
- **Cons:** Requires paid Workers plan, per-execution billing, less control vs. self-hosting.
- **Cost Observations:** Free tier covers up to ~3,600 screenshots/month; even heavy usage stays under ~$7/month including R2 storage.

### Option 2 – Self-Hosted Browser in Restate Worker
- **Pros:** Full control over browser behaviour, richer automation set, reuse existing worker infra.
- **Cons:** High memory footprint, browser maintenance overhead, slower cold starts, security concerns, higher ops cost.

### Option 3 – Dedicated Screenshot Service
- **Pros:** Decouples workload, enables batching and rate limiting, independent scaling.
- **Cons:** Requires additional infrastructure (queues/workers), higher operational complexity.

---

## Backend Status ✅
- **R2 storage service** (`apps/user-application/src/server/services/r2-storage.ts`)  
  Handles `generateR2Key`, `uploadScreenshot`, health checks; stores metadata for auditing.
- **Database schema** (`packages/data-ops/src/schema/orchestration.ts`: `httpx_probes.screenshot`)  
  Persists the R2 key associated with each probe.
- **Postback handler wiring** (`apps/user-application/src/server/postback/handlers/httpx.ts`: `createHttpxProbe`, `createTechDetection`)  
  Saves probe data, uploads screenshots, associates technology metadata.
- **Serving endpoint** (`apps/user-application/src/routes/api/screenshots.tsx`)  
  Validates organization/device ownership, checks R2 key, streams PNG with cache headers. Ready for consumption by the UI.

## Frontend Work Remaining ❌
- **Screenshot gallery component**  
  - Location to create: `apps/user-application/src/components/ScreenshotGallery.tsx`.  
  - Requirements: responsive thumbnail grid with lazy-loading, skeletons, error states, click-to-enlarge/lightbox.
- **Device detail integration**  
  - File to extend: `apps/user-application/src/features/assets/components/device-detail-sheet.tsx`.  
  - Needs to call `useDeviceScreenshots` (see below) and render the gallery when screenshots exist.
- **Query hook**  
  - Create `apps/user-application/src/queries/screenshot-queries.ts`.  
  - Fetch `httpx_probes` rows (R2 keys, timestamps, ports) for a given device; handle loading/error states; memoize results.
- **Retake screenshot action**  
  - UX affordance for retrying failed or stale captures (trigger new httpx probe).

## Suggested Next Steps
1. Implement `useDeviceScreenshots(deviceId)` fetching API `/api/screenshots` metadata, leveraging existing notification/query conventions.
2. Build `ScreenshotGallery` with the same design language as other detail cards; integrate into the device sheet accordion.
3. Add optimistic refresh or “Retake” button hooked into the httpx trigger once available.
4. Exercise new flow with feature tests (device sheet rendering) once the better-sqlite3 binary issue is resolved.

The backend stack is production-ready; remaining effort lives entirely in the UI layer. Once the gallery and hooks are in place, the feature can roll out without further server changes.***
