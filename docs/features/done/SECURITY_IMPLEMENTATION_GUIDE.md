# OpenScan Security Implementation Guide

Based on OpenPanel patterns, here's the step-by-step implementation for OpenScan.

## Priority 1: Fix Project→Organization Validation (CRITICAL)

### Step 1: Create validation function in data-ops

File: `packages/data-ops/src/queries/access-validation.ts` (new file)

```typescript
import { eq, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { projects, members } from '../schema';

/**
 * Validates that a project belongs to an organization
 * Returns the project if valid, throws if not found or belongs to different org
 */
export async function validateProjectBelongsToOrganization(
  projectId: string,
  organizationId: string,
) {
  const db = getDb();
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId),
    ),
  });

  if (!project) {
    throw new Error('Project not found or does not belong to this organization');
  }

  return project;
}

/**
 * Validates that a user has access to a project
 * Returns true if user is org member (all projects) or has explicit project access
 */
export async function validateUserProjectAccess(
  userId: string,
  projectId: string,
) {
  const db = getDb();
  
  // 1. Get the project and its org
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project?.organizationId) {
    return false;
  }

  // 2. Check if user is an org member (grants all project access)
  const orgMember = await db.query.members.findFirst({
    where: and(
      eq(members.userId, userId),
      eq(members.organizationId, project.organizationId),
    ),
  });

  if (orgMember) {
    return true;
  }

  // 3. Check for explicit project-level access (for future use)
  // For now, we rely on org membership
  return false;
}

/**
 * Validates both project→organization AND user access in one call
 * Use this in route loaders
 */
export async function validateProjectAccess(
  userId: string,
  projectId: string,
  organizationId: string,
) {
  // Validate project belongs to org
  await validateProjectBelongsToOrganization(projectId, organizationId);

  // Validate user has access
  const hasAccess = await validateUserProjectAccess(userId, projectId);
  if (!hasAccess) {
    throw new Error('No access to this project');
  }

  return true;
}
```

### Step 2: Export from data-ops index

File: `packages/data-ops/src/index.ts`

```typescript
export {
  validateProjectBelongsToOrganization,
  validateUserProjectAccess,
  validateProjectAccess,
} from './queries/access-validation';
```

### Step 3: Fix the route loader

File: `src/routes/_app.$organizationId.$projectId.tsx`

```typescript
import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { createLogger } from "@repo/logger";
import { validateProjectAccess } from "@repo/data-ops";
import { getCurrentUserId } from "@/server/utils/auth";

const logger = createLogger({ name: "project-layout" });

const RESERVED_PROJECT_IDS = [
  'settings',
  'members',
  'billing',
  'integrations',
];

export const Route = createFileRoute("/_app/$organizationId/$projectId")({
  beforeLoad: async ({ params }) => {
    // Block reserved project IDs
    if (RESERVED_PROJECT_IDS.includes(params.projectId)) {
      logger.warn("Attempted to access reserved project ID", {
        projectId: params.projectId
      });
      throw notFound();
    }
  },
  loader: async ({ params }) => {
    try {
      const userId = await getCurrentUserId();
      
      // CRITICAL: Validate project belongs to org AND user has access
      await validateProjectAccess(
        userId,
        params.projectId,
        params.organizationId,
      );

      logger.info("Project layout loaded", {
        organizationId: params.organizationId,
        projectId: params.projectId,
        userId,
      });

      return {
        projectId: params.projectId,
        organizationId: params.organizationId,
      };
    } catch (error) {
      logger.error("Project access validation failed", { 
        error,
        projectId: params.projectId,
        organizationId: params.organizationId,
      });
      throw notFound();
    }
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  return <Outlet />;
}
```

## Priority 2: Add Access Caching (PERFORMANCE)

### Step 1: Create cached versions in data-ops

File: `packages/data-ops/src/queries/access-validation.ts` (add to existing file)

```typescript
import { cacheable } from '@repo/redis'; // Add this import

// Cache for 5 minutes like OpenPanel
export const validateUserProjectAccessCached = cacheable(
  validateUserProjectAccess,
  60 * 5
);

// Use in high-traffic queries
export async function getDeviceListCached(
  userId: string,
  projectId: string,
  organizationId: string,
) {
  // Check access once (cached)
  const hasAccess = await validateUserProjectAccessCached(userId, projectId);
  if (!hasAccess) {
    throw new Error('No access to this project');
  }

  // Then fetch data
  return getDeviceListByProject(projectId);
}
```

### Step 2: Use in query functions

Update `src/queries/device-queries.ts` to validate project access:

```typescript
import { validateUserProjectAccessCached } from "@repo/data-ops";

export const deviceQueries = {
  list: (params: { verificationStatus: ..., projectId: string }) => 
    queryOptions({
      queryKey: ['devices', params],
      queryFn: async () => {
        // Validate access in every query
        // In real code, get userId from auth context
        await validateUserProjectAccessCached(userId, params.projectId);
        
        return getDevicesByProject(params.projectId, params.verificationStatus);
      },
    }),
};
```

## Priority 3: Document Security Patterns

### Create SECURITY.md in openscan

File: `apps/user-application/SECURITY.md`

```markdown
# Security Architecture

## Authorization Flow

1. **Route Level** (beforeLoad)
   - Block reserved IDs
   - Block static files
   
2. **Route Loader** (loader)
   - Validate project→organization relationship
   - Validate user has project access
   - Prefetch initial data

3. **Query Level** (server functions)
   - Validate organization context
   - Cache access checks for 5 minutes
   - Always include organizationId in results

## Adding New Routes

When adding a new route that accesses project data:

```typescript
export const Route = createFileRoute('/_app/$organizationId/$projectId/new-page')({
  loader: async ({ params }) => {
    // 1. Validate project exists and belongs to org
    const userId = await getCurrentUserId();
    await validateProjectAccess(
      userId,
      params.projectId,
      params.organizationId,
    );

    // 2. Then prefetch data
    // ...
  },
});
```

## Adding New Queries

When adding a new query function:

```typescript
export async function getDeviceData(
  userId: string,
  projectId: string,
  organizationId: string,
) {
  // 1. Always validate access first
  await validateUserProjectAccessCached(userId, projectId);

  // 2. Include both IDs in where clause
  const db = getDb();
  return db.query.devices.findMany({
    where: and(
      eq(devices.projectId, projectId),
      eq(devices.organizationId, organizationId),
    ),
  });
}
```

## Security Checklist

- [ ] Route has beforeLoad for static validation
- [ ] Route loader validates project→org + user access
- [ ] All queries validate access before returning data
- [ ] No hardcoded organizationId (always derive from project)
- [ ] Error messages are generic (don't leak whether org/project exists)
- [ ] Caching considered for high-traffic queries
- [ ] Results always include context (organizationId, projectId)
```

## Summary of Changes

| File | Change | Priority |
|------|--------|----------|
| `packages/data-ops/src/queries/access-validation.ts` | NEW: Access validation functions | P1 |
| `packages/data-ops/src/index.ts` | EXPORT: New functions | P1 |
| `src/routes/_app.$organizationId.$projectId.tsx` | UPDATE: Add validation in loader | P1 |
| `apps/user-application/SECURITY.md` | NEW: Documentation | P2 |
| `src/queries/device-queries.ts` | UPDATE: Add access checks | P2 |

## Timeline

- **Week 1**: Implement P1 (access validation)
- **Week 2**: Add caching + documentation
- **Week 3+**: Audit all existing routes and queries

## Testing

```bash
# Test project→org validation
# Try to access: /{org-a}/{project-from-org-b}
# Should get notFound() error

# Test user access
# User not in org should get access denied in loader

# Test caching
# Call same query twice - second should use cache
```

