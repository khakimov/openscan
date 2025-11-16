# Restate Best Practices

This document outlines best practices for using Restate in our application, based on official Restate examples and documentation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Concepts](#core-concepts)
- [API Patterns](#api-patterns)
- [State Management](#state-management)
- [Client Integration](#client-integration)
- [Common Patterns](#common-patterns)
- [Anti-Patterns (Things to Avoid)](#anti-patterns-things-to-avoid)

## Architecture Overview

```
React UI (localhost:3000)
    ↓ HTTP POST
Restate Server (localhost:8080 or Cloud)
    ↓ Routes to service
Restate Worker (localhost:9080)
    ↓ Executes handlers
    ↓ POST back results (optional)
React UI receives updates
```

**Key Principles:**
1. UI calls Restate directly via HTTP (no intermediate API layer needed)
2. Workers are stateless - state lives in Restate
3. Use `/send` endpoint for fire-and-forget async operations
4. Use durability features (`ctx.run`, `ctx.set`, `ctx.get`) for reliability

## Core Concepts

### 1. Services vs Virtual Objects vs Workflows

#### Services (Stateless)
Use for independent, one-time operations with no shared state.

```typescript
// Good: Each scan is independent
export const portScanner = restate.service({
  name: 'PortScanner',
  handlers: {
    scan: async (ctx, input: { target: string }) => {
      const scanId = ctx.rand.uuidv4();
      // Scan and return results
      return { scanId, ports: [...] };
    },
  },
});
```

**When to use:**
- Independent tasks (port scanning, one-off discovery)
- No state to maintain between calls
- Results are computed and returned immediately or via callback

#### Virtual Objects (Stateful, Keyed)
Use for entities with state that need to be queried/updated.

```typescript
// Good: Scan status keyed by scanId
export default object({
  name: "ScanStatus",
  handlers: {
    get: async (ctx: ObjectContext) => {
      const status = await ctx.get<string>("status");
      const portsFound = await ctx.get<number>("portsFound");
      return { status, portsFound };
    },
    updateStatus: async (ctx: ObjectContext, status: string) => {
      ctx.set("status", status);
    },
  },
});
```

**When to use:**
- Need to store/query state by ID (scan status, device state)
- Multiple operations on the same entity
- State needs to persist beyond single operation

#### Workflows (Long-running, Stateful)
Use for multi-step processes with state and coordination.

```typescript
// Good: Discovery workflow with multiple steps
export default workflow({
  name: "discovery-workflow",
  handlers: {
    run: async (ctx: WorkflowContext, input: { target: string }) => {
      ctx.set("status", "VALIDATING");

      const subdomains = await ctx.run("subfinder", () =>
        runSubfinder(input.target)
      );

      ctx.set("status", "DISCOVERING");
      ctx.set("subdomainsFound", subdomains.length);

      await ctx.promise("user_confirmed");
      ctx.set("status", "COMPLETED");

      return { subdomains };
    },

    getStatus: async (ctx: WorkflowSharedContext) => {
      return {
        status: await ctx.get<string>("status"),
        subdomainsFound: await ctx.get<number>("subdomainsFound"),
      };
    },

    confirm: async (ctx: WorkflowSharedContext) => {
      ctx.promise("user_confirmed").resolve();
    },
  },
});
```

**When to use:**
- Multi-step processes with state
- Need to pause/resume (waiting for user input, external events)
- Need to coordinate between steps

### 2. Keyed Entities

Restate uses **single key** for workflows and virtual objects - no separate "runId" concept.

```typescript
// ✅ CORRECT - Single key identifies the workflow
const scanId = `discovery-${target}-${Date.now()}`;
POST /Discovery/discover/send
Body: { scanId, targets: [...] }

// Later - query using same key
GET /Discovery/{scanId}/getState

// ❌ WRONG - Temporal-style with workflowId + runId
const workflowId = "discovery-123";
const runId = "abc-def-456";  // Not needed in Restate!
```

## API Patterns

### 1. Direct Restate Invocation

#### Synchronous (Wait for result)
```typescript
// POST /ServiceName/methodName
// or
// POST /ServiceName/{key}/methodName (for keyed entities)

const response = await fetch(`${RESTATE_URL}/PortScanner/scan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ target: '192.168.1.1', ports: '80,443' }),
});

const result = await response.json();
// result = { scanId, ports: [...], totalPorts: 10 }
```

#### Asynchronous (Fire and forget)
```typescript
// POST /ServiceName/methodName/send
// Returns immediately with invocation ID

const response = await fetch(`${RESTATE_URL}/PortScanner/scan/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    target: '192.168.1.1',
    callbackUrl: 'https://myapp.com/api/scan-results',
  }),
});

const { invocationId } = await response.json();
// Worker calls back when done
```

#### Query State (Virtual Objects/Workflows)
```typescript
// GET or POST /ObjectName/{key}/methodName

const response = await fetch(`${RESTATE_URL}/ScanStatus/${scanId}/get`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});

const status = await response.json();
// status = { status: "SCANNING", portsFound: 5 }
```

### 2. Helper Function Pattern

Create a reusable helper for all Restate calls:

```typescript
// utils/restate-client.ts
export async function sendToRestate<T>({
  service,
  method,
  key,
  data = {},
  async = false,
}: {
  service: string;
  method: string;
  key?: string;
  data?: any;
  async?: boolean; // true = use /send
}): Promise<T> {
  const baseUrl = process.env.RESTATE_INGRESS_URL || 'http://localhost:8080';

  let url = `${baseUrl}/${service}`;
  if (key) {
    url += `/${key}`;
  }
  url += `/${method}`;
  if (async) {
    url += '/send';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Restate error: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const result = await sendToRestate({
  service: 'PortScanner',
  method: 'scan',
  data: { target: '192.168.1.1' },
  async: true, // Use /send endpoint
});
```

## State Management

### 1. Storing State in Workflows/Objects

```typescript
// ✅ CORRECT - Use ctx.set/get for durable state
export const discoveryWorkflow = workflow({
  name: 'Discovery',
  handlers: {
    discover: async (ctx, input) => {
      // Store state durably
      ctx.set('status', 'VALIDATING');
      ctx.set('targets', input.targets);
      ctx.set('startedAt', Date.now());

      const results = await ctx.run('subfinder', async () => {
        return runSubfinder(input.targets[0]);
      });

      // Update state
      ctx.set('status', 'COMPLETED');
      ctx.set('devicesFound', results.length);
      ctx.set('devices', results); // ⚠️ Store full results!

      return results;
    },

    getState: async (ctx: WorkflowSharedContext) => {
      return {
        status: await ctx.get('status'),
        targets: await ctx.get('targets'),
        devicesFound: await ctx.get('devicesFound'),
        devices: await ctx.get('devices'), // Return full data
        startedAt: await ctx.get('startedAt'),
      };
    },
  },
});

// ❌ WRONG - In-memory Map (not durable, lost on restart)
const stateStore = new Map<string, State>();
stateStore.set(scanId, { status: 'RUNNING' }); // Lost if worker crashes!
```

### 2. When In-Memory State is OK

Only use in-memory state for:
- Temporary data within a single handler execution
- Caching that can be regenerated
- Data that's already persisted elsewhere (database)

```typescript
// ✅ OK - Temporary aggregation
export const portScanner = service({
  name: 'PortScanner',
  handlers: {
    scan: async (ctx, input) => {
      // In-memory accumulation during execution
      const allPorts = [];

      const masscanPorts = await ctx.run('masscan', () => runMasscan(input.target));
      allPorts.push(...masscanPorts);

      const rustscanPorts = await ctx.run('rustscan', () => runRustscan(input.target));
      allPorts.push(...rustscanPorts);

      // Return or store in database, not in-memory Map
      return { ports: allPorts };
    },
  },
});
```

## Client Integration

### 1. React Integration Pattern

```typescript
// hooks/useScanStatus.ts
import { useQuery } from '@tanstack/react-query';
import { sendToRestate } from '@/utils/restate-client';

export function useScanStatus(scanId: string | null) {
  return useQuery({
    queryKey: ['scan-status', scanId],
    queryFn: async () => {
      if (!scanId) return null;

      return sendToRestate({
        service: 'ScanStatus',
        key: scanId,
        method: 'get',
      });
    },
    enabled: !!scanId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.status?.toLowerCase();

      // Stop polling when complete
      if (status === 'completed' || status === 'failed') {
        return false;
      }

      // Poll every 5 seconds while running
      return 5000;
    },
  });
}

// components/ScanButton.tsx
function ScanButton({ target }: { target: string }) {
  const [scanId, setScanId] = useState<string | null>(null);
  const { data: status, isLoading } = useScanStatus(scanId);

  const handleScan = async () => {
    const result = await sendToRestate({
      service: 'PortScanner',
      method: 'scan',
      data: { target },
      async: true, // Use /send for async
    });

    setScanId(result.scanId);
  };

  return (
    <div>
      <button onClick={handleScan}>Start Scan</button>
      {status && <div>Status: {status.status}</div>}
    </div>
  );
}
```

### 2. Server Function Pattern (TanStack Start)

```typescript
// server/scan.ts
import { createServerFn } from '@tanstack/react-start';
import { sendToRestate } from '../utils/restate-client';

export const startScan = createServerFn({ method: 'POST' })
  .inputValidator((data: { target: string }) => {
    if (!data.target) throw new Error('Target required');
    return data;
  })
  .handler(async ({ data }) => {
    // Call Restate from server
    const result = await sendToRestate({
      service: 'PortScanner',
      method: 'scan',
      data: { target: data.target },
      async: true,
    });

    // Optionally save to database
    await db.insert(scans).values({
      scanId: result.scanId,
      target: data.target,
      status: 'RUNNING',
    });

    return result;
  });
```

## Common Patterns

### 1. Postback Pattern (Async Results)

When scans/workflows take a long time, use postback instead of polling:

```typescript
// Worker (Restate service)
export const portScanner = service({
  name: 'PortScanner',
  handlers: {
    scan: async (ctx, input: {
      target: string;
      callbackUrl?: string;
      deviceId?: string;
    }) => {
      const scanId = ctx.rand.uuidv4();

      // Run scan
      const results = await ctx.run('nmap', () => runNmap(input.target));

      // Postback results if URL provided
      if (input.callbackUrl) {
        await ctx.run('postback', () =>
          fetch(input.callbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.WORKER_API_KEY}`,
            },
            body: JSON.stringify({
              deviceId: input.deviceId,
              scanId,
              results,
            }),
          })
        );
      }

      return { scanId, results };
    },
  },
});

// Server (receives postback)
export async function handleScanResults(request: Request) {
  // Authenticate
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.WORKER_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { deviceId, scanId, results } = await request.json();

  // Update database
  await db.update(scans)
    .set({ status: 'COMPLETED', results })
    .where(eq(scans.scanId, scanId));

  // Invalidate React Query cache (if using SSE/websockets)
  // or user will see update on next poll

  return new Response('OK');
}
```

### 2. Heartbeat Pattern (Long Operations)

For operations longer than Restate's inactivity timeout:

```typescript
export const portScanner = service({
  name: 'PortScanner',
  handlers: {
    scan: handler({
      inactivityTimeout: 600000, // 10 minutes
      abortTimeout: 120000, // 2 minutes
    }, async (ctx, input) => {
      // Long operation - send heartbeats
      const masscanPorts = await ctx.run('masscan', () => runMasscan(input.target));

      // Heartbeat: Reset timeout clock
      await ctx.sleep(0);

      const rustscanPorts = await ctx.run('rustscan', () => runRustscan(input.target));

      // Another heartbeat
      await ctx.sleep(0);

      const nmapPorts = await ctx.run('nmap', () => runNmap(input.target));

      return { ports: [...masscanPorts, ...rustscanPorts, ...nmapPorts] };
    }),
  },
});
```

### 3. Keyed Workflow Pattern

Generate deterministic keys for deduplication:

```typescript
// ✅ CORRECT - Deterministic key generation
function generateScanKey(target: string): string {
  const normalized = target.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const timestamp = Date.now();
  return `scan-${normalized}-${timestamp}`;
}

const scanId = generateScanKey('192.168.1.1');
// scanId = "scan-192-168-1-1-1234567890"

// Use as key for workflow
await sendToRestate({
  service: 'Discovery',
  key: scanId, // Idempotent - same key = same workflow
  method: 'discover',
  data: { targets: [...] },
});
```

## Anti-Patterns (Things to Avoid)

### ❌ 1. Temporal-Style workflowId + runId

```typescript
// ❌ DON'T - Temporal pattern
const workflowId = "discovery-123";
const runId = "run-456";
await getWorkflowStatus({ workflowId, runId });

// ✅ DO - Restate pattern
const scanId = "discovery-example-com-1234567890";
await sendToRestate({
  service: 'Discovery',
  key: scanId,
  method: 'getState',
});
```

### ❌ 2. In-Memory State Store

```typescript
// ❌ DON'T - Lost on restart
const stateStore = new Map<string, State>();

export const portScanner = service({
  handlers: {
    scan: async (ctx, input) => {
      const scanId = ctx.rand.uuidv4();
      stateStore.set(scanId, { status: 'RUNNING' }); // Lost if crash!
      // ...
    },
    getState: async (ctx, { scanId }) => {
      return stateStore.get(scanId); // Might be null after restart!
    },
  },
});

// ✅ DO - Use workflow/object state
export const discoveryWorkflow = workflow({
  handlers: {
    discover: async (ctx, input) => {
      ctx.set('status', 'RUNNING'); // Durable!
      // ...
    },
    getState: async (ctx) => {
      return { status: await ctx.get('status') }; // Survives restarts!
    },
  },
});
```

### ❌ 3. Wrapper/Orchestrator Layers

```typescript
// ❌ DON'T - Unnecessary abstraction layer
class WorkflowOrchestratorRestate {
  async startDiscovery(request: DiscoveryRequest) {
    const restateInput = this.convertToRestateFormat(request);
    const result = await this.restateClient.startDiscovery(restateInput);
    return {
      workflowId: result.scanId, // Confusing mapping
      runId: result.scanId,      // Duplicated
    };
  }
}

// ✅ DO - Call Restate directly
await sendToRestate({
  service: 'Discovery',
  method: 'discover',
  data: { targets: [...], tools: [...] },
  async: true,
});
```

### ❌ 4. Polling Without State Check

```typescript
// ❌ DON'T - Poll forever
const { data } = useQuery({
  queryKey: ['scan', scanId],
  queryFn: () => getScanStatus(scanId),
  refetchInterval: 5000, // Polls even after complete!
});

// ✅ DO - Stop polling when done
const { data } = useQuery({
  queryKey: ['scan', scanId],
  queryFn: () => getScanStatus(scanId),
  refetchInterval: (query) => {
    const status = query.state.data?.status?.toLowerCase();
    if (status === 'completed' || status === 'failed') {
      return false; // Stop polling
    }
    return 5000; // Continue polling
  },
});
```

### ❌ 5. Hardcoded Service URLs

```typescript
// ❌ DON'T - Hardcoded
const url = 'http://localhost:8080/PortScanner/scan';

// ✅ DO - Use environment variable
const baseUrl = process.env.RESTATE_INGRESS_URL || 'http://localhost:8080';
const url = `${baseUrl}/PortScanner/scan`;
```

### ❌ 6. Missing Error Handling

```typescript
// ❌ DON'T - No error handling
const result = await sendToRestate({ service: 'PortScanner', method: 'scan' });

// ✅ DO - Handle errors
try {
  const result = await sendToRestate({
    service: 'PortScanner',
    method: 'scan',
    data: { target },
  });
} catch (error) {
  if (error.message.includes('ECONNREFUSED')) {
    throw new Error('Restate worker is not running');
  }
  if (error.message.includes('fetch failed')) {
    throw new Error('Unable to connect to Restate. Check RESTATE_INGRESS_URL.');
  }
  throw error;
}
```

## Summary

**Key Takeaways:**
1. Use **single key** for workflows/objects (no workflowId + runId)
2. Store state in **ctx.set/get**, not in-memory Maps
3. Call Restate **directly** via HTTP (no wrapper layers)
4. Use **`/send`** endpoint for async operations
5. **Stop polling** when workflow completes
6. Use **postback pattern** for long-running operations
7. Add **heartbeats** (`ctx.sleep(0)`) for operations > 5 minutes
8. **Normalize status** for case-insensitive comparisons

**Resources:**
- [Restate TypeScript Examples](https://github.com/restatedev/examples/tree/main/typescript)
- [Restate Documentation](https://docs.restate.dev)
- [Food Ordering Example](https://github.com/restatedev/examples/tree/main/typescript/end-to-end-applications/food-ordering)
