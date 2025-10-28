# Scan Artifacts - Future Improvements & Architectural Alternatives

This document captures architectural alternatives and future improvements for the scan artifacts system, deferred from the initial implementation but worth considering for future iterations.

**Status**: Ideas for future consideration (not currently implemented)
**Last Updated**: 2025-10-28
**Related**: SCAN_ARTIFACTS_ARCHITECTURE.md

---

## Table of Contents

1. [Retention & Archival Strategy](#retention--archival-strategy)
2. [Alternative Schema Patterns](#alternative-schema-patterns)
3. [Technology Stack Storage](#technology-stack-storage)
4. [Performance Optimizations](#performance-optimizations)
5. [Screenshot Storage](#screenshot-storage)
6. [Unified Vulnerability Model](#unified-vulnerability-model)

---

## 1. Retention & Archival Strategy

### Problem Statement

With continuous scanning, artifact data can grow significantly:
- **2,000 hosts** × **20 ports** × **daily scans** × **30 days** = **1.2M artifacts/month**
- D1 database has practical limits on row count and storage
- Old scan data loses value over time but may be needed for compliance/audit

### Current State

- ❌ No retention policy implemented
- ❌ All artifacts kept indefinitely
- ❌ No archival mechanism

### Proposed Solution: Retention Column

Add a `retentionDays` column to `scan_artifacts` table:

```sql
ALTER TABLE scan_artifacts ADD COLUMN retention_days INTEGER DEFAULT 90;
```

**Usage Pattern**:

```typescript
// Configure retention by tool
const retentionPolicies = {
  httpx: 90,        // Keep httpx probes for 90 days
  zap: 180,         // Keep ZAP scans for 6 months (compliance)
  nikto: 30,        // Keep Nikto scans for 30 days
  nmap: 365,        // Keep port scans for 1 year
};

// Scheduled cleanup job (daily)
async function cleanupExpiredArtifacts() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // Example: 90 days ago

  await db
    .delete(scanArtifacts)
    .where(
      and(
        lt(scanArtifacts.createdAt, cutoffDate),
        eq(scanArtifacts.status, 'completed')
      )
    );
}
```

### Alternative: Archival to R2

For compliance requirements where data must be retained longer:

```typescript
// Archive artifacts older than retention period to R2
async function archiveOldArtifacts(toolName: string, retentionDays: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // 1. Query artifacts to archive
  const artifacts = await db
    .select()
    .from(scanArtifacts)
    .where(
      and(
        eq(scanArtifacts.toolName, toolName),
        lt(scanArtifacts.createdAt, cutoffDate)
      )
    );

  // 2. Export to JSONL and upload to R2
  const archiveKey = `archives/${toolName}/${year}-${month}.jsonl.gz`;
  await env.R2_BUCKET.put(archiveKey, compressedData, {
    customMetadata: {
      recordCount: artifacts.length.toString(),
      retentionYears: '7', // Compliance requirement
    },
  });

  // 3. Delete from D1 (now safely archived)
  await db.delete(scanArtifacts).where(
    sql`id IN (${artifacts.map(a => a.id).join(',')})`
  );
}
```

**Benefits**:
- ✅ Keeps D1 database lean (only active data)
- ✅ Meets compliance requirements (long-term storage in R2)
- ✅ Cost-effective (R2 storage cheaper than D1 at scale)
- ✅ Can restore from archive if needed

**Drawbacks**:
- ❌ Archived data not queryable (requires restore)
- ❌ Additional complexity (archival job, restore process)

---

## 2. Alternative Schema Patterns

### Current Pattern: One Artifact Per Port

```
scan_artifacts (one row per port)
  └── httpx_probes (one row per artifact, optional)
```

**Pros**:
- ✅ Simple, clean separation
- ✅ Independent error handling per port
- ✅ Clear timeline views
- ✅ Easy to extend with new tools

**Cons**:
- ❌ Row explosion at scale (1.2M rows/month)
- ❌ Table sprawl (N tools → 2N tables)

### Alternative 1: One Artifact Per Device × Tool

```
scan_artifacts (one row per device+tool combination)
  └── httpx_port_probes (child table with port-specific data)
```

**Schema**:

```sql
CREATE TABLE scan_artifacts (
  id TEXT PRIMARY KEY,
  scan_run_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  ports_scanned INTEGER, -- Count of ports
  metadata TEXT, -- Tool-specific summary
  UNIQUE (device_id, scan_run_id, tool_name) -- Idempotency
);

CREATE TABLE httpx_port_probes (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES scan_artifacts(id),
  port INTEGER NOT NULL,
  scheme TEXT,
  status_code INTEGER,
  title TEXT,
  -- ... other fields
  UNIQUE (artifact_id, port)
);
```

**Benefits**:
- ✅ Reduces row count in scan_artifacts (2K rows vs 1.2M rows)
- ✅ Easier to track "scan completion" (one row = one device scan)
- ✅ Better for batch operations (update all ports at once)

**Drawbacks**:
- ❌ More complex error handling (partial failures need child table updates)
- ❌ Nested queries for port-specific data
- ❌ Harder to show "per-port timeline" in UI

**When to Consider**: If you have >10M artifacts and D1 performance degrades

### Alternative 2: Unified Tool Events Table (JSON-heavy)

```sql
CREATE TABLE tool_events (
  id TEXT PRIMARY KEY,
  scan_run_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'probe', 'scan', 'detection'
  payload TEXT NOT NULL, -- JSON blob with tool-specific data
  -- Generated columns for common queries
  status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')),
  port INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.port')),
  created_at INTEGER DEFAULT (unixepoch('now') * 1000) NOT NULL
);

CREATE INDEX tool_events_port_idx ON tool_events (port);
CREATE INDEX tool_events_status_idx ON tool_events (status);
```

**Benefits**:
- ✅ No schema changes needed for new tools
- ✅ Single table for all events
- ✅ Flexible payload structure

**Drawbacks**:
- ❌ JSON queries slower than typed columns
- ❌ Generated columns add overhead
- ❌ Schema validation happens at application layer
- ❌ Harder to enforce constraints

**When to Consider**: If you have >20 different scanner types and schema evolution is a major pain point

---

## 3. Technology Stack Storage

### Current Pattern: Normalized Technology Catalog

```
technologies (normalized names: "nginx", "react")
  └── httpx_tech_detections (junction table with confidence/version)
```

**Pros**:
- ✅ Efficient aggregation queries ("count devices by tech")
- ✅ Consistent naming (normalization)
- ✅ Easy to add tech metadata (category, vendor, EOL date)

**Cons**:
- ❌ 2 extra joins per query
- ❌ Complexity for simple lookups

### Alternative: JSONB Tech Stack Array

Store technologies directly in `httpx_probes.metadata`:

```typescript
{
  technologies: [
    { name: "nginx", version: "1.24.0", confidence: "high" },
    { name: "react", version: "18.2.0", confidence: "medium" }
  ]
}
```

**Benefits**:
- ✅ No joins needed for probe details
- ✅ Faster read queries
- ✅ Simpler schema (2 fewer tables)

**Drawbacks**:
- ❌ Harder to aggregate ("count all devices with nginx")
- ❌ Duplicated data (same tech stored in multiple rows)
- ❌ Can't enforce referential integrity

**When to Consider**: If tech detection is display-only and you never aggregate by technology

### Hybrid Approach

Use both patterns:
- Store technologies in metadata JSON for fast reads
- Background job populates normalized tables for aggregation queries

```typescript
// Fast read path (no joins)
const probe = await getHttpxProbe(probeId);
const techs = probe.metadata?.technologies || [];

// Analytics path (joins for aggregation)
const stats = await getTechnologyStats(organizationId);
// Uses normalized tables: technologies + httpx_tech_detections
```

---

## 4. Performance Optimizations

### Partitioning Strategy (Future: D1 Feature Dependent)

If D1 supports partitioning in the future:

```sql
-- Partition by month (time-based queries)
CREATE TABLE scan_artifacts_2025_01 PARTITION OF scan_artifacts
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE scan_artifacts_2025_02 PARTITION OF scan_artifacts
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

**Benefits**:
- ✅ Queries on recent data hit smaller partition
- ✅ Easy to drop old partitions (archival)
- ✅ Parallel query execution

### Materialized Views for Analytics

Pre-compute expensive aggregations:

```sql
-- Update daily via scheduled job
CREATE TABLE technology_stats_snapshot AS
  SELECT
    technologies.name,
    technologies.category,
    COUNT(DISTINCT scan_artifacts.device_id) AS device_count,
    COUNT(DISTINCT scan_artifacts.id) AS port_count,
    MAX(scan_artifacts.created_at) AS last_seen
  FROM technologies
  INNER JOIN httpx_tech_detections ON httpx_tech_detections.technology_id = technologies.id
  INNER JOIN httpx_probes ON httpx_probes.id = httpx_tech_detections.probe_id
  INNER JOIN scan_artifacts ON scan_artifacts.id = httpx_probes.artifact_id
  WHERE scan_artifacts.organization_id = ?
  GROUP BY technologies.id;
```

**Benefits**:
- ✅ Dashboard queries become simple SELECT * FROM snapshot
- ✅ No real-time join cost
- ✅ Can add pre-computed metrics (trends, deltas)

**Drawbacks**:
- ❌ Snapshot is stale (up to 24 hours old)
- ❌ Storage overhead (duplicate data)

---

## 5. Screenshot Storage

### Current Implementation: PNG in R2

```typescript
await env.R2_BUCKET.put(
  `screenshots/${artifactId}.png`,
  pngBuffer,
  { httpMetadata: { contentType: 'image/png' } }
);
```

**Current Size**: ~500KB - 2MB per screenshot (PNG)

### Improvement: WebP Lossless Compression

```typescript
import sharp from 'sharp';

// Convert PNG to WebP lossless
const webpBuffer = await sharp(pngBuffer)
  .webp({
    quality: 85,
    lossless: true,
  })
  .toBuffer();

await env.R2_BUCKET.put(
  `screenshots/${artifactId}.webp`,
  webpBuffer,
  { httpMetadata: { contentType: 'image/webp' } }
);
```

**Benefits**:
- ✅ 70% size reduction (500KB PNG → 150KB WebP)
- ✅ No visual quality loss (lossless mode)
- ✅ Faster download times
- ✅ Lower R2 storage costs

**Drawbacks**:
- ❌ Slight processing overhead (sharp conversion)
- ❌ Browser compatibility (98% support, but not 100%)

**Implementation**: Update screenshot-worker to compress before upload

### Alternative: Lazy Screenshot Generation

Don't take screenshots by default - only on-demand:

```typescript
// Store only metadata initially
await createHttpxProbe({
  artifactId,
  statusCode: 200,
  title: 'Welcome Page',
  // No screenshot
});

// User requests screenshot → trigger worker to capture
async function requestScreenshot(artifactId: string) {
  // Queue screenshot capture job
  await env.SCREENSHOT_QUEUE.send({
    artifactId,
    url: probe.finalUrl,
  });
}
```

**Benefits**:
- ✅ 90% reduction in screenshot storage (most never viewed)
- ✅ Faster scan completion
- ✅ Lower costs

**Drawbacks**:
- ❌ Screenshots might be unavailable later (site changed)
- ❌ UX delay (wait for screenshot generation)

---

## 6. Unified Vulnerability Model

### Problem

Currently, vulnerabilities are scattered:
- CVE data in `scan_runs.resultSummary.cveEnrichment`
- HTTP issues in `httpx_probes` (4xx, 5xx errors)
- Future: ZAP findings, Nikto vulnerabilities, etc.

### Proposed: Unified Vulnerabilities Table

```sql
CREATE TABLE vulnerabilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  device_id TEXT NOT NULL,

  -- Source of detection
  source_type TEXT NOT NULL, -- 'CVE', 'HTTPX', 'ZAP', 'NIKTO'
  source_id TEXT NOT NULL, -- artifact_id or scan_run_id

  -- Vulnerability details
  severity TEXT NOT NULL, -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
  title TEXT NOT NULL,
  description TEXT,

  -- Remediation
  status TEXT NOT NULL, -- 'OPEN', 'ACKNOWLEDGED', 'FIXED', 'FALSE_POSITIVE'
  remediation TEXT,

  -- Metadata
  cvss_score REAL,
  cve_id TEXT, -- If applicable
  port INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,

  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

CREATE INDEX vulnerabilities_device_idx ON vulnerabilities (device_id);
CREATE INDEX vulnerabilities_severity_idx ON vulnerabilities (severity);
CREATE INDEX vulnerabilities_status_idx ON vulnerabilities (status);
```

**Benefits**:
- ✅ Single source of truth for all vulnerabilities
- ✅ Unified workflow (acknowledge, fix, track)
- ✅ Easy to build dashboards ("top 10 critical vulns")
- ✅ Deduplication (same CVE on multiple ports = one entry)

**Example Usage**:

```typescript
// HTTPx scan finds exposed admin panel
await createVulnerability({
  organizationId,
  deviceId,
  sourceType: 'HTTPX',
  sourceId: artifactId,
  severity: 'HIGH',
  title: 'Exposed admin panel without authentication',
  description: 'Admin panel accessible at /admin with no login required',
  port: 80,
  status: 'OPEN',
});

// ZAP scan finds XSS
await createVulnerability({
  organizationId,
  deviceId,
  sourceType: 'ZAP',
  sourceId: zapArtifactId,
  severity: 'MEDIUM',
  title: 'Reflected XSS in search parameter',
  description: 'Parameter "q" is vulnerable to XSS attacks',
  port: 443,
  status: 'OPEN',
});

// CVE enrichment finds OS vulnerability
await createVulnerability({
  organizationId,
  deviceId,
  sourceType: 'CVE',
  sourceId: scanRunId,
  severity: 'CRITICAL',
  title: 'OpenSSL Heartbleed',
  cveId: 'CVE-2014-0160',
  cvssScore: 7.5,
  status: 'OPEN',
});
```

**Migration Path**: Start with new vulnerabilities, backfill from existing data later

---

## Implementation Priority

### Phase 7 (Soon)
1. ✅ **Retention policy** - Simple to add, high impact
2. ✅ **WebP screenshot compression** - One-line change, 70% savings

### Phase 8 (Medium-term)
3. **Unified vulnerabilities table** - Enables better workflows
4. **Materialized views** - If dashboard queries become slow

### Phase 9+ (Long-term)
5. **Alternative schema patterns** - Only if row count >10M
6. **Archival to R2** - Only if retention policy isn't enough

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-28 | Defer retention_days column | Current scale doesn't require it yet, document for later |
| 2025-10-28 | Keep normalized tech stack | Aggregation queries more important than read performance |
| 2025-10-28 | Keep one-artifact-per-port pattern | Simplicity > row count optimization at current scale |

---

## References

- Main Architecture: [SCAN_ARTIFACTS_ARCHITECTURE.md](./SCAN_ARTIFACTS_ARCHITECTURE.md)
- Engineering Review: Internal discussion thread (2025-10-28)
- Similar Project: Footprint (production system at scale)
