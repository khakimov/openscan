# AGENTS.md - Monorepo Architecture Guide

This file provides guidance to AI agents when working with code in this monorepo.

## Project Structure

```
sec/
├── apps/
│   ├── user-application/    # TanStack Start web app
│   └── restate-worker/       # Restate orchestration worker
├── packages/
│   ├── data-ops/            # Database operations & queries
│   ├── config/              # Shared configuration
│   ├── logger/              # Logging utilities
│   └── contracts/           # TypeScript types & schemas
└── AGENTS.md              # This file
```

## Cloudflare Pages Static Asset Routing

**Static Assets**: The application uses Cloudflare Pages' `_routes.json` to exclude static assets from hitting the worker.

**Location**: `apps/user-application/public/_routes.json`

This configuration ensures:
- ✅ Images, fonts, favicons bypass the worker (served directly from Pages CDN)
- ✅ API routes (`/api/*`) and SSR routes hit the worker
- ✅ Reduced worker invocations = lower costs + faster static asset delivery

**Excluded patterns**:
- Images: `*.png`, `*.jpg`, `*.webp`, `*.svg`
- Fonts: `/fonts/*`, `*.woff`, `*.woff2`, `*.ttf`
- Static files: `/robots.txt`, `/manifest.json`, `/favicon.ico`, `/apple-touch-icon.png`
- Build assets: `*.css`, `*.js`, `*.map`
- Documentation: `/docs/*`

**Reference**: [Cloudflare Pages Routing](https://developers.cloudflare.com/pages/configuration/serving-pages/#functions)

## Node.js Version Management

**CRITICAL**: This project requires Node.js 22.x.

### Before Running Any Build Commands

**ALWAYS** ensure the correct Node.js version is active:

```bash
# Auto-switch to version specified in .nvmrc (22)
nvm use

# Or explicitly
nvm use 22
```

### Common Commands That Require Node 22

- `pnpm build` (any package)
- `pnpm typecheck`
- `pnpm dev`
- `pnpm deploy:*`
- `pnpm drizzle-kit generate`

### Why This Matters

The build will fail with ESM/CJS compatibility errors if using the wrong Node.js version. Always run `nvm use` before executing build or deployment commands.

## Task Management with Beads

This project uses [beads](https://github.com/steveyegge/beads) - a dependency-aware issue tracker designed for AI-supervised workflows.

### Quick Reference

**When you need help with beads commands:**

```bash
bd quickstart  # Show comprehensive quick reference guide
```

**Call `bd quickstart` when:**

- You're unsure about beads command syntax
- You need to understand dependency types (blocks, parent-child, discovered-from, related)
- You want to see all available commands at a glance
- You're new to the beads workflow

### Common Beads Workflow

```bash
# List current work
bd list -s open           # Show all open issues
bd ready                  # Show issues ready to work (unblocked)

# Show issue details
bd show sec-42            # View full issue details

# Create new issues
bd create "Fix bug in device scanner" -p 1 -t bug
bd create "Add feature X" --deps "blocks:sec-42"

# Update issues
bd update sec-42 --status in_progress
bd close sec-42 "Implemented feature successfully"

# Manage dependencies
bd dep add sec-43 sec-42  # sec-42 blocks sec-43
bd dep tree sec-42        # Visualize dependency tree
```

### Dependency Types

- **blocks** - Task B must complete before task A (hard dependency)
- **parent-child** - Epic/subtask hierarchical relationship
- **discovered-from** - Auto-created when AI discovers related work during a task
- **related** - Soft connection, doesn't block progress

### Integration with Development

All beads data is stored in `.beads/sec.db` and automatically synced to git via JSONL export. Issues use the `sec-` prefix (e.g., `sec-42`, `sec-43`).

When working on tasks:

1. Check `bd ready` to find unblocked work
2. Update status to `in_progress` when starting
3. Create new issues with `--deps discovered-from:sec-X` when you discover related work
4. Close issues with a descriptive reason when complete

## Data-Ops Package Architecture

**Location:** `packages/data-ops/`

The `data-ops` package is the **single source of truth** for all database operations. It provides a clean separation between database logic and application code.

### Package Structure

```
packages/data-ops/
├── src/
│   ├── auth/                    # Authentication & authorization
│   │   ├── server.ts           # Better-auth instance
│   │   └── organization-api.ts # Organization management
│   ├── database/
│   │   └── setup.ts            # Database connection & initialization
│   ├── queries/                 # ⭐ Database queries (READ THIS!)
│   │   ├── devices.ts          # Device CRUD operations
│   │   ├── scans.ts            # Scan operations
│   │   └── polar.ts            # Polar integration
│   ├── schema/                  # Drizzle schema definitions
│   │   └── index.ts            # Tables, relations, types
│   └── index.ts                # Package exports
└── package.json
```

### 🎯 Golden Rules

#### 1. **ALWAYS use data-ops queries, NEVER raw DB operations in apps**

❌ **WRONG - Don't do this in apps:**

```typescript
// apps/user-application/src/server/something.ts
import { getDb } from "@repo/data-ops/database/setup";
import { devices } from "@repo/data-ops/schema";

const db = getDb();
const [device] = await db
  .select()
  .from(devices)
  .where(eq(devices.id, deviceId));
```

✅ **CORRECT - Use data-ops queries:**

```typescript
// apps/user-application/src/server/something.ts
import { getDeviceById } from "@repo/data-ops";

const device = await getDeviceById(deviceId, organizationId);
```

#### 2. **Where to write database logic**

| What                   | Where                            | Why                                        |
| ---------------------- | -------------------------------- | ------------------------------------------ |
| **Database queries**   | `packages/data-ops/src/queries/` | Reusable, testable, single source of truth |
| **Schema definitions** | `packages/data-ops/src/schema/`  | Type safety, migrations                    |
| **Server functions**   | `apps/*/src/server/`             | Application-specific business logic        |
| **Components**         | `apps/*/src/components/`         | UI only, use server functions              |

#### 3. **Import patterns**

```typescript
// ✅ CORRECT - Import from data-ops
import {
  getDevicesForTenant,
  updateDevice,
  deleteDevice,
} from "@repo/data-ops";

import { getCurrentOrganizationId, getCurrentUser } from "@/server/utils/auth";

// ✅ CORRECT - Import Drizzle operators from data-ops
import { eq, and, desc } from "@repo/data-ops";

// ❌ WRONG - Don't import DB internals in apps
import { getDb } from "@repo/data-ops/database/setup";
import { devices } from "@repo/data-ops/schema";

// ❌ WRONG - No dynamic imports
const { getDb } = await import("@repo/data-ops/database/setup");
```

#### 4. **Schema-First Data Operations (CRITICAL PATTERN)**

**Problem:** Type safety breaks down across layers. A UI component can create invalid data (e.g., missing required `projectId`) because the mutation hook accepts optional types, even though the database expects specific fields.

**Solution:** Split contracts for different use cases + compile-time enforcement at all layers.

##### Pattern: UI vs Worker Contracts

```typescript
// packages/data-ops/src/queries/devices.ts
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ✅ UI Contract - projectId REQUIRED
export const CreateDevicesInProjectSchema = z.object({
  targets: z.array(z.object({ host: z.string().min(1) })),
  projectId: z.string().min(1, "Project ID is required"), // ✅ Required!
  organizationId: z.string().min(1),
  options: z
    .object({
      /* ... */
    })
    .optional(),
});

export type CreateDevicesInProjectInput = z.infer<
  typeof CreateDevicesInProjectSchema
>;

// ✅ Worker Contract - projectId OPTIONAL
export const CreateDevicesFromDiscoverySchema = z.object({
  targets: z.array(z.object({ host: z.string().min(1) })),
  projectId: z.string().min(1).optional().nullable(), // ✅ Optional for workers
  organizationId: z.string().min(1),
  options: z
    .object({
      /* ... */
    })
    .optional(),
});

export type CreateDevicesFromDiscoveryInput = z.infer<
  typeof CreateDevicesFromDiscoverySchema
>;

// ✅ UI Function - Enforces strict contract
export async function createDevicesInProject(
  input: CreateDevicesInProjectInput
) {
  const validated = CreateDevicesInProjectSchema.parse(input); // Runtime check
  // projectId guaranteed by type system
}

// ✅ Worker Function - Allows flexible contract
export async function createDevicesFromDiscovery(
  input: CreateDevicesFromDiscoveryInput
) {
  const validated = CreateDevicesFromDiscoverySchema.parse(input); // Runtime check
  // projectId may be null/undefined
}
```

##### Enforce at UI Layer (TanStack Mutation Hook)

```typescript
// apps/user-application/src/queries/device-queries.ts
import type { CreateDevicesInProjectInput } from "@repo/data-ops";

export const useCreateDevicesFromDiscoveryMutation = () => {
  return useMutation({
    mutationFn: (data: {
      targets: Array<{ host: string; ip?: string }>;
      projectId: string; // ✅ REQUIRED - TypeScript error if missing!
      options?: {
        /* ... */
      };
    }) => createDevicesFromDiscovery({ data }),
  });
};
```

##### UI Component with Runtime Guard

```typescript
// apps/user-application/src/modals/AddDevice.tsx
const { projectId } = useParams({ strict: false }); // May be undefined
const mutation = useCreateDevicesFromDiscoveryMutation();

const onSubmit = async (data: FormData) => {
  // ✅ Runtime guard (TypeScript already enforces at mutation call)
  if (!projectId) {
    toast.error("Project required");
    return;
  }

  mutation.mutate({
    targets: data.targets,
    projectId, // ✅ TypeScript knows this is string after guard
  });
};
```

##### Type-Level Tests (Guard Against Schema Evolution)

```typescript
// packages/data-ops/src/queries/__tests__/devices-schema.test.ts
import { expectTypeOf } from "vitest";

describe("Device Schema Contracts", () => {
  it("UI contract should require projectId", () => {
    expectTypeOf<CreateDevicesInProjectInput["projectId"]>().toBeString();
    expectTypeOf<CreateDevicesInProjectInput["projectId"]>().not.toBeNullable();
  });

  it("should fail CI if Drizzle schema changes", () => {
    type DrizzleInsert = typeof devices.$inferInsert;

    // If projectId becomes .notNull() in Drizzle, this fails
    expectTypeOf<DrizzleInsert["projectId"]>().toMatchTypeOf<
      string | null | undefined
    >();
  });

  it("should reject missing projectId at runtime", () => {
    expect(() =>
      CreateDevicesInProjectSchema.parse({
        targets: [{ host: "example.com" }],
        organizationId: "org123",
        // projectId missing
      })
    ).toThrow(/Project ID is required/);
  });
});
```

##### Why This Works

| Layer            | Enforcement          | How                                                        |
| ---------------- | -------------------- | ---------------------------------------------------------- |
| **Database**     | NOT NULL constraints | Drizzle schema: `projectId: text('project_id')` (nullable) |
| **Runtime**      | Zod validation       | Schema parsing throws before DB insert                     |
| **Compile-Time** | TypeScript types     | Mutation hook requires `projectId: string` (no `?`)        |
| **CI/Tests**     | Type assertions      | `expectTypeOf` fails if schema changes                     |

##### Golden Rules for This Pattern

1. **UI flows use strict contracts** - `CreateDevicesInProjectInput` requires projectId
2. **Worker flows use flexible contracts** - `CreateDevicesFromDiscoveryInput` allows null
3. **Mutation hooks enforce at compile-time** - No optional `projectId?` in UI hooks
4. **Add runtime guards in components** - Check `if (!projectId)` before mutation
5. **Type tests catch schema drift** - `expectTypeOf` breaks CI when schema changes

**Example Bug This Prevents:**

```typescript
// Before: ❌ This compiled but created invalid data
mutation.mutate({ targets: [...] });  // projectId missing, device orphaned

// After: ✅ TypeScript error at compile-time
mutation.mutate({ targets: [...] });
//                ^^^ Error: Property 'projectId' is missing
```

#### 5. **Server function pattern**

```typescript
// apps/user-application/src/server/devices.ts
import { createServerFn } from "@tanstack/react-start";
import { getDevicesForTenant, type DeviceQueryParams } from "@repo/data-ops";
import { getCurrentOrganizationId } from "./utils/auth";
import { createLogger } from "@repo/logger";

const logger = createLogger({ name: "devices-server" });

export const getDevicesData = createServerFn({
  method: "POST",
})
  .inputValidator(/* validate input */)
  .handler(async ({ data }) => {
    try {
      // 1. Get organization from session
      const organizationId = await getCurrentOrganizationId();

      // 2. Use data-ops query
      const response = await getDevicesForTenant(organizationId, data);

      // 3. Transform for UI if needed
      const transformedData = response.items.map(transformDeviceForUI);

      return { success: true, data: transformedData };
    } catch (error) {
      logger.error("Failed to fetch devices", { error });
      return { success: false, error: error.message };
    }
  });
```

### 📝 Common Queries Reference

#### Devices

```typescript
import {
  getDevicesForTenant, // List devices with pagination
  getDeviceById, // Get single device
  updateDevice, // Update device
  deleteDevice, // Delete device
  createMultipleDevicesFromDiscovery, // Bulk create
  getDeviceTagSuggestions, // Get tags
} from "@repo/data-ops";
```

#### Scans

```typescript
import {
  getScanRunsWithArtifacts, // Get scans with results
  getDeviceScanHistory, // Get scan history for device
} from "@repo/data-ops";
```

### 🔐 Authentication Pattern

```typescript
// apps/user-application/src/server/utils/auth.ts

// Get current user
import { getCurrentUser } from "@/server/utils/auth";
const user = await getCurrentUser();
// Returns: { id, email, name, emailVerified, organizationId }

// Get organization ID (throws if not authenticated)
import { getCurrentOrganizationId } from "@/server/utils/auth";
const organizationId = await getCurrentOrganizationId();
```

### 🚀 SSR Pattern (TanStack Start + Cloudflare Workers)

**IMPORTANT: Cloudflare Workers cannot make external HTTP calls during SSR**
- ❌ Don't use tRPC in loaders (causes 522 timeout)
- ✅ Use `createServerFn` with data-ops queries (direct DB access)

#### Step 1: Create Server Function

```typescript
// src/server/organization.ts
import { createServerFn } from '@tanstack/react-start';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getOrganizationBySlugOrId } from '@repo/data-ops';
import { env } from 'cloudflare:workers';

export const getOrganization = createServerFn({ method: 'GET' })
  .inputValidator((organizationId: string) => organizationId)
  .handler(async ({ data: organizationId }) => {
    // ✅ Initialize DB with Worker binding
    initDatabase(env.DB);

    // ✅ Use existing data-ops query (direct DB, no HTTP)
    const org = await getOrganizationBySlugOrId(organizationId);

    if (!org) throw new Error('Organization not found');
    return org;
  });
```

#### Step 2: Use in Route Loader

```typescript
// src/routes/_app.$organizationId.tsx
export const Route = createFileRoute("/_app/$organizationId")({
  loader: async ({ params }) => {
    const { getOrganization } = await import('@/server/organization');

    // ✅ Direct DB access via serverFn (no external HTTP)
    const organization = await getOrganization({ data: params.organizationId });

    return { organization };
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  const { organization } = Route.useLoaderData(); // ✅ Always available
  return <OrganizationGate organization={organization}>...</OrganizationGate>;
}
```

#### Step 3: Dynamic Data via tRPC (Client-Side)

```typescript
// For real-time data (scans, devices) - use tRPC in components
function DevicesList({ projectId }: { projectId: string }) {
  // ✅ Client-side only - runs after hydration
  const { data: devices } = useQuery({
    ...trpc.device.list.queryOptions({ projectId }),
    refetchInterval: 5000, // Poll for live updates
  });

  return <DeviceTable devices={devices} />;
}
```

#### Key Patterns

| Data Type | Where to Fetch | Method |
|-----------|---------------|--------|
| **Layout data** (org, project, session) | Loader (SSR) | `createServerFn` |
| **Dynamic data** (devices, scans) | Component (client) | `tRPC` |
| **Static structure** (sidebar, tabs) | Loader (SSR) | `createServerFn` |
| **Real-time updates** | Component (client) | `tRPC` with polling |

#### Why This Works

```
❌ Broken (522 timeout):
Loader → tRPC client → fetch('https://sec.rocks/api/trpc') → 522
         └─ External HTTP back to itself = timeout

✅ Working:
Loader → createServerFn → /_serverFn/ (internal) → env.DB → ✓
         └─ Direct DB access, no external HTTP
```

**Key Insight:** `createServerFn` runs in Worker context with `env` access, allowing direct DB queries without external HTTP calls. The `/_serverFn/` endpoint is internal routing, not external DNS.

### 🛠️ Creating New Queries

When you need a new database operation:

1. **Add query to `packages/data-ops/src/queries/`**

   ```typescript
   // packages/data-ops/src/queries/devices.ts
   export async function getDevicesByTag(organizationId: string, tag: string) {
     const db = getDb();
     // ... implementation
   }
   ```

2. **Export from `packages/data-ops/src/index.ts`**

   ```typescript
   export { getDevicesByTag } from "./queries/devices";
   ```

3. **Use in server function**
   ```typescript
   // apps/user-application/src/server/devices.ts
   import { getDevicesByTag } from "@repo/data-ops";
   ```

### ⚠️ Common Mistakes to Avoid

1. ❌ **Don't mix server/client code in routes**

   ```typescript
   // Route file should NOT import DB directly
   import { getDb } from "@repo/data-ops/database/setup"; // ❌
   ```

2. ❌ **Don't use dynamic imports for data-ops**

   ```typescript
   const { getDb } = await import("@repo/data-ops/..."); // ❌
   ```

3. ❌ **Don't duplicate query logic**

   ```typescript
   // If query exists in data-ops, use it!
   // Don't write raw SQL in server functions
   ```

4. ❌ **Don't forget organization context**
   ```typescript
   // Always scope queries by organization
   const devices = await getDevicesForTenant(organizationId, params);
   ```

### 📚 Additional Resources

- Better-auth docs: https://www.better-auth.com/docs
- TanStack Start docs: https://tanstack.com/start
- Drizzle ORM docs: https://orm.drizzle.team/

---

## Notification Delivery System

### Architecture Overview

The notification system uses a **queue-based architecture** to decouple notification creation from delivery:

```
Port Scan Complete → Change Detection → Create Notifications
                                              ↓
                                    Filter by Org Severity Preferences
                                              ↓
                                    Enqueue to Cloudflare Queue
                                              ↓
                                    data-service Worker Consumes
                                              ↓
                                    Send Emails via Resend
```

### Key Components

**1. Change Detection** (`apps/user-application/src/server/notifications/change-detector/`)

- Detects changes between scan results (new ports, CVEs, service drift)
- Returns `ScanChange[]` with severity, title, description
- Called automatically in port-scan postback handler

**2. Notification Creation** (`packages/data-ops/src/queries/notifications/`)

- `createNotifications()` - Stores notifications in database
- Implements deduplication via fingerprint + suppress windows
- Returns created notifications (may be fewer than requested due to suppression)

**3. Delivery Queue** (`apps/user-application/src/server/notifications/delivery-queue.ts`)

- `enqueueNotificationDelivery()` - Filters by org severity preferences
- Calls `resolveEmailSeverities()` to get allowed severities per org
- Enqueues jobs to `NOTIFICATION_DELIVERY_PRODUCER` Cloudflare Queue

**4. Delivery Worker** (`apps/data-service/src/index.ts`)

- Consumes queue messages via `WorkerEntrypoint.queue()`
- Sends emails using React Email templates + Resend API
- Records delivery status (TODO: implement `recordNotificationDelivery`)

### Notification Severity Preferences

**Location:** `packages/data-ops/src/queries/notifications/settings.ts`

Organizations control which severity levels trigger email alerts:

```typescript
import { resolveEmailSeverities, updateEmailSeverities } from "@repo/data-ops";

// Get allowed severities for org
const allowed = await resolveEmailSeverities("org_123");
// Returns: ['CRITICAL', 'HIGH'] (default) or custom settings

// Update org preferences
await updateEmailSeverities({
  organizationId: "org_123",
  emailAllowedSeverities: ["CRITICAL", "HIGH", "MEDIUM"],
});

// Disable all email alerts
await updateEmailSeveritiesOrDisable({
  organizationId: "org_123",
  emailAllowedSeverities: [], // Empty array = disabled
});
```

**Cache Behavior:**

- 5-minute in-memory TTL cache per worker process
- Cleared on settings update
- Eventually consistent across multiple workers

### How to Add Notifications

**Step 1: Detect Changes**

Change detection already handles port/CVE/service changes. To add new change types, modify change detector:

```typescript
// apps/user-application/src/server/notifications/change-detector/diff-custom.ts
export function diffCustom(
  current: EnrichedScanResultSummary,
  baseline: EnrichedScanResultSummary | null,
  deviceId: string
): ScanChange[] {
  // Your detection logic
  return [
    {
      type: "CUSTOM_CHANGE",
      severity: "HIGH",
      module: "custom",
      title: "Custom change detected",
      message: "Details about the change",
      fingerprint: "custom:device:change",
      data: {
        /* custom data */
      },
    },
  ];
}
```

**Step 2: Include in Change Detection**

```typescript
// apps/user-application/src/server/notifications/change-detector/index.ts
import { diffCustom } from './diff-custom';

export async function detectScanChanges(...) {
  const customChanges = diffCustom(currentSummary, baselineSummary, deviceId);
  const allChanges = [...portChanges, ...cveChanges, ...customChanges];
  return allChanges;
}
```

**Step 3: Queue Integration (Automatic)**

The postback handler automatically:

1. Calls `createNotifications()` with detected changes
2. Filters by org severity preferences
3. Enqueues delivery jobs to Cloudflare Queue

No additional code needed - it's already integrated at `apps/user-application/src/server/postback/handlers/port-scan.ts:467-484`

### Common Mistakes to Avoid

**1. ❌ Don't bypass severity filtering**

```typescript
// ❌ WRONG - Sends emails regardless of org preferences
await sendEmail(notification);

// ✅ CORRECT - Use the queue system
await enqueueNotificationDelivery(notifications, env);
```

**2. ❌ Don't create notifications manually for scan changes**

```typescript
// ❌ WRONG - Duplicates change detection logic
await createNotifications([
  {
    type: "NEW_PORT",
    severity: "HIGH",
    // ...
  },
]);

// ✅ CORRECT - Use change detector
const changes = await detectScanChanges({
  deviceId,
  currentScan,
  organizationId,
});
await createNotifications(changes);
```

**3. ❌ Don't modify notification schema without updating queue payload**

```typescript
// If you add fields to NotificationDeliveryMessage:
// 1. Update apps/data-service/service-bindings.d.ts
// 2. Update apps/user-application/src/server/notifications/delivery-queue.ts
// 3. Update apps/data-service/src/index.ts queue handler
```

**4. ❌ Don't forget to handle recipients**

```typescript
// TODO in delivery-queue.ts - Currently recipients: []
// Need to query org members or user notification preferences
```

### Email Templates

**Location:** `apps/data-service/emails/`

Email templates use plain text format with `buildPlainEmail()`:

```typescript
// emails/custom-alert.tsx
import { buildPlainEmail, type PlainEmailLine } from "./layout";

export interface CustomAlertProps {
  deviceName: string;
  message: string;
}

export function CustomAlertEmail({ deviceName, message }: CustomAlertProps) {
  const bodyLines: PlainEmailLine[] = [
    deviceName,
    "",
    message,
    "",
    { text: "Take action immediately", bold: true },
  ];

  return buildPlainEmail({
    subject: `Alert for ${deviceName}`,
    heading: "Custom Alert",
    bodyLines,
  });
}
```

### Testing Notifications

**Test emails using Justfile:**

```bash
cd apps/data-service
just test-new-cve your@email.com
just test-critical-port your@email.com
```

**Integration test pattern:**

```typescript
// Test change detection + notification creation
const changes = await detectScanChanges({
  deviceId: "dev_test",
  currentScan: mockScanRun,
  organizationId: "org_test",
});

const notifications = await createNotifications(changes);
expect(notifications.length).toBeGreaterThan(0);

// Test severity filtering
const allowed = await resolveEmailSeverities("org_test");
const filtered = notifications.filter((n) => allowed.includes(n.severity));
```

### Documentation

- Full architecture: `docs/features/notifications/operations.md`
- Queue implementation plan: `docs/features/notifications/initiatives/notification-delivery-queue-plan.md`
- Change detection: `docs/NOTIFICATIONS/change-detection.md`

---

Approach tasks like John Carmack:

1. Explore and Plan Strategically

   - Before writing code, deeply explore the problem or feature.
   - Clearly identify root causes, requirements, and goals.
   - Plan a strategic, thoughtful approach before implementation.

2. Debug Elegantly
   - If there's a bug, systematically locate, isolate, and resolve it.
   - Effectively utilize logs, print statements, and isolation scripts to pinpoint issues.

**Last Updated:** After implementing queue-based notification delivery system
