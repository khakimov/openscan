# OpenPanel Security Patterns Analysis

## Executive Summary

OpenPanel implements a multi-layered security architecture that validates authorization at:
1. **Route level** (beforeLoad/loader with static validation)
2. **TRPC middleware level** (automatic projectId/organizationId validation)
3. **Server function level** (explicit access checks)
4. **Data layer** (all queries scoped to organization/project)

This document provides detailed patterns and best practices for implementation in openscan.

---

## 1. ROUTE PARAMETER VALIDATION

### Pattern: Static File & Reserved ID Filtering

**OpenPanel Location**: `/apps/start/src/routes/_app.$organizationId.tsx` (lines 36-45)

```typescript
const IGNORE_ORGANIZATION_IDS = ['.well-known', 'onboarding', 'assets'];
const FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', ...];

const isStaticFile = (path: string) => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

export const Route = createFileRoute('/_app/$organizationId')({
  beforeLoad: async ({ context, params }) => {
    // Block reserved and static file paths early
    if (IGNORE_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }
  },
  loader: async ({ context, params }) => {
    // Prefetch query - validates access through TRPC
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
});
```

**Key Insights**:
- Use `beforeLoad` for static validation (no DB calls)
- Use `loader` for data prefetching (triggers TRPC validation)
- TRPC middleware checks access before returning data
- Prevents directory traversal via reserved IDs

**Comparison to OpenScan**:
- OpenScan's `_app.$organizationId.$projectId.tsx` (lines 27-49) has TODO comments
- Currently only validates static files, doesn't validate project belongs to organization
- Needs explicit access validation in loader

---

### Pattern: Project Validation Without organizationId Redundancy

**OpenPanel Location**: `/packages/trpc/src/routers/project.ts` (lines 41-50)

```typescript
list: protectedProcedure
  .input(
    z.object({
      organizationId: z.string().nullable(),
    }),
  )
  .query(async ({ input: { organizationId } }) => {
    if (organizationId === null) return [];
    return getProjectsByOrganizationId(organizationId);
  }),
```

**Key Insight**: The TRPC middleware automatically validates the organizationId, so the router can trust it. This is cleaner than passing it through every function.

---

## 2. TRPC MIDDLEWARE SECURITY

### Pattern: Two-Layer Middleware Architecture

**OpenPanel Location**: `/packages/trpc/src/trpc.ts` (lines 83-164)

```typescript
// Layer 1: Enforce user is authenticated
const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      session: { ...ctx.session },
    },
  });
});

// Layer 2: Enforce organization/project access
const enforceAccess = t.middleware(async ({ ctx, next, type, getRawInput }) => {
  const rawInput = await getRawInput();
  
  // Block mutations in demo mode
  if (type === 'mutation' && process.env.DEMO_USER_ID) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not allowed to do this in demo mode',
    });
  }

  // Check projectId if present
  if (has('projectId', rawInput)) {
    const access = await getProjectAccessCached({
      userId: ctx.session.userId!,
      projectId: rawInput.projectId as string,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this project');
    }
  }

  // Check organizationId if present
  if (has('organizationId', rawInput)) {
    const access = await getOrganizationAccessCached({
      userId: ctx.session.userId!,
      organizationId: rawInput.organizationId as string,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this organization');
    }
  }

  return next();
});

// Create protected procedure combining both
export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceAccess)
  .use(loggerMiddleware);
```

**Key Security Features**:
1. **Automatic validation**: Any input with `projectId` or `organizationId` is validated
2. **Caching**: Uses `getProjectAccessCached` (5 minute TTL) for performance
3. **Demo mode protection**: Blocks mutations in demo environments
4. **Field-based detection**: Uses `has()` to check for fields, not string matching

**Critical Benefit**: Developers can't accidentally skip authorization checks - it's automatic for all protected procedures.

---

## 3. ACCESS CONTROL FUNCTIONS

### Pattern: Three-Level Access Hierarchy

**OpenPanel Location**: `/packages/trpc/src/access.ts`

#### Level 1: Project Access (Most Restrictive)

```typescript
export async function getProjectAccess({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  try {
    // 1. Get project and its organization
    const project = await getProjectById(projectId);
    if (!project?.organizationId) {
      return false;
    }

    // 2. Check if user has explicit project access
    const [projectAccess, member] = await Promise.all([
      db.projectAccess.findMany({
        where: {
          userId,
          organizationId: project.organizationId,
        },
      }),
      db.member.findFirst({
        where: {
          organizationId: project.organizationId,
          userId,
        },
      }),
    ]);

    // If user has no specific project restrictions, check org membership
    if (projectAccess.length === 0 && member) {
      return true; // Org members have full access
    }

    // If user has project restrictions, check if they have access to this project
    return projectAccess.find((item) => item.projectId === projectId);
  } catch (err) {
    return false; // Fail secure
  }
}

// Cached version for performance
export const getProjectAccessCached = cacheable(getProjectAccess, 60 * 5);
```

**Logic Breakdown**:
1. **Validates project exists**: If project doesn't exist or has no organization, deny
2. **Two-level access model**:
   - No restrictions: All organization members can access all projects
   - With restrictions: Only explicitly listed projects are accessible
3. **Fail secure**: Returns false on any error
4. **Caches for 5 minutes**: Balances performance with consistency

#### Level 2: Organization Access

```typescript
export async function getOrganizationAccess({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  return db.member.findFirst({
    where: {
      userId,
      organizationId,
    },
  });
}
```

Returns the member record with role (org:admin, org:member, etc.)

#### Level 3: Client Access

```typescript
export async function getClientAccess({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}) {
  const client = await db.client.findFirst({ where: { id: clientId } });
  if (!client) return false;

  // Check project-level access
  if (client.projectId) {
    return getProjectAccess({ userId, projectId: client.projectId });
  }

  // Check organization-level access
  if (client.organizationId) {
    return getOrganizationAccess({ userId, organizationId: client.organizationId });
  }

  return false;
}
```

**Key Pattern**: Clients can belong to projects OR organizations, so access is polymorphic.

---

## 4. SERVER FUNCTION PATTERNS

### Pattern: Explicit Access Checks + Data Fetching

**OpenPanel Location**: `/packages/trpc/src/routers/organization.ts` (lines 37-58)

```typescript
update: protectedProcedure
  .input(zEditOrganization)
  .mutation(async ({ input, ctx }) => {
    // 1. Check user is org admin
    const access = await getOrganizationAccess({
      userId: ctx.session.userId,
      organizationId: input.id,
    });

    if (access?.role !== 'org:admin') {
      throw TRPCAccessError('You do not have access to this project');
    }

    // 2. Only after validation, modify data
    return db.organization.update({
      where: { id: input.id },
      data: {
        name: input.name,
        timezone: input.timezone,
      },
    });
  }),
```

**Best Practices**:
1. Always check access BEFORE querying/modifying data
2. Validate role if needed (e.g., org:admin for destructive operations)
3. Use Zod for input validation
4. Return errors, don't log & swallow them

---

## 5. DATA LAYER SECURITY

### Pattern: Query-Level Scoping

**OpenPanel Location**: `/packages/db/src/services/organization.service.ts` (lines 18-35)

```typescript
export async function getOrganizations(userId: string | null) {
  if (!userId) return [];

  // Always scope by user's membership
  const organizations = await db.organization.findMany({
    where: {
      members: {
        some: {
          userId, // User must be a member
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return organizations;
}
```

**Key Insight**: Queries always filter by user/organization context - never return "all records".

### Pattern: Validating Relationships

**OpenPanel Location**: `/packages/trpc/src/routers/dashboard.ts` (lines 52-83)

```typescript
create: protectedProcedure
  .input(z.object({
    name: z.string(),
    projectId: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Check user can access project
    const access = await getProjectAccess({
      projectId: input.projectId,
      userId: ctx.session.userId,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this project');
    }

    // 2. Fetch project to get its organization
    const project = await getProjectById(input.projectId);
    if (!project) {
      throw TRPCNotFoundError('Project not found');
    }

    // 3. Create dashboard with both projectId AND organizationId
    // (This ensures data integrity - dashboard can't orphan from org)
    return db.dashboard.create({
      data: {
        id: await getId('dashboard', input.name),
        projectId: input.projectId,
        organizationId: project.organizationId, // Derived from project
        name: input.name,
      },
    });
  }),
```

**Security Pattern**: When creating child records (dashboard → project → organization):
1. Validate access to the parent (project)
2. Fetch the parent to get its parent (organization)
3. Store both references in the child record

This prevents bypassing authorization by fabricating organization IDs.

---

## 6. SESSION VALIDATION

**OpenPanel Location**: `/packages/auth/src/session.ts`

```typescript
export async function validateSessionToken(
  token: string | null,
): Promise<SessionValidationResult> {
  if (process.env.DEMO_USER_ID) {
    return createDemoSession(process.env.DEMO_USER_ID);
  }

  if (!token) {
    return EMPTY_SESSION;
  }

  // Hash token before lookup (security)
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  
  const result = await db.$primary().session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (result === null) {
    return EMPTY_SESSION;
  }

  const { user, ...session } = result;

  // Check expiration
  if (Date.now() >= session.expiresAt.getTime()) {
    await db.session.delete({ where: { id: sessionId } });
    return EMPTY_SESSION;
  }

  // Extend session if needed
  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: session.expiresAt },
    });
  }

  return { session, user, userId: user.id };
}
```

**Key Features**:
1. Token is hashed before database lookup (prevents timing attacks)
2. Sessions are validated and extended on each request
3. Expired sessions are deleted immediately
4. Returns empty session on any error (fail secure)

---

## 7. COMPARISON: OPENSCAN VS OPENPANEL

### Route-Level Validation

| Aspect | OpenPanel | OpenScan | Gap |
|--------|-----------|----------|-----|
| Static file blocking | ✅ Explicit list in beforeLoad | ❌ Not implemented | Need to add FILE_EXTENSIONS check |
| Reserved ID blocking | ✅ IGNORE_ORGANIZATION_IDS | ✅ RESERVED_PROJECT_IDS | Partial (only at project level) |
| Access check in loader | ✅ Calls TRPC to prefetch | ❌ Placeholder TODO | Critical - need actual validation |
| Organization→Project validation | ✅ Implicit via TRPC | ❌ Not validated | **CRITICAL GAP** |

### TRPC Middleware

| Aspect | OpenPanel | OpenScan | Status |
|--------|-----------|----------|--------|
| Auth enforcement | ✅ enforceUserIsAuthed | ❌ No TRPC setup | Not applicable (uses queries directly) |
| Access enforcement | ✅ enforceAccess middleware | N/A | N/A |
| Field-based validation | ✅ has('projectId') pattern | N/A | N/A |
| Caching | ✅ 5-min TTL cache | ❌ No caching | Need caching layer |

### Data Layer

| Aspect | OpenPanel | OpenScan | Gap |
|--------|-----------|----------|-----|
| Scoped queries | ✅ User/org context | ⚠️ Partial | Missing explicit org scope |
| Relationship validation | ✅ Parent→child checks | ❌ Not implemented | Need to validate project→org |
| Derived fields | ✅ Fetches org from project | ❌ Manual passing | Risk of ID spoofing |

---

## 8. CRITICAL GAPS IN OPENSCAN

### Gap 1: Project→Organization Validation

**Risk Level**: CRITICAL

Current code in `_app.$organizationId.$projectId.tsx`:
```typescript
loader: async ({ params }) => {
  // TODO: Validate project exists and belongs to organization
  // TODO: Validate user has access to project
  // For now, just pass through params
```

**OpenPanel Pattern**:
```typescript
// Validate in router when accessing resources
const project = await getProjectById(input.projectId);
if (project.organizationId !== expectedOrgId) {
  throw TRPCAccessError('Project not in this organization');
}
```

**Action Items**:
1. Create `validateProjectBelongsToOrganization()` function in data-ops
2. Call it in route loader and all TRPC procedures
3. Prevent user from accessing `/{org-a}/{project-from-org-b}`

### Gap 2: No Automatic TRPC Validation

**Risk Level**: HIGH

OpenScan uses direct queries instead of TRPC, so middleware validation is N/A. But this means:
- No automatic projectId/organizationId validation
- Access checks must be manual in every query function
- Easy to accidentally forget a check

**OpenPanel Pattern**: Use TRPC protected procedures with middleware.

**Action Items** (if staying with direct queries):
1. Create a wrapper function: `validateProjectAccess(userId, projectId, organizationId)`
2. Call it in EVERY query that touches project/organization data
3. Consider migrating to TRPC for consistency

### Gap 3: No Access Caching

**Risk Level**: MEDIUM

Every query hits the database to check access. OpenPanel caches for 5 minutes.

**Action Items**:
1. Add Redis caching layer using `@repo/redis`
2. Cache access checks with 5-minute TTL
3. Invalidate on membership changes

---

## 9. IMPLEMENTATION RECOMMENDATIONS

### For Immediate Security

1. **Add project→organization validation**
   ```typescript
   // src/server/device-queries.ts
   export async function validateProjectAccess(
     userId: string,
     projectId: string,
     organizationId: string,
   ) {
     const access = await getProjectAccess({ userId, projectId });
     if (!access) {
       throw new Error('No access to project');
     }

     const project = await getProjectById(projectId);
     if (project?.organizationId !== organizationId) {
       throw new Error('Project not in organization');
     }
   }
   ```

2. **Use in route loader**
   ```typescript
   loader: async ({ params, context }) => {
     // Validate project belongs to org
     const project = await getProjectById(params.projectId);
     if (project?.organizationId !== params.organizationId) {
       throw notFound();
     }

     const userId = await getCurrentUserId(); // from auth
     const access = await getProjectAccess({ userId, projectId: params.projectId });
     if (!access) {
       throw redirect({ to: '/login' });
     }

     return { projectId: params.projectId };
   },
   ```

3. **Add access caching**
   ```typescript
   import { cacheable } from '@repo/redis';

   const getProjectAccessCached = cacheable(getProjectAccess, 60 * 5);
   ```

### For Long-Term Architecture

1. **Consider TRPC for unified validation**
   - Moves all authorization to middleware
   - Prevents developer mistakes
   - Cleaner code

2. **Implement role-based access control**
   - Follow OpenPanel's member.role pattern
   - Support org:admin, org:member roles
   - Check role for destructive operations

3. **Add analytics tracking**
   - Log failed access attempts
   - Monitor for suspicious patterns
   - Track who accesses what data

---

## 10. SECURITY CHECKLIST

When adding new routes/queries, verify:

- [ ] Route parameters validated in `beforeLoad` (static checks)
- [ ] Access validated in `loader` (calls to data layer)
- [ ] All mutations require role check (not just access)
- [ ] Child resources validate parent relationship (project→org)
- [ ] Error messages don't leak information (generic "unauthorized")
- [ ] No user input directly used in queries (always use Zod validation)
- [ ] Results are scoped to user's organization (never return all records)
- [ ] Demo mode is respected (no mutations in demo)
- [ ] Caching considered for performance (but not at expense of security)
- [ ] Analytics tracked for audit trail

---

## 11. REFERENCE CODE LOCATIONS

### OpenPanel

| File | Lines | Purpose |
|------|-------|---------|
| `packages/trpc/src/access.ts` | 1-94 | Access control functions |
| `packages/trpc/src/trpc.ts` | 83-164 | Middleware implementation |
| `packages/trpc/src/routers/organization.ts` | 37-58 | Example access checks |
| `packages/trpc/src/routers/dashboard.ts` | 52-83 | Example relationship validation |
| `packages/auth/src/session.ts` | 62-101 | Session validation |
| `apps/start/src/routes/_app.$organizationId.tsx` | 36-54 | Route validation pattern |

### OpenScan

| File | Purpose | Status |
|------|---------|--------|
| `src/routes/_app.$organizationId.$projectId.tsx` | Project layout | Needs access validation |
| `src/routes/_app.$organizationId.$projectId.assets.tsx` | Assets page | Uses device queries |
| `src/queries/device-queries.ts` | Device queries | Needs explicit org scope |

---

## Summary

OpenPanel's security model relies on:

1. **Multiple validation layers**: Route → TRPC → Data layer
2. **Automatic middleware validation**: Can't bypass auth checks
3. **Fail-secure defaults**: Deny by default, grant when proven safe
4. **Relationship validation**: Child resources validate parent context
5. **Caching for performance**: But only non-security-critical data
6. **Comprehensive access control**: Organizations → Projects → Resources

OpenScan needs to implement similar patterns, especially:
- Project→Organization validation (CRITICAL)
- Access caching for performance
- Role-based checks for mutations
- Consistent scope checking in all queries

