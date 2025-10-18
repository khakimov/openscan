# Security Scanning Application

A modern, full-stack security scanning platform built with TanStack Start and deployed on Cloudflare Workers. This application provides device discovery, port scanning, and vulnerability assessment capabilities with real-time monitoring.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test:run

# Build for production
pnpm build

# Deploy to Cloudflare
pnpm deploy
```

## 📦 Development Workflow

- **`pnpm dev`** - Start development server on port 3000
- **`pnpm build`** - Build the application for production
- **`pnpm deploy`** - Build and deploy to Cloudflare Workers
- **`pnpm serve`** - Preview production build locally
- **`pnpm test`** - Run tests in watch mode
- **`pnpm test:run`** - Run tests once and exit
- **`pnpm typecheck`** - Run TypeScript type checking
- **`pnpm cf-typegen`** - Generate TypeScript types for Cloudflare environment

## 🏗️ Project Structure

```
apps/user-application/
├── src/
│   ├── components/          # Reusable React components
│   │   └── layout/         # Layout components (sidebar, nav)
│   ├── features/           # Feature-based modules
│   │   ├── devices/        # Device management
│   │   ├── onboarding/     # User onboarding flow
│   │   └── scans/          # Scan management
│   ├── routes/             # File-based routing (TanStack Router)
│   │   ├── __root.tsx      # Root layout
│   │   ├── index.tsx       # Home page
│   │   └── _authenticated/ # Protected routes
│   ├── server/             # Server-side code
│   │   ├── scan-results-postback.ts  # Webhook handler for scan results
│   │   ├── discovery/      # Device discovery utilities
│   │   └── __tests__/      # Integration tests
│   ├── test/               # Test configuration
│   │   └── integration-setup.ts  # Shared test setup (Miniflare)
│   ├── lib/                # Utility functions
│   ├── hooks/              # Custom React hooks
│   └── server.ts           # Cloudflare Workers entry point
├── vitest.config.ts        # Test configuration
└── wrangler.jsonc          # Cloudflare deployment config

packages/data-ops/          # Shared data layer
├── src/
│   ├── database/          # Database setup and connection
│   ├── schema/            # Drizzle ORM schemas
│   ├── queries/           # Database query functions
│   │   ├── devices.ts     # Device-related queries
│   │   └── scans.ts       # Scan-related queries
│   └── drizzle/           # Better-auth schema
└── migrations/            # Database migrations
```

## 🌩️ Cloudflare Integration

### D1 Database

This application uses Cloudflare D1 (SQLite) for data storage with Drizzle ORM:

```bash
# Run migrations locally
pnpm --filter @repo/data-ops drizzle:migrate

# Run migrations in production
pnpm --filter @repo/data-ops drizzle:migrate:prod

# Open Drizzle Studio
pnpm --filter @repo/data-ops drizzle:studio
```

### Environment Variables

Configure environment variables in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "WORKER_API_KEY": "your-worker-api-key"
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "sec-db",
    "database_id": "your-database-id",
    "preview_database_id": "test-sec-db"
  }],
  "analytics_engine_datasets": [{
    "binding": "ANALYTICS"
  }]
}
```

## 🧪 Testing

This project uses **Vitest** for comprehensive testing with real database integration:

### Test Structure

```bash
src/server/__tests__/
├── devices-scan-stats.test.ts              # Unit tests (mocked DB)
├── devices-scan-stats.integration.test.ts  # Integration tests (real DB)
├── scan-results-postback.test.ts           # Unit tests
└── scan-results-postback.integration.test.ts  # Integration tests
```

### Running Tests

```bash
# Run all tests
pnpm test:run

# Run tests in watch mode
pnpm test

# Run specific test file
pnpm test:run devices-scan-stats.integration
```

### Integration Test Features

Integration tests use **Miniflare** to connect to a real local D1 database:

- **Self-contained**: Tests create their own organizations, users, devices, and scans
- **No hardcoded IDs**: Uses `@paralleldrive/cuid2` to generate unique test data
- **Proper cleanup**: All test data is deleted after tests complete
- **Shared database**: Single Miniflare instance across all tests (via `setupFiles`)
- **Sequential execution**: `fileParallelism: false` prevents SQLite lock conflicts

Example integration test structure:

```typescript
beforeAll(async () => {
  // Create test organization and user
  testOrgId = createId();
  await db.insert(organization).values({
    id: testOrgId,
    name: 'Test Organization',
    slug: `test-org-${Date.now()}`,
    createdAt: new Date(),
  });
});

afterAll(async () => {
  // Clean up all test data
  await db.delete(organization).where(eq(organization.id, testOrgId));
});
```

## 🎨 Styling & Components

### Tailwind CSS v4

This project uses the latest Tailwind CSS v4 with CSS variables for theming.

### Shadcn/UI Components

Add beautiful, accessible components:

```bash
pnpx shadcn@latest add button
pnpx shadcn@latest add card
pnpx shadcn@latest add form
```

## 🔄 Data Fetching & Server Functions

### Server Functions

Server functions run on Cloudflare Workers and maintain type safety:

```typescript
const baseFunction = createServerFn().middleware([
  authMiddleware,
]);

export const scanDevice = baseFunction
  .inputValidator((data) => ScanInputSchema.parse(data))
  .handler(async (ctx) => {
    // Server-side logic
    return result;
  });
```

### Client Integration

```tsx
import { useMutation } from '@tanstack/react-query';
import { scanDevice } from '@/server/functions';

function ScanButton() {
  const mutation = useMutation({
    mutationFn: scanDevice,
  });

  return (
    <button onClick={() => mutation.mutate({ deviceId: 'xyz' })}>
      Scan Device
    </button>
  );
}
```

## 📊 Monitoring & Observability

### Analytics Engine

The application uses **Cloudflare Analytics Engine** to track scan result postbacks:

```bash
# Query Analytics Engine
./scripts/query-analytics.sh
```

Event types tracked:
- `postback_success` - Successful scan result delivery
- `postback_failure` - Failed scan result processing
- `postback_auth_failed` - Authentication failures
- `postback_validation_failed` - Invalid payloads

## 📋 Tech Stack

### Core Framework
- **TanStack Start** - Full-stack React framework with SSR
- **React 19** - Latest React with concurrent features
- **TypeScript** - Strict type checking enabled

### Routing & Data
- **TanStack Router** - Type-safe, file-based routing
- **TanStack Query** - Server state management with SSR integration

### Database & ORM
- **Cloudflare D1** - SQLite at the edge
- **Drizzle ORM** - Type-safe database queries
- **Better Auth** - Authentication and session management

### Styling & UI
- **Tailwind CSS v4** - Utility-first CSS with CSS variables
- **Shadcn/UI** - Beautiful, accessible component library
- **Lucide React** - Consistent icon set

### Development Tools
- **Vite** - Lightning-fast build tool and dev server
- **Vitest** - Unit and integration testing
- **Miniflare** - Local Cloudflare Workers development

### Deployment
- **Cloudflare Workers** - Edge computing platform
- **Wrangler** - Cloudflare deployment and development CLI

## 🚀 Learn More

- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing
- **[TanStack Query](https://tanstack.com/query)** - Server state management
- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Edge computing platform
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** - SQLite database
- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript ORM
- **[Shadcn/UI](https://ui.shadcn.com/)** - Component library
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
