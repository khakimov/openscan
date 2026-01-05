# SSR + tRPC Patterns: Avoiding 522 Timeouts

**Last Updated:** 2025-11-20
**Related:** TanStack Start + Cloudflare Workers + tRPC

## Overview

When running TanStack Start on Cloudflare Workers, **tRPC queries cannot be used during SSR** because they cause the Worker to make HTTP requests to itself, resulting in 522 timeouts. This document explains when and why this happens, and how to use `createServerFn` as the correct alternative.

---

## Visual Schema: SSR vs Client-Side

### ❌ SCENARIO 1: SSR with tRPC - PROBLEMATIC

```
Browser Request
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (Your App)                                    │
│                                                                  │
│  1. Request hits route /_app/$org/$proj/servers/discovery       │
│  2. Route beforeLoad executes (SSR context)                     │
│  3. Code calls: context.trpc.organization.list.queryOptions()   │
│     │                                                            │
│     ├─> ❌ Makes HTTP to: https://sec.rocks/api/trpc/org.list  │
│     │                                                            │
│     └─> 💥 SELF-LOOP: Worker tries to HTTP to itself!          │
│         Cloudflare timeout: 522 error after 10 seconds          │
│                                                                  │
│  Result: Request fails, user sees error                         │
└──────────────────────────────────────────────────────────────────┘
```

**Error logs:**
```javascript
{
  url: 'https://sec.rocks/api/trpc/organization.list?batch=1&input=...',
  status: 522,
  contentType: 'text/html; charset=UTF-8'
}
```

---

### ✅ SCENARIO 2: SSR with createServerFn - CORRECT

```
Browser Request
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (Your App)                                    │
│                                                                  │
│  1. Request hits route __root.tsx                               │
│  2. beforeLoad calls: await fetchSession()                      │
│  3. fetchSession is createServerFn - executes IN-PROCESS        │
│     │                                                            │
│     ├─> ✅ Direct function call (no HTTP)                       │
│     │   getCurrentUser() → getAuth() → DB query                 │
│     │                                                            │
│     └─> Returns { session: {...} } instantly                    │
│                                                                  │
│  4. Renders HTML with session data                              │
│  5. Sends HTML to browser                                       │
│                                                                  │
│  Result: Fast, no HTTP loop ✅                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Success logs:**
```javascript
{
  url: 'https://sec.rocks/_serverFn/REDACTED?createServerFn',
  status: 200,
  isSSR: true
}
```

---

### ✅ SCENARIO 3: Client-Side Navigation - BOTH WORK

```
Browser (already has loaded app)
    │
    ▼
User clicks link → TanStack Router navigation
    │
    ├─> Route beforeLoad executes IN BROWSER
    │
    ├─> Option A: tRPC query
    │   └─> HTTP to https://sec.rocks/api/trpc/... ✅
    │       (External HTTP from browser is fine)
    │
    └─> Option B: createServerFn
        └─> HTTP to https://sec.rocks/_serverFn/... ✅
            Worker executes function, returns result
```

---

## When 522 Errors Happen

### ❌ Case 1: tRPC in Route Loaders/beforeLoad (SSR)

```typescript
// ❌ CAUSES 522 TIMEOUT
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // During SSR: Worker tries to HTTP to itself
    const orgs = await context.queryClient.ensureQueryData(
      context.trpc.organization.list.queryOptions()  // 💥 522!
    );
  }
});
```

**Why it fails:**
- `beforeLoad` runs during SSR (inside the Worker)
- tRPC client makes HTTP to `https://sec.rocks/api/trpc/...`
- Worker cannot HTTP to itself → Cloudflare timeout → 522

---

### ❌ Case 2: tRPC in Server Components (SSR)

```typescript
// ❌ CAUSES 522 TIMEOUT
export default async function ServerComponent() {
  // During SSR: Worker tries to HTTP to itself
  const devices = await trpc.device.list.query({...});  // 💥 522!

  return <div>{devices.length} devices</div>;
}
```

---

### ❌ Case 3: tRPC in getRouter() Initialization

```typescript
// ❌ CAUSES 522 TIMEOUT
export const getRouter = async () => {
  // During SSR initialization
  const session = await trpcClient.auth.session.query();  // 💥 522!

  return createRouter({
    context: { session },
    // ...
  });
};
```

---

## Solution: Use createServerFn for SSR

### ✅ Pattern 1: Session Fetching

```typescript
// src/routes/__root.tsx

import { createServerFn } from '@tanstack/react-start';
import { getCurrentUser } from '@/server/utils/auth';

/**
 * Fetch session on both SSR and client-side navigation
 * During SSR: Executes directly in worker (has access to getRequest())
 * During client nav: Makes HTTP to /_serverFn/... endpoint
 */
const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await getCurrentUser();
    return {
      session: {
        user,
        activeOrganizationId: user.organizationId,
      },
    };
  } catch {
    return { session: null };
  }
});

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await fetchSession();  // ✅ Direct call during SSR
    return { session };
  },
});
```

---

### ✅ Pattern 2: Organization Listing

```typescript
// src/server/organization.ts

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getAuth } from '@repo/data-ops/auth/server';
import { getOrganizationAPI } from '@repo/data-ops/auth/organization-api';

/**
 * List all organizations for the current user (SSR-safe)
 */
export const listOrganizations = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const auth = getAuth();
  const orgAPI = getOrganizationAPI(auth);

  const result = await orgAPI.listOrganizations({
    headers: request.headers,
  });

  return result ?? [];
});
```

**Usage in route:**
```typescript
// src/routes/index.tsx

import { listOrganizations } from '@/server/organization';

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (!context.session?.session) return;

    // ✅ Uses createServerFn - no HTTP during SSR
    const organizations = await listOrganizations();

    if (organizations.length === 0) {
      throw redirect({ to: "/onboarding" });
    }
  },
});
```

---

### ✅ Pattern 3: Project Listing

```typescript
// src/server/project.ts

import { createServerFn } from '@tanstack/react-start';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getProjectsForOrganization } from '@repo/data-ops';
import { env } from 'cloudflare:workers';

export const listProjects = createServerFn({ method: 'GET' })
  .inputValidator((organizationId: string) => organizationId)
  .handler(async ({ data: organizationId }) => {
    // ✅ Initialize DB with Worker binding (required for SSR)
    initDatabase(env.DB);

    // ✅ Use existing data-ops query
    const projects = await getProjectsForOrganization(organizationId);
    return projects;
  });
```

---

## Decision Matrix: When to Use What

| Context | tRPC Query | createServerFn |
|---------|-----------|----------------|
| **SSR (Worker)** | ❌ 522 timeout (HTTP loop) | ✅ Direct call (in-process) |
| **Client Navigation** | ✅ HTTP to `/api/trpc` | ✅ HTTP to `/_serverFn` |
| **Component (Browser)** | ✅ HTTP to `/api/trpc` | ✅ HTTP to `/_serverFn` |
| **useQuery in component** | ✅ Preferred | ⚠️ Works but overkill |
| **Route loader/beforeLoad** | ❌ Never | ✅ Always |

---

## Detection Rules

### 1. If code runs in route `beforeLoad`/`loader` → Use `createServerFn`

```typescript
// ✅ CORRECT
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const data = await myServerFunction();  // createServerFn
  }
});
```

### 2. If code runs in component `useQuery` → tRPC is fine

```typescript
// ✅ CORRECT
function MyComponent() {
  const { data } = useQuery(
    trpc.device.list.queryOptions({ projectId })  // tRPC
  );
}
```

### 3. If `typeof window === 'undefined'` → Use `createServerFn`

```typescript
// ✅ CORRECT
if (typeof window === 'undefined') {
  // SSR context - use createServerFn
  const data = await serverFunction();
}
```

---

## Debugging 522 Timeouts

### Quick Test: Check Logs During Page Load

**✅ Working correctly:**
```javascript
// You'll see serverFn calls during SSR
[fetchSession serverFn] {
  isSSR: true,
  user: { id: '...', email: '...' }
}

[listOrganizations serverFn] {
  count: 1,
  isSSR: true
}
```

**❌ HTTP loop detected:**
```javascript
// You'll see tRPC failures
tRPC fetch failure {
  url: 'https://sec.rocks/api/trpc/organization.list?batch=1&input=...',
  status: 522,
  contentType: 'text/html; charset=UTF-8'
}
```

### Search Logs for Problems

```bash
# Find 522 timeouts in production
wrangler tail --format json | grep "522"

# Find tRPC failures
wrangler tail | grep "tRPC fetch failure"

# Confirm serverFn usage
wrangler tail | grep "serverFn"
```

---

## Migration Checklist

When converting tRPC calls to `createServerFn`:

- [ ] Create server function in `src/server/` directory
- [ ] Use `getRequest()` from `@tanstack/react-start/server` for auth
- [ ] Initialize DB with `env.DB` binding if needed
- [ ] Export server function from module
- [ ] Import and call server function in route `beforeLoad`
- [ ] Remove tRPC query from route loader
- [ ] Keep tRPC in components for client-side fetching
- [ ] Test SSR: Check logs for `isSSR: true`
- [ ] Test client nav: Verify `/_serverFn/...` calls in network tab
- [ ] Verify no 522 errors in production logs

---

## Real-World Examples

### Example 1: Landing Page Organization Redirect

**Before (❌ 522 timeout):**
```typescript
// src/routes/index.tsx
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const orgs = await context.queryClient.ensureQueryData(
      context.trpc.organization.list.queryOptions()  // 💥 522!
    );

    if (orgs.length === 0) {
      throw redirect({ to: "/onboarding" });
    }
  },
});
```

**After (✅ Works):**
```typescript
// src/routes/index.tsx
import { listOrganizations } from '@/server/organization';

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const orgs = await listOrganizations();  // ✅ Server function

    if (orgs.length === 0) {
      throw redirect({ to: "/onboarding" });
    }
  },
});
```

---

### Example 2: Root Session Loading

**Before (❌ 522 timeout):**
```typescript
// src/routes/__root.tsx
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    if (typeof window === 'undefined') {
      return { session: context.session };  // Undefined during SSR
    }

    const session = await context.queryClient.ensureQueryData(
      context.trpc.auth.session.queryOptions()  // Works on client, 522 on SSR
    );

    return { session };
  },
});
```

**After (✅ Works):**
```typescript
// src/routes/__root.tsx
import { createServerFn } from '@tanstack/react-start';
import { getCurrentUser } from '@/server/utils/auth';

const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await getCurrentUser();
    return { session: { user, activeOrganizationId: user.organizationId } };
  } catch {
    return { session: null };
  }
});

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await fetchSession();  // ✅ Works on SSR and client
    return { session };
  },
});
```

---

## Related Documentation

- [TanStack Start Official Docs](https://tanstack.com/start)
- [TanStack Start Cloudflare Example](https://github.com/TanStack/router/tree/main/examples/react/start-basic-cloudflare)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Project CLAUDE.md - Data-Ops Architecture](../../../CLAUDE.md#data-ops-package-architecture)

---

## Key Takeaways

1. **Never use tRPC queries in route loaders/beforeLoad** - They cause 522 timeouts during SSR
2. **Always use `createServerFn` for SSR data fetching** - It executes in-process without HTTP
3. **tRPC is fine in client components** - External HTTP from browser works correctly
4. **Check logs for `isSSR: true`** - Confirms server functions are working during SSR
5. **Watch for 522 errors** - Indicates HTTP self-loop from tRPC in SSR context
