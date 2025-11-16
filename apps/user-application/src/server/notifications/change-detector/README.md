# Change Detector

Modular change detection system for scan result analysis.

## Structure

```
change-detector/
├── README.md              # This file
├── index.ts               # Main entry point, exports detectScanChanges()
├── types.ts               # Shared type definitions (ScanChange, CVEInfo)
├── utils.ts               # Common helpers (fingerprinting, port keys)
├── baseline.ts            # Scan history fetching
├── diff-ports.ts          # New/closed port detection
├── diff-service-drift.ts  # Service configuration drift
└── diff-cves.ts           # CVE lifecycle (new, fixed, regressed, severity increase)
```

## Usage

```typescript
import { detectScanChanges } from '@/server/notifications/change-detector';

const changes = await detectScanChanges({
  deviceId: 'dev_123',
  currentScan: scanRun,
  organizationId: 'org_123',
});

// changes = [
//   { type: 'NEW_PORT', severity: 'HIGH', ... },
//   { type: 'CVE_FIXED', severity: 'INFO', ... },
//   { type: 'CVE_REGRESSED', severity: 'CRITICAL', ... },
// ]
```

## Module Responsibilities

### baseline.ts
- `getScanHistory()`: Consolidated query builder with options (limit, excludeIds, status)
- `getBaselineScan()`: Convenience wrapper (fetches N-1)
- `getRecentScans()`: Convenience wrapper (fetches multiple scans for regression)

### diff-ports.ts
- Detects new ports (state: closed → open)
- Detects closed ports (state: open → closed/filtered)
- Includes service metadata in fingerprints (sec-11n)

### diff-service-drift.ts
- Detects service configuration changes (product, version, name)
- Mirrors legacy Daemon.compare_parameters (daemon.py:57-87)
- MEDIUM severity for product changes, INFO for version/name

### diff-cves.ts
- **NEW_CVE**: First-time CVE appearance (HIGH/CRITICAL only)
- **CVE_SEVERITY_INCREASE**: Severity upgrade (e.g., MEDIUM → CRITICAL)
- **CVE_FIXED**: CVE present in N-1, absent in N (INFO severity, "Good job!" message)
- **CVE_REGRESSED**: CVE in N-2, absent in N-1 (fixed), returns in N (severity-based, "Investigate" message)
- 3-scan regression detection requires previousPrevious context

## Legacy Alignment

- CVE_FIXED mirrors `critical_fix` (priority 70/INFO)
- CVE_REGRESSED mirrors `critical_unfix` (severity-based)
- Service drift mirrors `Daemon.compare_parameters`
- Port detection mirrors `discover_new_devices` fingerprinting

## Testing

Each module is independently testable:

```bash
# CVE lifecycle (27 tests)
pnpm test src/server/notifications/__tests__/cve-lifecycle.test.ts

# Port detection (14 + 11 tests)
pnpm test src/server/notifications/__tests__/port-*.test.ts

# Service drift (15 tests)
pnpm test src/server/notifications/__tests__/service-drift.test.ts

# Integration (11 tests, 4 skipped)
pnpm test src/server/__tests__/notifications-integration.test.ts
```

## Suppression Windows

All notification types use time-based suppression windows to prevent notification spam:

| Notification Type | Suppress Window | Rationale |
|-------------------|----------------|-----------|
| NEW_PORT | 6 hours | Ports change frequently during scanning |
| CLOSED_PORT | 6 hours | Match NEW_PORT for symmetry |
| NEW_CVE | 24 hours | CVEs are more stable than port changes |
| CVE_SEVERITY_INCREASE | 24 hours | Match NEW_CVE (same vulnerability context) |
| CVE_FIXED | 24 hours | Good news, but prevent spam if CVE flaps |
| CVE_REGRESSED | 24 hours | Uniform for MVP (future: severity-based) |
| SERVICE_DRIFT | 6 hours | Match port changes (service metadata) |

Suppression windows are configured in `packages/data-ops/src/notifications/helpers.ts` using shared constants:
- `HOURS_6_MS` = 6 hours (port changes)
- `DAY_MS` = 24 hours (CVE changes)

This makes duration adjustments easy and prevents magic number duplication.

## Future Enhancements

1. **Fix history table** (sec-m9y): Enable true multi-scan regression detection
   - Add `cve_fix_history` table (deviceId + cveId + fixedAt + scanRunId)
   - Upsert row when emitting CVE_FIXED
   - Query history when evaluating "new" CVEs → emit CVE_REGRESSED if recently fixed
   - Update `diff-cves.ts` header comment to describe persisted path + compatibility fallback
2. **Notification router integration**: Wire up the new notification types with proper suppression

## See Also

- [Notification System Docs](../../../docs/NOTIFICATIONS/README.md) - Complete algorithm documentation
- [postback-architecture.md](../../../docs/architecture/backend/postback-architecture.md) - Postback system integration
