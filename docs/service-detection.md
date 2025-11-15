# Service Detection Resolution

This document explains how the platform resolves conflicts when multiple service detection sources (Nmap, HTTPx, TLS, etc.) provide different information about the same port.

## Overview

Service detection happens in two stages:

1. **Scan Time (Worker)**: Nmap scans ports, low-confidence detections filtered out before database write
2. **UI Time (Data-Ops)**: Resolver merges Nmap + HTTPx evidence, picks best source, returns audit trail

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1: Scan Time (Restate Worker)                            │
├─────────────────────────────────────────────────────────────────┤
│ Nmap -sV scan                                                   │
│   ↓                                                             │
│ Filter: shouldDiscardServiceDetection()                         │
│   ↓ (confidence < 5 OR not in Top 20 → discarded)             │
│ Write to scanRuns.resultSummary.portSnapshots                  │
│                                                                 │
│ HTTPx probe (separate)                                         │
│   ↓                                                             │
│ Write to httpxProbes table                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Stage 2: UI Time (Data-Ops Query Layer)                        │
├─────────────────────────────────────────────────────────────────┤
│ getDeviceById()                                                 │
│   ↓                                                             │
│ Read portSnapshots + httpxProbes                               │
│   ↓                                                             │
│ For each port:                                                  │
│   - normalizeNmap(port.service, port.port)                     │
│   - normalizeHttpx(httpxProbesMap.get(port.port))              │
│   - resolveService([nmapEvidence, httpxEvidence])              │
│   ↓                                                             │
│ Return resolved service with audit trail                       │
│   - kind: 'httpx' | 'nmap' | 'manual'                         │
│   - confidence: 0-10                                            │
│   - resolvedFrom: ['httpx', 'nmap']                            │
│   - suppressed: ['nmap:rwhois:confidence=3:threshold=5']       │
└─────────────────────────────────────────────────────────────────┘
```

## Resolver Pipeline

### 1. Evidence Normalization

Each probe source is normalized to a common `ServiceEvidence` format:

```typescript
interface ServiceEvidence {
  kind: 'nmap' | 'httpx' | 'tls' | 'manual';
  confidence: number;  // 0-10
  quality: number;     // 0-10
  displayName: string; // UI label
  metadata: Record<string, unknown>;
  raw: unknown;        // Original probe data
}
```

### 2. Confidence Scoring

#### Nmap
Base score from Nmap's confidence field (0-10), with boosts:
- Top 20 common ports: +1
- Has CPE identifier: +1
- Has version info: +0.5
- **Threshold**: 5 (below this = discarded)

#### HTTPx
Score based on response quality:
- 2xx/3xx + screenshot: **10**
- 2xx/3xx + body: **9**
- 2xx/3xx headers only: **8**
- 4xx + screenshot: **8**
- 4xx + body: **7**
- 4xx headers: **6**
- 5xx: **6**
- **Threshold**: 7 (below this = discarded)

#### Manual Override
- Always **10** (user override wins all)
- **Threshold**: 0 (always accepted)

### 3. Priority Policy

When multiple evidence sources pass thresholds, resolution uses:

1. **Priority** (higher wins):
   - Manual: 90
   - HTTPx: 80
   - TLS: 60 *(future)*
   - ZGrab: 50 *(future)*
   - Nmap: 20

2. **Confidence** (if priority tied)
3. **Quality** (if confidence tied)

### 4. Audit Trail

Every resolution includes:
- `resolvedFrom`: Which sources contributed (e.g., `['httpx', 'nmap']`)
- `suppressed`: Which sources were discarded (e.g., `['nmap:rwhois:confidence=3:threshold=5']`)
- `resolvedAt`: ISO 8601 timestamp

## Example: Port 4321 (rwhois → HTTP)

**Scan Results:**
- Nmap detected: `rwhois` (confidence=3, method=table)
- HTTPx probed: HTTP 403 Forbidden + screenshot

**Resolution Flow:**

```typescript
// 1. Normalize evidence
const nmapEvidence = normalizeNmap({
  name: 'rwhois',
  confidence: 3,
  method: 'table'
}, 4321);
// → confidence: 3, quality: 2

const httpxEvidence = normalizeHttpx({
  scheme: 'http',
  statusCode: 403,
  screenshot: 'screenshots/4321-forbidden.png'
});
// → confidence: 8, quality: 7

// 2. Resolve
const { resolved } = resolveService([nmapEvidence, httpxEvidence]);

// 3. Result
{
  kind: 'httpx',
  confidence: 8,
  displayName: 'HTTP service (403)',
  resolvedFrom: ['httpx'],
  suppressed: ['nmap:rwhois:confidence=3:threshold=5']
}
```

**Why HTTPx Won:**
- Nmap confidence 3 < threshold 5 → suppressed
- HTTPx confidence 8 ≥ threshold 7 → viable
- HTTPx is only viable evidence → wins by default

## Configuration

All policy is centralized in `packages/contracts/device/resolvers/weights.ts`:

```typescript
export const SERVICE_EVIDENCE_WEIGHTS = {
  manual: {
    priority: 90,
    confidenceThreshold: 0,
    defaultConfidence: 10,
  },
  httpx: {
    priority: 80,
    confidenceThreshold: 7,
    defaultConfidence: 8,
  },
  nmap: {
    priority: 20,
    confidenceThreshold: 5,
    defaultConfidence: 5,
  },
};
```

**To adjust policy:**
1. Edit `weights.ts` (single source of truth)
2. Run tests: `pnpm --filter @repo/contracts test`
3. Deploy (no worker restart needed - resolver runs in data-ops query)

## Adding a New Probe Type

Example: Adding TLS fingerprinting

### 1. Add Type
```typescript
// packages/contracts/device/resolvers/types.ts
export type ServiceEvidenceKind =
  | 'nmap'
  | 'httpx'
  | 'tls'  // ← Add here
  | 'manual';
```

### 2. Add Weight Config
```typescript
// packages/contracts/device/resolvers/weights.ts
export const SERVICE_EVIDENCE_WEIGHTS = {
  // ...
  tls: {
    priority: 60,              // Between httpx (80) and nmap (20)
    confidenceThreshold: 5,    // Require valid handshake
    defaultConfidence: 7,
  },
};
```

### 3. Create Normalizer
```typescript
// packages/contracts/device/resolvers/normalizers.ts
export interface TlsProbeData {
  version?: string;
  cipher?: string;
  certificateChain?: string[];
  success: boolean;
}

export function normalizeTls(
  probe: TlsProbeData | null
): ServiceEvidence | null {
  if (!probe?.success) return null;

  let confidence = 5; // Base
  if (probe.certificateChain?.length) confidence += 2;
  if (probe.version === 'TLSv1.3') confidence += 1;

  return {
    kind: 'tls',
    confidence: Math.min(10, confidence),
    quality: probe.certificateChain ? 8 : 4,
    displayName: `HTTPS (${probe.version || 'TLS'})`,
    metadata: {
      version: probe.version,
      cipher: probe.cipher,
      certChain: probe.certificateChain,
    },
    raw: probe,
  };
}
```

### 4. Export from Index
```typescript
// packages/contracts/device/resolvers/index.ts
export { normalizeTls } from './normalizers';
export type { TlsProbeData } from './normalizers';
```

### 5. Integrate in Data-Ops
```typescript
// packages/data-ops/src/queries/devices.ts
import { normalizeTls } from '@repo/contracts/device/resolvers';

const evidence = [
  normalizeNmap(snapshot.service, snapshot.port),
  normalizeHttpx(httpxProbe),
  normalizeTls(tlsProbesMap.get(snapshot.port)), // ← Add here
].filter(Boolean);
```

### 6. Add Tests
```typescript
// packages/contracts/device/resolvers/__tests__/resolution.test.ts
describe('TLS Evidence', () => {
  it('tls beats low-confidence nmap', () => {
    const tls = normalizeTls({
      version: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      certificateChain: ['cert1', 'cert2'],
      success: true,
    });

    const nmap = normalizeNmap({ name: 'ssl', confidence: 4 }, 443);

    const { resolved } = resolveService([tls!, nmap!]);
    expect(resolved?.kind).toBe('tls');
  });
});
```

## Debugging

### View Resolution in Browser Console

Port snapshots include full evidence trail:

```javascript
// Browser console
const device = await trpcClient.device.detail.query({ deviceId: 'xyz' });
console.log(device.portSnapshots[0].service);
// {
//   name: "HTTP service (403)",
//   confidence: 8,
//   source: "httpx",
//   resolvedFrom: ["httpx"],
//   suppressed: ["nmap:rwhois:confidence=3:threshold=5"],
//   _originalNmap: { name: "rwhois", confidence: 3 },
//   _evidence: [...]
// }
```

### Common Issues

**Problem**: Port shows "Unknown service" despite HTTPx success

**Cause**: HTTPx confidence below threshold (7)

**Fix**: Check HTTPx status code. 5xx errors only get confidence=6. Need 4xx or better.

---

**Problem**: Nmap detection preferred over HTTPx

**Cause**: HTTPx probe failed or missing

**Fix**: Check `httpxProbes` table for that port. If missing, HTTPx step might have timed out or been skipped.

---

**Problem**: Service changes between page loads

**Cause**: Non-deterministic timestamp in `resolvedAt`

**Fix**: This is expected. `resolvedAt` reflects when UI query ran, not when scan happened. Use `metadata.lastSeenAt` for scan timestamp.

## Analytics Queries

### Count resolution outcomes
```sql
-- How often does HTTPx override Nmap?
SELECT
  json_extract(value, '$.service.source') as source,
  COUNT(*) as count
FROM scanRuns,
  json_each(scanRuns.result_summary, '$.portSnapshots')
WHERE json_extract(value, '$.service.source') IS NOT NULL
GROUP BY source;
```

### Find suppressed detections
```sql
-- What Nmap detections are being suppressed?
SELECT
  json_extract(value, '$.service.suppressed[0]') as suppressed_reason,
  COUNT(*) as count
FROM scanRuns,
  json_each(scanRuns.result_summary, '$.portSnapshots')
WHERE json_extract(value, '$.service.suppressed') IS NOT NULL
GROUP BY suppressed_reason
ORDER BY count DESC
LIMIT 10;
```

## Testing

Run the full test suite:
```bash
pnpm --filter @repo/contracts test device/resolvers/__tests__/resolution.test.ts
```

Test specific scenarios:
```bash
# Priority policy tests
pnpm --filter @repo/contracts test -t "Priority Policy"

# Port 4321 rwhois case
pnpm --filter @repo/contracts test -t "port 4321"
```

## Performance

**Resolver overhead**: ~0.5ms per port (negligible)

**Optimization**: Resolver runs only when device detail is loaded, not on every scan. Scans still write raw Nmap data; resolution is deferred to query time.

**Caching**: Browser-side React Query caches resolved devices. Re-resolution only happens on cache invalidation.

## Related Files

- `packages/contracts/device/resolvers/` - Core resolver logic
- `packages/data-ops/src/queries/devices.ts:478-515` - Integration point
- `apps/restate-worker/src/port-scanner.ts:590` - Worker-side filtering
- `apps/user-application/src/features/assets/utils/service-display.tsx` - UI formatting

## Future Enhancements

- [ ] **Machine learning confidence**: Train model on user feedback (manual overrides)
- [ ] **Temporal analysis**: Track confidence changes over time per port
- [ ] **Cross-port correlation**: If port 80 is HTTP, boost confidence for 443 being HTTPS
- [ ] **User feedback loop**: "Is this correct?" button → adjust weights
- [ ] **A/B testing**: Compare old vs new resolution logic in production
