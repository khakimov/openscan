# Temporal Workflow Architecture for Port Scanning

This document explains how we built a robust, scalable port scanning system using Temporal workflows, including the complete data flow, activity design patterns, and extension points for adding new scanners like RustScan or Masscan.

## Overview

Our port scanning system uses Temporal to orchestrate complex scanning workflows that involve:
- **Database persistence** for scan lifecycle management
- **XML parsing** of nmap results with comprehensive artifact storage
- **Error handling and retries** for reliable scanning
- **Real-time status updates** via TanStack Query polling
- **Extensible activity pattern** for adding new scan tools

## Architecture Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Server Fns     │    │   Temporal      │
│   (TanStack)    │────│   (Start)        │────│   Workflows     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌──────────────────┐             │
         └──────────────│   Database       │─────────────┘
                        │   (PostgreSQL)   │
                        └──────────────────┘
```

## Database Schema Design

### Core Tables

#### 1. Scan Workflows (`scan_workflows`)
**Location**: `/packages/db/src/schema/orchestration.ts:10-25`

```typescript
export const scanWorkflows = pgTable('scan_workflows', {
  id: cuidText().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  kind: workflowKindEnum('kind').notNull(), // 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN'
  status: workflowStatusEnum('status').notNull().default('PENDING'),
  temporalId: text('temporal_id').notNull(), // Links to Temporal execution
  temporalRunId: text('temporal_run_id'),
  startedAt: timestamp('started_at', { mode: 'date' }),
  finishedAt: timestamp('finished_at', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
});
```

#### 2. Scan Runs (`scan_runs`)
**Location**: `/packages/db/src/schema/orchestration.ts:27-42`

```typescript
export const scanRuns = pgTable('scan_runs', {
  id: cuidText().primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => scanWorkflows.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  scope: scanScopeEnum('scope').notNull(), // 'INTERNAL' | 'EXTERNAL' | 'HYBRID'
  scanType: scanTypeEnum('scan_type').notNull(), // 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED'
  target: text('target'), // Primary scan target (e.g., "example.com")
  requestedById: uuid('requested_by_id').references(() => users.id),
  requestedAt: now(),
  status: runStatusEnum('status').notNull().default('PENDING'),
  resultSummary: jsonb('result_summary').$type<Record<string, any>>(),
});
```

#### 3. Scan Artifacts (`scan_artifacts`)
**Location**: `/packages/db/src/schema/findings.ts:10-23`

```typescript
export const scanArtifacts = pgTable('scan_artifacts', {
  id: cuidText().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  runId: text('run_id').notNull().references(() => scanRuns.id),
  artifactType: text('artifact_type').notNull(), // 'port_scan', 'nmap_xml', etc.
  data: jsonb('data').$type<JsonObject>().notNull(), // Parsed scan results
  metadata: jsonb('metadata').$type<JsonObject>(),
  storageUrl: text('storage_url'), // Optional file storage reference
  checksum: text('checksum'), // Data integrity verification
  createdAt: now(),
});
```

## Workflow Implementation

### Port Scan Workflow Entry Point
**Location**: `/apps/web/src/server/discovery/workflows/port-scan-handler.ts`

```typescript
export const startPortScanWorkflow = createServerFn({
  method: "POST",
}).handler(async ({ data }) => {
  const session = await useAppSession();
  const sessionData = session.data;

  // Input validation
  const input = portScanInputSchema.parse(data);

  // 1. Create temporal workflow ID
  const temporalWorkflowId = `portscan-${input.target.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;

  // 2. Create workflow record
  const scanWorkflow = await createScanWorkflow({
    kind: 'RESCAN',
    temporalWorkflowId,
    tenantId: sessionData.tenantId
  });

  // 3. Create scan run record with target
  const scanRun = await createScanRun({
    workflowId: scanWorkflow.id,
    tenantId: sessionData.tenantId,
    scanType: 'PORT',
    scope: determineScanScope(input.target),
    requestedById: sessionData.userId,
    target: input.target, // Store primary target for UI display
    targets: [input.target]
  });

  // 4. Start Temporal workflow
  const handle = await temporal.workflow.start(portScanWorkflow, {
    taskQueue: 'port-scan',
    workflowId: temporalWorkflowId,
    args: [{
      target: input.target,
      scanRunId: scanRun.id,
      tenantId: sessionData.tenantId
    }],
  });

  return {
    success: true,
    workflowId: temporalWorkflowId,
    scanRunId: scanRun.id,
    temporalRunId: handle.firstExecutionRunId
  };
});
```

### Input/Output Types

#### Server Function Input
```typescript
// Location: /apps/web/src/server/discovery/schemas/port-scan-schemas.ts
const portScanInputSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  protocol: z.enum(['tcp', 'udp', 'both']).default('tcp'),
  timeout: z.number().min(1000).max(300000).default(30000),
});

type PortScanInput = z.infer<typeof portScanInputSchema>;
```

#### Workflow Parameters
```typescript
// Location: /apps/worker/src/workflows/portscan/workflow.ts
interface PortScanWorkflowParams {
  target: string;           // Scan target (domain/IP)
  scanRunId: string;        // Database scan run ID
  tenantId: string;         // Tenant isolation
  protocol?: 'tcp' | 'udp' | 'both';
  timeout?: number;
}
```

#### Workflow Return Type
```typescript
interface PortScanWorkflowResult {
  success: boolean;
  target: string;
  scanRunId: string;
  summary?: {
    totalPorts: number;
    openPorts: number;
    closedPorts: number;
    filteredPorts: number;
  };
  error?: string;
}
```

## Activity Pattern Design

### Core Activity: Nmap Execution
**Location**: `/apps/worker/src/workflows/portscan/activities/nmap.ts:15-95`

```typescript
export async function executeNmapScan(params: {
  target: string;
  protocol: 'tcp' | 'udp' | 'both';
  timeout: number;
}): Promise<NmapScanResult> {

  // 1. Build nmap command
  const nmapArgs = buildNmapCommand(params);

  // 2. Execute scan with timeout
  const { stdout, stderr, exitCode } = await executeCommand({
    command: 'nmap',
    args: nmapArgs,
    timeout: params.timeout,
    cwd: '/tmp' // Isolated execution directory
  });

  // 3. Handle execution results
  if (exitCode !== 0) {
    throw new Error(`Nmap execution failed: ${stderr}`);
  }

  return {
    success: true,
    target: params.target,
    xmlOutput: stdout,
    command: `nmap ${nmapArgs.join(' ')}`,
    executedAt: new Date(),
  };
}

// Input/Output Types
interface NmapScanResult {
  success: boolean;
  target: string;
  xmlOutput: string;        // Raw nmap XML output
  command: string;          // Executed command for debugging
  executedAt: Date;
  error?: string;
}
```

### XML Parsing Activity
**Location**: `/apps/worker/src/workflows/portscan/activities/xml-parser.ts:20-150`

```typescript
export async function parseNmapMockXml(xmlFilePath: string): Promise<ParsedNmapData> {
  // 1. Read and validate XML
  const xmlContent = await fs.readFile(xmlFilePath, 'utf-8');

  // 2. Parse with xml2js
  const parser = new xml2js.Parser({
    explicitArray: true,
    mergeAttrs: false,
    explicitCharkey: false,
  });

  const result = await parser.parseStringPromise(xmlContent);

  // 3. Extract structured data
  return {
    scanner: result.nmaprun?.$.scanner || 'nmap',
    version: result.nmaprun?.$.version || 'unknown',
    hosts: extractHostData(result.nmaprun.host || []),
    runStats: extractRunStats(result.nmaprun.runstats?.[0]),
    scanMetadata: {
      command: result.nmaprun?.$.args || '',
      startTime: parseInt(result.nmaprun?.$.start || '0'),
      endTime: parseInt(result.nmaprun?.runstats?.[0]?.finished?.[0]?.$.time || '0'),
    }
  };
}

// Comprehensive output type
interface ParsedNmapData {
  scanner: string;
  version: string;
  hosts: Record<string, HostData>;
  runStats: RunStats;
  scanMetadata: ScanMetadata;
}

interface HostData {
  ip: string;
  hostnames: string[];
  state: 'up' | 'down' | 'unknown';
  ports: PortInfo[];
  osInfo?: OSDetectionInfo;
}

interface PortInfo {
  port: number;
  protocol: string;
  state: 'open' | 'closed' | 'filtered';
  service?: {
    name?: string;
    product?: string;
    version?: string;
    extraInfo?: string;
  };
  lastSeen?: number;
}
```

### Database Persistence Activity
**Location**: `/apps/worker/src/workflows/shared/activities/persistence.ts:15-85`

```typescript
export async function persistScanArtifact(params: {
  scanRunId: string;
  tenantId: string;
  artifactType: string;
  data: JsonObject;
  metadata?: JsonObject;
}): Promise<{ artifactId: string; success: boolean }> {

  try {
    // Create artifact record
    const artifact = await createScanArtifact({
      tenantId: params.tenantId,
      scanRunId: params.scanRunId,
      artifactType: params.artifactType,
      data: params.data,
      metadata: params.metadata || {}
    });

    return {
      artifactId: artifact.id,
      success: true
    };

  } catch (error) {
    logger.error('Failed to persist scan artifact', {
      error,
      scanRunId: params.scanRunId,
      artifactType: params.artifactType
    });

    throw new ActivityFailure(
      `Failed to persist artifact: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

## Complete Workflow Orchestration

### Main Workflow Function
**Location**: `/apps/worker/src/workflows/portscan/workflow.ts:20-120`

```typescript
export async function portScanWorkflow(params: PortScanWorkflowParams): Promise<PortScanWorkflowResult> {

  // 1. Update workflow status to RUNNING
  await updateScanWorkflowStatus({
    scanRunId: params.scanRunId,
    tenantId: params.tenantId,
    status: 'RUNNING',
    startedAt: new Date()
  });

  try {
    // 2. Execute nmap scan
    const scanResult = await executeNmapScan({
      target: params.target,
      protocol: params.protocol || 'tcp',
      timeout: params.timeout || 30000
    });

    // 3. Parse XML results
    const parsedData = await parseNmapOutput({
      xmlContent: scanResult.xmlOutput,
      target: params.target
    });

    // 4. Enrich with scan context
    const enrichedData = {
      ...parsedData,
      scanContext: {
        target: params.target,
        scanId: params.scanRunId,
        userId: params.requestedById,
        tenantId: params.tenantId,
        scanRunId: params.scanRunId,
        workflowId: 'temporal-generated', // Temporal provides this
        authScanType: 'PORT',
        isExtendScan: false
      },
      scanMetadata: {
        ...parsedData.scanMetadata,
        scanner: parsedData.scanner,
        version: parsedData.version,
        duration: parsedData.runStats?.finished?.elapsed || 0
      }
    };

    // 5. Persist artifact to database
    await persistScanArtifact({
      scanRunId: params.scanRunId,
      tenantId: params.tenantId,
      artifactType: 'port_scan',
      data: enrichedData,
      metadata: {
        scanner: 'nmap',
        version: parsedData.version,
        executedAt: new Date().toISOString()
      }
    });

    // 6. Update workflow status to SUCCEEDED
    await updateScanWorkflowStatus({
      scanRunId: params.scanRunId,
      tenantId: params.tenantId,
      status: 'SUCCEEDED',
      completedAt: new Date(),
      resultSummary: {
        totalPorts: parsedData.runStats?.hosts?.total || 0,
        openPorts: Object.values(parsedData.hosts).reduce((acc, host) =>
          acc + host.ports.filter(p => p.state === 'open').length, 0
        )
      }
    });

    return {
      success: true,
      target: params.target,
      scanRunId: params.scanRunId,
      summary: {
        totalPorts: parsedData.runStats?.hosts?.total || 0,
        openPorts: Object.values(parsedData.hosts).reduce((acc, host) =>
          acc + host.ports.filter(p => p.state === 'open').length, 0
        ),
        closedPorts: 0, // Calculate from parsedData
        filteredPorts: 0 // Calculate from parsedData
      }
    };

  } catch (error) {
    // 7. Handle failures
    await updateScanWorkflowStatus({
      scanRunId: params.scanRunId,
      tenantId: params.tenantId,
      status: 'FAILED',
      completedAt: new Date(),
      resultSummary: {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    });

    return {
      success: false,
      target: params.target,
      scanRunId: params.scanRunId,
      error: error instanceof Error ? error.message : 'Workflow failed'
    };
  }
}
```

## Frontend Integration

### Real-time Status Updates
**Location**: `/apps/web/src/features/scans/components/table/index.tsx:160-178`

```typescript
const {
  data: response,
  isLoading,
  error,
  isFetching,
  isRefetching,
} = useQuery({
  queryKey: ["scans"],
  queryFn: () => getScans(),
  refetchInterval: (query) => {
    const data = query.state.data;

    // Only poll if there are active scans (PENDING or RUNNING)
    if (!data?.success || !Array.isArray(data.data)) {
      return false;
    }

    const hasActiveScans = data.data.some((scan: Scan) =>
      scan.status === 'PENDING' || scan.status === 'RUNNING'
    );

    return hasActiveScans ? 3000 : false; // Poll every 3 seconds only if needed
  },
  refetchIntervalInBackground: false,
  keepPreviousData: true, // Prevent jank during updates
});
```

### Cache Invalidation on Scan Start
**Location**: `/apps/web/src/features/assets/components/device-card.tsx:98-100`

```typescript
if (result.success) {
  // Invalidate scans query to show the new scan immediately
  queryClient.invalidateQueries({ queryKey: ['scans'] });

  toast.success(`Port scan started for ${target}`, {
    description: `Workflow ID: ${result.workflowId}`
  });
}
```

## Extension Patterns for New Scanners

### Adding RustScan Support

#### 1. Create RustScan Activity
**Location**: `/apps/worker/src/workflows/portscan/activities/rustscan.ts`

```typescript
export async function executeRustScan(params: {
  target: string;
  portRange?: string; // e.g., "1-65535"
  timeout: number;
  threads?: number;
}): Promise<RustScanResult> {

  const rustScanArgs = [
    '-a', params.target,
    '--timeout', params.timeout.toString(),
    '--ports', params.portRange || '1-65535',
    '--scripts', 'None', // Disable Nmap scripts initially
    '--greppable' // Machine-readable output
  ];

  if (params.threads) {
    rustScanArgs.push('--ulimit', params.threads.toString());
  }

  const { stdout, stderr, exitCode } = await executeCommand({
    command: 'rustscan',
    args: rustScanArgs,
    timeout: params.timeout,
    cwd: '/tmp'
  });

  if (exitCode !== 0) {
    throw new Error(`RustScan execution failed: ${stderr}`);
  }

  return {
    success: true,
    target: params.target,
    greppableOutput: stdout,
    command: `rustscan ${rustScanArgs.join(' ')}`,
    executedAt: new Date(),
  };
}

interface RustScanResult {
  success: boolean;
  target: string;
  greppableOutput: string;  // RustScan's greppable format
  command: string;
  executedAt: Date;
  error?: string;
}
```

#### 2. Create RustScan Parser
**Location**: `/apps/worker/src/workflows/portscan/activities/rustscan-parser.ts`

```typescript
export async function parseRustScanOutput(params: {
  greppableOutput: string;
  target: string;
}): Promise<ParsedRustScanData> {

  const lines = params.greppableOutput.split('\n').filter(line => line.trim());
  const ports: PortInfo[] = [];

  // Parse RustScan greppable format
  // Example: "192.168.1.1:22/open/tcp//ssh///"
  for (const line of lines) {
    const match = line.match(/^([^:]+):(\d+)\/(open|closed|filtered)\/(tcp|udp)\/\/([^\/]*)\//);
    if (match) {
      const [, ip, portStr, state, protocol, service] = match;
      ports.push({
        port: parseInt(portStr),
        protocol: protocol as 'tcp' | 'udp',
        state: state as 'open' | 'closed' | 'filtered',
        service: service ? { name: service } : undefined,
      });
    }
  }

  return {
    scanner: 'rustscan',
    version: 'latest', // Could extract from --version
    hosts: {
      [params.target]: {
        ip: params.target,
        hostnames: [],
        state: 'up',
        ports: ports,
      }
    },
    runStats: {
      finished: {
        time: Date.now(),
        timeStr: new Date().toISOString(),
        summary: `RustScan done: 1 IP address scanned`,
        elapsed: 0, // Would need to track timing
        exit: 'success'
      },
      hosts: {
        up: 1,
        down: 0,
        total: 1
      }
    },
    scanMetadata: {
      scanner: 'rustscan',
      command: params.greppableOutput.split('\n')[0] || '', // First line usually has command
      startTime: Date.now(),
      endTime: Date.now(),
    }
  };
}
```

#### 3. Enhanced Workflow with Scanner Selection
**Location**: `/apps/worker/src/workflows/portscan/workflow.ts` (enhanced)

```typescript
export async function portScanWorkflow(params: PortScanWorkflowParams & {
  scanner?: 'nmap' | 'rustscan' | 'masscan';
}): Promise<PortScanWorkflowResult> {

  await updateScanWorkflowStatus({
    scanRunId: params.scanRunId,
    tenantId: params.tenantId,
    status: 'RUNNING',
    startedAt: new Date()
  });

  try {
    let parsedData: ParsedScanData;

    // Scanner selection
    switch (params.scanner || 'nmap') {
      case 'nmap':
        const nmapResult = await executeNmapScan({
          target: params.target,
          protocol: params.protocol || 'tcp',
          timeout: params.timeout || 30000
        });
        parsedData = await parseNmapOutput({
          xmlContent: nmapResult.xmlOutput,
          target: params.target
        });
        break;

      case 'rustscan':
        const rustScanResult = await executeRustScan({
          target: params.target,
          timeout: params.timeout || 30000,
          threads: 5000 // RustScan's default
        });
        parsedData = await parseRustScanOutput({
          greppableOutput: rustScanResult.greppableOutput,
          target: params.target
        });
        break;

      case 'masscan':
        // Implementation similar to RustScan
        throw new Error('Masscan support not yet implemented');

      default:
        throw new Error(`Unsupported scanner: ${params.scanner}`);
    }

    // Rest of workflow remains the same...
    const enrichedData = addScanContext(parsedData, params);
    await persistScanArtifact({ /* ... */ });
    await updateScanWorkflowStatus({ /* success */ });

    return { success: true, /* ... */ };

  } catch (error) {
    await updateScanWorkflowStatus({ /* failure */ });
    return { success: false, error: error.message };
  }
}
```

### Adding Masscan Support

Similar pattern as RustScan, but with Masscan-specific command building and output parsing:

```typescript
// masscan command example
const masscanArgs = [
  '-p', params.portRange || '1-65535',
  '--rate', '1000',
  '--output-format', 'json',
  '--output-file', '/tmp/masscan-output.json',
  params.target
];
```

## Key Design Principles

### 1. **Activity Isolation**
Each scanner (nmap, rustscan, masscan) is implemented as a separate activity with its own:
- Input/output types
- Error handling
- Command execution
- Result parsing

### 2. **Unified Data Model**
All scanners produce the same `ParsedScanData` interface, enabling:
- Consistent database storage
- Unified frontend display
- Interchangeable scanner backends

### 3. **Database-First Approach**
- Workflow state is persisted at each major step
- Rich artifact storage with JSONB for flexibility
- Tenant isolation at the database level
- Comprehensive audit trail

### 4. **Error Resilience**
- Temporal handles retries and timeouts
- Database transactions ensure consistency
- Graceful degradation on parsing errors
- Comprehensive error logging

### 5. **Frontend Integration**
- Real-time status updates via conditional polling
- Cache invalidation on workflow initiation
- Optimistic UI updates
- Performance-conscious rendering

## Testing and Debugging

### Mock XML Files for Testing
**Location**: `/apps/worker/src/workflows/portscan/fixtures/nmap-sample.xml`

Use the debug script to test XML parsing:
```bash
npx tsx scripts/test/debug-xml-parser.ts
```

### Temporal Web UI
Monitor workflow execution at: `http://localhost:8080`

### Database Queries
Monitor scan progress:
```sql
-- View active workflows
SELECT * FROM scan_workflows WHERE status IN ('PENDING', 'RUNNING');

-- View scan artifacts
SELECT sr.target, sa.artifact_type, sa.created_at
FROM scan_runs sr
JOIN scan_artifacts sa ON sa.run_id = sr.id
WHERE sr.tenant_id = 'your-tenant-id'
ORDER BY sa.created_at DESC;
```

## Performance Considerations

1. **Conditional Polling**: Frontend only polls when scans are active
2. **keepPreviousData**: Prevents UI jank during background refetches
3. **JSONB Indexing**: Efficient queries on artifact data
4. **Activity Timeouts**: Prevent hanging workflows
5. **Connection Pooling**: Database connection management

This architecture provides a solid foundation for extending scanning capabilities while maintaining reliability, observability, and performance.
