# Service Detection Confidence - Design Document

**Status**: Approved for Implementation
**Created**: 2025-01-12
**Epic**: sec-8sh (Service Detection Accuracy)

## Context

### The Problem

Our current port scanning implementation captures rich service detection metadata from nmap (confidence scores, detection methods) but discards it during persistence. This creates two issues:

1. **False Precision**: The UI shows service names like "rwhois" on port 4321 without indicating these are low-confidence guesses from IANA port tables, not actual fingerprints.
2. **Lost Data Quality**: Nmap provides confidence (0-10 scale) and method (`probe` vs `table`) but we throw this away, making it impossible to distinguish verified detections from port-number guesses.

### Legacy Behavior Analysis

The OpenPanel codebase (reference implementation) had the same limitation:

**What Legacy Did:**
- Parsed nmap `product`, `version`, `extraInfo` but **dropped** `conf` and `method` (nmap_controller.py:392-410)
- Stored only: `product`, `version`, `extra`, `protocol` (ScannerApplication model:110-145)
- Displayed via `compose_fullname` pattern: product/version first, protocol as fallback (application.py:154-160)
- Relied on **manual overrides** via Element Editor when detection was wrong (element_editor.py:40-119)

**What Legacy Couldn't Do:**
- No automatic "unverified" warnings for low-confidence matches
- No detection method visibility (`table` vs `probe`)
- No drift tracking for service changes between scans

### Our Opportunity

We already capture the full nmap metadata in our postback contract (`@repo/contracts/postbacks.ts`). We just need to:
1. **Persist** it (add to database schema)
2. **Display** it (show confidence badges in UI)
3. **Leverage** it (manual overrides, drift detection)

---

## Design Decisions

### 1. Data Persistence

#### What We Store

Add `method` and `confidence` to port service objects:

```typescript
service: {
  name: string;              // "http", "ssh" (nmap protocol name)
  product?: string;          // "nginx", "OpenSSH" (detected product)
  version?: string;          // "1.28.0", "8.2p1"
  extraInfo?: string;        // "Ubuntu", "Ubuntu Linux; protocol 2.0"
  method?: string;           // 🆕 "table" | "probed" | "servicefp" (nmap detection method)
  confidence?: number;       // 🆕 0-10 (nmap confidence score)
  cpe?: string;              // "cpe:/a:nginx:nginx:1.28.0"
  tunnel?: string;           // "ssl"
  // ... existing fields
}
```

#### Where We Store It

**Location 1: `scanRuns.resultSummary`** (per-scan history)
- JSON column already contains port details
- No migration needed - just TypeScript types + postback handler changes
- Preserves full scan history with confidence metadata

**Location 2: `devices.ports`** (current "last known" state)
- JSON column contains latest port snapshot
- Updated when new scan completes
- Allows UI/APIs to show confidence without fetching scan runs

**Queries/Indexes:**
- ❌ **No indexes initially** - confidence filtering is a future nice-to-have
- JSON queries can filter by confidence when needed: `JSON_EXTRACT(ports, '$.service.confidence')`

---

### 2. UI Display Logic

#### Display Priority (Match Legacy)

**Rule**: Show composed product/version first. Only show protocol when product is empty.

```typescript
/**
 * Format service information for display
 *
 * Legacy pattern (Application.compose_fullname):
 * - Priority 1: product + version + extraInfo → "nginx 1.28.0 Ubuntu"
 * - Priority 2: protocol name as fallback → "http"
 * - Never show "http • nginx" (redundant duplication)
 */
function formatServiceInfo(service?: PortDetail["service"]) {
  if (!service) return "Unknown";

  // Compose product/version/extraInfo
  const parts = [
    service.product,
    service.version,
    service.extraInfo,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" "); // "nginx 1.28.0 Ubuntu"
  }

  // Fallback to protocol
  if (service.name) {
    return service.name; // "http"
  }

  return service.reportedName
    ? `Unknown (reported: ${service.reportedName})`
    : "Unknown";
}
```

**Rationale:**
- ✅ Matches legacy `compose_fullname` logic
- ✅ Removes redundant "http • nginx" duplication
- ✅ Keeps protocol context when no product detected
- 🔮 Future: Optionally show protocol in muted text when it differs from product (e.g., "nginx 1.28 `ssl`")

#### Confidence Badge

**Rule**: Tag as "Unverified" when `method === "table"` OR `confidence <= 3`

```tsx
{(service?.method === 'table' || (service?.confidence !== undefined && service.confidence <= 3)) && (
  <Badge variant="outline" className="text-xs text-muted-foreground">
    <Tooltip>
      <TooltipTrigger>Unverified</TooltipTrigger>
      <TooltipContent>
        Detected via port-to-service table lookup. Verify manually or wait for probe-based detection.
      </TooltipContent>
    </Tooltip>
  </Badge>
)}
```

**Threshold Rationale (Nmap Confidence Scale):**
| Score | Meaning | Action |
|-------|---------|--------|
| 10 | Definitive match | ✅ Trust it |
| 5-9 | High confidence | ✅ Trust it |
| 3-4 | Medium confidence (shaky) | ⚠️ **Flag as unverified** |
| 0-2 | Low confidence (guess) | ⚠️ **Flag as unverified** |

**Badge Style:**
- `variant="outline"` (subtle gray, not alarming)
- Tooltip explains the source (not an incident, just low confidence)
- Positioned inline with service name + existing badges (tunnel, CVEs)

**Example UI:**
```
Port 4321 TCP
Service: rwhois [Unverified 🛈]
Last Scan: 5 minutes ago
```

---

### 3. Manual Override Workflow

#### When Analysts Need This

- Nmap guesses wrong (port 4321 shows "rwhois" but it's actually nginx)
- Custom services on non-standard ports
- Proprietary protocols nmap can't fingerprint
- Legacy/uncommon software versions

#### Storage Schema

**New Table: `service_overrides`**

```typescript
// packages/data-ops/src/schema/inventory.ts
export const serviceOverrides = sqliteTable('service_overrides', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  deviceId: text('device_id').notNull().references(() => devices.id),

  // Port identification
  port: integer('port').notNull(),
  protocol: text('protocol', { enum: ['tcp', 'udp'] }).notNull(),

  // What nmap detected (original)
  originalProduct: text('original_product'),
  originalVersion: text('original_version'),
  originalExtraInfo: text('original_extra_info'),
  originalMethod: text('original_method'),
  originalConfidence: integer('original_confidence'),

  // What analyst corrected to (override)
  overrideProduct: text('override_product').notNull(),
  overrideVersion: text('override_version'),
  overrideExtraInfo: text('override_extra_info'),

  // Audit trail
  overriddenBy: text('overridden_by').notNull(), // user.id
  overriddenAt: integer('overridden_at', { mode: 'timestamp_ms' }).notNull(),
  reason: text('reason'), // "Manually verified via banner grab"

  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  // Composite unique: one override per device/port/protocol
  devicePortIdx: uniqueIndex('service_overrides_device_port_idx')
    .on(table.deviceId, table.port, table.protocol),
  orgIdx: index('service_overrides_org_idx').on(table.organizationId),
}));
```

#### Application Logic

**When Override Applies:**
1. **Current scan**: Display override values instead of nmap values
2. **Future scans**: Continue applying override UNLESS new scan has higher confidence
   - Example: Override stays if new scan is `method=table, conf=3`
   - Override removed if new scan is `method=probe, conf=9` (actual fingerprint beats manual guess)

**Conflict Resolution:**
```typescript
function resolveServiceDisplay(
  scanDetection: Service,
  override?: ServiceOverride
): Service {
  // No override = use scan data
  if (!override) return scanDetection;

  // Override exists, but scan has high-confidence probe data = trust new detection
  if (scanDetection.method === 'probed' && scanDetection.confidence >= 8) {
    // Archive override: soft-delete (set archivedAt timestamp) and log activity
    // Activity log: "Override for port {port} archived - high-confidence scan detected {product}"
    // This notifies analysts why their override disappeared
    return scanDetection;
  }

  // Override exists and scan still low-confidence = keep override
  return {
    ...scanDetection,
    product: override.overrideProduct,
    version: override.overrideVersion,
    extraInfo: override.overrideExtraInfo,
    method: 'manual', // 🆕 Custom method flag
    confidence: 10,   // Manual = definitive
  };
}
```

#### UI Workflow

**Trigger:** "Override Service" button in port details expandable row

**Form Fields:**
```tsx
<Dialog>
  <DialogHeader>
    <DialogTitle>Override Service Detection</DialogTitle>
    <DialogDescription>
      Nmap detected: <code>{service.product || service.name}</code>
      {service.confidence !== undefined && ` (confidence: ${service.confidence}/10)`}
    </DialogDescription>
  </DialogHeader>

  <Form>
    <Input
      label="Product Name"
      value={overrideProduct}
      placeholder="nginx"
      required
    />
    <Input
      label="Version"
      value={overrideVersion}
      placeholder="1.28.0"
    />
    <Input
      label="Extra Info"
      value={overrideExtraInfo}
      placeholder="Ubuntu"
    />
    <Textarea
      label="Reason for Override"
      value={reason}
      placeholder="Manually verified via banner grab on port 4321"
      helperText="This helps the team understand why the override was necessary"
    />
  </Form>

  <DialogFooter>
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
    <Button onClick={onSave}>Save Override</Button>
  </DialogFooter>
</Dialog>
```

**Permissions:**
- Requires `security:admin` or `devices:edit` role
- Non-admin users see "Request Override" button → creates notification for admins

**Post-Save Actions:**
1. Insert record into `service_overrides` table
2. Update `devices.ports` JSON with override values
3. Log activity: `"Jane Doe overridden service on port 4321: rwhois → nginx 1.28.0"`
4. Optional: Send notification (Slack/email) based on organization settings

**Display in UI:**
```tsx
{override && (
  <Badge variant="secondary" className="text-xs">
    <Tooltip>
      <TooltipTrigger>
        Manual Override
      </TooltipTrigger>
      <TooltipContent>
        Overridden by {override.userName} on {formatDate(override.overriddenAt)}
        <br />
        Reason: {override.reason}
        <br />
        Original detection: {override.originalProduct || 'Unknown'}
      </TooltipContent>
    </Tooltip>
  </Badge>
)}
```

---

### 4. Service Drift Detection

#### What We Track

**High-Value Signals:**
- ✅ Product changed: `nginx` → `apache`
- ✅ Version changed: `1.28.0` → `1.29.0` (upgrade) or `1.29.0` → `1.28.0` (downgrade/rollback)
- ✅ Confidence improved: `method=table, conf=3` → `method=probe, conf=8`

**Already Handled Elsewhere:**
- ❌ Port state changes (open → closed) - existing scan diff logic
- ❌ New ports discovered - existing scan summary

#### Detection Logic

**Trigger**: After postback handler saves scan results, before updating `devices.ports`

```typescript
// In postback handler (port-scan.ts)
async function detectServiceDrift(
  deviceId: string,
  currentPorts: PortDetail[]
): Promise<ServiceDriftChange[]> {
  // Get previous scan
  const previousScan = await getLastScanRun(deviceId);
  if (!previousScan?.resultSummary?.ports) return [];

  const changes: ServiceDriftChange[] = [];

  for (const currentPort of currentPorts) {
    const previousPort = previousScan.resultSummary.ports.find(
      p => p.port === currentPort.port && p.protocol === currentPort.protocol
    );

    if (!previousPort?.service || !currentPort.service) continue;

    const prev = previousPort.service;
    const curr = currentPort.service;

    // Product change
    if (prev.product !== curr.product) {
      changes.push({
        type: 'SERVICE_CHANGED',
        port: currentPort.port,
        protocol: currentPort.protocol,
        previous: {
          product: prev.product,
          version: prev.version,
          confidence: prev.confidence,
        },
        current: {
          product: curr.product,
          version: curr.version,
          confidence: curr.confidence,
        },
      });
    }
    // Version change (same product)
    else if (prev.version !== curr.version) {
      const isDowngrade = compareVersions(curr.version, prev.version) < 0;
      changes.push({
        type: isDowngrade ? 'VERSION_DOWNGRADE' : 'VERSION_UPGRADE',
        port: currentPort.port,
        protocol: currentPort.protocol,
        previous: { product: prev.product, version: prev.version },
        current: { product: curr.product, version: curr.version },
      });
    }
    // Confidence improvement
    else if (
      prev.method === 'table' && curr.method === 'probe' ||
      (prev.confidence ?? 0) < 5 && (curr.confidence ?? 0) >= 8
    ) {
      changes.push({
        type: 'CONFIDENCE_IMPROVED',
        port: currentPort.port,
        protocol: currentPort.protocol,
        previous: { method: prev.method, confidence: prev.confidence },
        current: { method: curr.method, confidence: curr.confidence },
      });
    }
  }

  return changes;
}
```

#### Storage

**Location 1: `scanRuns.resultSummary.drift`** (per-scan history)
```typescript
{
  ports: [...],
  drift: {
    detectedAt: "2025-01-12T10:30:00Z",
    previousScanId: "scan_xyz123",
    changes: [
      {
        type: "SERVICE_CHANGED",
        port: 80,
        protocol: "tcp",
        previous: { product: "nginx", version: "1.28.0", confidence: 10 },
        current: { product: "apache", version: "2.4.52", confidence: 7 },
      },
      {
        type: "VERSION_UPGRADE",
        port: 443,
        protocol: "tcp",
        previous: { product: "nginx", version: "1.28.0" },
        current: { product: "nginx", version: "1.29.0" },
      },
    ],
  },
}
```

**Location 2: `devices.lastServiceChanges`** (latest N changes, UI summary)
```typescript
// Add to devices table (JSON column)
lastServiceChanges: {
  updatedAt: "2025-01-12T10:30:00Z",
  changes: [
    { port: 80, type: "SERVICE_CHANGED", from: "nginx", to: "apache", scanId: "..." },
    { port: 443, type: "VERSION_UPGRADE", from: "1.28.0", to: "1.29.0", scanId: "..." },
  ].slice(0, 10), // Keep last 10 changes
}
```

#### Override Interplay

**Rule**: Manual overrides are canonical, but we still log what scan detected

```typescript
{
  type: "DETECTION_DIFFERS_FROM_OVERRIDE",
  port: 4321,
  protocol: "tcp",
  override: { product: "nginx", version: "1.28.0", by: "Jane Doe" },
  scanDetected: { product: "rwhois", version: null, confidence: 3 },
  message: "Scan reported rwhois (conf 3), but manual override nginx 1.28 retained",
}
```

**Why This Matters:**
- Analyst sees "Scan still detects rwhois (low confidence) - override remains active"
- If confidence improves (e.g., probe detects actual nginx), we can suggest removing override
- Provides audit trail of why override was necessary

#### UI Display

**Location 1: Badge on Port Row** (inline context)
```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <span>{serviceInfo}</span>

    {drift && (
      <Badge variant="default" className="text-xs">
        <Tooltip>
          <TooltipTrigger>
            <TrendingUp className="w-3 h-3 mr-1" />
            Changed
          </TooltipTrigger>
          <TooltipContent>
            Changed from {drift.previous.product} {drift.previous.version}
            <br />
            Detected on: {formatDate(drift.detectedAt)}
          </TooltipContent>
        </Tooltip>
      </Badge>
    )}
  </div>
</TableCell>
```

**Location 2: Expandable Details Panel** (full history)
```tsx
{portDrift && portDrift.length > 0 && (
  <div className="space-y-3">
    <Badge variant="outline" className="text-xs">
      <History className="w-3 h-3 mr-1" />
      Recent Changes
    </Badge>

    <div className="space-y-2">
      {portDrift.map((change, idx) => (
        <div key={idx} className="flex items-start gap-3 text-xs bg-muted/30 p-2 rounded">
          <ArrowRight className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">
              {change.type === 'SERVICE_CHANGED' && 'Service Changed'}
              {change.type === 'VERSION_UPGRADE' && 'Version Upgraded'}
              {change.type === 'VERSION_DOWNGRADE' && 'Version Downgraded ⚠️'}
              {change.type === 'CONFIDENCE_IMPROVED' && 'Detection Improved'}
            </div>
            <div className="text-muted-foreground mt-1">
              {formatDriftChange(change)}
            </div>
            <div className="text-muted-foreground mt-1">
              {formatRelativeTime(change.detectedAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

**Location 3: Device Timeline** (future enhancement)
- Dedicated "Service History" tab showing all drift events
- Filterable by port, change type, date range
- Exportable for compliance/audit reports

#### Retention

**Strategy**: Keep full history in scan runs, summarize for device view

- `scanRuns.resultSummary.drift` - **Forever** (no cost, already JSON)
- `devices.lastServiceChanges` - **Last 10 changes** (UI performance)
- Future: Aggregate into weekly/monthly summaries for long-term trends

#### Notifications (Future Phase)

**Not Implemented Initially** (avoid alert fatigue), but designed for:

```typescript
// Example policy rules (future)
const driftAlertRules = [
  {
    condition: (change) => change.type === 'SERVICE_CHANGED' && isCriticalPort(change.port),
    severity: 'MEDIUM',
    message: 'Critical service changed on port {port}: {previous.product} → {current.product}',
  },
  {
    condition: (change) => change.type === 'VERSION_DOWNGRADE',
    severity: 'HIGH',
    message: 'Version downgrade detected (potential rollback/compromise): {previous.version} → {current.version}',
  },
  {
    condition: (change) => change.current.confidence < 3 && !change.previous,
    severity: 'LOW',
    message: 'New low-confidence service detected on port {port}: {current.product} (verify manually)',
  },
];
```

---

## Implementation Phases

### Phase 1: Data Foundation (Week 1)
**Epic**: sec-8sh
**Subtasks**:
- [ ] Update TypeScript types in `@repo/contracts` for `method` and `confidence`
- [ ] Modify postback handler to persist these fields in `scanRuns.resultSummary`
- [ ] Update device query responses to include confidence metadata
- [ ] Add to `devices.ports` JSON when updating device snapshots
- [ ] Write integration tests for persistence

**Deliverable**: All port data includes confidence metadata (no UI changes yet)

---

### Phase 2: UI Visibility (Week 2)
**Epic**: sec-8sh
**Subtasks**:
- [ ] Update `formatServiceInfo()` to match legacy pattern (product-first, protocol fallback)
- [ ] Add "Unverified" badge for `method=table` or `confidence <= 3`
- [ ] Update `formatRawPortOutput()` to show method/confidence in scan details
- [ ] Add tooltips explaining confidence scores
- [ ] QA/polish badge styling and positioning

**Deliverable**: Users see which services are low-confidence guesses

---

### Phase 3: Manual Overrides (Week 3-4)
**Epic**: sec-xxx (new)
**Subtasks**:
- [ ] Create `service_overrides` table migration
- [ ] Add CRUD queries in `@repo/data-ops`
- [ ] Build override modal form component
- [ ] Implement permissions check (security:admin role)
- [ ] Update device query to merge overrides with scan data
- [ ] Add activity logging for overrides
- [ ] Add "Manual Override" badge to port display
- [ ] Write tests for override conflict resolution

**Deliverable**: Analysts can correct wrong service detections

---

### Phase 4: Drift Detection (Week 5-6)
**Epic**: sec-xxx (new)
**Subtasks**:
- [ ] Implement drift comparison logic in postback handler
- [ ] Add `drift` field to `scanRuns.resultSummary`
- [ ] Add `lastServiceChanges` to `devices` table
- [ ] Build drift badge component for port rows
- [ ] Build "Recent Changes" panel in port details
- [ ] Add drift handling for manual overrides
- [ ] Write tests for drift detection edge cases
- [ ] Document drift event types for future notification system

**Deliverable**: Users see service changes across scans

---

## Success Metrics

**Data Quality:**
- ✅ 100% of port scan results include `method` and `confidence` (where nmap provides them)
- ✅ Drift detection identifies service changes within 1 scan cycle

**User Experience:**
- ✅ Analysts can distinguish table guesses from fingerprinted services
- ✅ Manual override workflow takes < 30 seconds
- ✅ Drift changes surface within 5 minutes of scan completion

**System Health:**
- ✅ No performance degradation on device list queries (confidence data in JSON, no joins)
- ✅ Override conflict resolution prevents data loss (high-confidence scans trump overrides)

---

## Open Questions / Future Work

1. **Confidence Filtering**: Add "Show only verified services" toggle in device list?
2. **Bulk Overrides**: Allow overriding service on multiple devices/ports at once?
3. **Drift Notifications**: When to alert (critical services only, or configurable rules)?
4. **Historical Trends**: Build timeline view showing service evolution over months?
5. **Integration with CVE Enrichment**: Flag when low-confidence service has critical CVEs?

---

## References

**Legacy Codebase Analysis:**
- `scanners/port_scanner/nmap_controller.py:392-410` - Raw nmap parsing
- `footprint_app/port_scanner/application.py:154-160` - `compose_fullname` pattern
- `footprint_app/element_editor/element_editor.py:40-119` - Manual override workflow

**Current Implementation:**
- `apps/restate-worker/src/port-scanner.ts:535-569` - Nmap result normalization
- `apps/user-application/src/features/assets/components/device-open-ports.tsx:67-120` - Port display logic
- `packages/contracts/src/postbacks.ts` - Universal postback schema

**Related Issues:**
- sec-8sh - Service name accuracy improvements (parent epic)
- sec-zg2 - Port snapshot migration (future breaking change)

---

**Approved By**: [Pending]
**Implementation Start Date**: [TBD]
