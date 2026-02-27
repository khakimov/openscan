# Universal Postback System

Type-safe, extensible HTTP callback handler for restate-worker workflows.

## Quick Links

📚 **[Full Documentation](../../../../../docs/architecture/backend/postback-architecture.md)** - Complete architecture guide

## Overview

This directory implements a universal postback router that handles HTTP callbacks from the restate-worker for multiple workflow types (port scans, discovery, etc.) through type discrimination.

## Key Features

- **Type-Safe**: TypeScript discriminated unions ensure correct payload handling
- **Extensible**: Add new workflow types in 3 simple steps
- **Database-First**: UI polls database instead of Restate (faster, more reliable)
- **Analytics**: Unified tracking in Workers Analytics Engine
- **Backward Compatible**: Legacy port scan postbacks work unchanged

## Architecture

```
Restate Worker → Universal Router → Handler Registry → Database + Analytics
                  (type field)       (PORT_SCAN,         (workflow status
                                     DISCOVERY, etc.)     + results)
```

## Quick Start: Add a New Postback Type

### 1. Define Contract (`packages/contracts/postbacks.ts`)

Add your schema + builder to the shared contracts package:

```typescript
export const WebScanPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('WEB_SCAN'),
  data: z.object({
    url: z.string().url(),
    vulnerabilities: z.array(z.unknown()),
  }),
});

export type WebScanPostback = z.infer<typeof WebScanPostbackSchema>;
```

### 2. Create Handler (`handlers/web-scan.ts`)

```typescript
export class WebScanPostbackHandler implements PostbackHandler<WebScanPostback> {
  readonly type = 'WEB_SCAN';
  readonly schema = WebScanPostbackSchema;
  async handle(payload, ctx) { /* business logic */ }
}
```

### 3. Register (`handlers/registry.ts`)

```typescript
postbackRegistry.register(new WebScanPostbackHandler());
```

Done! The router automatically validates and routes requests to your handler.

## File Structure

```
postback/
├── index.ts              # Universal router (handles all types)
├── types.ts              # Re-exports shared contract types
├── auth.ts               # WORKER_API_KEY validation
├── analytics.ts          # Analytics Engine helpers
├── handlers/
│   ├── base.ts          # PostbackHandler<T> interface
│   ├── registry.ts      # Handler registration
│   ├── port-scan.ts     # PORT_SCAN handler
│   └── discovery.ts     # DISCOVERY handler
```

## Current Handlers

| Type | Handler | Purpose |
|------|---------|---------|
| `PORT_SCAN` | PortScanPostbackHandler | Store port scan results, update device |
| `DISCOVERY` | DiscoveryPostbackHandler | Create discovered devices, update workflow |

## Environment Variables

```bash
WORKER_API_KEY=<secret>    # Authentication (shared with restate-worker)
APP_URL=<base-url>         # Callback URL base
```

## See Also

- [Full Documentation](../../../../../docs/architecture/backend/postback-architecture.md) - Complete architecture guide
- [Restate Worker CLAUDE.md](../../../../restate-worker/CLAUDE.md) - Worker-side implementation
- [Data Model](../../../../../docs/architecture/backend/data-model.md) - Database schema
