# Architecture Review - Security Validation Patterns

**Date:** 2025-01-26
**Focus:** Code alignment, simplicity, and reusability
**Status:** ⚠️ Refactoring Recommended

---

## Executive Summary

The current security implementation is **functional and secure** (all tests passing), but has **architectural violations** that reduce maintainability and reusability:

1. ❌ **Server functions calling server functions** (projects.ts → organization.ts)
2. ❌ **Business logic in server layer** (should be in data-ops)
3. ❌ **Organization resolution in wrong layer** (should be in data-ops)

**Recommendation:** Refactor to align with data-ops architecture pattern for better separation of concerns.

---

## Current Architecture Issues

### Issue 1: Server Function Cross-Dependencies

**Location:** `apps/user-application/src/server/projects.ts:7,65`

```typescript
// ❌ BAD: Server function importing another server function
import { getOrganizationById } from "./organization";

export const validateProjectAccess = createServerFn({
  method: "GET",
}).handler(async ({ data }) => {
  // ❌ BAD: Server function calling server function
  const orgResult = await getOrganizationById({
    data: data.organizationId
  });
  // ...
});
```

**Problems:**
- Creates tight coupling between server modules
- Risk of circular dependencies
- Violates single responsibility principle
- Harder to test in isolation

**Golden Rule Violation:**
From `CLAUDE.md`: "ALWAYS use data-ops queries, NEVER raw DB operations in apps"

Server functions should call **data-ops**, not other server functions.

---

### Issue 2: Business Logic in Server Layer

**Current Structure:**
```
apps/user-application/src/server/
├── projects.ts
│   └── validateProjectAccess()        ❌ Business logic here
│       ├── Resolve org slug→ID
│       ├── Check membership
│       ├── Validate project ownership
│       └── Return project
└── organization.ts
    └── getOrganizationById()          ❌ Business logic here
        ├── Resolve slug/ID
        ├── Check membership
        └── Return organization
```

**Should be:**
```
packages/data-ops/src/queries/
├── organizations.ts                   ✅ Business logic here
│   ├── getOrganizationBySlugOrId()
│   └── validateOrganizationAccess()
└── projects.ts                        ✅ Business logic here
    └── validateProjectAccess()

apps/user-application/src/server/
├── projects.ts                        ✅ Orchestration only
│   └── validateProjectAccess()
│       └── calls data-ops function
└── organization.ts                    ✅ Orchestration only
    └── getOrganizationById()
        └── calls data-ops function
```

---

### Issue 3: Organization Resolution in Wrong Layer

**Current:** Organization slug→ID resolution happens in server functions

**Should be:** Organization resolution should be a reusable data-ops query

**Why it matters:**
- Organization resolution is **data access**, not business logic
- Will be needed by multiple server functions
- Should be testable independently
- Follows OpenPanel pattern (see `packages/db/src/services/organization.service.ts`)

---

## Comparison with OpenPanel Architecture

### OpenPanel's Clean Separation

```
packages/db/src/services/
├── organization.service.ts
│   ├── getOrganizationById(id)
│   ├── getMembers(organizationId)
│   └── ... (data access only)
└── project.service.ts
    ├── getProjectById(id)
    └── getProjectsByOrganization(orgId)

packages/trpc/src/
├── access.ts
│   ├── getOrganizationAccess()        ← Business logic
│   ├── getProjectAccess()             ← Business logic
│   └── (cached versions)
└── routers/
    ├── organization.ts                ← API layer
    └── project.ts                     ← API layer
```

**Key Pattern:** Data → Business Logic → API

### Your Current Structure

```
packages/data-ops/src/queries/
├── projects.ts                        ✅ Data access
│   ├── getProjectById()
│   └── getProjectsForOrganization()
└── (no organizations.ts yet)          ❌ Missing

apps/user-application/src/server/
├── projects.ts                        ⚠️ Mixed concerns
│   ├── getOrganizationProjects()      ✅ Orchestration
│   └── validateProjectAccess()        ❌ Business logic
└── organization.ts                    ⚠️ Mixed concerns
    └── getOrganizationById()          ❌ Business logic + data access
```

**Key Problem:** Business logic and orchestration are mixed in server layer

---

## Recommended Refactoring

### Step 1: Create Organization Queries in Data-Ops

**File:** `packages/data-ops/src/queries/organizations.ts` (NEW)

```typescript
import { eq, or, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { organization, member } from '../drizzle/auth-schema';

/**
 * Get organization by slug or ID
 *
 * Security: Does NOT check membership - use validateOrganizationAccess for that
 */
export async function getOrganizationBySlugOrId(
  slugOrId: string
) {
  const db = getDb();

  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      metadata: organization.metadata,
    })
    .from(organization)
    .where(
      or(
        eq(organization.slug, slugOrId),
        eq(organization.id, slugOrId)
      )
    )
    .limit(1);

  return org || null;
}

/**
 * Validate user has access to organization
 *
 * Security: Checks membership table
 * Returns organization if user is a member, null otherwise
 */
export async function validateOrganizationAccess(
  userId: string,
  organizationSlugOrId: string
) {
  const db = getDb();

  // First, resolve slug/ID to organization
  const org = await getOrganizationBySlugOrId(organizationSlugOrId);

  if (!org) {
    return null;
  }

  // Then check membership
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, org.id)
      )
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  // Return org with membership info
  return {
    ...org,
    userRole: membership.role,
  };
}
```

---

### Step 2: Create Project Access Validation in Data-Ops

**File:** `packages/data-ops/src/queries/projects.ts` (UPDATE)

Add after existing functions:

```typescript
/**
 * Validate user has access to project
 *
 * Security:
 * 1. Resolves organization slug/ID to actual organization
 * 2. Validates user is a member of that organization
 * 3. Validates project exists and belongs to organization
 *
 * This is the SINGLE SOURCE OF TRUTH for project access validation
 */
export async function validateProjectAccess(
  userId: string,
  projectId: string,
  organizationSlugOrId: string
) {
  // Import from organizations.ts
  const orgAccess = await validateOrganizationAccess(
    userId,
    organizationSlugOrId
  );

  if (!orgAccess) {
    return null;
  }

  // Validate project belongs to organization
  const project = await getProjectById(projectId, orgAccess.id);

  if (!project) {
    return null;
  }

  return {
    project,
    organization: orgAccess,
  };
}
```

---

### Step 3: Simplify Server Functions

**File:** `apps/user-application/src/server/projects.ts` (REFACTOR)

```typescript
import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { validateProjectAccess } from "@repo/data-ops";  // ← From data-ops now
import { getCurrentUser } from "./utils/auth";

const logger = createLogger({ name: "projects-server" });

/**
 * Validate project access and ownership (VULN-001 FIX - REFACTORED)
 *
 * Now just a thin wrapper around data-ops function
 */
export const validateProjectAccessFn = createServerFn({
  method: "GET",
})
  .inputValidator((data: { projectId: string; organizationId: string }) => {
    if (!data?.projectId || !data?.organizationId) {
      throw new Error("Both projectId and organizationId are required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      // ✅ CLEAN: All business logic in data-ops
      const result = await validateProjectAccess(
        user.id,
        data.projectId,
        data.organizationId
      );

      if (!result) {
        logger.warn("Project access denied", {
          userId: user.id,
          organizationId: data.organizationId,
          projectId: data.projectId,
        });
        return {
          success: false,
          error: "Project not found or access denied",
          project: null,
        };
      }

      logger.info("Project access validated", {
        userId: user.id,
        projectId: result.project.id,
        projectName: result.project.name,
        organizationId: result.organization.id,
        organizationSlug: result.organization.slug,
      });

      return {
        success: true,
        project: result.project,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to validate project access", {
        error: errorMessage,
        projectId: data.projectId,
        organizationId: data.organizationId,
      });

      return {
        success: false,
        error: errorMessage,
        project: null,
      };
    }
  });
```

---

### Step 4: Update Organization Server Function

**File:** `apps/user-application/src/server/organization.ts` (REFACTOR)

```typescript
import { validateOrganizationAccess } from "@repo/data-ops";  // ← From data-ops
import { getCurrentUser } from "./utils/auth";

/**
 * Get organization by slug or ID and validate user has access
 */
export const getOrganizationById = createServerFn({
  method: "GET",
})
  .inputValidator((organizationIdentifier: string) => {
    if (!organizationIdentifier) {
      throw new Error("Organization identifier is required");
    }
    return organizationIdentifier;
  })
  .handler(async ({ data: organizationIdentifier }) => {
    try {
      const user = await getCurrentUser();

      // ✅ CLEAN: All business logic in data-ops
      const org = await validateOrganizationAccess(
        user.id,
        organizationIdentifier
      );

      if (!org) {
        logger.warn("Organization access denied", {
          userId: user.id,
          organizationIdentifier,
        });
        throw new Error("Organization not found or access denied");
      }

      logger.info("Organization accessed", {
        organizationId: org.id,
        organizationSlug: org.slug,
        userId: user.id,
        userRole: org.userRole,
      });

      return {
        success: true,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          metadata: org.metadata ? JSON.parse(org.metadata) : null,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get organization", {
        error: errorMessage,
        identifier: organizationIdentifier,
      });

      throw error;
    }
  });
```

---

### Step 5: Export from Data-Ops

**File:** `packages/data-ops/src/index.ts` (UPDATE)

```typescript
// Organization queries (NEW)
export {
  getOrganizationBySlugOrId,
  validateOrganizationAccess,
} from './queries/organizations';

// Project queries (UPDATED)
export {
  createProject,
  getProjectById,
  getOrganizationIdFromProject,
  getProjectsForOrganization,
  updateProject,
  deleteProject,
  getOrCreateDefaultProject,
  validateProjectAccess,  // ← ADD THIS
} from './queries/projects';
```

---

## Benefits of Refactoring

### 1. ✅ **Separation of Concerns**
- **Data-ops:** Pure data access and business logic
- **Server functions:** Orchestration and logging only
- **Routes:** UI and navigation only

### 2. ✅ **Reusability**
- `validateOrganizationAccess()` can be used by any server function
- `validateProjectAccess()` can be used by routes, server functions, background jobs
- No duplication of validation logic

### 3. ✅ **Testability**
- Data-ops functions can be tested in isolation
- No need to mock server function dependencies
- Integration tests can use data-ops directly

### 4. ✅ **Maintainability**
- Single source of truth for access validation
- Changes to validation logic happen in one place
- Clear dependency graph: Routes → Server → Data-ops → DB

### 5. ✅ **Consistency with OpenPanel**
- Similar architecture to OpenPanel's service layer
- Follows industry best practices
- Easier for new developers to understand

---

## Migration Path

### Phase 1: Add Data-Ops Functions (No Breaking Changes)
1. Create `packages/data-ops/src/queries/organizations.ts`
2. Add `validateOrganizationAccess()` and `getOrganizationBySlugOrId()`
3. Add `validateProjectAccess()` to `projects.ts`
4. Export from `packages/data-ops/src/index.ts`
5. Rebuild data-ops package

### Phase 2: Update Server Functions
1. Refactor `src/server/projects.ts` to use data-ops
2. Refactor `src/server/organization.ts` to use data-ops
3. Remove cross-dependencies between server functions

### Phase 3: Test and Verify
1. Run all security tests (should still pass)
2. Manual testing of routes
3. Verify no regression

**Estimated Time:** 2-3 hours

---

## Alternative: Keep Current Implementation

If you prefer to **avoid refactoring right now**, the current implementation is:

✅ **Secure** - All 18 security tests passing
✅ **Functional** - Working in production
✅ **Complete** - All vulnerabilities fixed

⚠️ **Trade-offs:**
- Less maintainable (tight coupling)
- Harder to reuse validation logic
- Not aligned with data-ops architecture

**Recommendation:** Refactor when you have time, but not urgent since security is solid.

---

## Conclusion

**Current Status:** ✅ Secure but ⚠️ Architectural violations

**Recommendation:** Refactor to data-ops pattern for:
- Better separation of concerns
- Improved reusability
- Easier maintenance
- Alignment with OpenPanel best practices

**Priority:** 🟡 Medium (not blocking, but improves code quality)

**Next Steps:**
1. Review this proposal
2. Decide: refactor now or defer
3. If defer, add to backlog as tech debt
4. If proceed, I can implement the refactoring

---

## References

- **Codebase Guide:** `CLAUDE.md` - Data-ops architecture patterns
- **OpenPanel Analysis:** Task exploration output above
- **Security Audit:** `docs/features/SECURITY_AUDIT_2025.md`
- **Current Implementation:** `apps/user-application/src/server/projects.ts:41-140`
