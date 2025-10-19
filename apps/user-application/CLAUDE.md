# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `pnpm dev` - Start development server on port 3000
- `pnpm build` - Build for production
- `pnpm serve` - Preview production build
- `pnpm test` - Run tests with Vitest (watch mode)
- `pnpm test:run` - Run tests once and exit

### Shadcn Components
- `pnpx shadcn@latest add <component>` - Add new Shadcn components (use latest version)

## Architecture

This is a TanStack Start application - a type-safe, client-first, full-stack React framework built on top of:

### Core Stack
- **TanStack Router**: File-based routing with type-safe navigation
- **TanStack Query**: Server state management with SSR integration
- **React 19**: Latest React with concurrent features
- **Vite**: Build tool and dev server
- **TypeScript**: Strict type checking enabled
- **Tailwind CSS v4**: Utility-first styling with CSS variables

### Project Structure
- `src/routes/` - File-based routes (auto-generates `routeTree.gen.ts`)
- `src/components/` - Reusable React components  
- `src/integrations/tanstack-query/` - Query client setup and providers
- `src/lib/utils.ts` - Utility functions (includes clsx/tailwind-merge)
- `src/utils/seo.ts` - SEO helper functions
- Path aliases: `@/*` maps to `src/*`

### Key Architecture Patterns

**Router Setup**: The router is created via `getRouter()` in `src/router.tsx` which integrates TanStack Query context and SSR. Routes are auto-generated from the file system.

**Query Integration**: TanStack Query is pre-configured with SSR support through `setupRouterSsrQueryIntegration`. The query client is accessible in route contexts.

**Root Layout**: `src/routes/__root.tsx` defines the HTML document structure, includes devtools, and provides navigation links. It uses `createRootRouteWithContext` for type-safe context passing.

**Styling**: Uses Tailwind CSS v4 with the Vite plugin. Shadcn components are configured with "new-york" style, Zinc base color, and CSS variables enabled.

**TypeScript**: Strict mode with additional linting rules (`noUnusedLocals`, `noUnusedParameters`, etc.). Uses modern ESNext module resolution.

## Testing

### Integration Tests with Miniflare + D1

For testing data-ops queries against the real local D1 database:

```typescript
import { Miniflare } from 'miniflare';
import { initDatabase, resetDatabase, getDb } from '@repo/data-ops/database/setup';
import path from 'node:path';

// Setup Miniflare connection to existing D1 database
const mf = new Miniflare({
  modules: true,
  script: '',
  d1Databases: {
    DB: '93d2bd33-3b3e-42f3-a982-39b790922949', // database_id from wrangler.jsonc
  },
  d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
});

const d1db = await mf.getD1Database('DB');
initDatabase(d1db);
```

**Key Points:**
- Use `database_id` from wrangler.jsonc (NOT database_name)
- Use object syntax for d1Databases: `{ DB: 'id' }`
- Call `mf.getD1Database('DB')` to get proper D1Database binding
- Local D1 database is safe to modify for test data
- Insert test data in `beforeAll`, clean up in `afterAll`
- Use real IDs from database for foreign key constraints

**Example:** See `src/server/__tests__/devices-scan-stats.integration.test.ts`

### Development Notes
- Demo files (prefixed with `demo`) can be safely deleted
- The project uses pnpm as the package manager
- Devtools are included for both Router and Query in development
- Routes support loaders, error boundaries, and not-found components
- File-based routing automatically generates type-safe route definitions

## Monitoring & Observability

### Universal Postback Architecture

The application uses a **type-safe, extensible postback system** for handling HTTP callbacks from the restate-worker. It supports multiple workflow types (port scans, discovery, etc.) through type discrimination.

#### Architecture Overview

```
Restate Worker → Universal Router → Handler Registry → Database + Analytics
                  (type: PORT_SCAN     (PortScanHandler,   (workflow status
                   or DISCOVERY)        DiscoveryHandler)    + results)
```

**Key Features:**
- Type-safe discriminated unions for payload validation
- Handler registry pattern for extensibility
- Database-first architecture (UI polls database, not Restate)
- Unified analytics tracking in Workers Analytics Engine
- Add new workflow types in 3 simple steps

**Documentation:** See [docs/postback-architecture.md](../../../docs/postback-architecture.md) for complete guide

#### Analytics Event Types

| Event Type | When | Blobs[2] | Doubles[1] |
|------------|------|----------|------------|
| `postback_portscan_success` | Port scan completes | organizationId | Port count |
| `postback_portscan_failure` | Port scan fails | Error message | - |
| `postback_discovery_success` | Discovery completes | organizationId | Device count |
| `postback_discovery_failure` | Discovery fails | Error message | - |
| `postback_auth_failed` | Invalid API key | "Authentication failed" | - |
| `postback_validation_failed` | Payload validation fails | Validation error | - |

#### Common Queries

**View recent failures with details:**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/b846a37c6228b2869896493f338f17d5/analytics_engine/sql" \
  -H "Authorization: Bearer YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8" \
  -d "SELECT blob1 AS scanId, blob2 AS deviceId, blob3 AS error, timestamp
      FROM postback_events
      WHERE index1 = 'postback_failure'
      ORDER BY timestamp DESC
      LIMIT 10" | jq .
```

**Success rate over last 24 hours:**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/b846a37c6228b2869896493f338f17d5/analytics_engine/sql" \
  -H "Authorization: Bearer YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8" \
  -d "SELECT
      index1 AS event_type,
      count() AS total,
      avg(double1) AS avg_latency_ms
      FROM postback_events
      WHERE timestamp >= NOW() - INTERVAL '24' HOUR
      GROUP BY event_type" | jq .
```

**Latency percentiles:**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/b846a37c6228b2869896493f338f17d5/analytics_engine/sql" \
  -H "Authorization: Bearer YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8" \
  -d "SELECT
      quantile(0.5)(double1) AS p50_ms,
      quantile(0.95)(double1) AS p95_ms,
      quantile(0.99)(double1) AS p99_ms
      FROM postback_events
      WHERE index1 = 'postback_success'
      AND timestamp >= NOW() - INTERVAL '24' HOUR" | jq .
```

#### Dashboard Access

Analytics Engine data is also viewable in the Cloudflare Dashboard:
1. Go to: https://dash.cloudflare.com
2. Navigate to: Workers & Pages → sec-rocks → Observability
3. Look for: Analytics Engine → `postback_events` dataset

#### Implementation Details

- **Location**: `src/server/postback/` (universal architecture)
- **API Route**: `/api/internal/scan-results` (single endpoint for all types)
- **Binding**: Configured in `wrangler.jsonc` as `analytics_engine_datasets`
- **Data Points**: Written via `env.ANALYTICS.writeDataPoint()`
- **Schema**:
  - `indexes[0]`: event_type (e.g., 'postback_portscan_success')
  - `blobs[0]`: scanId
  - `blobs[1]`: entityId (deviceId for port scan, organizationId for discovery)
  - `blobs[2]`: organizationId or error message
  - `doubles[0]`: latency (milliseconds)
  - `doubles[1]`: result count (ports/devices/etc.)
  - `timestamp`: Auto-populated by Workers runtime

**Note**: The dataset is created automatically on the first `writeDataPoint()` call - no manual setup required.

**Adding New Postback Types**: See [postback architecture docs](../../../docs/postback-architecture.md#adding-a-new-postback-type) for step-by-step guide.