# Universal Postback Architecture

**Version**: 1.0
**Status**: Production Ready
**Last Updated**: 2025-10-18

## Overview

The Universal Postback Architecture provides a type-safe, extensible system for handling HTTP callbacks from the restate-worker. It replaces the hardcoded port-scan-only postback with a flexible router that supports multiple workflow types through type discrimination.

## Architecture Flow

```
┌─────────────────┐
│  Restate Worker │
│  (Port Scan or  │
│   Discovery)    │
└────────┬────────┘
         │ HTTP POST
         │ type: 'PORT_SCAN' | 'DISCOVERY'
         ↓
┌─────────────────────────────────────┐
│  Universal Postback Router          │
│  /api/internal/scan-results         │
│                                     │
│  1. Authenticate (WORKER_API_KEY)   │
│  2. Parse & validate 'type' field   │
│  3. Look up handler in registry     │
│  4. Validate payload with schema    │
│  5. Execute handler                 │
│  6. Track analytics                 │
└────────┬───────────────────────────┘
         │
         ↓
┌────────────────────────────┐
│  Handler Registry          │
│                            │
│  PORT_SCAN    → Handler A  │
│  DISCOVERY    → Handler B  │
│  WEB_SCAN     → Handler C  │ (future)
└────────┬───────────────────┘
         │
         ↓
┌────────────────────────────┐
│  Database Updates          │
│                            │
│  - Update scan_workflow    │
│  - Update scan_run         │
│  - Store results           │
│  - Create devices (disc.)  │
└────────┬───────────────────┘
         │
         ↓
┌────────────────────────────┐
│  Analytics Engine          │
│                            │
│  Track event with:         │
│  - Event type              │
│  - Latency                 │
│  - Result counts           │
│  - Error details           │
└────────────────────────────┘
```

## Type System

The architecture uses **discriminated unions** for type-safe handling:

```typescript
// Base type - common fields for all postbacks
interface BasePostback {
  type: string;                    // Discriminator field
  scanId: string;                  // Workflow identifier
  organizationId: string;          // Tenant ID
  timestamp: string;               // ISO 8601 timestamp
  status: 'SUCCESS' | 'FAILURE';   // Execution status
  error?: string;                  // Error message (if FAILURE)
}

// Port scan postback
interface PortScanPostback extends BasePostback {
  type: 'PORT_SCAN';               // Literal type
  deviceId: string;                // Target device
  data: {
    target: string;
    ports: Array<{
      port: number;
      protocol: 'tcp' | 'udp';
      state: 'open' | 'closed' | 'filtered';
      service?: string;
      version?: string;
    }>;
    osInfo?: { /* ... */ };
    timing?: { /* ... */ };
  };
}

// Discovery postback
interface DiscoveryPostback extends BasePostback {
  type: 'DISCOVERY';               // Literal type
  data: {
    target: string;
    devices: Array<{
      hostname: string;
      ipAddress?: string;
      metadata?: Record<string, any>;
    }>;
    totalSubdomains: number;
    executionTime: number;
    tools: string[];
    errors?: string[];
  };
}

// Union type for all postbacks
type PostbackPayload =
  | PortScanPostback
  | DiscoveryPostback;
  // Easy to add more!
```

## Handler Interface

All handlers implement the `PostbackHandler<T>` interface:

```typescript
interface PostbackHandler<T extends BasePostback> {
  // Type identifier (must match payload.type)
  readonly type: string;

  // Zod schema for validation
  readonly schema: z.ZodType<T>;

  // Handler implementation
  handle(
    payload: T,
    ctx: HandlerContext
  ): Promise<HandlerResult>;
}

interface HandlerContext {
  env?: { ANALYTICS?: AnalyticsEngineDataset };
  logger: Logger;
  startTime: number;
}

interface HandlerResult {
  success: boolean;
  message?: string;
  analytics?: {
    eventType: string;
    blobs?: string[];
    doubles?: number[];
  };
}
```

## Handler Registry

The registry manages all registered handlers:

```typescript
// Singleton registry
export const postbackRegistry = new PostbackRegistry();

// Register handlers (done at module load time)
postbackRegistry.register(new PortScanPostbackHandler());
postbackRegistry.register(new DiscoveryPostbackHandler());

// Router looks up handler by type
const handler = postbackRegistry.get('PORT_SCAN');
```

## Adding a New Postback Type

Adding support for a new workflow type takes **3 simple steps**:

### Step 1: Define Type in `types.ts`

```typescript
interface WebScanPostback extends BasePostback {
  type: 'WEB_SCAN';
  data: {
    url: string;
    vulnerabilities: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      cwe?: string;
    }>;
    screenshot?: string;
  };
}

// Add to union
type PostbackPayload =
  | PortScanPostback
  | DiscoveryPostback
  | WebScanPostback;  // <-- New!
```

### Step 2: Create Handler in `handlers/web-scan.ts`

```typescript
import { z } from 'zod';
import type { PostbackHandler } from './base';
import type { WebScanPostback } from '../types';

const WebScanPostbackSchema = z.object({
  type: z.literal('WEB_SCAN'),
  scanId: z.string(),
  organizationId: z.string(),
  timestamp: z.string(),
  status: z.enum(['SUCCESS', 'FAILURE']),
  data: z.object({
    url: z.string().url(),
    vulnerabilities: z.array(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      description: z.string(),
      cwe: z.string().optional(),
    })),
    screenshot: z.string().optional(),
  }),
  error: z.string().optional(),
});

export class WebScanPostbackHandler
  implements PostbackHandler<WebScanPostback>
{
  readonly type = 'WEB_SCAN';
  readonly schema = WebScanPostbackSchema;

  async handle(payload: WebScanPostback, ctx: HandlerContext) {
    const { scanId, organizationId, data, status } = payload;

    // Your business logic here
    // - Find scan workflow
    // - Store vulnerability results
    // - Update workflow status
    // - Track analytics

    return {
      success: true,
      message: 'Web scan results processed',
      analytics: {
        eventType: 'postback_webscan_success',
        blobs: [scanId, organizationId],
        doubles: [data.vulnerabilities.length],
      },
    };
  }
}

export const webScanPostbackHandler = new WebScanPostbackHandler();
```

### Step 3: Register in `handlers/registry.ts`

```typescript
import { portScanPostbackHandler } from './port-scan';
import { discoveryPostbackHandler } from './discovery';
import { webScanPostbackHandler } from './web-scan';  // <-- New!

postbackRegistry.register(portScanPostbackHandler);
postbackRegistry.register(discoveryPostbackHandler);
postbackRegistry.register(webScanPostbackHandler);  // <-- New!
```

**That's it!** The router automatically:
- Validates the payload with your schema
- Routes to your handler based on `type` field
- Tracks analytics
- Returns appropriate HTTP responses

## Analytics Schema

All postback events follow a consistent schema in Workers Analytics Engine:

```typescript
{
  indexes: [eventType],    // e.g., 'postback_portscan_success'
  blobs: [                 // String metadata
    scanId,                // [0] Workflow identifier
    entityId,              // [1] deviceId (port scan) or organizationId (discovery)
    organizationId | error // [2] Organization ID or error message
  ],
  doubles: [               // Numeric metadata
    latency,               // [0] Processing time in ms
    resultCount            // [1] Ports/devices/vulns found
  ]
}
```

### Event Types

| Event Type | When | Blobs[2] | Doubles[1] |
|------------|------|----------|------------|
| `postback_portscan_success` | Port scan completes successfully | organizationId | Port count |
| `postback_portscan_failure` | Port scan fails | Error message | - |
| `postback_discovery_success` | Discovery completes successfully | organizationId | Device count |
| `postback_discovery_failure` | Discovery fails | Error message | - |
| `postback_auth_failed` | Invalid WORKER_API_KEY | "Authentication failed" | - |
| `postback_validation_failed` | Payload validation fails | Validation error | - |
| `postback_generic_failure` | Unhandled exception | Exception message | - |

## Authentication

Postbacks are authenticated using the **WORKER_API_KEY** environment variable:

```typescript
// Worker sends:
POST /api/internal/scan-results
Authorization: Bearer ${WORKER_API_KEY}
Content-Type: application/json

{
  "type": "PORT_SCAN",
  // ... payload
}

// Server validates:
const authHeader = request.headers.get('Authorization');
const [scheme, token] = authHeader.split(' ');
if (scheme !== 'Bearer' || token !== process.env.WORKER_API_KEY) {
  return 401 Unauthorized;
}
```

**Security Notes**:
- WORKER_API_KEY must be a strong random secret (32+ bytes)
- Use the same key in both user-application and restate-worker
- Rotate every 90 days
- Store in secrets manager in production

## Database-First Architecture

The postback system implements a **database-first** architecture:

1. **User starts workflow** → Creates `scan_workflow` and `scan_run` records in database
2. **Workflow executes** → Restate worker runs scan/discovery
3. **Workflow completes** → Sends postback to update database
4. **UI polls database** → Gets status and results from database (NOT from Restate)

### Benefits

- **Faster**: Database queries are faster than HTTP to Restate
- **Reliable**: Database is single source of truth
- **Scalable**: No load on Restate from UI polling
- **Consistent**: Same pattern for all workflow types

### Database Polling Example

```typescript
// UI polls database instead of Restate
const { data: status } = useQuery({
  queryKey: ["workflow-status-db", scanId],
  queryFn: () => getScanWorkflowStatusDB({ data: { scanId } }),
  refetchInterval: 3000,  // 3 seconds (database is fast!)
});

// Fetch results from database when complete
const { data: results } = useQuery({
  queryKey: ["workflow-results-db", scanId],
  queryFn: () => getScanWorkflowResultsDB({ data: { scanId } }),
  enabled: status?.isCompleted,
});
```

## Testing

### Unit Tests

Test handlers in isolation:

```typescript
import { PortScanPostbackHandler } from '../port-scan';

describe('PortScanPostbackHandler', () => {
  it('should update workflow status to SUCCEEDED', async () => {
    const handler = new PortScanPostbackHandler();

    const result = await handler.handle({
      type: 'PORT_SCAN',
      scanId: 'test-scan-123',
      organizationId: 'org-456',
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      deviceId: 'device-789',
      data: { /* ... */ },
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.analytics?.eventType).toBe('postback_portscan_success');
  });
});
```

### Integration Tests

Use Miniflare + local D1 database:

```typescript
import { Miniflare } from 'miniflare';
import { initDatabase } from '@repo/data-ops';

const mf = new Miniflare({
  modules: true,
  script: '',
  d1Databases: {
    DB: 'database_id_from_wrangler_jsonc',
  },
  d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
});

const d1db = await mf.getD1Database('DB');
initDatabase(d1db);
```

### End-to-End Tests

See `sec-60` for manual testing checklist.

## Error Handling

Handlers should **never throw** - always return a `HandlerResult`:

```typescript
async handle(payload: T, ctx: HandlerContext): Promise<HandlerResult> {
  try {
    // Business logic
    return { success: true };
  } catch (error) {
    // Log error and return failure result
    ctx.logger.error('Handler failed', { error });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      analytics: {
        eventType: 'postback_failure',
        blobs: [payload.scanId, 'unknown', String(error)],
      },
    };
  }
}
```

## Backward Compatibility

The system maintains backward compatibility with existing port scans:

```typescript
// Legacy postback helper automatically converts to universal format
export async function postbackScanResults(payload: LegacyPayload) {
  const universalPayload: UniversalPostbackPayload = {
    type: 'PORT_SCAN',  // Auto-converted
    scanId: payload.scanId,
    organizationId: payload.organizationId || 'UNKNOWN',
    timestamp: new Date().toISOString(),
    status: 'SUCCESS',
    deviceId: payload.deviceId,
    data: payload.results,
  };

  return postUniversalPostback(universalPayload);
}
```

## File Structure

```
src/server/postback/
├── README.md                  # This file
├── index.ts                   # Universal router
├── types.ts                   # Type definitions
├── auth.ts                    # Authentication helper
├── analytics.ts               # Analytics tracking
├── handlers/
│   ├── base.ts               # Handler interface
│   ├── registry.ts           # Handler registry
│   ├── port-scan.ts          # Port scan handler
│   ├── discovery.ts          # Discovery handler
│   └── web-scan.ts           # (future) Web scan handler
└── __tests__/
    ├── port-scan.test.ts
    ├── discovery.test.ts
    └── router.test.ts
```

## Migration from Old Postback

The old `scan-results-postback.ts` is **deprecated**. See cleanup tasks:
- **sec-62**: Remove scan-results-postback.ts
- **sec-63**: Remove Restate polling functions
- **sec-64**: Remove old test files

## Environment Variables

```bash
# Required
WORKER_API_KEY=<strong-random-secret>  # Shared with restate-worker
APP_URL=https://your-app.com           # Base URL for callback

# Optional (for development)
BETTER_AUTH_URL=http://localhost:3000  # Fallback base URL
```

## Monitoring

Query Analytics Engine for postback metrics:

```bash
# Success rate
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $API_KEY" \
  -d "SELECT index1 AS event_type, count() AS total
      FROM postback_events
      WHERE timestamp >= NOW() - INTERVAL '24' HOUR
      GROUP BY event_type"

# Latency percentiles
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $API_KEY" \
  -d "SELECT
      quantile(0.5)(double1) AS p50_ms,
      quantile(0.95)(double1) AS p95_ms,
      quantile(0.99)(double1) AS p99_ms
      FROM postback_events
      WHERE index1 = 'postback_portscan_success'"
```

## Performance

- **Latency**: P50 < 100ms, P95 < 500ms, P99 < 1000ms
- **Throughput**: 1000+ postbacks/minute
- **Database impact**: Minimal (single workflow + run update per postback)

## Future Enhancements

- [ ] Streaming results (send partial results as they arrive)
- [ ] Retry mechanism (automatic retry on failure)
- [ ] Rate limiting (prevent abuse)
- [ ] Batch processing (process multiple postbacks in one transaction)
- [ ] Webhook subscriptions (notify external systems)

## Related Documentation

- [Restate Worker CLAUDE.md](../../../../restate-worker/CLAUDE.md)
- [Data Model](../../../../../docs/data-model.md)
- [Discovery Workflow Integration](../../../../../docs/discovery-workflow-integration.md)

## Changelog

### v1.0 (2025-10-18)
- Initial release
- Support for PORT_SCAN and DISCOVERY types
- Database-first architecture
- Handler registry pattern
- Comprehensive analytics tracking
