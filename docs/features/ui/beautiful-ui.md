# Beautiful UI: Optimistic Updates & Smooth Rendering

This document provides patterns and solutions for creating a smooth, responsive UI experience in OpenScan using TanStack Start best practices.

## Table of Contents

1. [Core Principles](#core-principles)
2. [Temporary UI States vs Data Optimism](#temporary-ui-states-vs-data-optimism) ⭐ NEW
3. [Current Problems & Solutions](#current-problems--solutions)
4. [Optimistic UI Patterns](#optimistic-ui-patterns)
5. [SSR & Navigation](#ssr--navigation)
6. [Loading States & Transitions](#loading-states--transitions)
7. [Universal Solutions](#universal-solutions)
8. [Implementation Checklist](#implementation-checklist)

---

## Core Principles

### The Three Rules of Smooth UI

1. **Optimistic First**: Update UI immediately, sync with server in background
2. **Cache Consistency**: Always cancel in-flight queries before optimistic updates
3. **Predictable Transitions**: Use loading states with delays to prevent flashing

### Key TanStack Start Capabilities

```typescript
// ✅ We already have these configured in router.tsx
const router = createRouter({
  defaultPreload: 'intent',              // Preload on hover/focus
  setupRouterSsrQueryIntegration,        // SSR + hydration
  context: { queryClient },              // Query context
})
```

**What we're missing:** Optimistic updates in mutations.

---

## Temporary UI States vs Data Optimism

### ⚠️ Critical Distinction

**DO NOT confuse these two patterns:**

| Concern | Where to Store | Lifetime | Example |
|---------|---------------|----------|---------|
| **Data Optimism** | React Query cache | Until server confirms | Creating a new device |
| **UI Effects** | Component state | Fixed duration (e.g., 3s) | Highlighting newly added items |

### ❌ Wrong Pattern: UI State in Cache

```typescript
// ❌ WRONG - Polluting cache with UI metadata
queryClient.setQueryData(['devices'], (old) => ({
  ...old,
  items: [
    {
      id: 'temp-123',
      name: 'New Device',
      _optimistic: true,  // ⬅️ UI state doesn't belong in data!
    },
    ...old.items
  ]
}));
```

**Problems:**
- Cache is for data, not UI state
- Requires complex cleanup logic
- Mixes concerns (data vs presentation)
- Type pollution (`_optimistic` in data types)

### ✅ Correct Pattern: Component State for UI

```typescript
// ✅ CORRECT - UI state in component
function DeviceList() {
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const mutation = useCreateDevicesMutation();

  const handleAdd = () => {
    mutation.mutate(data, {
      onSuccess: (response) => {
        // Track IDs for animation
        setNewlyAddedIds(new Set(response.devices.map(d => d.id)));

        // Auto-clear after animation
        setTimeout(() => setNewlyAddedIds(new Set()), 3000);
      }
    });
  };

  return devices.map(device => (
    <DeviceCard
      device={device}
      isNewlyAdded={newlyAddedIds.has(device.id)}  // ⬅️ Prop, not data
    />
  ));
}
```

### When to Use Each Pattern

**Use React Query Cache (Data Optimism):**
- ✅ Creating/updating/deleting data
- ✅ Temporary IDs until server responds
- ✅ Bridging the gap before server confirmation
- ✅ Data that affects queries and filters

**Use Component State (UI Effects):**
- ✅ Animations and transitions
- ✅ Highlighting newly added items
- ✅ Temporary visual indicators
- ✅ Time-based effects (fade out, pulse, etc.)

### Real Example: TanStack Trellaux

**How they handle "newly added" state:**

```typescript
// From: start-trellaux/src/components/Board.tsx
const newColumnAddedRef = useRef(false);  // ⬅️ Component state!

const columnRef = useCallback((node: HTMLElement | null) => {
  if (scrollContainerRef.current && newColumnAddedRef.current) {
    newColumnAddedRef.current = false;
    scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
  }
}, []);

// Mutation only updates data, not UI state
<NewColumn
  onNewColumnAdded={() => {
    newColumnAddedRef.current = true;  // ⬅️ UI flag set via callback
  }}
/>
```

**Key insights:**
- Cache has data only
- `newColumnAddedRef` tracks UI state
- Ref callback handles scroll effect
- No `_optimistic` or `_isNew` in cache data

### Implementation: Newly Added Device Animation

**Step 1: Parent component tracks animation state**

```typescript
// apps/user-application/src/routes/_auth/assets.tsx
function Assets() {
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const handleDevicesAdded = (deviceIds: string[]) => {
    setNewlyAddedIds(new Set(deviceIds));
    setTimeout(() => setNewlyAddedIds(new Set()), 3000);
  };

  return (
    <DeviceDetailSheet
      devices={devices}
      newlyAddedIds={newlyAddedIds}  // ⬅️ Pass down
    />
  );
}
```

**Step 2: Modal calls callback with device IDs**

```typescript
// apps/user-application/src/modals/AddDiscovery.tsx
interface AddDiscoveryProps {
  onDevicesAdded?: (deviceIds: string[]) => void;
}

const handleAddDevices = () => {
  addDevicesMutation.mutate({ targets }, {
    onSuccess: (response) => {
      popModal("AddDiscovery");

      // Notify parent of new device IDs
      if (onDevicesAdded && response.devices) {
        onDevicesAdded(response.devices.map(d => d.id));
      }
    }
  });
};
```

**Step 3: Components receive animation prop**

```typescript
// apps/user-application/src/features/assets/components/device-card.tsx
interface DeviceCardProps {
  device: TransformedDevice;
  isNewlyAdded?: boolean;  // ⬅️ Prop, not data field
}

export function DeviceCard({ device, isNewlyAdded = false }: DeviceCardProps) {
  return (
    <div className={isNewlyAdded ? "animate-new-device-border" : ""}>
      {/* Card content */}
    </div>
  );
}
```

**Step 4: Mutation stays clean (data only)**

```typescript
// apps/user-application/src/queries/device-queries.ts
export const useCreateDevicesFromDiscoveryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDevicesFromDiscovery,

    onMutate: async (variables) => {
      // Only data, no UI metadata!
      queryClient.setQueryData(['devices'], (old) => ({
        ...old,
        items: [
          ...variables.targets.map(t => ({
            id: `temp-${Date.now()}`,
            name: t.host,
            // ... data fields only, no _optimistic!
          })),
          ...old.items
        ]
      }));
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    }
  });
};
```

### Summary: The Golden Rule

**Cache = Source of truth for DATA**
**State = Source of truth for TEMPORARY UI EFFECTS**

Never mix these concerns!

---

## Current Problems & Solutions

### Problem 1: Device Card Scanning Status Flickers

**Location:** `apps/user-application/src/features/assets/components/device-card.tsx`

**Current Flow:**
```
User clicks "Scan"
  ↓
scanMutation.isPending = true → Shows "Scanning..."
  ↓
Server responds "scan started"
  ↓
scanMutation.isPending = false → Shows "Not Scanning" ⚠️ FLICKER
  ↓
Database polling picks up scan (30s interval)
  ↓
isScanning = true → Shows "Scanning..." again
```

**The Gap:** There's a ~1-2 second gap between mutation completing and polling picking up the database scan.

#### Solution: Optimistic Cache Update

**File:** `apps/user-application/src/queries/device-queries.ts`

```typescript
export const useStartDeviceScanMutation = (deviceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['devices', 'scan', deviceId],
    mutationFn: (data: { deviceId: string; target: string; preset: string }) =>
      startDeviceScan({ data }),

    // NEW: Optimistic update
    onMutate: async (variables) => {
      // 1. Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({
        queryKey: deviceQueries.activeScans(deviceId).queryKey
      });

      // 2. Snapshot previous value for rollback
      const previousScans = queryClient.getQueryData(
        deviceQueries.activeScans(deviceId).queryKey
      );

      // 3. Optimistically update cache with temporary scan
      queryClient.setQueryData(
        deviceQueries.activeScans(deviceId).queryKey,
        (old: any[] = []) => [
          ...old,
          {
            id: `temp-${Date.now()}`, // Temporary ID
            deviceId: variables.deviceId,
            target: variables.target,
            status: 'PENDING',
            startedAt: new Date().toISOString(),
          }
        ]
      );

      // 4. Return context for rollback
      return { previousScans };
    },

    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousScans) {
        queryClient.setQueryData(
          deviceQueries.activeScans(deviceId).queryKey,
          context.previousScans
        );
      }
    },

    onSuccess: () => {
      // Invalidate to sync with real database scan
      queryClient.invalidateQueries({
        queryKey: deviceQueries.activeScans(deviceId).queryKey
      });
    },
  });
};
```

**Result:** UI shows "Scanning..." immediately and stays that way until scan completes.

---

### Problem 2: Add Discovery Modal Has Lag

**Location:** `apps/user-application/src/modals/AddDiscovery.tsx`

**Current Flow:**
```
User clicks "Add Targets"
  ↓
Server creates devices
  ↓
onSuccess: await refetchQueries() ⚠️ USER WAITS
  ↓
Modal closes (finally!)
  ↓
Device list re-renders
```

**The Problem:** User waits for refetch to complete (~500-1000ms) before modal closes.

#### Solution: Close Immediately + Optimistic Updates (Data Only!)

**File:** `apps/user-application/src/queries/device-queries.ts`

```typescript
export const useCreateDevicesFromDiscoveryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['devices', 'create-from-discovery'],
    mutationFn: (data: {
      targets: Array<{ host: string; ip?: string }>;
    }) => createDevicesFromDiscovery({ data }),

    // Optimistic update - DATA ONLY (no UI metadata)
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['devices'] });
      const previousDevices = queryClient.getQueryData(['devices']);

      queryClient.setQueryData(['devices', undefined], (old: any) => {
        if (!old?.items) return old;

        // Create temporary device objects (data fields only!)
        const tempDevices = variables.targets.map((target, index) => ({
          id: `temp-${Date.now()}-${index}`,
          name: target.host,
          ip: target.ip || 'Resolving...',
          status: 'offline',
          riskLevel: 'UNKNOWN',
          verificationStatus: 'CANDIDATE',
          tags: ['discovery', 'subdomain'],
          isScanned: false,
          discoveredOn: new Date().toISOString(),
          // ✅ NO _optimistic flag - that's UI state, not data!
        }));

        return {
          ...old,
          items: [...tempDevices, ...old.items],
          totalItems: old.totalItems + tempDevices.length,
        };
      });

      return { previousDevices };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousDevices) {
        queryClient.setQueryData(['devices'], context.previousDevices);
      }
    },

    onSuccess: () => {
      // Invalidate to sync with real data (happens in background)
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};
```

**File:** `apps/user-application/src/modals/AddDiscovery.tsx`

```typescript
interface AddDiscoveryProps {
  onDevicesAdded?: (deviceIds: string[]) => void; // ⬅️ Callback for UI state
}

const handleAddDevices = () => {
  // ... validation ...

  addDevicesMutation.mutate(
    { targets: targetsData },
    {
      onSuccess: (response) => {
        // Close modal immediately (no await!)
        popModal("AddDiscovery");

        // Show toast
        toast.success("Devices created successfully", {
          description: `${response.count} device${response.count !== 1 ? 's' : ''} added to inventory`,
        });

        // Notify parent for animation (UI state in component)
        if (onDevicesAdded && response.devices) {
          onDevicesAdded(response.devices.map(d => d.id));
        }
      },
      onError: (error: any) => {
        toast.error("Failed to create devices");
      },
    }
  );
};
```

**Result:** Modal closes instantly, devices appear immediately (optimistic data), animation handled separately by component state.

---

### Problem 3: Navigation Feels Laggy

**Symptoms:**
- Clicking links shows loading state too long
- Page feels "stuck" during navigation
- Content flashes or jumps

**Root Causes:**
1. Routes not using `ensureQueryData` in loaders
2. Components not using `useSuspenseQuery`
3. No `pendingComponent` on routes

#### Solution: Proper SSR Data Flow

**Pattern for Route Files:**

```typescript
// apps/user-application/src/routes/_auth/assets.tsx

import { createFileRoute } from '@tanstack/react-router';
import { deviceQueries } from '@/queries/device-queries';

export const Route = createFileRoute('/_auth/assets')({
  // 1. Loader: Prefetch data on server + client navigation
  loader: async ({ context: { queryClient } }) => {
    // ensureQueryData will:
    // - Fetch on server during SSR
    // - Return cached data if available
    // - Fetch if stale or missing
    await queryClient.ensureQueryData(deviceQueries.list());
  },

  // 2. Pending component: Show during navigation
  pendingComponent: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  ),

  // 3. Component: Use cached data
  component: AssetsPage,
});

function AssetsPage() {
  // useSuspenseQuery uses cached data from loader
  // No loading state - data is already available!
  const { data } = useSuspenseQuery(deviceQueries.list());

  return <DeviceList devices={data.items} />;
}
```

**Benefits:**
- SSR: Data loads on server, HTML includes content
- Client navigation: Data prefetches on link hover/focus
- No loading spinner on fast navigations
- `pendingComponent` only shows for slow navigation

---

## Optimistic UI Patterns

### Pattern 1: Mutation with Optimistic Update

```typescript
export const useMyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: myServerFunction,

    onMutate: async (variables) => {
      // Step 1: Cancel refetches (prevent race conditions)
      await queryClient.cancelQueries({ queryKey: ['myData'] });

      // Step 2: Snapshot previous value (for rollback)
      const previous = queryClient.getQueryData(['myData']);

      // Step 3: Optimistically update cache
      queryClient.setQueryData(['myData'], (old) => {
        // Your optimistic logic here
        return { ...old, /* updated data */ };
      });

      // Step 4: Return context for error handling
      return { previous };
    },

    onError: (err, variables, context) => {
      // Rollback to previous value
      if (context?.previous) {
        queryClient.setQueryData(['myData'], context.previous);
      }
    },

    onSuccess: () => {
      // Sync with server (happens in background)
      queryClient.invalidateQueries({ queryKey: ['myData'] });
    },
  });
};
```

### Pattern 2: Reading Optimistic State in Components

```typescript
function MyComponent() {
  const mutation = useMyMutation();
  const { data } = useQuery(myQueries.something());

  // Show optimistic value while mutation is pending
  const displayValue = mutation.isPending && mutation.variables?.newValue
    ? mutation.variables.newValue
    : data.value;

  return <div>{displayValue}</div>;
}
```

### Pattern 3: Optimistic Delete

```typescript
// Already implemented in device-queries.ts!
export const useDeleteDeviceMutation = () => {
  const queryClient = useQueryClient();

  const optimistic = createOptimisticDeleteHandlers([
    ['devices'], // Update all device list queries
  ]);

  return useMutation({
    mutationFn: deleteDevice,
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) =>
      optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};
```

---

## SSR & Navigation

### Current Router Config ✅

```typescript
// apps/user-application/src/router.tsx
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',              // ✅ Preload on hover/focus
    Wrap: TanStackQueryProvider,          // ✅ Query context
  });

  setupRouterSsrQueryIntegration({        // ✅ SSR integration
    router,
    queryClient,
  });

  return router;
};
```

### Pattern: Global Loading Indicator

**Create:** `apps/user-application/src/components/shared/loading-indicator.tsx`

```typescript
import { useRouterState } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

export function GlobalLoadingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });

  return (
    <div
      className={`fixed top-0 left-0 right-0 h-1 transition-all duration-300 ${
        isLoading ? 'opacity-100 delay-300' : 'opacity-0 delay-0'
      }`}
    >
      {/* Linear progress bar */}
      <div className="h-full bg-blue-500 animate-pulse" />
    </div>
  );
}
```

**Add to root layout:** `apps/user-application/src/routes/__root.tsx`

```typescript
export const Route = createRootRoute({
  component: () => (
    <>
      <GlobalLoadingIndicator />
      <Outlet />
    </>
  ),
});
```

**Key technique:** `delay-300` prevents loader from flashing on fast navigations.

---

## Loading States & Transitions

### Pattern 1: Mutation Button States

```typescript
function ActionButton() {
  const mutation = useMyMutation();

  return (
    <Button
      onClick={() => mutation.mutate(data)}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        'Submit'
      )}
    </Button>
  );
}
```

### Pattern 2: Skeleton Loaders for SSR

```typescript
// Show skeleton on first load, instant render on navigation
function MyPage() {
  const { data, isLoading } = useQuery(myQueries.data());

  if (isLoading) {
    return <Skeleton />;
  }

  return <Content data={data} />;
}
```

### Pattern 3: Suspense Boundaries

```typescript
// Wrap slow-loading sections in Suspense
<Suspense fallback={<Skeleton />}>
  <ExpensiveComponent />
</Suspense>

// Fast components render immediately
<QuickComponent />
```

---

## Universal Solutions

### Solution 1: Query Configuration

**File:** `packages/constants/src/query-config.ts`

```typescript
export const QUERY_CONFIG = {
  DEFAULTS: {
    // For stable data (devices, scans)
    STABLE_DATA: {
      staleTime: 30_000,           // Don't refetch for 30s
      gcTime: 5 * 60 * 1000,       // Cache for 5 min
      refetchOnWindowFocus: false, // Don't refetch on focus
      refetchOnReconnect: false,   // Don't refetch on reconnect
      retry: 1,                    // Retry once on failure
    },

    // For live data (active scans, workflow status)
    LIVE_DATA: {
      staleTime: 0,                // Always fetch fresh
      refetchInterval: 3_000,      // Poll every 3s
      refetchIntervalInBackground: false,
    },
  },
};
```

### Solution 2: Optimistic Update Helper

**Create:** `apps/user-application/src/lib/optimistic-mutations.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export function createOptimisticMutationHandlers<TData, TVariables>({
  queryKey,
  updater,
}: {
  queryKey: any[];
  updater: (old: TData | undefined, variables: TVariables) => TData;
}) {
  return {
    onMutate: async (variables: TVariables, queryClient: QueryClient) => {
      // Cancel refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot
      const previous = queryClient.getQueryData<TData>(queryKey);

      // Update
      queryClient.setQueryData<TData>(queryKey, (old) =>
        updater(old, variables)
      );

      return { previous };
    },

    onError: (
      err: any,
      variables: TVariables,
      context: any,
      queryClient: QueryClient
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },

    onSettled: (queryClient: QueryClient) => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}
```

**Usage:**

```typescript
const handlers = createOptimisticMutationHandlers({
  queryKey: ['devices'],
  updater: (old, variables) => ({
    ...old,
    items: [variables.newDevice, ...old.items],
  }),
});

const mutation = useMutation({
  mutationFn: createDevice,
  ...handlers,
});
```

### Solution 3: Smart Polling

```typescript
// Only poll when data is actively being updated
export const myQuery = queryOptions({
  queryKey: ['activeScans', deviceId],
  queryFn: () => getActiveScans(deviceId),
  refetchInterval: (query) => {
    const data = query.state.data;
    // Stop polling when no active scans
    return data?.length > 0 ? 30_000 : false;
  },
  refetchIntervalInBackground: false, // Don't poll in background tab
});
```

---

## Implementation Checklist

### Phase 1: Fix Current Issues ⚡ PRIORITY

- [ ] **DeviceCard scanning status**
  - [ ] Add `onMutate` to `useStartDeviceScanMutation`
  - [ ] Optimistically add temporary scan to cache
  - [ ] Test: Click scan → immediately shows "Scanning..." → no flicker

- [ ] **AddDiscovery modal lag**
  - [ ] Add `onMutate` to `useCreateDevicesFromDiscoveryMutation`
  - [ ] Optimistically add devices to cache
  - [ ] Remove `await refetchQueries()` from modal
  - [ ] Test: Click "Add" → modal closes instantly → devices appear immediately

- [ ] **Navigation lag**
  - [ ] Audit all routes: ensure `ensureQueryData` in loaders
  - [ ] Audit all page components: use `useSuspenseQuery` not `useQuery`
  - [ ] Add `pendingComponent` to slow routes
  - [ ] Test: Click navigation → page changes instantly

### Phase 2: Global Improvements

- [ ] **Global loading indicator**
  - [ ] Create `GlobalLoadingIndicator` component
  - [ ] Add to `__root.tsx`
  - [ ] Test: Navigation shows thin progress bar

- [ ] **Query configuration audit**
  - [ ] Review all `queryOptions` for appropriate `staleTime`
  - [ ] Add smart polling (stop when complete)
  - [ ] Disable unnecessary refetches

- [ ] **Skeleton loaders**
  - [ ] Add skeleton for device cards
  - [ ] Add skeleton for scan results
  - [ ] Add skeleton for discovery results

### Phase 3: Advanced Patterns

- [ ] **Optimistic helpers**
  - [ ] Create `createOptimisticMutationHandlers` utility
  - [ ] Refactor all mutations to use helpers
  - [ ] Add rollback error handling

- [ ] **View transitions**
  - [ ] Add `viewTransition` prop to critical links
  - [ ] Test on Chrome/Edge (native support)

- [ ] **Form improvements**
  - [ ] Use `flushSync` for focus management
  - [ ] Add auto-save on blur
  - [ ] Handle Escape key to cancel

---

## Identifying Problematic UI Areas

### Symptoms of Bad UX

1. **Flickering badges/states**
   - Cause: State transitions not optimistic
   - Fix: Add `onMutate` with cache update

2. **Modal close delay**
   - Cause: Waiting for refetch before closing
   - Fix: Close immediately, refetch in background

3. **Navigation lag**
   - Cause: No loader prefetching
   - Fix: Add `ensureQueryData` in route loader

4. **Loading spinners flash briefly**
   - Cause: Data already cached but component shows loading
   - Fix: Use `useSuspenseQuery` instead of `useQuery`

5. **Stale data on navigation**
   - Cause: Cache not invalidated after mutation
   - Fix: Add `invalidateQueries` in `onSuccess`

### Debug Checklist

Run through this checklist when you find janky UI:

1. **Is the mutation optimistic?**
   - ❌ No: User sees stale state until server responds
   - ✅ Yes: User sees update immediately

2. **Is there a loading state between actions?**
   - ❌ Yes: User waits unnecessarily
   - ✅ No: Action completes instantly

3. **Does navigation preload data?**
   - ❌ No: Page shows loading spinner
   - ✅ Yes: Page renders instantly

4. **Do quick operations show loading spinners?**
   - ❌ Yes: Spinner flashes annoyingly
   - ✅ No: Uses transition delays

---

## Reference Examples from TanStack Start

### Primary Reference: Trellaux Example

**Location:** `/Users/rus/Projects/current/sec/router/examples/react/start-trellaux/`

**Key Files:**
- `src/queries.ts` - Optimistic mutations with `onMutate`
- `src/routes/boards.$boardId.tsx` - SSR loader pattern
- `src/components/EditableText.tsx` - `flushSync` for focus
- `src/components/NewCard.tsx` - Inline form with optimistic submit
- `src/router.tsx` - Router configuration with query integration

### Other Useful Examples

- **Deferred loading:** `start-basic-react-query/src/routes/deferred.tsx`
- **Navigation blocking:** `navigation-blocking/src/main.tsx`
- **View transitions:** `view-transitions/src/routes/__root.tsx`

---

## Final Notes

**Golden Rules:**

1. **Never mix data and UI state** - Cache for data, component state for UI effects
2. **Never wait for server before updating UI** - Use optimistic updates
3. **Never refetch before closing modals** - Refetch in background
4. **Always cancel queries before optimistic updates** - Prevent race conditions
5. **Always provide rollback context** - Handle errors gracefully
6. **Use `useSuspenseQuery` for SSR** - Prevent loading states on navigation

**Performance Targets:**

- Modal close: < 50ms
- Navigation: < 100ms (cached), < 300ms (fresh)
- Mutation feedback: < 16ms (one frame)
- Loading indicator delay: 300ms (prevents flashing)

**When to Use What:**

| Scenario | Pattern |
|----------|---------|
| User clicks button | Optimistic mutation |
| User navigates to page | SSR loader + useSuspenseQuery |
| User submits form | Optimistic mutation + close modal |
| User deletes item | Optimistic delete (already implemented!) |
| Polling for status | Smart polling (stop when complete) |
| Fast operation | No loading spinner (use mutation.isPending) |
| Slow operation | Loading spinner with 300ms delay |

---

**Last Updated:** 2025-10-23
- **2025-10-23:** Added "Temporary UI States vs Data Optimism" section, fixed wrong `_optimistic` pattern
- **2025-10-22:** Initial version based on TanStack Start examples