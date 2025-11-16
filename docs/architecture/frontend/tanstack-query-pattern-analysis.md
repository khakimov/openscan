# TanStack Query Pattern Analysis

## Current Pattern Issues

### ❌ Problem 1: Custom Hooks Wrapping useQuery (Unnecessary Abstraction)

**Current approach** (`hooks/useDeviceDetailQuery.ts`):
```typescript
export const DEVICE_DETAIL_QUERY_KEY = (deviceId: string) => ["device-detail", deviceId];

export function useDeviceDetailQuery(deviceId: string | null) {
  return useQuery<TransformedDevice>({
    queryKey: deviceId ? DEVICE_DETAIL_QUERY_KEY(deviceId) : ["device-detail"],
    queryFn: async (): Promise<TransformedDevice> => {
      if (!deviceId) throw new Error("No device ID provided");
      const result = await getDeviceDetailData({ data: { deviceId } });
      return result as TransformedDevice;
    },
    enabled: !!deviceId,
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
}
```

**Problems**:
- Duplicate query configuration (can't reuse in loaders)
- Separate query key exports
- Wrapper adds no real value
- Can't use in SSR loaders easily
- Type inference less clean

### ❌ Problem 2: No Centralized Query Definitions

Our queries are scattered:
- `hooks/useDeviceDetailQuery.ts`
- `hooks/useDevicesQuery.ts`
- `hooks/useDeviceScanStatus.ts`
- Query keys exported separately

**Problem**: Hard to find all queries related to "devices", no single source of truth.

---

## TanStack Recommended Pattern (from official examples)

### ✅ Solution: Use `queryOptions()` Factories

**From `router/examples/react/start-trellaux/src/queries.ts`**:

```typescript
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

// 1. Centralized query definitions using queryOptions()
export const boardQueries = {
  list: () =>
    queryOptions({
      queryKey: ['boards', 'list'],
      queryFn: () => getBoards()
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: ['boards', 'detail', id],
      queryFn: () => getBoard({ data: id }),
    }),
}

// 2. Use in loaders (SSR prefetching)
export const Route = createFileRoute('/boards/$boardId')({
  loader: ({ context: { queryClient }, params: { boardId } }) => {
    return queryClient.ensureQueryData(boardQueries.detail(boardId))
  },
})

// 3. Use in components (guaranteed data from loader)
function BoardDetail() {
  const { boardId } = route.useParams()
  const { data: board } = useSuspenseQuery(boardQueries.detail(boardId))
  // ...
}

// 4. Reference in mutations (optimistic updates)
export function useCreateColumnMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createColumn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries()
      // Easy to reference queryKey from queryOptions
      queryClient.setQueryData(
        boardQueries.detail(variables.data.boardId).queryKey,
        (board) => ({ ...board, columns: [...board.columns, variables.data] })
      )
    },
  })
}
```

### Key Benefits

1. **Reusable**: Same options in loader AND component
2. **Type-safe**: TypeScript infers return types
3. **No duplication**: queryKey defined once
4. **Centralized**: All queries in one place
5. **Easy invalidation**: Reference `.queryKey` in mutations
6. **SSR-friendly**: Works with `ensureQueryData()` and `useSuspenseQuery()`

---

## Recommended Refactor for Our Codebase

### Step 1: Create Centralized Query Options

**New file: `/src/queries/device-queries.ts`**

```typescript
import { queryOptions } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getDeviceDetailData,
  getDevicesData,
  getDeviceScanHistoryData,
  getDeviceVulnerabilitiesData,
} from '@/server/devices';
import { getActiveDeviceScans } from '@/server/discovery/workflows/device-scan-handler';

/**
 * Centralized device query definitions
 * Use these in loaders, components, and mutations
 */
export const deviceQueries = {
  // Device list (with optional filtering)
  list: (params?: {
    verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[]
  }) =>
    queryOptions({
      queryKey: ['devices', params?.verificationStatus],
      queryFn: () => getDevicesData({ data: { verificationStatus: params?.verificationStatus } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  // Single device detail
  detail: (deviceId: string) =>
    queryOptions({
      queryKey: ['device-detail', deviceId],
      queryFn: () => getDeviceDetailData({ data: { deviceId } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  // Device scan history
  scanHistory: (target: string, limit = 10) =>
    queryOptions({
      queryKey: ['device-scan-history', target, limit],
      queryFn: () => getDeviceScanHistoryData({ data: { target, limit } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  // Device vulnerabilities (paginated)
  vulnerabilities: (deviceId: string, page = 1, sortByCvss = true) =>
    queryOptions({
      queryKey: ['device-vulnerabilities', deviceId, page, sortByCvss],
      queryFn: () =>
        getDeviceVulnerabilitiesData({
          data: {
            deviceId,
            page,
            sortColumn: sortByCvss ? 'cvssScore' : undefined,
            sortDirection: sortByCvss ? 'descending' : undefined,
          },
        }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  // Active scans (polling query)
  activeScans: (deviceId: string) =>
    queryOptions({
      queryKey: ['active-device-scans', deviceId],
      queryFn: async () => {
        const result = await getActiveDeviceScans({ data: { deviceId } });
        if (!result.success) throw new Error(result.error || 'Failed to get active scans');
        return result.activeScans;
      },
      staleTime: QUERY_CONFIG.STALE_TIME.SECONDS_30,
      refetchInterval: (query) => {
        const activeScans = query.state.data;
        // Stop polling when no active scans
        return activeScans?.length ? QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_30 : false;
      },
      refetchIntervalInBackground: false,
    }),
};
```

### Step 2: Update Route Loaders

**Before** (`routes/_auth/assets.tsx`):
```typescript
export const Route = createFileRoute("/_auth/assets")({
  loader: async ({ deps: { tab } }) => {
    const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];
    const devicesResponse = await getDevicesData({ data: { verificationStatus } });
    return devicesResponse;
  },
});
```

**After**:
```typescript
import { deviceQueries } from '@/queries/device-queries';

export const Route = createFileRoute("/_auth/assets")({
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { queryClient }, deps: { tab } }) => {
    const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];
    // Reuse same query definition as components
    return queryClient.ensureQueryData(deviceQueries.list({ verificationStatus }));
  },
});
```

### Step 3: Update Components

**Before**:
```typescript
const { data: devicesResponse } = useDevicesQuery({
  verificationStatus,
  initialData,
});
```

**After**:
```typescript
const { data: devicesResponse } = useSuspenseQuery(
  deviceQueries.list({ verificationStatus })
);
```

**Benefits**:
- No `initialData` prop needed (handled by loader)
- Suspends if data not ready
- Guaranteed type-safe data

### Step 4: Update Mutations to Reference Query Keys

**Before**:
```typescript
queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] });
queryClient.invalidateQueries({ queryKey: ['devices'] });
```

**After**:
```typescript
queryClient.invalidateQueries({ queryKey: deviceQueries.detail(deviceId).queryKey });
queryClient.invalidateQueries({ queryKey: deviceQueries.list().queryKey });
```

**Benefits**:
- Type-safe query key references
- Refactoring is easier (query keys in one place)
- No typos or mismatches

---

## When to Keep Custom Hooks

**Keep hooks when they have additional logic beyond just wrapping useQuery:**

### ✅ Good use of custom hook: `useActiveDeviceScans` (with state tracking)

```typescript
export function useActiveDeviceScans(deviceId: string) {
  const queryClient = useQueryClient();
  const previousActiveScansRef = React.useRef<string[]>([]);

  return useQuery({
    ...deviceQueries.activeScans(deviceId), // Reuse queryOptions
    select: (data) => {
      // Custom logic: Detect completion and invalidate
      const activeScans = data || [];
      const previousActiveScans = previousActiveScansRef.current;

      if (previousActiveScans.length > 0 && activeScans.length === 0) {
        console.log('🔄 Scan completed - invalidating device queries');
        queryClient.invalidateQueries({ queryKey: deviceQueries.detail(deviceId).queryKey });
      }

      previousActiveScansRef.current = activeScans;
      return activeScans;
    },
  });
}
```

**Why keep it?**
- Has stateful logic (useRef)
- Performs side effects (invalidation)
- More than just a query wrapper

---

## Migration Plan

### Phase 1: Create Query Options (Low Risk)
1. Create `/src/queries/device-queries.ts`
2. Define all device queries using `queryOptions()`
3. Export centralized `deviceQueries` object
4. **No breaking changes** - old hooks still work

### Phase 2: Update Loaders (Medium Risk)
1. Update route loaders to use `queryClient.ensureQueryData()`
2. Test SSR behavior
3. Verify cache deduplication

### Phase 3: Update Components (High Risk)
1. Replace `useQuery()` with `useSuspenseQuery()`
2. Remove `initialData` props
3. Add Suspense boundaries if needed
4. Test loading states

### Phase 4: Update Mutations (Low Risk)
1. Reference `deviceQueries.*.queryKey` instead of hardcoded arrays
2. Test invalidation still works

### Phase 5: Remove Old Hooks (Cleanup)
1. Delete `useDevicesQuery.ts`
2. Delete `useDeviceDetailQuery.ts`
3. Keep `useDeviceScanStatus.ts` (has custom logic)

---

## Additional Patterns from TanStack Examples

### 1. Prefetch on Hover (Instant Navigation)

```typescript
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';

function DeviceList({ devices }) {
  const queryClient = useQueryClient();

  return devices.map(device => (
    <Link
      to="/devices/$deviceId"
      params={{ deviceId: device.id }}
      onMouseEnter={() => {
        // Prefetch on hover for instant navigation
        queryClient.prefetchQuery(deviceQueries.detail(device.id));
      }}
    >
      {device.name}
    </Link>
  ));
}
```

### 2. Optimistic Updates (Instant UI Feedback)

```typescript
export function useVerifyDeviceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyDevice,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: deviceQueries.detail(variables.deviceId).queryKey });

      const previousDevice = queryClient.getQueryData(deviceQueries.detail(variables.deviceId).queryKey);

      // Optimistically update UI
      queryClient.setQueryData(
        deviceQueries.detail(variables.deviceId).queryKey,
        (old) => old ? { ...old, verificationStatus: 'VERIFIED' } : undefined
      );

      return { previousDevice };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousDevice) {
        queryClient.setQueryData(
          deviceQueries.detail(variables.deviceId).queryKey,
          context.previousDevice
        );
      }
    },
  });
}
```

### 3. Dependent Queries (Waterfall Prevention)

```typescript
function DeviceDetail({ deviceId }: { deviceId: string }) {
  // Parallel fetching (both start immediately)
  const { data: device } = useSuspenseQuery(deviceQueries.detail(deviceId));
  const { data: scanHistory } = useSuspenseQuery(deviceQueries.scanHistory(device.name));
  const { data: vulnerabilities } = useSuspenseQuery(deviceQueries.vulnerabilities(deviceId));

  // All 3 queries run in parallel, suspends until all complete
}
```

---

## Conclusion

### Current Issues
1. ❌ Custom hooks add unnecessary abstraction
2. ❌ Duplicate query configuration (loader + component)
3. ❌ Separate query key exports (risk of mismatch)
4. ❌ No centralized query definitions

### Recommended Pattern
1. ✅ Use `queryOptions()` factories
2. ✅ Centralize in `queries/` directory
3. ✅ Use `ensureQueryData()` in loaders
4. ✅ Use `useSuspenseQuery()` in components
5. ✅ Keep custom hooks only when they add logic

### Migration Priority
1. **High**: Device queries (most used)
2. **Medium**: Scan queries
3. **Low**: Discovery queries (less frequent)

### Breaking Changes
- Components switch from `useQuery` → `useSuspenseQuery`
- Need Suspense boundaries (probably already have them)
- Remove `initialData` prop (handled by loader)

### Timeline
- Phase 1 (Create query options): 1-2 hours
- Phase 2 (Update loaders): 2-3 hours
- Phase 3 (Update components): 3-4 hours
- Phase 4 (Update mutations): 1 hour
- Phase 5 (Cleanup): 1 hour

**Total**: ~8-11 hours for complete migration
