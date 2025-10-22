# Screenshot Capture Feature

**Status**: Planning
**Created**: 2025-10-22
**Owner**: TBD

## Overview

Automatically capture visual screenshots of web services discovered during port scans. This provides security analysts with immediate visual context of what's running on discovered ports without manually browsing to each service.

## Problem Statement

Currently, port scans only return service banners and version information (e.g., "nginx 1.18.0", "OpenSSH 9.6p1"). For web services, analysts need to manually visit each URL to understand:
- What application is running (login page, API dashboard, admin panel, etc.)
- Visual branding/design (helps identify known software)
- Potential security issues visible in UI (exposed debug info, default pages, etc.)
- Whether the service is actually accessible vs just port open

Manual screenshot capture is time-consuming when dealing with dozens or hundreds of discovered services.

## Goals

1. **Automate** screenshot capture for all HTTP/HTTPS ports discovered during scans
2. **Store** screenshots efficiently with minimal cost
3. **Display** screenshots in device detail view alongside port information
4. **Don't slow down** existing port scan workflows (async operation)
5. **Handle failures gracefully** (timeouts, authentication walls, non-HTTP services on HTTP ports)

## Non-Goals

- Screenshot capture for non-web protocols (SSH, SMTP, etc.)
- Video/animated screenshots or screen recordings
- Interactive browser automation (clicking, form filling, etc.)
- OCR or automated screenshot analysis (future enhancement)

## Architecture Options

### Option 1: Cloudflare Browser Rendering API (Recommended)

**Description**: Use Cloudflare's managed browser automation service to capture screenshots from within Cloudflare Workers ecosystem.

**Pros**:
- Fully managed (no browser maintenance, auto-scaling)
- Serverless pricing (pay only for captures, no idle costs)
- Integrated with Cloudflare Workers (same platform as user-application)
- Simple API (one HTTP call per screenshot)
- Built-in security (isolated browser instances)

**Cons**:
- Requires Cloudflare Workers Paid plan ($5/mo minimum)
- Per-execution pricing (~$0.50 per million requests + duration)
- Less customization than self-hosted browsers
- Limited control over browser behavior (viewport, wait times, etc.)

**Cost Estimate** (based on Cloudflare Paid plan):

**Included FREE** (Cloudflare Paid plan):
- 10 hours browser duration/month = **3,600 screenshots FREE** @ 10sec each
- 10 concurrent browsers (more than enough for our use)

**Actual Usage Scenarios**:

Light usage (100 scans/month × 3 ports = 300 screenshots):
- Browser Rendering: $0 (within free tier)
- R2 Storage: ~$0.001/month
- **Total: FREE**

Moderate usage (1,000 scans/month × 3 ports = 3,000 screenshots):
- Browser Rendering: $0 (within free tier)
- R2 Storage: ~$0.01/month
- **Total: FREE**

Heavy usage (2,000 scans/month × 3 ports = 6,000 screenshots):
- Browser duration: 16.67 hours - 10 free = 6.67 hours × $0.09 = $0.60
- R2 Storage: ~$0.02/month
- **Total: ~$0.62/month**

Very heavy usage (10,000 scans/month × 3 ports = 30,000 screenshots):
- Browser duration: 83.3 hours - 10 free = 73.3 hours × $0.09 = $6.60
- R2 Storage: ~$0.10/month
- **Total: ~$6.70/month**

### Option 2: Self-Hosted Browser in Restate Worker

**Description**: Install Puppeteer/Playwright in the restate-worker Node.js environment.

**Pros**:
- Full control over browser behavior and customization
- No additional service subscription costs
- Can use existing restate-worker infrastructure
- Richer automation capabilities (click, scroll, wait for JS, etc.)

**Cons**:
- Memory intensive (Chrome headless ~100-200MB per instance)
- Need to install/maintain browser binaries on server
- Slower cold starts (browser initialization overhead)
- Security concerns (executing untrusted web content on scan server)
- Server resource requirements increase significantly
- Scaling requires more server capacity

**Cost Estimate**:
- Server upgrade for memory (approx +2GB): ~$10-20/month
- Maintenance overhead: ongoing
- **Total**: ~$10-20/month + operational complexity

### Option 3: Separate Screenshot Worker/Service

**Description**: Dedicated service (Cloudflare Worker or separate Node.js app) that receives screenshot requests via queue.

**Pros**:
- Isolated from scan workflows (better separation of concerns)
- Can scale independently based on screenshot demand
- Easier to add rate limiting and retry logic
- Can batch screenshots efficiently

**Cons**:
- Additional infrastructure component to manage
- Need queue system (Cloudflare Queues or similar)
- More complex deployment and monitoring
- Higher operational overhead

## Recommended Approach: Hybrid Architecture

**Why Hybrid?**
1. **httpx** requires CLI access → must run in restate-worker (Node.js server)
2. **Screenshots** benefit from Cloudflare native integrations → separate Cloudflare Worker
3. Separation of concerns: port scanning vs asset enrichment
4. Can scale independently
5. Lowest operational overhead

### Component Placement

| Component | Where | Bindings | Why |
|-----------|-------|----------|-----|
| **httpx detection** | restate-worker | None | Needs CLI/shell access, runs with nmap |
| **Screenshot capture** | screenshot-worker | R2, Browser Rendering | Native API access for screenshots |
| **Database updates** | user-application | D1, R2, Queue | ✅ Single source of truth for ALL DB writes |
| **Retry coordination** | Cloudflare Queue | N/A | Built-in retry logic, backpressure handling |

**Critical Design Principle:**
- ⚠️ **Database writes happen in ONE place only**: user-application
- screenshot-worker bindings: R2 + Browser Rendering ONLY (NO D1)
- screenshot-worker posts back to user-application
- user-application updates database via postback handler

### Data Flow Summary (Queue-Based)

```
restate-worker:
  - Runs nmap + httpx (CLI tools)
  - Posts results to user-application
  - Does NOT touch database

user-application (Cloudflare Worker):
  1. Receives port scan postback
  2. Creates screenshot_jobs record (PENDING)
  3. Enqueues to Cloudflare Queue
  - Updates D1 database (ONLY place DB writes happen)
  - Serves UI

Cloudflare Queue:
  - Delivers message to queue consumer
  - Automatic retries (5 attempts, exponential backoff)
  - Dead letter queue for failures

Queue Consumer (in user-application):
  - Calls screenshot-worker API
  - Updates screenshot_jobs (IN_PROGRESS)

screenshot-worker (Cloudflare Worker):
  - Captures screenshots (Browser Rendering API)
  - Uploads to R2 (R2 binding)
  - Posts results to user-application
  - Bindings: R2 + Browser Rendering ONLY (NO D1)

user-application receives postback:
  - Updates scan_runs.resultSummary.screenshots
  - Updates screenshot_jobs (COMPLETED)
```

**Result**: Clean separation, queue handles retries, single source of truth for database.

### Architecture: Hybrid (Recommended)

```
┌─────────────────────────────────────────────────────────┐
│ Restate Worker (Node.js server)                         │
│  ┌─────────────────────────────────┐                   │
│  │ Port Scanner Service             │                   │
│  │  1. nmap scan                    │                   │
│  │  2. httpx detection (CLI) ✅     │                   │
│  │  3. Postback to user-app         │                   │
│  └─────────────────────────────────┘                   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP POST (scan results + httpx)
                     ↓
┌─────────────────────────────────────────────────────────┐
│ User Application (Cloudflare Worker)                    │
│  ┌─────────────────────────────────┐                   │
│  │ Port Scan Postback Handler       │                   │
│  │  1. Store scan results in D1     │                   │
│  │  2. Filter HTTP ports            │                   │
│  │  3. Create screenshot_jobs (D1)  │                   │
│  │  4. Enqueue to Cloudflare Queue  │                   │
│  └─────────────────────────────────┘                   │
└────────────────────┬────────────────────────────────────┘
                     │ Queue.send()
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Queue (screenshot-jobs)                      │
│  - Automatic retries (5 attempts)                       │
│  - Exponential backoff                                  │
│  - Dead letter queue                                    │
└────────────────────┬────────────────────────────────────┘
                     │ Consumer triggered
                     ↓
┌─────────────────────────────────────────────────────────┐
│ User Application - Queue Consumer                       │
│  ┌─────────────────────────────────┐                   │
│  │ Screenshot Queue Handler         │                   │
│  │  1. Call screenshot-worker API   │                   │
│  │  2. Update job (IN_PROGRESS)     │                   │
│  └─────────────────────────────────┘                   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP POST
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Screenshot Worker (NEW - Cloudflare Worker)             │
│  ┌─────────────────────────────────┐                   │
│  │ For each HTTP port:              │                   │
│  │   1. Browser Rendering API ✅    │ (native binding) │
│  │   2. Upload to R2 ✅             │ (R2 binding)     │
│  │   3. Postback to user-app        │                   │
│  │                                  │                   │
│  │ Bindings: Browser Rendering, R2  │                   │
│  │ NO D1 binding ❌                 │                   │
│  └─────────────────────────────────┘                   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP POST (results)
                     ↓
┌─────────────────────────────────────────────────────────┐
│ User Application - Postback Handler                     │
│  ┌─────────────────────────────────┐                   │
│  │ Screenshot Postback Handler      │                   │
│  │  1. Update scan_runs (D1) ✅     │                   │
│  │  2. Update screenshot_jobs (D1)  │                   │
│  │  3. Store R2 keys                │                   │
│  │                                  │                   │
│  │ Single source for DB writes ✅   │                   │
│  └─────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Execution Flow

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Port Scan (restate-worker)                                   │
│    a. Nmap discovers ports                                      │
│    b. httpx probes ports for HTTP support                       │
│    c. Postback to user-application                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Port Scan Postback Handler (user-application)                │
│    a. Store scan results in D1 database                         │
│    b. Filter ports where httpx detected HTTP                    │
│    c. Create screenshot_jobs record (PENDING)                   │
│    d. Enqueue message to Cloudflare Queue                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Cloudflare Queue                                             │
│    - Delivers message to queue consumer                         │
│    - Automatic retries (5 attempts, exponential backoff)        │
│    - Dead letter queue for failures                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Queue Consumer (user-application)                            │
│    a. Call screenshot-worker API                                │
│    b. Update screenshot_jobs (IN_PROGRESS)                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Screenshot Worker (NEW - Cloudflare Worker)                  │
│    - For each HTTP/HTTPS port:                                  │
│      a. Call Browser Rendering API                              │
│      b. Upload screenshot to R2                                 │
│    - Postback results to user-application                       │
│    - Bindings: R2 + Browser Rendering (NO D1)                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Screenshot Postback Handler (user-application)               │
│    a. Validate screenshot results                               │
│    b. Update scan_runs.resultSummary.screenshots (D1)           │
│    c. Update screenshot_jobs (COMPLETED)                        │
│    - Single source of truth for database writes                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. UI Display (device detail sheet)                             │
│    - Fetch screenshots from scan_runs.resultSummary             │
│    - Show gallery with thumbnails                               │
│    - Click to enlarge, view full screenshot from R2             │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Implementation Flow

#### When to Capture Screenshots

**HTTP Detection First (using httpx):**
1. After nmap completes, run `httpx` on all open ports to detect HTTP support
2. httpx probes each port to confirm it actually responds to HTTP/HTTPS
3. Store httpx results in port scan data:
   - URL (http:// or https://)
   - Status code (200, 404, 403, etc.)
   - Title (page title from HTML)
   - Tech stack (Server headers, frameworks detected)
   - Content length
   - Response time

**After port scan completes successfully:**
1. Port scan postback includes httpx detection results
2. Handler filters ports that httpx confirmed as HTTP-capable:
   - `port.httpDetection.status === 'HTTP_DETECTED'`
   - Includes both standard (80, 443) and non-standard ports (e.g., 9200, 3000, 5000)
3. If HTTP ports found:
   - ⚠️ **IMPORTANT**: Persist job BEFORE enqueueing (reliability)
   - Create `screenshot_jobs` record (status: PENDING) in D1
   - Enqueue message to Cloudflare Queue
   - Queue handles retries automatically
   - If enqueue fails, job stays PENDING (can be manually requeued)

**Why httpx instead of port-number filtering?**
- ✅ Accurate: Only screenshots actual HTTP services
- ✅ Comprehensive: Catches HTTP on non-standard ports (8443, 9000, etc.)
- ✅ Efficient: Avoids wasting screenshots on SSH/SMTP/etc on port 8080
- ✅ Rich metadata: httpx provides title, status, tech detection (useful even without screenshots)
- ✅ Fast: httpx is highly optimized for mass HTTP probing

**Why after postback (not during scan)?**
- Screenshot capture can be slow (5-30 seconds per port)
- Port scan should complete quickly and not be blocked by screenshots
- Screenshot failures shouldn't affect port scan success
- Can retry screenshots independently without re-scanning

#### Retry Mechanism: Cloudflare Queue

**Why Queue for Retries?**
- Built-in exponential backoff (no custom implementation)
- Automatic dead letter queue for permanent failures
- Handles backpressure (burst of screenshots doesn't overwhelm worker)
- Real-time processing (no polling delay)
- Native to Cloudflare (same platform as user-application)

**Queue Configuration:**
- Max retries: 5 attempts
- Retry delay: Exponential backoff (configurable)
- Dead letter queue: Captures permanently failed jobs
- Batch size: 10 messages per invocation

**Monitoring:**
- Queue depth (number of pending messages)
- Success rate (messages acknowledged vs retried)
- DLQ depth (permanently failed jobs requiring investigation)

## Storage Strategy

### Cloudflare R2 (Object Storage)

**Structure**:
```
screenshots/
  {organizationId}/
    {deviceId}/
      {scanId}/
        {port}-{timestamp}.png
```

**Example**:
```
screenshots/
  org_abc123/
    dev_xyz789/
      scan_20251022_143022/
        80-20251022T143045Z.png
        443-20251022T143052Z.png
        8080-20251022T143058Z.png
```

**Why R2?**
- Cost-effective: $0.015/GB/month (vs S3's $0.023/GB)
- Zero egress fees (vs S3's $0.09/GB)
- Integrated with Cloudflare Workers
- S3-compatible API (easy migration if needed)

**Alternative Considered**: Cloudflare Images
- Rejected for primary storage (limited to images, higher cost at $5/100k)
- Could use for thumbnails in future (automatic resizing, CDN delivery)

### R2 Bucket Configuration

**Lifecycle Rules**:
- Delete screenshots older than 90 days (configurable per organization)
- Keep latest screenshot per port indefinitely (for comparison)

**Access Control**:
- Private bucket (not publicly accessible)
- Presigned URLs for viewing (expire after 1 hour)
- Scoped to organization (users can only access their org's screenshots)

**Metadata** (stored in R2 object metadata):
```json
{
  "organizationId": "org_abc123",
  "deviceId": "dev_xyz789",
  "scanId": "scan_20251022_143022",
  "port": 443,
  "url": "https://example.com:443",
  "capturedAt": "2025-10-22T14:30:52Z",
  "viewport": "1920x1080",
  "fileSize": 12456
}
```

## HTTP Detection with httpx

### Integration into Port Scanner

**Location**: `apps/restate-worker/src/port-scanner.ts`

**After nmap completes** (before postback):
1. Extract all open ports from nmap results
2. Run httpx to probe each port for HTTP support
3. Parse httpx JSON output
4. Merge httpx results into port data

**httpx Command** (comprehensive metadata collection):
```bash
echo "target:port" | httpx \
  -json \
  -status-code \
  -title \
  -tech-detect \
  -content-length \
  -content-type \
  -response-time \
  -location \
  -method \
  -websocket \
  -ip \
  -cname \
  -cdn \
  -jarm \
  -asn \
  -server \
  -silent
```

**httpx Output Example** (rich metadata):
```json
{
  "url": "https://example.com:443",
  "input": "example.com:443",
  "status-code": 200,
  "title": "Example Domain - Admin Panel",
  "content-type": "text/html; charset=utf-8",
  "content-length": 1256,
  "response-time": "234ms",
  "method": "GET",
  "location": null,
  "webserver": "nginx/1.18.0",
  "tech": ["Nginx:1.18.0", "React", "Express"],
  "cdn": "cloudflare",
  "ip": "93.184.216.34",
  "cname": "example.com",
  "asn": "AS15133",
  "jarm": "29d29d00029d29d00041d...",
  "websocket": false,
  "final-url": "https://example.com:443/"
}
```

**Benefits of Comprehensive httpx Metadata**:

**For Screenshot Feature**:
- ✅ **Accurate filtering**: Only screenshot ports confirmed as HTTP-capable
- ✅ **Smart URL construction**: Use httpx's detected protocol (http vs https)

**For Asset Identification**:
- ✅ **Application detection**: Titles reveal what's running ("Jenkins Dashboard", "WordPress Admin")
- ✅ **Technology stack**: Tech array shows frameworks/CMS versions (useful for CVE matching!)
- ✅ **Content type detection**: Differentiate web pages from APIs (application/json vs text/html)

**For Security Analysis**:
- ✅ **Version detection**: webserver and tech fields provide version info (e.g., "nginx/1.18.0")
- ✅ **CDN detection**: Know if target is behind Cloudflare/Akamai (affects scanning strategy)
- ✅ **TLS fingerprinting**: JARM hash helps identify SSL/TLS configuration
- ✅ **WebSocket detection**: Identify real-time communication services

**For Network Intelligence**:
- ✅ **IP resolution**: See actual IP behind hostname
- ✅ **CNAME chains**: Understand DNS delegation
- ✅ **ASN mapping**: Identify hosting provider/network owner

**For Performance**:
- ✅ **Fast**: httpx processes all ports in ~2-5 seconds (parallel probing)
- ✅ **Response time tracking**: Identify slow services or geo-distributed endpoints

**Integration with CVE Enrichment**:
- httpx tech detection provides versions that nmap might miss
- Tech array feeds into CVE matching alongside nmap service detection
- Better version data = more accurate vulnerability matching

### httpx Installation

**Restate Worker Server**:
```bash
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
```

**Verification**:
```bash
httpx -version
# Should show: httpx v1.x.x
```

## Database Schema Changes

### New Table: `screenshot_jobs` (Job Tracking & Retry)

**Purpose**: Persist screenshot intent before calling worker (prevents lost jobs)

```sql
CREATE TABLE screenshot_jobs (
  id TEXT PRIMARY KEY,                    -- CUID
  scan_run_id TEXT NOT NULL,              -- Foreign key to scan_runs
  device_id TEXT NOT NULL,                -- Foreign key to devices
  organization_id TEXT NOT NULL,          -- Tenant isolation

  -- Status tracking
  status TEXT NOT NULL,                   -- PENDING | IN_PROGRESS | COMPLETED | FAILED

  -- Request data
  ports_json TEXT NOT NULL,               -- JSON array of ports to screenshot
  callback_url TEXT NOT NULL,             -- Where worker should post back

  -- Retry logic
  attempts INTEGER DEFAULT 0,             -- Number of trigger attempts
  last_attempt_at TEXT,                   -- ISO 8601 timestamp

  -- Completion tracking
  screenshots_expected INTEGER NOT NULL,   -- How many screenshots requested
  screenshots_completed INTEGER DEFAULT 0, -- How many completed
  screenshots_failed INTEGER DEFAULT 0,    -- How many failed

  -- Error tracking
  last_error TEXT,                        -- Last error message

  -- Timestamps
  created_at TEXT NOT NULL,               -- ISO 8601
  updated_at TEXT NOT NULL,               -- ISO 8601
  completed_at TEXT,                      -- ISO 8601 (when status changed to COMPLETED)

  FOREIGN KEY (scan_run_id) REFERENCES scan_runs(id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_screenshot_jobs_status ON screenshot_jobs(status);
CREATE INDEX idx_screenshot_jobs_device ON screenshot_jobs(device_id);
CREATE INDEX idx_screenshot_jobs_created ON screenshot_jobs(created_at);
```

**Lifecycle:**
```
1. Port scan completes → Create job (status: PENDING, attempts: 0)
2. Queue consumer calls screenshot-worker → Update (status: IN_PROGRESS, attempts + 1)
3. Worker posts back → Update (status: COMPLETED, screenshots_completed: N)

If queue exhausts retries:
1. Message lands in DLQ
2. Dead-letter handler marks job FAILED and records `last_error`
```

### Extend Port Data Structure

**Add httpDetection to each port** in `scan_runs.resultSummary.ports[]`:

```typescript
interface Port {
  // Existing nmap fields...
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: {
    name?: string;
    product?: string;
    version?: string;
  };

  // NEW: HTTP detection from httpx (comprehensive metadata)
  httpDetection?: {
    status: 'HTTP_DETECTED' | 'NO_HTTP' | 'PROBE_FAILED';

    // Core HTTP data
    url?: string;              // e.g., "https://example.com:443"
    finalUrl?: string;         // After redirects
    statusCode?: number;       // HTTP status (200, 404, 403, etc.)
    method?: string;           // HTTP method used (GET, POST, etc.)
    location?: string;         // Redirect location header

    // Content metadata
    title?: string;            // Page title (useful for identifying applications)
    contentType?: string;      // e.g., "text/html; charset=utf-8"
    contentLength?: number;    // Response size in bytes

    // Technology detection
    tech?: string[];           // Detected technologies (e.g., ["Nginx:1.18.0", "React"])
    webserver?: string;        // Server header (e.g., "nginx/1.18.0")

    // Network metadata
    ip?: string;               // Resolved IP address
    cname?: string;            // CNAME record
    cdn?: string;              // CDN provider (cloudflare, akamai, etc.)
    asn?: string;              // Autonomous System Number

    // Performance & fingerprinting
    responseTime?: number;     // Response time in ms
    jarm?: string;             // JARM TLS fingerprint
    websocket?: boolean;       // WebSocket support detected

    // Timing
    probedAt?: string;         // ISO 8601 timestamp when probed
  };
}
```

### Extend `scan_runs.resultSummary` (JSON column)

Add `screenshots` array to existing structure:

```typescript
interface ScanRunResultSummary {
  // Existing fields...
  target: string;
  openPortCount: number;
  ports: Port[];
  cveEnrichment?: CVEEnrichment;

  // NEW: Screenshot data
  screenshots?: Screenshot[];
}

interface Screenshot {
  port: number;
  protocol: 'http' | 'https';
  url: string;              // Reconstructed URL (e.g., "https://example.com:443")
  r2Key: string;            // R2 object key for retrieval
  capturedAt: string;       // ISO 8601 timestamp
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
  error?: string;           // Error message if failed
  dimensions?: {            // Image dimensions (if successful)
    width: number;
    height: number;
  };
  fileSize?: number;        // Bytes (if successful)
  duration?: number;        // Capture time in milliseconds
}
```

**Why store in `resultSummary` instead of separate table?**
- Screenshots are tightly coupled to specific scan results
- No need to query screenshots independently
- Simplifies data model (no additional joins)
- Consistent with how we store `cveEnrichment`

**Alternative Considered**: Separate `screenshots` table
- Rejected for now (over-engineering for MVP)
- Can migrate later if we need advanced screenshot querying

## Implementation Phases

### Phase 1: Infrastructure Setup
**Goal**: Set up storage and dependencies

**Tasks**:
1. Create R2 bucket via Cloudflare dashboard
   - Name: `openscan-screenshots`
   - Location: Auto (Cloudflare's optimal location)
2. Add R2 binding to `wrangler.jsonc`:
   ```jsonc
   "r2_buckets": [
     {
       "binding": "SCREENSHOTS",
       "bucket_name": "openscan-screenshots",
       "preview_bucket_name": "openscan-screenshots-dev"
     }
   ]
   ```
3. Add R2 helpers to `packages/data-ops`:
   - `uploadScreenshot(key, buffer, metadata)`
   - `getScreenshotUrl(key, expiresIn)`
   - `deleteScreenshot(key)`
4. Update TypeScript types for `Screenshot` interface

**Deliverables**:
- ✅ R2 bucket created and accessible
- ✅ R2 helpers tested with sample upload/download
- ✅ Types added to `@repo/contracts`

### Phase 2: HTTP Detection (httpx integration)
**Goal**: Enhance port scanner to detect HTTP services and collect metadata

**Tasks**:
1. Install httpx on restate-worker server
2. Extend `apps/restate-worker/src/port-scanner.ts`:
   - Add httpx probe step after nmap completes
   - Run httpx on all open ports to detect HTTP
   - Parse httpx JSON output
   - Merge httpx data into port results
3. Update port scan postback payload to include `httpDetection` data
4. Update `@repo/contracts` types for httpx metadata
5. Add tests for httpx integration

**Deliverables**:
- ✅ httpx installed and verified on server
- ✅ Port scan results include httpDetection metadata
- ✅ Types updated in contracts package
- ✅ Tests passing for httpx integration

### Phase 3: Screenshot Worker (Cloudflare Worker)
**Goal**: Implement screenshot capture worker using Browser Rendering + R2

**Tasks**:
1. Create new Cloudflare Worker: `apps/screenshot-worker/`
   - Bootstrap from data-service template
   - Configure Browser Rendering + R2 bindings (NO D1 needed)
2. Implement `POST /screenshots/capture`:
   - Input: `{ jobId, deviceId, scanId, ports[], organizationId, callbackUrl }`
   - Validate authentication & payload (jobId required)
   - Loop through ports where `status === 'HTTP_DETECTED'`
     - Call Browser Rendering API (native binding) with timeout safeguards
     - Upload image bytes to R2 (native binding)
     - Collect metadata (dimensions, file size, port, status)
   - Build response object: `{ jobId, screenshots: [...] }`
   - POST results to `callbackUrl`
3. Emit structured logs for each stage (start, per-port success/failure, completion)
4. Add unit/integration tests for capture + postback logic
5. Deploy worker to Cloudflare (production + staging)

**Deliverables**:
- ✅ screenshot-worker deployed to Cloudflare
- ✅ Handles multiple ports per request
- ✅ Uploads to R2 with metadata
- ✅ Posts results back to user-application
- ✅ Logs capture lifecycle for debugging

### Phase 4: Integration with Port Scan Flow
**Goal**: Trigger screenshots automatically after port scans

**Tasks**:

**1. Add Screenshot Job Persistence (Reliability)**
   - Create migration for `screenshot_jobs` table
   - Add Drizzle schema definition
   - Add data-ops queries: `createScreenshotJob`, `updateScreenshotJob`, `getScreenshotJob`

**2. Extend `PortScanPostbackHandler.handleSuccess()`:**
   ```typescript
   // Filter HTTP ports
   const httpPorts = ports.filter(p => p.httpDetection?.status === 'HTTP_DETECTED');

   if (httpPorts.length > 0) {
     // Create job record (PENDING) - persisted BEFORE enqueueing for reliability
     const job = await createScreenshotJob({
       scanRunId,
       deviceId,
       organizationId,
       portsJson: JSON.stringify(httpPorts),
       screenshotsExpected: httpPorts.length,
       status: 'PENDING',
     });

     // Enqueue to Cloudflare Queue (consumer implementation in Phase 6)
     await env.SCREENSHOT_QUEUE.send({
       jobId: job.id,
       deviceId,
       scanId,
       ports: httpPorts,
       organizationId,
     });

     logger.info('Screenshot job enqueued', { jobId: job.id, portCount: httpPorts.length });
   }
   ```

   **Note**: The queue consumer (Phase 6) handles calling screenshot-worker with automatic retries.

**3. Create `ScreenshotPostbackHandler`:**
   - Implement `PostbackHandler<ScreenshotPostback>` interface
   - Validate screenshot results (R2 keys exist, valid metadata)
   - Update `scan_runs.resultSummary.screenshots` via D1
   - Update `screenshot_jobs` table (status: COMPLETED, screenshots_completed)
   - Single source of truth for database writes

**4. Register handler in postback registry**

**5. Configure queue binding in wrangler.jsonc** (see Phase 6 for details)

**6. Add analytics tracking for screenshot events**

**Deliverables**:
- ✅ Screenshots triggered automatically after port scans
- ✅ Screenshot jobs persisted BEFORE calling worker (no lost jobs)
- ✅ Automatic retries with exponential backoff
- ✅ ScreenshotPostbackHandler updates database (follows postback pattern)
- ✅ Analytics tracking screenshot triggers and completion
- ✅ Single source of truth: user-application owns all DB writes

### Phase 5: UI Display
**Goal**: Show screenshots in device detail view

**Tasks**:
1. Extend `device-detail-sheet.tsx`:
   - Add screenshot gallery section
   - Fetch presigned R2 URLs for viewing
2. Create `ScreenshotGallery` component:
   - Thumbnail grid (lazy loaded)
   - Click to view full-size
   - Show port, timestamp, status
3. Add loading states and error handling
4. Add "Retake Screenshot" button for failures

**Deliverables**:
- ✅ Screenshots visible in device detail sheet
- ✅ Smooth UX with loading states
- ✅ Error states handled gracefully

### Phase 6: Cloudflare Queue Setup (Reliability)
**Goal**: Configure queue for reliable screenshot triggering with automatic retries

**Tasks**:

**1. Configure Cloudflare Queue** (wrangler.jsonc):
```jsonc
{
  "queues": {
    "producers": [
      { "binding": "SCREENSHOT_QUEUE", "queue": "screenshot-jobs" }
    ],
    "consumers": [
      {
        "queue": "screenshot-jobs",
        "max_batch_size": 10,
        "max_retries": 5,
        "dead_letter_queue": "screenshot-jobs-dlq"
      }
    ]
  }
}
```

**2. Implement Queue Consumer** (user-application):
```typescript
// apps/user-application/src/queue-handlers/screenshot-queue.ts

export default {
  async queue(batch: MessageBatch<ScreenshotJob>, env: Env) {
    for (const message of batch.messages) {
      const { jobId, deviceId, ports, organizationId, scanId } = message.body;

      try {
        logger.info('Processing screenshot job', { jobId, deviceId });

        // Call screenshot-worker
        const response = await fetch(env.SCREENSHOT_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SCREENSHOT_WORKER_API_KEY}`
          },
          body: JSON.stringify({
            jobId,
            deviceId,
            scanId,
            ports,
            organizationId,
            callbackUrl: `${env.APP_URL}/api/internal/screenshot-results`,
          }),
        });

        if (!response.ok) {
          throw new Error(`Screenshot worker returned ${response.status}`);
        }

        // Update job status
        await updateScreenshotJob(jobId, {
          status: 'IN_PROGRESS',
          attempts: (await getScreenshotJob(jobId)).attempts + 1,
          lastAttemptAt: new Date().toISOString(),
        });

        // Acknowledge message (success)
        message.ack();

        logger.info('Screenshot job triggered successfully', { jobId });
      } catch (error) {
        logger.error('Failed to trigger screenshot worker', {
          jobId,
          error: error.message,
          attempt: message.attempts,
        });

        // Retry automatically (queue handles exponential backoff)
        message.retry();

        // After max retries, message goes to DLQ automatically
      }
    }
  },
};
```

**3. Update Port Scan Postback Handler**:
```typescript
// In PortScanPostbackHandler.handleSuccess()

// Filter HTTP ports
const httpPorts = ports.filter(p => p.httpDetection?.status === 'HTTP_DETECTED');

if (httpPorts.length > 0) {
  // Create job record (PENDING)
  const job = await createScreenshotJob({
    scanRunId,
    deviceId,
    organizationId,
    portsJson: JSON.stringify(httpPorts),
    screenshotsExpected: httpPorts.length,
    status: 'PENDING',
  });

  // Enqueue to Cloudflare Queue
  await env.SCREENSHOT_QUEUE.send({
    jobId: job.id,
    deviceId,
    scanId,
    ports: httpPorts,
    organizationId,
  });

  logger.info('Screenshot job enqueued', { jobId: job.id, portCount: httpPorts.length });
}
```

**4. Create Dead Letter Queue Handler**:
```typescript
// Monitor and handle permanently failed jobs
export async function handleDeadLetterQueue(batch: MessageBatch, env: Env) {
  for (const message of batch.messages) {
    const { jobId } = message.body;

    // Mark job as permanently FAILED
    await updateScreenshotJob(jobId, {
      status: 'FAILED',
      lastError: 'Max retries exceeded',
    });

    // Alert/log for investigation
    logger.error('Screenshot job permanently failed', { jobId, message: message.body });

    message.ack();
  }
}
```

**Deliverables**:
- ✅ Cloudflare Queue configured (screenshot-jobs)
- ✅ Queue consumer implemented in user-application
- ✅ Automatic retries with exponential backoff (5 attempts)
- ✅ Dead letter queue for permanently failed jobs
- ✅ Port scan postback enqueues screenshot jobs
- ✅ Jobs persisted BEFORE enqueueing (no lost jobs)

### Phase 7: Polish & Optimization
**Goal**: Production-ready feature

**Tasks**:
1. Add screenshot lifecycle management:
   - Cleanup old screenshots (90 day retention)
   - Keep latest screenshot per port
2. Add user preferences:
   - Enable/disable screenshots per organization
   - Configure viewport size
3. Performance optimizations:
   - Parallelize screenshot captures (up to 5 concurrent)
   - Compress images before upload (WebP format)
4. Monitoring and alerts:
   - Track screenshot success rate
   - Alert on high failure rates

**Deliverables**:
- ✅ Production-ready with monitoring
- ✅ Documentation updated
- ✅ User guide written

## Testing & Debugging

### Remote Testing screenshot-worker

#### 1. Direct HTTP Testing (Recommended for Development)

**Trigger screenshot capture directly:**
```bash
# Test endpoint (bypasses port scan flow)
curl -X POST https://screenshot-worker.account.workers.dev/screenshots/capture \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "deviceId": "dev_test123",
    "scanId": "scan_test123",
    "organizationId": "org_test123",
    "callbackUrl": "https://sec-rocks.saipe.workers.dev/api/internal/screenshot-results",
    "ports": [
      {
        "port": 443,
        "url": "https://example.com:443",
        "httpDetection": {
          "status": "HTTP_DETECTED",
          "title": "Example Domain"
        }
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "jobId": "job_cuid123",
  "message": "Screenshot capture started",
  "portsQueued": 1
}
```

#### 2. Status Checking Endpoint

Add to screenshot-worker:
```typescript
// GET /screenshots/status/:jobId
// Returns job status and results
{
  "jobId": "job_cuid123",
  "status": "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED",
  "progress": {
    "total": 3,
    "completed": 2,
    "failed": 0
  },
  "screenshots": [
    {
      "port": 443,
      "r2Key": "screenshots/org_test/dev_test/scan_test/443-timestamp.png",
      "status": "SUCCESS",
      "dimensions": { "width": 1920, "height": 1080 },
      "fileSize": 245678
    }
  ]
}
```

#### 3. Live Logging with Wrangler Tail

Stream logs from deployed worker:
```bash
# Terminal 1: Watch logs
wrangler tail screenshot-worker --format pretty

# Terminal 2: Trigger test
curl -X POST https://screenshot-worker.account.workers.dev/screenshots/capture ...
```

**Output:**
```
[2025-10-22 14:30:45] POST /screenshots/capture
[2025-10-22 14:30:45] Processing screenshot job for 3 ports
[2025-10-22 14:30:47] Port 443: Screenshot captured (245KB)
[2025-10-22 14:30:47] Port 443: Uploaded to R2
[2025-10-22 14:30:50] Port 8080: Screenshot captured (189KB)
...
```

#### 5. Local Development with Wrangler Dev

Run worker locally with mocked Browser Rendering:
```bash
cd apps/screenshot-worker
wrangler dev --remote  # Uses real R2 and Browser Rendering API
```

**Mock Browser Rendering for faster iteration:**
```typescript
// Mock for local testing
if (env.ENVIRONMENT === 'local') {
  // Return test screenshot instead of real capture
  const testScreenshot = await fetch('http://localhost:3001/test-screenshot.png');
  return testScreenshot.arrayBuffer();
}
```

#### 6. Integration Test Suite

```typescript
// apps/screenshot-worker/src/__tests__/integration.test.ts

describe('Screenshot Worker Integration', () => {
  test('captures screenshot for HTTPS port', async () => {
    const response = await fetch('http://localhost:8787/screenshots/capture', {
      method: 'POST',
      body: JSON.stringify({
        ports: [{ port: 443, url: 'https://example.com' }],
        // ... other params
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.jobId).toBeDefined();

    // Poll for completion
    const status = await pollJobStatus(data.jobId);
    expect(status.screenshots[0].status).toBe('SUCCESS');
  });
});
```

#### 7. End-to-End Testing Flow

```bash
# 1. Trigger screenshot capture
JOB_ID=$(curl -X POST https://screenshot-worker.account.workers.dev/screenshots/capture \
  -H "Content-Type: application/json" \
  -d '{ ... }' | jq -r '.jobId')

# 2. Poll for completion
while true; do
  STATUS=$(curl https://screenshot-worker.account.workers.dev/screenshots/status/$JOB_ID | jq -r '.status')
  echo "Status: $STATUS"
  [[ "$STATUS" == "COMPLETED" ]] && break
  sleep 2
done

# 3. Check R2 storage
aws s3 ls s3://openscan-screenshots/org_test/dev_test/scan_test/ --endpoint-url https://your-account.r2.cloudflarestorage.com

# 4. Verify database update (if postback completed)
curl https://sec-rocks.saipe.workers.dev/api/devices/dev_test123 | jq '.screenshots'
```

### Testing Checklist

Before deploying to production:

- [ ] Direct HTTP endpoint responds correctly
- [ ] Browser Rendering API returns screenshots
- [ ] R2 upload succeeds
- [ ] Postback to user-application succeeds
- [ ] Database updates correctly
- [ ] Error handling works (timeout, invalid URL, etc.)
- [ ] Retries work for transient failures
- [ ] Concurrent screenshot capture works (5 parallel)
- [ ] Large screenshots handled (>1MB)
- [ ] Analytics tracking fires

### Debugging Tips

**Problem: Screenshot capture times out**
```bash
# Check Browser Rendering API directly
curl -X POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"url":"https://example.com","viewport":{"width":1920,"height":1080}}'
```

**Problem: R2 upload fails**
```bash
# Check R2 binding
wrangler r2 object get openscan-screenshots/test.txt
```

**Problem: Postback not received**
```bash
# Check user-application logs
wrangler tail sec-rocks --format pretty | grep screenshot
```

## Security Considerations

### 1. Screenshot Content Security

**Concern**: Screenshots may capture sensitive information (credentials, tokens, PII)

**Mitigations**:
- Store screenshots with same access controls as scan data (organization-scoped)
- Use presigned URLs with short expiration (1 hour)
- Add audit logging for screenshot access
- Option to disable screenshots for specific devices/domains
- Clear retention policy (90 days default)

### 2. SSRF (Server-Side Request Forgery)

**Concern**: Attacker could scan internal services via screenshot feature

**Mitigations**:
- Screenshot capture only triggered from port scan results (already validated)
- No user-provided URLs (URLs constructed from scan data)
- Restate Worker validates target before capture
- Rate limiting per organization

### 3. Storage Access

**Concern**: Unauthorized access to R2 bucket

**Mitigations**:
- Private bucket (no public access)
- Presigned URLs generated server-side (requires authentication)
- Organization-scoped access (users only see their org's screenshots)
- R2 access keys stored in secrets (not in code)

### 4. Browser Rendering Abuse

**Concern**: Malicious websites could exploit browser rendering

**Mitigations**:
- Cloudflare Browser Rendering runs in isolated instances
- Timeout limits (30 seconds max)
- No JavaScript execution beyond initial page load
- No form submission or interaction

## Open Questions / Decisions Needed

1. **Screenshot viewport size?**
   - Default: 1920x1080 (desktop)
   - Alternative: 1280x720 (smaller files)
   - Decision: Start with 1920x1080, make configurable later

2. **Capture timing - when to screenshot?**
   - Option A: Immediately after port scan (current plan)
   - Option B: On-demand (user clicks "Take Screenshot")
   - Option C: Both (auto-capture + manual retake)
   - Decision: **Option C** - auto-capture with manual retake button

3. **Screenshot format?**
   - PNG: Lossless, larger files (~50-200KB)
   - JPEG: Lossy, smaller files (~20-80KB)
   - WebP: Modern, best compression (~15-60KB)
   - Decision: **WebP** for storage, PNG fallback for older browsers

4. **Wait time before screenshot?**
   - Problem: Some pages load content after initial render (JS, images)
   - Options:
     - 0s (immediate)
     - 2s (wait for most content)
     - 5s (wait for slow content)
   - Decision: **2 seconds** (balance between speed and completeness)

5. **Parallel vs sequential capture?**
   - Sequential: Safer, predictable, slower (1 port at a time)
   - Parallel: Faster but higher resource usage (5 concurrent max)
   - Decision: **Parallel (max 5)** - most devices have 2-5 web ports

6. **Integration with existing postback flow?**
   - Option A: Extend port scan postback (one postback, includes screenshots)
   - Option B: Separate screenshot postback (two postbacks: scan, then screenshots)
   - Decision: **Option B** - separate concerns, screenshots can fail independently

## Success Metrics

- **Adoption**: % of port scans that capture screenshots
- **Success Rate**: % of screenshot attempts that succeed
- **Performance**: Average screenshot capture time
- **Cost**: Monthly R2 storage + Browser Rendering costs
- **User Engagement**: % of users viewing screenshots in device details

**Targets**:
- Adoption: 80%+ of scans with web ports
- Success Rate: 90%+ (after initial tuning)
- Performance: < 10 seconds average per screenshot
- Cost: FREE for first 3,600 screenshots/month, < $1/month for moderate usage
- Engagement: 60%+ users view screenshots

## Future Enhancements

- **Screenshot Comparison**: Highlight changes between scans (visual diff)
- **Mobile Viewport**: Capture both desktop and mobile views
- **OCR/Text Extraction**: Extract text from screenshots for searching
- **Automated Threat Detection**: Flag screenshots with known vulnerable UIs
- **Screenshot Notifications**: Alert on new/changed screenshots
- **Video Capture**: Record short clips instead of static images
- **Multiple Screenshots**: Capture after scroll, after interaction, etc.

## Related Documentation

- [Postback Architecture](../postback-architecture.md)
- [Restate Worker Guide](../../apps/restate-worker/CLAUDE.md)
- [Cloudflare Browser Rendering API](https://developers.cloudflare.com/browser-rendering/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)

## Architecture Decision Summary

### Question: Where should we implement httpx and screenshots?

**Answer: Hybrid Architecture**

| Component | Location | Reasoning |
|-----------|----------|-----------|
| **httpx detection** | `restate-worker` | ✅ CLI tool requires shell access<br>✅ Runs alongside nmap (same server)<br>✅ Fast local execution<br>❌ Can't run in Cloudflare Workers |
| **Screenshot capture** | `screenshot-worker` (NEW Cloudflare Worker) | ✅ Native Browser Rendering API access<br>✅ Native R2 binding<br>✅ Auto-scaling, no server management<br>❌ No CLI access (not needed) |

### Why Not All-in-One?

**Option: Everything in restate-worker**
- ❌ Heavy server load (browser rendering)
- ❌ Slower API calls (REST vs native bindings)
- ❌ Manual scaling required
- ❌ No native R2/D1 integration

**Option: Everything in Cloudflare Worker**
- ❌ Can't run httpx (no CLI/shell access)
- ❌ Would need separate httpx service anyway

**✅ Hybrid Solution**
- Each component in its optimal environment
- httpx: fast local execution with nmap
- screenshots: native Cloudflare integrations
- Clean separation of concerns
- Each scales independently

### Implementation Path

1. **Phase 2**: Add httpx to existing `restate-worker/src/port-scanner.ts`
2. **Phase 3**: Create new `apps/screenshot-worker/` (Cloudflare Worker)
3. **Phase 4**: Wire them together (postback handler triggers screenshot worker)

**Result**: Best of both worlds - CLI tools where needed, Cloudflare native where beneficial.

## Changelog

- **2025-10-22**: Initial draft - architecture options and recommended hybrid approach
- **2025-10-22**: Added httpx integration with comprehensive metadata collection
- **2025-10-22**: Clarified hybrid architecture (restate-worker for httpx, Cloudflare Worker for screenshots)
- **2025-10-22**: Simplified to queue-only retry mechanism (removed Cloudflare Workflows and cron, queue-centric architecture)
