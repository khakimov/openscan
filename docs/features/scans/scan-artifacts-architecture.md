# Scan Artifacts Architecture

**Status**: Design Phase
**Created**: 2025-10-27
**Owner**: Engineering

## Overview

This document defines the architecture for storing and managing scan artifacts from multiple security scanning tools (httpx, ZAP, Nuclei, etc.). The design follows a proven pattern from Footprint backend: thin canonical records with tool-specific rich payloads.

## Key Architectural Decisions

Based on analysis of the Footprint codebase and battle-tested patterns:

### 1. **One Artifact Per Port** (Not One Artifact → Many Probes)
**Footprint Pattern**: Each open port modeled as its own `Daemon` (application record)

```
✅ Our Design:
scan_artifacts: { id: "abc1", port: 80, status: "completed" }
httpx_probes:   { artifactId: "abc1", ... }

scan_artifacts: { id: "abc2", port: 443, status: "completed" }
httpx_probes:   { artifactId: "abc2", ... }
```

**Benefits**:
- Timeline shows port-level granularity
- Error handling: port failures are independent
- Worker logic: process each port independently
- UI aggregation: "3/5 ports succeeded" = COUNT query

### 2. **Normalized Tech Stack (Not JSON Array)**
**Footprint Pattern**: Normalized link tables for queryable relationships

```sql
technologies → httpx_tech_detections → httpx_probes
```

**Benefits**:
- Fast queries: "Find all nginx devices" with indexes
- Cross-tech queries: "nginx AND React"
- Name normalization: 'nginx' (lowercase canonical)
- Category grouping: web-server, framework, database

### 3. **Partial Success is Normal**
**Footprint Pattern**: Missing ports simply absent from payload, task succeeds

**Our Approach**:
- Worker probes 5 ports, 2 fail → 3 artifacts marked 'completed', 2 marked 'failed'
- Postback reports summary: `portsSuccessful: 3, portsFailed: 2`
- UI shows per-port status, no overall "failed scan" concept

### 4. **Avoid JSON for Core Queries**
**Footprint Lesson**: JSON summary fields exist but aren't used for filtering/aggregation

**Our Approach**:
- `httpx_probes.headers` = JSON (rarely queried)
- `httpx_probes.statusCode` = INTEGER (frequently filtered)
- `technologies.name` = TEXT (indexed for search)
- `scan_artifacts.metadata` = JSON (escape hatch only)

## Problem Statement

### Current State
- Port scan results stored in `scanRuns.resultSummary` JSON blob
- CVE enrichment appended to same blob
- Works for simple data, but growing pain points:
  - Cannot efficiently query "all devices running nginx"
  - JSON parsing required for every filter
  - No type safety for tool-specific fields
  - Schema evolution requires careful JSON manipulation
  - Mixing concerns (lifecycle, metadata, payload)

### Requirements
1. Store httpx probe data (screenshots, tech detection, HTTP headers)
2. Extend cleanly for future tools (ZAP, Nuclei, custom scanners)
3. Support efficient queries on typed columns
4. Maintain scan timeline and audit trail
5. Preserve tenant isolation (organizationId)
6. Enable independent tool evolution without schema conflicts

## Architecture Decision

### The Hybrid Pattern: Canonical + Rich Payload

**Inspired by Footprint's BaseApplication → ScannerApplication pattern**

```
scan_artifacts (thin metadata)
    ├── httpx_probes (rich HTTP data)
    ├── zap_findings (future: security vulns)
    └── nuclei_events (future: template results)
```

### Why This Pattern?

#### ✅ Proven in Production
Footprint backend successfully uses this pattern:
- `BaseApplication` = canonical record (metadata, timing, ownership)
- `ScannerApplication`, `AgentApplication`, `UserOverride` = rich payloads
- Adding new sources doesn't disturb core schema

#### ✅ Type Safety Without Sprawl
- Typed columns enable fast queries: `WHERE 'nginx' = ANY(tech_stack)`
- No JSON parsing overhead
- Database indexes work properly
- Type safety in application code

#### ✅ Clean Extensibility
- New scanner = new table + worker encoder
- Existing tables remain untouched
- No migration coordination required
- Tools evolve independently

#### ❌ Rejected Alternatives

**Option: Extend scanRuns.resultSummary**
- Problem: JSON blob grows unbounded, slow queries, no indexes

**Option: Single polymorphic scan_artifacts table**
- Problem: Loss of type safety, complex JSON validation, slow queries

**Option: Separate tables without canonical record**
- Problem: No unified timeline, duplicate metadata, complex queries

## Schema Design

### Core: scan_artifacts (Thin Canonical Record)

**Pattern from Footprint**: One artifact per port (like Daemon records), not one artifact with multiple probes.

```sql
CREATE TABLE scan_artifacts (
  id TEXT PRIMARY KEY,
  scanRunId TEXT NOT NULL,
  deviceId TEXT NOT NULL,
  organizationId TEXT NOT NULL,  -- Tenant isolation
  toolName TEXT NOT NULL,         -- 'httpx', 'zap', 'nuclei'
  port INTEGER,                   -- NEW: Port being scanned (for httpx, null for device-level scans)
  status TEXT NOT NULL,           -- 'pending', 'running', 'completed', 'failed'
  startedAt INTEGER,              -- timestamp_ms
  completedAt INTEGER,            -- timestamp_ms
  errorMessage TEXT,              -- Error detail if status='failed'
  metadata TEXT,                  -- JSON: { workerVersion, retries, config }
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (scanRunId) REFERENCES scanRuns(id) ON DELETE CASCADE,
  FOREIGN KEY (deviceId) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX idx_scan_artifacts_scan_run ON scan_artifacts(scanRunId);
CREATE INDEX idx_scan_artifacts_device ON scan_artifacts(deviceId);
CREATE INDEX idx_scan_artifacts_org ON scan_artifacts(organizationId);
CREATE INDEX idx_scan_artifacts_tool ON scan_artifacts(toolName);
CREATE INDEX idx_scan_artifacts_port ON scan_artifacts(port);
CREATE INDEX idx_scan_artifacts_status ON scan_artifacts(status);
```

**Purpose**: Timeline view, lifecycle tracking, ownership

**Columns**:
- `id`: Primary key (cuid2)
- `scanRunId`: Links to parent scan execution
- `deviceId`: Target device
- `organizationId`: Tenant boundary (defense-in-depth)
- `toolName`: Discriminator for tool type
- `status`: State machine for worker progress
- `startedAt/completedAt`: Timing metrics
- `metadata`: Escape hatch for tool-agnostic fields (JSON)

### Phase 1: httpx_probes (Rich HTTP Payload)

**Note**: 1:1 relationship with scan_artifacts (one probe per artifact per port).

```sql
CREATE TABLE httpx_probes (
  id TEXT PRIMARY KEY,
  artifactId TEXT NOT NULL UNIQUE, -- FK to scan_artifacts.id (1:1 relationship)
  scheme TEXT,                      -- 'http', 'https'
  statusCode INTEGER,
  title TEXT,
  screenshot TEXT,                  -- R2 object key: screenshots/{orgId}/{deviceId}/{scanRunId}/{port}.png
  headers TEXT,                     -- JSON: full HTTP headers
  responseTime INTEGER,             -- milliseconds
  contentLength INTEGER,
  finalUrl TEXT,                    -- after redirects
  tlsVersion TEXT,                  -- 'TLS 1.3'
  tlsCipher TEXT,
  serverHeader TEXT,
  contentType TEXT,
  webServer TEXT,                   -- Extracted server software
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (artifactId) REFERENCES scan_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX idx_httpx_probes_artifact ON httpx_probes(artifactId);
CREATE INDEX idx_httpx_probes_status ON httpx_probes(statusCode);
```

### Phase 1: Technology Detection (Normalized)

**Pattern from Footprint**: Normalized link tables for queryable relationships.

```sql
-- Technology catalog (pre-populated or dynamically added)
CREATE TABLE technologies (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,      -- 'nginx' (normalized lowercase)
  category TEXT,                  -- 'web-server', 'framework', 'database', 'cdn'
  createdAt INTEGER NOT NULL
);

CREATE INDEX idx_technologies_name ON technologies(name);
CREATE INDEX idx_technologies_category ON technologies(category);

-- Link httpx probes to detected technologies
CREATE TABLE httpx_tech_detections (
  id TEXT PRIMARY KEY,
  probeId TEXT NOT NULL,          -- FK to httpx_probes.id
  technologyId TEXT NOT NULL,     -- FK to technologies.id
  confidence TEXT,                -- 'high', 'medium', 'low' (from Wappalyzer)
  version TEXT,                   -- detected version (optional, e.g., '1.21.0')
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (probeId) REFERENCES httpx_probes(id) ON DELETE CASCADE,
  FOREIGN KEY (technologyId) REFERENCES technologies(id),
  UNIQUE(probeId, technologyId)  -- Prevent duplicate detections
);

CREATE INDEX idx_httpx_tech_probe ON httpx_tech_detections(probeId);
CREATE INDEX idx_httpx_tech_technology ON httpx_tech_detections(technologyId);
```

**Purpose**: Store httpx probe results per port

**Key Fields**:
- `techStack`: JSON array for Wappalyzer/httpx tech detection
- `screenshot`: R2 bucket key (not base64 blob)
- `headers`: Full HTTP headers as JSON (less critical for queries)
- `finalUrl`: Captures redirects
- `responseTime`: Performance metrics

### Phase 2: Future Tools (Not Implemented Yet)

#### zap_findings
```sql
CREATE TABLE zap_findings (
  id TEXT PRIMARY KEY,
  artifactId TEXT NOT NULL,
  alertId TEXT,
  name TEXT NOT NULL,
  riskLevel TEXT,                 -- 'High', 'Medium', 'Low', 'Informational'
  confidence TEXT,
  description TEXT,
  solution TEXT,
  evidence TEXT,
  cweid INTEGER,
  wascid INTEGER,
  url TEXT,
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (artifactId) REFERENCES scan_artifacts(id) ON DELETE CASCADE
);
```

#### nuclei_events
```sql
CREATE TABLE nuclei_events (
  id TEXT PRIMARY KEY,
  artifactId TEXT NOT NULL,
  templateId TEXT NOT NULL,
  templateName TEXT,
  severity TEXT,                  -- 'critical', 'high', 'medium', 'low', 'info'
  matchedAt TEXT,                 -- URL or endpoint
  extractedData TEXT,             -- JSON: template-specific extractions
  tags TEXT,                      -- JSON array
  createdAt INTEGER NOT NULL,

  FOREIGN KEY (artifactId) REFERENCES scan_artifacts(id) ON DELETE CASCADE
);
```

## Happy Path: End-to-End Flow

### Complete Flow from Port Scan → Screenshot Display

This section walks through the entire happy path with concrete examples of data at each step.

#### Step 1: Port Scan Completes

**What happens**: Restate port scanner finishes, sends postback to user-application

**Postback payload**:
```json
{
  "type": "PORT_SCAN",
  "scanId": "scan_abc123",
  "deviceId": "dev_xyz789",
  "organizationId": "org_company1",
  "status": "SUCCESS",
  "timestamp": "2025-10-27T14:30:00Z",
  "data": {
    "target": "app.example.com",
    "ports": [
      { "port": 80, "protocol": "tcp", "state": "open", "service": { "name": "http" } },
      { "port": 443, "protocol": "tcp", "state": "open", "service": { "name": "https" } },
      { "port": 8080, "protocol": "tcp", "state": "open", "service": { "name": "http-proxy" } }
    ],
    "hostsUp": 1
  }
}
```

**Storage**: Postback handler updates `scanRuns.resultSummary`:
```sql
UPDATE scanRuns
SET resultSummary = json_set(resultSummary, '$.ports', [...])
WHERE id = 'scan_abc123';
```

**Result**: `scanRuns.resultSummary` now contains:
```json
{
  "ports": [
    { "port": 80, "state": "open", "service": "http" },
    { "port": 443, "state": "open", "service": "https" },
    { "port": 8080, "state": "open", "service": "http-proxy" }
  ],
  "hostsUp": 1,
  "scanDuration": 45000
}
```

---

#### Step 2: Trigger httpx Scan

**What happens**: User-application detects HTTP/HTTPS ports, triggers httpx workflow

**Decision logic**:
```typescript
const httpPorts = scanResult.ports.filter(p =>
  p.state === 'open' &&
  ['http', 'https', 'http-proxy'].includes(p.service?.name)
);

if (httpPorts.length > 0) {
  await restateClient.httpxProbe({
    scanRunId: 'scan_abc123',
    deviceId: 'dev_xyz789',
    organizationId: 'org_company1',
    target: 'app.example.com',
    ports: [80, 443, 8080]  // Extracted HTTP ports
  });
}
```

**Restate workflow invoked**:
```
Workflow: httpxProbe
Input: {
  scanRunId: "scan_abc123",
  deviceId: "dev_xyz789",
  organizationId: "org_company1",
  target: "app.example.com",
  ports: [80, 443, 8080]
}
```

---

#### Step 3: httpx Worker Execution (Per Port)

**What happens**: Screenshot-worker probes each port independently

**For Port 80** (first iteration):

**3a. Create scan_artifact**:
```typescript
const artifactId = await createScanArtifact({
  id: 'artifact_80_xyz',
  scanRunId: 'scan_abc123',
  deviceId: 'dev_xyz789',
  organizationId: 'org_company1',
  toolName: 'httpx',
  port: 80,
  status: 'pending',
  createdAt: Date.now()
});
```

**Database state**:
```sql
-- scan_artifacts table
id: 'artifact_80_xyz'
scanRunId: 'scan_abc123'
deviceId: 'dev_xyz789'
organizationId: 'org_company1'
toolName: 'httpx'
port: 80
status: 'pending'
startedAt: NULL
completedAt: NULL
```

**3b. Update to 'running'**:
```typescript
await updateArtifactStatus('artifact_80_xyz', 'running', Date.now());
```

**3c. Execute httpx**:
```bash
# Screenshot-worker runs:
httpx -u http://app.example.com:80 \
  -screenshot \
  -tech-detect \
  -json
```

**httpx output**:
```json
{
  "url": "http://app.example.com:80",
  "status_code": 200,
  "title": "Example App - Login",
  "scheme": "http",
  "webserver": "nginx/1.24.0",
  "content_type": "text/html",
  "content_length": 4521,
  "response_time": "245ms",
  "technologies": ["Nginx:1.24.0", "React:18.2.0", "Webpack:5.88.0"],
  "screenshot": "./output/screenshot_1234.png",
  "final_url": "http://app.example.com/login"
}
```

---

#### Step 4: Screenshot Upload to R2

**What happens**: Worker uploads screenshot to existing R2 bucket

**R2 bucket structure** (assuming bucket already exists):
```
Bucket: openscan-screenshots (production)
       openscan-screenshots-dev (development)

Path structure:
  {organizationId}/
    {deviceId}/
      {scanRunId}/
        {port}-{timestamp}.png
```

**Upload operation**:
```typescript
const screenshotBuffer = fs.readFileSync('./output/screenshot_1234.png');
const r2Key = `${organizationId}/${deviceId}/${scanRunId}/${port}-${Date.now()}.png`;

// Worker has R2 binding from wrangler.jsonc
await env.SCREENSHOTS.put(r2Key, screenshotBuffer, {
  httpMetadata: {
    contentType: 'image/png'
  },
  customMetadata: {
    deviceId: 'dev_xyz789',
    port: '80',
    scanRunId: 'scan_abc123'
  }
});
```

**R2 object created**:
```
Key: org_company1/dev_xyz789/scan_abc123/80-1730038200000.png
Size: 245 KB
Content-Type: image/png
Metadata: {
  deviceId: "dev_xyz789",
  port: "80",
  scanRunId: "scan_abc123"
}
```

---

#### Step 5: Store httpx Probe Data

**What happens**: Worker inserts probe result into database

**5a. Insert httpx_probes**:
```typescript
await db.insert(httpx_probes).values({
  id: 'probe_80_abc',
  artifactId: 'artifact_80_xyz',  // Links to scan_artifacts
  scheme: 'http',
  statusCode: 200,
  title: 'Example App - Login',
  screenshot: 'org_company1/dev_xyz789/scan_abc123/80-1730038200000.png',  // R2 key
  headers: JSON.stringify({
    'server': 'nginx/1.24.0',
    'content-type': 'text/html; charset=utf-8',
    'x-powered-by': 'Express'
  }),
  responseTime: 245,
  contentLength: 4521,
  finalUrl: 'http://app.example.com/login',
  tlsVersion: null,
  webServer: 'nginx/1.24.0',
  contentType: 'text/html',
  createdAt: Date.now()
});
```

**Database state**:
```sql
-- httpx_probes table
id: 'probe_80_abc'
artifactId: 'artifact_80_xyz'
scheme: 'http'
statusCode: 200
title: 'Example App - Login'
screenshot: 'org_company1/dev_xyz789/scan_abc123/80-1730038200000.png'
responseTime: 245
webServer: 'nginx/1.24.0'
finalUrl: 'http://app.example.com/login'
```

---

#### Step 6: Store Tech Detections (Normalized)

**What happens**: Worker normalizes tech names and creates link records

**6a. Process Wappalyzer output**:
```typescript
const rawTech = ['Nginx:1.24.0', 'React:18.2.0', 'Webpack:5.88.0'];

for (const tech of rawTech) {
  const [name, version] = tech.split(':');
  const normalizedName = name.toLowerCase();  // 'nginx', 'react', 'webpack'

  // Ensure technology exists in catalog
  let techId = await findOrCreateTechnology(normalizedName, 'web-server');

  // Create detection link
  await db.insert(httpx_tech_detections).values({
    id: createId(),
    probeId: 'probe_80_abc',
    technologyId: techId,
    confidence: 'high',  // from Wappalyzer
    version: version,
    createdAt: Date.now()
  });
}
```

**Database state**:
```sql
-- technologies table
id: 'tech_nginx'     | name: 'nginx'    | category: 'web-server'
id: 'tech_react'     | name: 'react'    | category: 'framework'
id: 'tech_webpack'   | name: 'webpack'  | category: 'build-tool'

-- httpx_tech_detections table
id: 'det_1' | probeId: 'probe_80_abc' | technologyId: 'tech_nginx'   | version: '1.24.0'
id: 'det_2' | probeId: 'probe_80_abc' | technologyId: 'tech_react'   | version: '18.2.0'
id: 'det_3' | probeId: 'probe_80_abc' | technologyId: 'tech_webpack' | version: '5.88.0'
```

---

#### Step 7: Mark Artifact Complete

**What happens**: Worker updates artifact status to 'completed'

```typescript
await updateArtifactStatus('artifact_80_xyz', 'completed', Date.now());
```

**Database state**:
```sql
-- scan_artifacts table (updated)
id: 'artifact_80_xyz'
status: 'completed'  -- Changed from 'running'
startedAt: 1730038100000
completedAt: 1730038145000  -- 45 seconds later
```

**Repeat Steps 3-7 for ports 443 and 8080** → Creates 2 more artifacts, probes, tech detections

---

#### Step 8: Send Postback Summary

**What happens**: Worker sends completion event to user-application

**Postback payload**:
```json
{
  "type": "HTTPX_COMPLETE",
  "scanRunId": "scan_abc123",
  "deviceId": "dev_xyz789",
  "organizationId": "org_company1",
  "timestamp": "2025-10-27T14:32:00Z",
  "summary": {
    "portsScanned": 3,
    "portsSuccessful": 3,
    "portsFailed": 0,
    "screenshotsCaptured": 3,
    "technologiesDetected": 5,
    "artifactIds": [
      "artifact_80_xyz",
      "artifact_443_xyz",
      "artifact_8080_xyz"
    ]
  }
}
```

**Postback handler** (user-application):
```typescript
export async function handleHttpxPostback(payload) {
  // Update scan run with httpx metadata
  await db.update(scanRuns)
    .set({
      metadata: sql`json_set(metadata, '$.httpxCompleted', true)`
    })
    .where(eq(scanRuns.id, payload.scanRunId));

  // Trigger UI notification
  await notifyUser({
    organizationId: payload.organizationId,
    message: `httpx scan completed: ${payload.summary.portsSuccessful}/${payload.summary.portsScanned} ports`,
    link: `/devices/${payload.deviceId}/artifacts`
  });
}
```

---

#### Step 9: UI Data Retrieval

**What happens**: User views device in UI, needs to display artifacts

**9a. Timeline Query**:
```typescript
// Route: /devices/[deviceId]/artifacts
export const getDeviceArtifacts = createServerFn()
  .handler(async ({ deviceId }) => {
    const organizationId = await getCurrentOrganizationId();

    const artifacts = await db
      .select({
        artifactId: scan_artifacts.id,
        port: scan_artifacts.port,
        status: scan_artifacts.status,
        createdAt: scan_artifacts.createdAt,
        completedAt: scan_artifacts.completedAt,
        // Join probe data
        probeId: httpx_probes.id,
        statusCode: httpx_probes.statusCode,
        title: httpx_probes.title,
        screenshot: httpx_probes.screenshot,
        webServer: httpx_probes.webServer,
        // Aggregate tech stack
        technologies: sql<string[]>`
          json_group_array(
            json_object(
              'name', technologies.name,
              'version', httpx_tech_detections.version
            )
          )
        `
      })
      .from(scan_artifacts)
      .leftJoin(httpx_probes, eq(httpx_probes.artifactId, scan_artifacts.id))
      .leftJoin(httpx_tech_detections, eq(httpx_tech_detections.probeId, httpx_probes.id))
      .leftJoin(technologies, eq(technologies.id, httpx_tech_detections.technologyId))
      .where(and(
        eq(scan_artifacts.deviceId, deviceId),
        eq(scan_artifacts.organizationId, organizationId)
      ))
      .groupBy(scan_artifacts.id, httpx_probes.id)
      .orderBy(desc(scan_artifacts.createdAt))
      .limit(50);

    return artifacts;
  });
```

**Query result**:
```typescript
[
  {
    artifactId: 'artifact_80_xyz',
    port: 80,
    status: 'completed',
    createdAt: 1730038100000,
    completedAt: 1730038145000,
    probeId: 'probe_80_abc',
    statusCode: 200,
    title: 'Example App - Login',
    screenshot: 'org_company1/dev_xyz789/scan_abc123/80-1730038200000.png',
    webServer: 'nginx/1.24.0',
    technologies: [
      { name: 'nginx', version: '1.24.0' },
      { name: 'react', version: '18.2.0' },
      { name: 'webpack', version: '5.88.0' }
    ]
  },
  {
    artifactId: 'artifact_443_xyz',
    port: 443,
    status: 'completed',
    // ... similar data for port 443
  },
  {
    artifactId: 'artifact_8080_xyz',
    port: 8080,
    status: 'completed',
    // ... similar data for port 8080
  }
]
```

---

#### Step 10: Screenshot Display (Signed URLs)

**What happens**: UI needs to display screenshot, generates signed URL from R2

**10a. Generate signed URL**:
```typescript
// Server function to get signed URL
export const getScreenshotUrl = createServerFn()
  .handler(async ({ screenshotKey, deviceId }) => {
    const organizationId = await getCurrentOrganizationId();

    // Validate device belongs to organization
    const device = await db.query.devices.findFirst({
      where: and(
        eq(devices.id, deviceId),
        eq(devices.organizationId, organizationId)
      )
    });

    if (!device) {
      throw new Error('Device not found or access denied');
    }

    // Generate signed URL (valid for 1 hour)
    // Note: R2 signed URLs via Workers API
    const url = await env.SCREENSHOTS.createSignedUrl(screenshotKey, {
      expiresIn: 3600  // 1 hour
    });

    return { url };
  });
```

**10b. UI Component**:
```tsx
function ArtifactTimeline({ artifacts }) {
  return (
    <div className="space-y-4">
      {artifacts.map(artifact => (
        <div key={artifact.artifactId} className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Port {artifact.port}</h3>
              <p className="text-sm text-muted-foreground">{artifact.title}</p>
            </div>
            <Badge>{artifact.statusCode}</Badge>
          </div>

          {/* Screenshot with signed URL */}
          <ScreenshotViewer
            screenshotKey={artifact.screenshot}
            deviceId={artifact.deviceId}
          />

          {/* Tech stack */}
          <div className="flex gap-2 mt-2">
            {artifact.technologies.map(tech => (
              <Badge key={tech.name} variant="secondary">
                {tech.name} {tech.version}
              </Badge>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Scanned {formatDistanceToNow(artifact.createdAt)} ago
          </p>
        </div>
      ))}
    </div>
  );
}

function ScreenshotViewer({ screenshotKey, deviceId }) {
  const [signedUrl, setSignedUrl] = useState(null);

  useEffect(() => {
    // Fetch signed URL from server
    getScreenshotUrl({ screenshotKey, deviceId })
      .then(({ url }) => setSignedUrl(url));
  }, [screenshotKey, deviceId]);

  if (!signedUrl) return <Skeleton className="h-48 w-full" />;

  return (
    <img
      src={signedUrl}
      alt="Screenshot"
      className="rounded-md mt-2 cursor-pointer"
      onClick={() => openLightbox(signedUrl)}
    />
  );
}
```

---

### Summary: Data Storage Locations

| Data Type | Storage | Access Pattern |
|-----------|---------|----------------|
| **Port scan results** | `scanRuns.resultSummary` (JSON) | Query by scanRunId |
| **Artifact metadata** | `scan_artifacts` table | Query by deviceId + organizationId |
| **HTTP probe results** | `httpx_probes` table | Join via artifactId |
| **Tech detections** | `httpx_tech_detections` + `technologies` | Join via probeId → technologyId |
| **Screenshots** | R2 bucket (object storage) | Signed URL from R2 key |
| **Timeline view** | Join: `scan_artifacts` + `httpx_probes` + tech | Ordered by createdAt DESC |
| **Tech search** | `technologies` → `httpx_tech_detections` | Filter by technology name |

### Key Performance Paths

**1. Device Timeline** (most common):
```sql
-- Single query with all data
SELECT * FROM scan_artifacts sa
LEFT JOIN httpx_probes hp ON hp.artifactId = sa.id
WHERE sa.deviceId = ? AND sa.organizationId = ?
ORDER BY sa.createdAt DESC
LIMIT 50;
```

**2. Tech Stack Search**:
```sql
-- Find all devices running nginx
SELECT DISTINCT d.id, d.name
FROM devices d
JOIN scan_artifacts sa ON sa.deviceId = d.id
JOIN httpx_probes hp ON hp.artifactId = sa.id
JOIN httpx_tech_detections htd ON htd.probeId = hp.id
JOIN technologies t ON t.id = htd.technologyId
WHERE t.name = 'nginx' AND d.organizationId = ?;
```

**3. Screenshot Access**:
```
1. Query httpx_probes.screenshot → Get R2 key
2. Call env.SCREENSHOTS.createSignedUrl(key) → Get signed URL
3. Return URL to UI (valid 1 hour)
4. Browser fetches from R2 directly (fast, no proxy)
```

---

## Data Flow

### 1. Scan Initiation (User-Application)
```
User triggers scan → Restate workflow → Creates scanRun record
  → Queries scanRuns.resultSummary for open ports
```

### 2. Worker Execution (Screenshot-Worker)

**Pattern: One artifact per port** (matching Footprint's Daemon approach)

```
1. Restate invokes httpxProbe workflow with target device + open ports
2. For each open port:
   a. Worker creates scan_artifact (status='pending', port=X)
   b. Worker updates status='running'
   c. httpx executes against target:port
   d. On success:
      - Upload screenshot to R2 (key: screenshots/{orgId}/{deviceId}/{scanRunId}/{port}.png)
      - Insert httpx_probes record
      - Insert httpx_tech_detections records (if Wappalyzer data available)
      - Update scan_artifact (status='completed', completedAt)
   e. On failure:
      - Update scan_artifact (status='failed', errorMessage)
   f. Continue to next port (partial success is OK)
3. Worker sends postback to user-application with summary:
   {
     scanRunId,
     deviceId,
     portsScanned: 5,
     portsSuccessful: 3,
     portsFailed: 2,
     artifactIds: [...]
   }
```

### 3. Postback Handler (User-Application)
```
1. Receives httpx completion event
2. Queries scan_artifacts for summary metrics:
   - COUNT(status='completed')
   - COUNT(status='failed')
3. Updates UI notification system
4. Returns aggregate stats to UI
```

### 4. UI Display

**Timeline View** (Device-level):
```sql
SELECT
  sa.id,
  sa.port,
  sa.toolName,
  sa.status,
  sa.createdAt,
  hp.statusCode,
  hp.title,
  hp.screenshot
FROM scan_artifacts sa
LEFT JOIN httpx_probes hp ON hp.artifactId = sa.id
WHERE sa.deviceId = ?
  AND sa.organizationId = ?
ORDER BY sa.createdAt DESC
LIMIT 50;
```

**Tech Stack Search** (Find devices running nginx):
```sql
SELECT DISTINCT
  d.id,
  d.name,
  sa.port,
  hp.finalUrl
FROM devices d
JOIN scan_artifacts sa ON sa.deviceId = d.id
JOIN httpx_probes hp ON hp.artifactId = sa.id
JOIN httpx_tech_detections htd ON htd.probeId = hp.id
JOIN technologies t ON t.id = htd.technologyId
WHERE t.name = 'nginx'
  AND d.organizationId = ?
ORDER BY d.name;
```

**Tech Stack Aggregation** (Dashboard):
```sql
-- Top 10 technologies across organization
SELECT
  t.name,
  t.category,
  COUNT(DISTINCT sa.deviceId) AS deviceCount,
  COUNT(DISTINCT hp.id) AS probeCount
FROM technologies t
JOIN httpx_tech_detections htd ON htd.technologyId = t.id
JOIN httpx_probes hp ON hp.id = htd.probeId
JOIN scan_artifacts sa ON sa.id = hp.artifactId
WHERE sa.organizationId = ?
GROUP BY t.id, t.name, t.category
ORDER BY deviceCount DESC
LIMIT 10;
```

## Integration Points

### 1. Screenshot Storage (R2)

**Bucket Structure**:
```
screenshots/
  {organizationId}/
    {deviceId}/
      {scanRunId}/
        {port}-{timestamp}.png
```

**Key Format**: `screenshots/{orgId}/{deviceId}/{scanRunId}/{port}-{timestamp}.png`

**Access**:
- Workers have R2 write access
- User-application generates signed URLs for UI
- TTL: 90 days (configurable)

### 2. Data-Ops Layer

New queries in `packages/data-ops/src/queries/scan-artifacts.ts`:

```typescript
// Create artifact record
export async function createScanArtifact(data: {
  scanRunId: string;
  deviceId: string;
  organizationId: string;
  toolName: string;
}): Promise<string>  // Returns artifactId

// Update artifact status
export async function updateArtifactStatus(
  artifactId: string,
  status: 'running' | 'completed' | 'failed',
  completedAt?: Date
): Promise<void>

// Insert httpx probe
export async function insertHttpxProbe(data: {
  artifactId: string;
  port: number;
  screenshot?: string;
  techStack?: string[];
  // ... other fields
}): Promise<void>

// Query artifacts by device
export async function getArtifactsByDevice(
  deviceId: string,
  organizationId: string
): Promise<ScanArtifact[]>

// Query httpx probes by artifact
export async function getHttpxProbes(
  artifactId: string,
  organizationId: string
): Promise<HttpxProbe[]>
```

### 3. Screenshot-Worker Updates

**New responsibilities**:
1. Create `scan_artifacts` record at start
2. Update status throughout execution
3. Upload screenshots to R2
4. Insert `httpx_probes` records
5. Handle errors gracefully (mark artifact as 'failed')

**Configuration** (wrangler.jsonc):
```json
{
  "r2_buckets": [
    { "binding": "SCREENSHOTS", "bucket_name": "openscan-screenshots" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_id": "..." }
  ]
}
```

## State Machine

### scan_artifacts.status

```
┌─────────┐
│ pending │ (artifact created, worker not started)
└────┬────┘
     │
     ▼
┌─────────┐
│ running │ (worker executing)
└────┬────┘
     │
     ├──────────┐
     ▼          ▼
┌───────────┐ ┌────────┐
│ completed │ │ failed │
└───────────┘ └────────┘
```

**Transitions**:
- `pending → running`: Worker starts execution
- `running → completed`: All probes successful
- `running → failed`: Worker error or timeout
- No backwards transitions

## Security & Tenant Isolation

### Defense-in-Depth

1. **scan_artifacts.organizationId**: First-class tenant field
2. **Foreign keys**: Device must belong to organization
3. **Data-ops validation**: All queries require organizationId
4. **R2 bucket structure**: Organization-scoped paths
5. **Signed URLs**: Time-limited access to screenshots

### Access Control Pattern

```typescript
// ✅ CORRECT: Always pass organizationId
export async function getArtifactsByDevice(
  deviceId: string,
  organizationId: string  // Required!
) {
  const artifacts = await db
    .select()
    .from(scan_artifacts)
    .where(and(
      eq(scan_artifacts.deviceId, deviceId),
      eq(scan_artifacts.organizationId, organizationId)  // ← Security boundary
    ));

  return artifacts;
}
```

## Implementation Phases

### Phase 1: Foundation (Current)
- [ ] Create migration for `scan_artifacts` + `httpx_probes`
- [ ] Create R2 bucket
- [ ] Add data-ops queries
- [ ] Update screenshot-worker to use new schema
- [ ] Test with httpx integration

### Phase 2: UI Integration
- [ ] Artifact timeline component
- [ ] Screenshot viewer with signed URLs
- [ ] Tech stack filters
- [ ] Performance metrics dashboard

### Phase 3: Future Scanners
- [ ] ZAP integration (zap_findings table)
- [ ] Nuclei integration (nuclei_events table)
- [ ] Custom scanner framework

## Migration Strategy

### Database Migration

```typescript
// packages/data-ops/migrations/YYYYMMDD_scan_artifacts.sql
CREATE TABLE scan_artifacts (...);
CREATE TABLE httpx_probes (...);
CREATE INDEX ...;
```

### Backwards Compatibility

**Keep existing `scanRuns.resultSummary` for port scans**:
- Port scan data stays in JSON blob (working, no need to migrate)
- New httpx data goes to new tables
- CVE enrichment stays in resultSummary (attached to port scans)

**No breaking changes**: Adding tables doesn't affect existing code

## Learnings from Footprint Codebase

### Confirmed Patterns

1. **One Artifact Per Port** ✅
   - Footprint models each open port as its own `Daemon` (application record)
   - Timeline views work at daemon (port) level
   - UI aggregation ("scan captured 3 ports") is derived metric
   - Worker complexity stays low - each port is independent

2. **Partial Success is Normal** ✅
   - `run_scan()` continues even if some ports fail
   - Missing/filtered ports are simply absent from payload
   - Task succeeds with whatever data it got
   - Individual port failures don't fail entire scan

3. **Normalized Data Beats JSON** ✅
   - Heavy lifting always happens in per-table columns, not JSON blobs
   - JSON "summary" fields exist but aren't used for core queries
   - Single canonical table (`base_applications`) feeding multiple sources

4. **Idempotency & Watchdogs Matter** ⚠️
   - `tasks` and `active_tasks` tables have complex state wrangling
   - Lesson: Design cleanup jobs for orphaned artifacts upfront
   - Need clear strategy for stuck "running" states

### No Evidence Found

1. **Tech Stack Detection** - No Wappalyzer-style feature in Footprint
2. **Screenshot Management** - No screenshot subsystem
3. **Restate Integration** - No Restate workflow patterns
4. **Postback Payloads** - Inter-service contracts not exposed

## Open Questions

### 1. Screenshot Storage (No Footprint Precedent)
- **R2 bucket name**: `openscan-screenshots` (prod), `openscan-screenshots-dev` (dev)?
- **TTL policy**: 90 days? Configurable per org?
- **Size limits**: Max screenshot size (5MB?)? Compress before upload (WebP)?
- **Cost model**: Need estimates for 10k screenshots/month
- **CDN**: Put CloudFlare CDN in front of R2 for faster access?

### 2. Tech Stack Normalization
- **Name canonicalization**: Force lowercase? Handle variations (nginx vs Nginx vs NGINX)?
- **Technology catalog**: Pre-seed common techs or dynamic insertion?
- **Wappalyzer categories**: Map to our categories or use theirs?
- **Confidence thresholds**: Filter out 'low' confidence detections?

### 3. Artifact Lifecycle & Cleanup
- **Retention policy**: Auto-delete artifacts after X days? (Footprint unknown)
- **Watchdog job**: Cleanup stuck "running" artifacts (no activity for 1 hour)?
- **Screenshot sync**: Delete screenshots when artifact deleted?
- **Compliance mode**: "Keep forever" option for certain devices?

### 4. Restate ↔ Database Sync
- **Workflow mapping**: Does Restate workflow ID = scanRunId?
- **Artifact creation**: Worker creates artifact or Restate?
- **Idempotency**: How to handle Restate retries (duplicate artifacts)?
- **Orphaned states**: Restate succeeds but postback fails - recovery?

### 5. Query Performance
- **Most expensive query**: Timeline with filters? Tech stack aggregation?
- **Pagination**: Offset-based or cursor-based for large result sets?
- **Materialized views**: Need summary tables for dashboard metrics?

## Success Metrics

### Technical
- Query performance: <100ms for artifact list queries
- Screenshot upload: <5s per image to R2
- Storage efficiency: <10MB per device per scan

### Product
- Tech stack filtering enables asset inventory
- Screenshot timeline improves security review workflow
- Multi-tool support enables custom scanner workflows

## References

- **Footprint Pattern**: `back/footprint_app/port_scanner/models.py:30` (BaseApplication)
- **Data Flow**: `docs/port_scanner_data_flow.md:32` (PortScannerResultsProcessor)
- **Existing Schema**: `packages/data-ops/src/schema/inventory.ts` (scanRuns)

## Changelog

- **2025-10-27**: Initial design document created
