# Hooks Complexity & SSR Usage Analysis

## Question 1: Do we need so many `useDevice*` hooks?

### Current Hooks (6 total, ~487 lines)
```
useBreakpoint.ts          - UI utility (✅ Keep)
useDeviceDetailQuery.ts   - ❌ Thin wrapper, should be queryOptions
useDeviceScanStatus.ts    - ⚠️  Has custom logic (useRef + invalidation), keep but simplify
useDevicesQuery.ts        - ❌ Thin wrapper, should be queryOptions
useScansQuery.ts          - ❌ Thin wrapper, should be queryOptions
useScansTableQuery.ts     - ❌ Thin wrapper, should be queryOptions
```

### Analysis: **YES, unnecessary complexity!**

**Current pattern** (`useDevicesQuery.ts`):
```typescript
export const useDevicesQuery = (params?: UseDevicesQueryParams) => {
  const query = useQuery<DevicesResponse>({
    queryKey: ['devices', params?.verificationStatus],
    initialData: params?.initialData, // ⚠️ OLD PATTERN
    queryFn: async () => {
      console.log('📡 useDevicesQuery: Fetching fresh device data...');
      const result = await getDevicesData({ data: { verificationStatus: params?.verificationStatus } });
      console.log('✅ useDevicesQuery: Fresh data received', { deviceCount: result.items?.length || 0 });
      return result;
    },
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
  return query;
};
```

**Problems**:
1. Just wrapping `useQuery()` - adds no value
2. Takes `initialData` prop (old SSR pattern)
3. Debug console.logs should be in devtools, not production code
4. Forces type assertions and nullability checks
5. Can't reuse in loaders

**Better approach** (queryOptions):
```typescript
// queries/device-queries.ts
export const deviceQueries = {
  list: (verificationStatus?) => queryOptions({
    queryKey: ['devices', verificationStatus],
    queryFn: () => getDevicesData({ data: { verificationStatus } }),
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  }),
};

// In loader: queryClient.ensureQueryData(deviceQueries.list(status))
// In component: useSuspenseQuery(deviceQueries.list(status))
```

**Result**:
- ✅ 15 lines → 5 lines (70% reduction)
- ✅ Reusable in loader + component
- ✅ No `initialData` prop needed
- ✅ Type-safe everywhere

---

## Question 2: Are we using TanStack SSR fully?

### Current SSR Usage: **NO! Using OLD pattern** ❌

**What we're doing** (`routes/_auth/assets.tsx`):
```typescript
export const Route = createFileRoute("/_auth/assets")({
  // ❌ OLD: Manually call server function in loader
  loader: async ({ deps: { tab } }) => {
    const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];
    const devicesResponse = await getDevicesData({ data: { verificationStatus } });
    return devicesResponse; // Return raw data
  },
});

function Assets() {
  const initialData = Route.useLoaderData(); // Get raw data

  // ❌ OLD: Pass initialData to custom hook
  const { data: devicesResponse } = useDevicesQuery({
    verificationStatus,
    initialData, // Manual SSR hydration
  });

  const devices = devicesResponse?.items || []; // Nullable, needs default
}
```

**Problems**:
1. ❌ Loader and component use DIFFERENT query logic
2. ❌ No query cache integration in loader
3. ❌ Manual `initialData` passing (error-prone)
4. ❌ Component uses `useQuery()` (not `useSuspenseQuery()`)
5. ❌ Nullable data types (needs `|| []` everywhere)
6. ❌ Can cause hydration mismatches

**What we SHOULD be doing** (TanStack modern pattern):
```typescript
import { deviceQueries } from '@/queries/device-queries';

export const Route = createFileRoute("/_auth/assets")({
  // ✅ NEW: Use ensureQueryData with queryOptions
  loader: async ({ context: { queryClient }, deps: { tab } }) => {
    const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];

    // This populates the query cache AND returns data
    return queryClient.ensureQueryData(deviceQueries.list({ verificationStatus }));
  },
});

function Assets() {
  const { tab } = Route.useSearch();
  const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];

  // ✅ NEW: Use useSuspenseQuery with SAME queryOptions
  const { data: devicesResponse } = useSuspenseQuery(
    deviceQueries.list({ verificationStatus })
  );

  // ✅ Data is NEVER null/undefined (guaranteed by loader)
  const devices = devicesResponse.items; // No || [] needed!
}
```

**Benefits**:
1. ✅ Loader and component use SAME query definition
2. ✅ Query cache integration (deduplication)
3. ✅ No manual `initialData` passing
4. ✅ `useSuspenseQuery()` guarantees data exists
5. ✅ Non-nullable types (no defensive `|| []`)
6. ✅ Perfect hydration (same queryKey)

---

## Current State vs TanStack Best Practices

### What We're Doing (OLD Pattern)

```
┌─────────────────────────────────────────────────────────┐
│ LOADER (Route)                                          │
│ ┌─────────────────────────────────────────────┐        │
│ │ const data = await getDevicesData(...)      │        │
│ │ return data                                  │        │
│ └─────────────────────────────────────────────┘        │
│                        ↓                                │
│                  Raw Data Object                        │
│                        ↓                                │
│ ┌─────────────────────────────────────────────┐        │
│ │ COMPONENT                                    │        │
│ │ const initialData = Route.useLoaderData()   │        │
│ │ useDevicesQuery({ initialData })             │        │
│ │   └─> useQuery({ initialData, queryKey,... })│       │
│ └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘

Problems:
- Loader bypasses query cache
- Component and loader use different logic
- Manual initialData passing
- Nullable data types
```

### What We SHOULD Be Doing (TanStack Modern)

```
┌─────────────────────────────────────────────────────────┐
│ QUERY OPTIONS (Shared Definition)                      │
│ ┌─────────────────────────────────────────────┐        │
│ │ deviceQueries.list = queryOptions({         │        │
│ │   queryKey: ['devices', status],            │        │
│ │   queryFn: () => getDevicesData({ status }) │        │
│ │ })                                           │        │
│ └─────────────────────────────────────────────┘        │
│           ↓                              ↓              │
│    ┌──────────────┐            ┌──────────────┐       │
│    │ LOADER       │            │ COMPONENT    │       │
│    │ ensureQuery  │            │ useSuspense  │       │
│    │ Data(opts)   │            │ Query(opts)  │       │
│    └──────────────┘            └──────────────┘       │
│           ↓                              ↓              │
│           └──────────┬───────────────────┘             │
│                      ↓                                  │
│              Query Cache (Single Source of Truth)      │
│              - Deduplication ✅                         │
│              - Type-safe ✅                             │
│              - Hydration ✅                             │
└─────────────────────────────────────────────────────────┘

Benefits:
- Loader populates query cache
- Component reads from cache (no fetch)
- Same queryOptions everywhere
- Non-nullable types
```

---

## Real-World Impact

### Performance Impact

**Current (OLD pattern)**:
```
1. Loader: Fetch data → Return raw data
2. Component mounts: useQuery checks cache → MISS
3. Component: Check initialData → Use it
4. On invalidation: Re-fetch (correct queryKey? 🤞)
```

**Modern pattern**:
```
1. Loader: ensureQueryData → Populate cache
2. Component mounts: useSuspenseQuery checks cache → HIT ✅
3. No fetch needed, instant render
4. On invalidation: Same queryKey guaranteed
```

**Performance Gain**: Eliminates duplicate fetches on navigation/refresh

### Type Safety Impact

**Current (nullable types)**:
```typescript
const devices = devicesResponse?.items || []; // Defensive programming
devices.map(d => d.name); // TypeScript: OK, but runtime could still fail
```

**Modern (guaranteed types)**:
```typescript
const devices = devicesResponse.items; // Non-null assertion not needed
devices.map(d => d.name); // TypeScript: OK, runtime guaranteed safe
```

### Developer Experience Impact

**Current**:
- Find query logic: Check 3 places (hook, loader, component)
- Change queryKey: Update in 2 places (hook + mutation)
- Debug cache: Hard (loader bypasses cache)

**Modern**:
- Find query logic: Check 1 place (queryOptions)
- Change queryKey: Update in 1 place (queryOptions)
- Debug cache: Easy (everything goes through cache)

---

## Recommendation: Refactor in 3 Phases

### Phase 1: Create Query Options (1-2 hours)

**Create `/src/queries/device-queries.ts`**:
```typescript
import { queryOptions } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import { getDevicesData, getDeviceDetailData } from '@/server/devices';

export const deviceQueries = {
  list: (params?: { verificationStatus?: string | string[] }) =>
    queryOptions({
      queryKey: ['devices', params?.verificationStatus],
      queryFn: () => getDevicesData({ data: params }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  detail: (deviceId: string) =>
    queryOptions({
      queryKey: ['device-detail', deviceId],
      queryFn: () => getDeviceDetailData({ data: { deviceId } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),
};
```

**Create `/src/queries/scan-queries.ts`**:
```typescript
export const scanQueries = {
  list: () => queryOptions({
    queryKey: ['scans'],
    queryFn: () => getScansData(),
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  }),

  table: () => queryOptions({
    queryKey: ['scans-table'],
    queryFn: () => getScansTableData(),
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  }),
};
```

### Phase 2: Update Routes (2-3 hours)

**Before**:
```typescript
loader: async () => {
  const devicesResponse = await getDevicesData({ data: { verificationStatus } });
  return devicesResponse;
},
```

**After**:
```typescript
loader: async ({ context: { queryClient }, deps: { tab } }) => {
  const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];
  return queryClient.ensureQueryData(deviceQueries.list({ verificationStatus }));
},
```

### Phase 3: Update Components (2-3 hours)

**Before**:
```typescript
const initialData = Route.useLoaderData();
const { data } = useDevicesQuery({ verificationStatus, initialData });
const devices = data?.items || [];
```

**After**:
```typescript
const { data } = useSuspenseQuery(deviceQueries.list({ verificationStatus }));
const devices = data.items; // Non-null!
```

---

## Expected Benefits

### Code Reduction
- Delete 4 unnecessary hooks: **~300 lines removed**
- Centralize query definitions: **~100 lines added**
- **Net: -200 lines of code**

### Type Safety
- No more nullable types in components
- Guaranteed data from `useSuspenseQuery()`
- Single source of truth for query config

### Performance
- Eliminate duplicate fetches
- Better cache utilization
- Prefetching on hover becomes trivial

### Developer Experience
- One place to find all queries
- Easy to invalidate (reference queryKey)
- Easier debugging (query cache visible in devtools)

---

## Final Answer

### Q1: Too many hooks?
**YES** - 4 out of 6 hooks are unnecessary wrappers. They add:
- ❌ Complexity (500 lines of boilerplate)
- ❌ Maintenance burden (update in 3 places)
- ❌ Type issues (nullable everywhere)

### Q2: Using TanStack fully?
**NO** - We're using the OLD pattern (circa 2021):
- ❌ No `queryOptions()` factories
- ❌ No `useSuspenseQuery()` in components
- ❌ No `ensureQueryData()` in loaders
- ❌ Manual `initialData` passing

**Recommendation**: Migrate to modern pattern for ~70% code reduction and better DX.
