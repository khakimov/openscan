# Change Detection

### Core Algorithm

**File**: `apps/user-application/src/server/notifications/change-detector.ts`

```typescript
/**
 * Detect changes between current and previous scan
 *
 * CRITICAL FIX: Must receive scan with fresh resultSummary
 * (not stale database object from pre-update query)
 */
export async function detectScanChanges(params: {
  deviceId: string;
  currentScan: typeof scanRuns.$inferSelect;
  organizationId: string;
}): Promise<Array<CreateNotificationInput>> {
  const { deviceId, currentScan, organizationId } = params;

  // Early exit: no results to compare
  if (!currentScan.resultSummary) {
    logger.info('Skipping change detection: no resultSummary');
    return [];
  }

  // Load baseline (previous successful scan)
  const baseline = await getLastSuccessfulScanForDevice({
    deviceId,
    organizationId,
    excludeScanId: currentScan.id,
  });

  // First scan for device - no changes to detect
  if (!baseline || !baseline.resultSummary) {
    logger.info('Skipping change detection: no baseline scan');
    return [];
  }

  const changes: Array<CreateNotificationInput> = [];

  // Diff ports
  changes.push(...diffPorts(
    currentScan.resultSummary,
    baseline.resultSummary,
    deviceId,
    organizationId,
    currentScan.id
  ));

  // Diff CVEs
  changes.push(...diffCVEs(
    currentScan.resultSummary,
    baseline.resultSummary,
    deviceId,
    organizationId,
    currentScan.id
  ));

  return changes;
}
```

### Port Diffing Logic

```typescript
/**
 * Compare port states between scans
 *
 * BUG FIX: Extract service names from objects
 * (service can be string OR object with name/product fields)
 */
function diffPorts(
  current: any,
  previous: any,
  deviceId: string,
  organizationId: string,
  scanRunId: string
): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  // Build port maps: "port/protocol" → port object
  const prevPortMap = new Map<string, any>();
  for (const port of previous.ports || []) {
    const key = `${port.port}/${port.protocol}`;
    prevPortMap.set(key, port);
  }

  const currPortMap = new Map<string, any>();
  for (const port of current.ports || []) {
    const key = `${port.port}/${port.protocol}`;
    currPortMap.set(key, port);
  }

  // Detect NEW open ports
  for (const [key, port] of currPortMap) {
    const wasOpen = prevPortMap.has(key) && prevPortMap.get(key).state === 'open';
    const isNowOpen = port.state === 'open';

    if (isNowOpen && !wasOpen) {
      // ✅ FIX: Extract service name from object
      const serviceName = port.service?.name || port.service?.product || port.service || 'service';
      const product = port.service?.product || serviceName;
      const version = port.service?.version || 'unknown';
      const name = serviceName;

      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        type: 'NEW_PORT',
        severity: determinePortSeverity(port.port),
        title: `New ${serviceName} on port ${port.port} discovered`,
        message: getPortSecurityMessage(port),
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          state: port.state,
          version: port.version,
        },
        fingerprint: `new_port:${deviceId}:${port.protocol}:${port.port}:${product}:${version}:${name}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      });
    }
  }

  // Detect CLOSED ports (previously open, now closed/filtered)
  for (const [key, prevPort] of prevPortMap) {
    const wasOpen = prevPort.state === 'open';
    const currPort = currPortMap.get(key);
    const isNowOpen = currPort && currPort.state === 'open';

    if (wasOpen && !isNowOpen) {
      const serviceName = prevPort.service?.name || prevPort.service?.product || prevPort.service || 'unknown';
      const product = prevPort.service?.product || serviceName;
      const version = prevPort.service?.version || 'unknown';
      const name = serviceName;

      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        type: 'CLOSED_PORT',
        severity: 'INFO', // Port closing is informational (good news)
        title: `${serviceName} on port ${prevPort.port} is now closed`,
        message: `Port ${prevPort.port}/${prevPort.protocol} (${serviceName}) is no longer accessible`,
        data: {
          port: prevPort.port,
          protocol: prevPort.protocol,
          service: serviceName,
          previousState: prevPort.state,
        },
        fingerprint: `closed_port:${deviceId}:${prevPort.protocol}:${prevPort.port}:${product}:${version}:${name}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      });
    }
  }

  return changes;
}
```

### CVE Diffing Logic

```typescript
/**
 * Compare CVE enrichment between scans
 *
 * BUG FIX: Use cve.cveId (not cve.id) for map keys
 * (matches safeParseCVEEnrichment schema)
 */
function diffCVEs(
  current: any,
  previous: any,
  deviceId: string,
  organizationId: string,
  scanRunId: string
): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  const currentCVEs = extractCVEsFromEnrichment(current.cveEnrichment);
  const previousCVEs = extractCVEsFromEnrichment(previous.cveEnrichment);

  // ✅ FIX: Use cveId field (not id)
  const prevCVEMap = new Map(previousCVEs.map(cve => [cve.cveId, cve]));
  const currCVEMap = new Map(currentCVEs.map(cve => [cve.cveId, cve]));

  // Detect NEW CVEs (not in previous scan)
  for (const [cveId, cve] of currCVEMap) {
    if (!prevCVEMap.has(cveId)) {
      // Only notify for HIGH/CRITICAL CVEs by default
      if (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') {
        changes.push({
          organizationId,
          deviceId,
          scanRunId,
          type: 'NEW_CVE',
          severity: cve.severity,
          title: `${cve.severity} vulnerability ${cveId} detected`,
          message: cve.description?.slice(0, 200), // Truncate long descriptions
          data: {
            cveId,
            cvss: cve.cvssScore,
            severity: cve.severity,
            description: cve.description,
            affectedService: cve.affectedService,
            port: cve.port,
          },
          fingerprint: `new_cve:${deviceId}:${cveId}`,
          suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      }
    }
  }

  // Detect CVE severity UPGRADES
  for (const [cveId, currCVE] of currCVEMap) {
    const prevCVE = prevCVEMap.get(cveId);
    if (prevCVE && prevCVE.severity !== currCVE.severity) {
      const severityIncreased = compareSeverity(currCVE.severity, prevCVE.severity) > 0;

      if (severityIncreased && (currCVE.severity === 'CRITICAL' || currCVE.severity === 'HIGH')) {
        changes.push({
          organizationId,
          deviceId,
          scanRunId,
          type: 'CVE_SEVERITY_INCREASE',
          severity: currCVE.severity,
          title: `${cveId} severity upgraded to ${currCVE.severity}`,
          message: `Previously: ${prevCVE.severity}. ${currCVE.description?.slice(0, 150)}`,
          data: {
            cveId,
            oldSeverity: prevCVE.severity,
            newSeverity: currCVE.severity,
            cvss: currCVE.cvssScore,
            description: currCVE.description,
          },
          fingerprint: `cve_upgrade:${deviceId}:${cveId}`,
          suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      }
    }
  }

  return changes;
}
```

### Baseline Selection Strategy

**Query**: Fetch last successful scan for same device

**File**: `packages/data-ops/src/queries/scans.ts`

```typescript
/**
 * Get the most recent successful scan for a device
 * Used as baseline for change detection
 *
 * BUG FIX: Join on runId (not scanRunId)
 */
export async function getLastSuccessfulScanForDevice(
  params: GetLastSuccessfulScanParams
): Promise<typeof scanRuns.$inferSelect | null> {
  const db = getDb();
  const { deviceId, organizationId, excludeScanId } = params;

  const conditions = [
    eq(scanRunDevices.deviceId, deviceId),
    eq(scanRuns.organizationId, organizationId),
    eq(scanRuns.status, 'SUCCEEDED'),
    isNotNull(scanRuns.resultSummary), // Must have results to compare
  ];

  if (excludeScanId) {
    // ✅ FIX: Use ne() instead of SQL template
    conditions.push(ne(scanRuns.id, excludeScanId));
  }

  const [baseline] = await db
    .select()
    .from(scanRuns)
    // ✅ FIX: Join on runId (not scanRunId)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(...conditions))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1);

  return baseline?.scan_runs || null;
}
```

---
