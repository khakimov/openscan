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