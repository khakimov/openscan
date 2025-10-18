# CLAUDE.md - Monorepo Architecture Guide

This file provides guidance to Claude Code when working with code in this monorepo.

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
└── CLAUDE.md               # This file
```

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

| What | Where | Why |
|------|-------|-----|
| **Database queries** | `packages/data-ops/src/queries/` | Reusable, testable, single source of truth |
| **Schema definitions** | `packages/data-ops/src/schema/` | Type safety, migrations |
| **Server functions** | `apps/*/src/server/` | Application-specific business logic |
| **Components** | `apps/*/src/components/` | UI only, use server functions |

#### 3. **Import patterns**

```typescript
// ✅ CORRECT - Import from data-ops
import {
  getDevicesForTenant,
  updateDevice,
  deleteDevice
} from "@repo/data-ops";

import {
  getCurrentOrganizationId,
  getCurrentUser
} from "@/server/utils/auth";

// ✅ CORRECT - Import Drizzle operators from data-ops
import { eq, and, desc } from "@repo/data-ops";

// ❌ WRONG - Don't import DB internals in apps
import { getDb } from "@repo/data-ops/database/setup";
import { devices } from "@repo/data-ops/schema";

// ❌ WRONG - No dynamic imports
const { getDb } = await import("@repo/data-ops/database/setup");
```

#### 4. **Server function pattern**

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
  getDevicesForTenant,      // List devices with pagination
  getDeviceById,            // Get single device
  updateDevice,             // Update device
  deleteDevice,             // Delete device
  createMultipleDevicesFromDiscovery,  // Bulk create
  getDeviceTagSuggestions   // Get tags
} from "@repo/data-ops";
```

#### Scans
```typescript
import {
  getScanRunsWithArtifacts, // Get scans with results
  getDeviceScanHistory      // Get scan history for device
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

### 🚀 SSR Pattern (TanStack Start)

**Route with loader (SSR):**
```typescript
// apps/user-application/src/routes/_auth/assets.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getDevicesData } from "@/server/devices";

export const Route = createFileRoute("/_auth/assets")({
  loader: async ({ search }) => {
    // Fetch server-side for instant render
    const devices = await getDevicesData({
      data: { verificationStatus: search.tab }
    });
    return { devices };
  },
  component: Assets,
});

function Assets() {
  const { devices } = Route.useLoaderData(); // SSR data
  return <DeviceList devices={devices.items} />;
}
```

**SSR + Real-time updates:**
```typescript
// For data that needs polling (scans, live updates)
export const Route = createFileRoute("/_auth/scans")({
  loader: async () => {
    const scans = await getScans(); // SSR
    return { scans };
  },
  component: Scans,
});

function Scans() {
  const { scans } = Route.useLoaderData();

  // Use SSR data as initialData, then poll
  const { data: liveScans } = useScansQuery(scans);

  return <ScansTable scans={liveScans} />;
}
```

### 🛠️ Creating New Queries

When you need a new database operation:

1. **Add query to `packages/data-ops/src/queries/`**
   ```typescript
   // packages/data-ops/src/queries/devices.ts
   export async function getDevicesByTag(
     organizationId: string,
     tag: string
   ) {
     const db = getDb();
     // ... implementation
   }
   ```

2. **Export from `packages/data-ops/src/index.ts`**
   ```typescript
   export { getDevicesByTag } from './queries/devices';
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

**Last Updated:** When refactoring to SSR and data-ops query pattern
