# Temporal Worker Architecture

## Overview

This worker is designed to be **database-agnostic** - it processes scan workflows and returns results through Temporal without requiring database persistence. This enables:

- **Stateless deployment** - No database credentials needed
- **Multi-tenant flexibility** - Clients handle their own storage
- **Simplified testing** - No database fixtures required
- **Result streaming** - Real-time results through Temporal queries/signals

## Database-Free vs Database-Dependent

### Old Worker (`apps/worker`) - Database-Dependent

```typescript
// Old workflow persistence (database writes)
import { createScanArtifact, updateDevice } from "database-package";
// Uses Drizzle ORM with Cloudflare D1

await persistPortScanArtifact({
  tenantId,
  scanRunId,
  scanResult,  // Writes to database
  scanContext,
  deviceId
});

await completeScan({  // Updates scan status in DB
  scanRunId,
  summary: { portsFound: 42, ... }
});
```

**Dependencies:**
- Database connection (Drizzle ORM + Cloudflare D1)
- Persistence activities (`persistPortScanArtifact`)
- Orchestration activities (`updateScanStatus`, `completeScan`, `failScan`)
- Writes artifacts to `scanArtifacts` table
- Updates device status in `devices` table

### New Worker (`apps/temporal-worker`) - Database-Free

```typescript
// New workflow - returns results through Temporal
export async function portscanWorkflow(input: PortScanInput): Promise<PortScanResult> {
  // 1. Parse input
  const normalizedInput = normalizePortScanInput(input);

  // 2. Run prescan (masscan/rustscan)
  const prescanPorts = await executePrescanStage(...);

  // 3. Run detailed nmap scan
  const nmapResult = await executeNmapStage(...);

  // 4. Parse XML and analyze
  const parsedResults = await parseNmapXml(nmapResult.xmlOutput);
  const analyzedResults = await analyzePortScanResults(parsedResults);

  // 5. Return results through Temporal (no database writes)
  return {
    ports: analyzedResults,
    osInfo: parsedResults.osInfo,
    timing: parsedResults.timing,
    scanMetadata: nmapResult.scanMetadata
  };
}
```

**No Dependencies:**
- ❌ No database imports
- ❌ No persistence activities
- ❌ No orchestration activities
- ✅ Returns results as workflow return value
- ✅ Client decides how/where to store

## Result Flow

### Database-Dependent Flow (Old)
```
Client → Temporal → Worker → Nmap → XML Parser → Database
                                              ↓
                               Client ← Database Query
```

### Database-Free Flow (New)
```
Client → Temporal → Worker → Nmap → XML Parser → Temporal Result
       ↑                                              ↓
       └──────────── Direct Result ←──────────────────┘
```

## Architecture Components

### Core Processing Pipeline

1. **Input Normalization** (`input/normalizer.ts`)
   - Handles both simple `PortScanInput` and rich `ScannerInput` formats
   - Normalizes target, ports, scan profiles

2. **Prescan Stage** (`prescan/`)
   - Policy-based tool selection (masscan/rustscan)
   - Fast discovery of open ports
   - Configurable based on scan mode

3. **Port Merging** (`merge/port-merger.ts`)
   - Combines prescan results
   - Derives additional ports for nmap
   - Deduplicates port lists

4. **XML Parser** (`xml-parser/`)
   - **Modular architecture** (we just refactored this!)
   - Parses nmap XML → structured data
   - Extracts ports, services, OS info, CPE strings
   - See `xml-parser/README.md` for details

5. **Result Analysis** (`result-analysis.ts`)
   - Filters and analyzes discovered ports
   - Removes tcpwrapped false positives
   - Provides `filterOpenPorts()` helper

6. **Observability** (`observability.ts`)
   - Metrics collection
   - Structured logging
   - No database writes

## Client Integration

### Starting a Scan (Database-Free)

```typescript
// Client code
import { Client } from '@temporalio/client';

const client = new Client();

// Start workflow and get results directly
const result = await client.workflow.execute('portscanWorkflow', {
  workflowId: `portscan-${target}-${Date.now()}`,
  taskQueue: 'portscan-queue',
  args: [{
    target: '192.168.1.1',
    scanProfile: 'QUICK',
    requestedPorts: [80, 443, 22]
  }]
});

// Client decides what to do with results
await saveToDatabase(result);        // Option 1: Save to DB
await sendToWebhook(result);         // Option 2: Send to webhook
await streamToWebSocket(result);     // Option 3: Stream to client
```

### Streaming Results via Queries

```typescript
// Client can poll for progress
const handle = client.workflow.getHandle('portscan-123');

const state = await handle.query('getPortScanState');
console.log(`Progress: ${state.progress}% - ${state.portsFound} ports found`);
```

## Migration from Old Worker

If you need to migrate from the old database-dependent worker:

1. **Change workflow invocation** - Get results from return value instead of database
2. **Remove persistence activities** - No `persistPortScanArtifact` calls
3. **Handle results in client** - Client stores/processes results as needed
4. **Update orchestration** - No `completeScan`/`failScan` calls

### Example Migration

**Before (Old Worker):**
```typescript
// Workflow persists to DB
await client.workflow.execute('portscanWorkflow', { ... });

// Client queries DB for results
const results = await db.scanArtifacts.findOne({ scanRunId });
```

**After (New Worker):**
```typescript
// Workflow returns results
const results = await client.workflow.execute('portscanWorkflow', { ... });

// Client decides what to do
await yourPersistenceLayer.save(results);
```

## Testing Benefits

Database-free architecture simplifies testing:

```typescript
// No database fixtures needed!
import { TestWorkflowEnvironment } from '@temporalio/testing';

const env = await TestWorkflowEnvironment.createLocal();
const result = await env.client.workflow.execute('portscanWorkflow', {
  args: [{ target: '192.168.1.1' }]
});

expect(result.ports).toHaveLength(4);
expect(result.osInfo).toBeDefined();
// No database cleanup needed
```

## Future Enhancements

- **Signal-based streaming**: Stream results incrementally as ports are discovered
- **Activity-level granularity**: Return results from individual scan stages
- **Multi-target support**: Scan multiple targets in parallel, return combined results
- **Result caching**: Optional Redis/memory cache for duplicate scans

## Related Documentation

- `CLAUDE.md` - Test-driven development workflow
- `xml-parser/README.md` - XML parser module details (if created)
- `src/workflows/discovery/` - Similar database-free discovery workflows
