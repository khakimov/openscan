# OpenPanel UI Patterns Analysis

Analysis of OpenPanel's TanStack Start architecture and UI patterns - what we can learn and adopt.

**Project:** `/Users/rus/Projects/current/sec/openpanel/apps/start`

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Differences from Our Approach](#key-differences-from-our-approach)
3. [Patterns Worth Adopting](#patterns-worth-adopting)
4. [tRPC vs CreateServerFn](#trpc-vs-createserverfn)
5. [Form Handling](#form-handling)
6. [Modal Management](#modal-management)
7. [URL State Management](#url-state-management)
8. [Loading States](#loading-states)
9. [Custom Hooks](#custom-hooks)
10. [Recommendations](#recommendations)

---

## Architecture Overview

### Tech Stack Comparison

| Feature | OpenPanel | OpenScan (Current) |
|---------|-----------|-------------------|
| **API Layer** | tRPC | createServerFn |
| **Forms** | React Hook Form + Zod | Native forms |
| **Modals** | Pushmodal | Custom pushModal |
| **URL State** | Nuqs | TanStack Router search params |
| **State Management** | Redux Toolkit (minimal) | React state only |
| **Query Config** | 5min stale, no refetch | 30s stale, smart refetch |
| **Optimistic Updates** | ❌ No | ⚠️ Partial |

### Core Dependencies

```json
{
  "@tanstack/react-router": "^1.x",
  "@tanstack/react-query": "^5.x",
  "@trpc/client": "next",
  "@trpc/react-query": "next",
  "@trpc/server": "next",
  "react-hook-form": "^7.x",
  "zod": "^3.x",
  "pushmodal": "^1.x",
  "nuqs": "^1.x",
  "superjson": "^2.x"
}
```

---

## Key Differences from Our Approach

### 1. tRPC Instead of CreateServerFn

**OpenPanel:**
```typescript
// Define API in separate server package
// packages/trpc/src/router/dashboard.ts
export const dashboardRouter = router({
  byId: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await db.dashboard.findUnique({
        where: { id: input.id, projectId: input.projectId }
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return await db.dashboard.update({
        where: { id: input.id },
        data: { name: input.name }
      });
    }),
});

// Use in client
const trpc = useTRPC();
const query = useQuery(
  trpc.dashboard.byId.queryOptions({ id, projectId })
);
```

**OpenScan (Current):**
```typescript
// Define in server file
export const getDashboard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    return await getDashboardById(data.id);
  });

// Use in client
const { data } = useQuery({
  queryKey: ['dashboard', id],
  queryFn: () => getDashboard({ data: { id } }),
});
```

**Trade-offs:**
- ✅ tRPC: Better type inference, easier invalidation, less boilerplate
- ✅ createServerFn: Simpler, no extra packages, better for simple APIs
- ⚠️ tRPC: More setup, separate package needed
- ⚠️ createServerFn: Manual query key management

### 2. No Optimistic Updates (Intentional Choice)

**OpenPanel Approach:**
```typescript
// They prefer simple invalidation over optimistic updates
const mutation = useMutation(
  trpc.dashboard.update.mutationOptions({
    onSuccess() {
      // Just invalidate and refetch
      queryClient.invalidateQueries(
        trpc.dashboard.byId.pathFilter()
      );
      toast.success('Updated');
    },
  })
);
```

**Why they chose this:**
- Simpler codebase (no optimistic rollback logic)
- Fewer bugs (no sync issues between optimistic/real data)
- Good enough for their use case (analytics dashboard)

**When to use optimistic updates (our case):**
- Real-time status updates (scanning, running workflows)
- User expects instant feedback (adding devices, deleting items)
- Network latency is noticeable

### 3. React Hook Form Everywhere

**OpenPanel Pattern:**
```typescript
const validation = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

const form = useForm<z.infer<typeof validation>>({
  resolver: zodResolver(validation),
  defaultValues: { name: '', email: '' },
});

return (
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <Input
      placeholder="Name"
      error={form.formState.errors.name?.message}
      {...form.register('name')}
    />

    {/* For custom components */}
    <Controller
      control={form.control}
      name="type"
      render={({ field }) => (
        <Combobox {...field} onChange={field.onChange} />
      )}
    />

    <Button
      type="submit"
      loading={mutation.isPending}
      disabled={!form.formState.isDirty}
    >
      Save
    </Button>
  </form>
);
```

**Benefits:**
- ✅ Automatic validation
- ✅ Form state management (isDirty, isValid)
- ✅ Error handling
- ✅ Reset capability
- ✅ Integration with custom components

---

## Patterns Worth Adopting

### 1. Pushmodal System

**Current Setup:**

```typescript
// apps/start/src/modals/index.tsx
export const {
  pushModal,
  popModal,
  replaceWithModal,
  popAllModals,
  ModalProvider,
  useOnPushModal,
} = createPushModal({
  modals: {
    AddProject,
    EditDashboard,
    Confirm,
    // Type-safe modal registry
  },
});

// Helper for confirm dialogs
export const showConfirm = (props: ConfirmProps) =>
  pushModal('Confirm', props);
```

**Usage:**

```typescript
// Open modal
pushModal('AddProject', { organizationId });

// Confirm dialog
showConfirm({
  title: 'Delete device?',
  text: 'This action cannot be undone',
  onConfirm: () => deleteMutation.mutate({ id }),
});

// In modal component
export default function AddProject({ organizationId }: Props) {
  const mutation = useMutation(/*...*/);

  return (
    <ModalContent>
      {mutation.isSuccess ? (
        <SuccessScreen onClose={() => popModal()} />
      ) : (
        <FormScreen />
      )}
    </ModalContent>
  );
}
```

**Why It's Better:**
- ✅ Type-safe props
- ✅ No useState for modal visibility
- ✅ Stack-based (can nest modals)
- ✅ URL-based (works with browser back button)
- ✅ Centralized registry

**Should we adopt?** ✅ **Yes** - Much cleaner than our current approach

---

### 2. URL State with Nuqs

**OpenPanel Pattern:**

```typescript
// Custom hook for URL-based filters
export function useEventQueryFilters() {
  const [filters, setFilters] = useQueryState(
    'f', // URL param name
    eventQueryFiltersParser.withDefault([]).withOptions({
      history: 'push',        // Push to history
      clearOnDefault: true,   // Remove param when default
    })
  );

  const setFilter = useCallback((name: string, value: string) => {
    setFilters((prev) => {
      const existing = prev.find((f) => f.name === name);
      if (existing) {
        return prev.map((f) =>
          f.name === name ? { ...f, value } : f
        );
      }
      return [...prev, { name, value, operator: 'is' }];
    });
  }, [setFilters]);

  return [filters, setFilter] as const;
}
```

**Usage:**

```typescript
function DeviceTable() {
  const [filters, setFilter] = useDeviceFilters();

  // URL updates automatically: /devices?f=[{"name":"status","value":"active"}]
  <FilterBar
    filters={filters}
    onFilterChange={(name, value) => setFilter(name, value)}
  />
}
```

**Combined with Pagination:**

```typescript
export function useSearchQueryState() {
  const { page, setPage } = useDataTablePagination();
  const [search, setSearch] = useQueryState('q', {
    defaultValue: '',
    limitUrlUpdates: {
      method: 'debounce',
      timeMs: 500,
    },
  });

  return {
    search,
    setSearch: (value: string) => {
      if (page !== 1) void setPage(1); // Reset to page 1 on search
      setSearch(value);
    },
  };
}
```

**Benefits:**
- ✅ Shareable URLs with filters
- ✅ Browser back/forward works
- ✅ SSR-friendly
- ✅ Built-in debouncing
- ✅ Type-safe parsers

**Should we adopt?** ⚠️ **Maybe** - TanStack Router search params already work, but Nuqs is more ergonomic

---

### 3. Route Prefetching Pattern

**OpenPanel Approach:**

```typescript
export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/dashboards_/$dashboardId'
)({
  component: Component,

  // Prefetch multiple queries in parallel
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.dashboard.byId.queryOptions({
          id: params.dashboardId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.report.list.queryOptions({
          dashboardId: params.dashboardId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.dashboard.permissions.queryOptions({
          id: params.dashboardId,
        })
      ),
    ]);
  },

  pendingComponent: FullPageLoadingState,
  errorComponent: FullPageErrorState,
});

function Component() {
  const params = Route.useParams();
  const trpc = useTRPC();

  // All data is cached, no loading states!
  const dashboard = useSuspenseQuery(
    trpc.dashboard.byId.queryOptions({
      id: params.dashboardId,
      projectId: params.projectId,
    })
  );

  const reports = useSuspenseQuery(
    trpc.report.list.queryOptions({
      dashboardId: params.dashboardId,
      projectId: params.projectId,
    })
  );

  // Render immediately with data
  return <DashboardView dashboard={dashboard.data} reports={reports.data} />;
}
```

**Key Pattern:** `prefetchQuery` in loader + `useSuspenseQuery` in component = instant render

**Should we adopt?** ✅ **Yes** - We should use this pattern everywhere

---

### 4. Conditional Success Rendering

**Pattern:**

```typescript
export default function AddProjectModal() {
  const mutation = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (data) => {
        // Don't close modal - show success screen
      },
    })
  );

  return (
    <ModalContent>
      {mutation.isSuccess ? (
        <>
          <ModalHeader title="Project created!" />
          <SuccessView project={mutation.data} />
          <div className="flex gap-2">
            <Button onClick={() => {
              popModal();
              router.navigate({ to: '/projects/$id', params: { id: mutation.data.id } });
            }}>
              Go to project
            </Button>
            <Button variant="outline" onClick={() => popModal()}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <ModalHeader title="Create project" />
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* form fields */}
          </form>
        </>
      )}
    </ModalContent>
  );
}
```

**Benefits:**
- ✅ User sees success confirmation
- ✅ Provides next actions (navigate, close)
- ✅ No abrupt modal close

**Should we adopt?** ⚠️ **Maybe** - Good for complex flows, but simple actions can just close

---

### 5. Inline Creation Pattern

**Pattern:**

```typescript
export default function SaveReportModal() {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  const createDashboardMutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onSuccess: (dashboard) => {
        setIsCreatingNew(false);
        setNewDashboardName('');
        setValue(dashboard.id); // Select newly created dashboard
      },
    })
  );

  return (
    <ModalContent>
      <ModalHeader title="Save report to dashboard" />

      {!isCreatingNew ? (
        <div className="flex flex-wrap gap-2">
          {dashboards.map((dashboard) => (
            <Button
              key={dashboard.id}
              variant={value === dashboard.id ? 'default' : 'outline'}
              onClick={() => setValue(dashboard.id)}
            >
              {dashboard.name}
            </Button>
          ))}

          <Button
            variant="outline"
            onClick={() => setIsCreatingNew(true)}
          >
            + Create new dashboard
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Dashboard name"
            value={newDashboardName}
            onChange={(e) => setNewDashboardName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                createDashboardMutation.mutate({
                  name: newDashboardName,
                  projectId,
                });
              }}
              loading={createDashboardMutation.isPending}
            >
              Create
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsCreatingNew(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </ModalContent>
  );
}
```

**Benefits:**
- ✅ User doesn't leave context
- ✅ Faster workflow
- ✅ Better UX than separate modal

**Should we adopt?** ✅ **Yes** - Great pattern for related actions

---

## tRPC vs CreateServerFn

### Type Safety Comparison

**tRPC:**
```typescript
// Server
const router = router({
  getDevice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return db.device.findUnique({ where: { id: input.id } });
    }),
});

// Client - Full type inference!
const device = trpc.getDevice.useQuery({ id: '123' });
//    ^? type: Device | undefined

// Invalidation is typed
queryClient.invalidateQueries(trpc.getDevice.pathFilter());
```

**CreateServerFn:**
```typescript
// Server
export const getDevice = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    return db.device.findUnique({ where: { id: data.id } });
  });

// Client - Manual typing
const { data } = useQuery({
  queryKey: ['device', id],
  queryFn: () => getDevice({ data: { id } }),
});

// Manual invalidation
queryClient.invalidateQueries({ queryKey: ['device', id] });
```

### Recommendation

**Stick with createServerFn** because:
1. ✅ Already integrated and working
2. ✅ Simpler for our scale
3. ✅ No additional packages
4. ✅ Good enough type safety with Zod

**Consider tRPC if:**
- Project grows significantly (100+ endpoints)
- Need better type inference across packages
- Want easier cache invalidation

---

## Form Handling

### React Hook Form Pattern

**Install:**
```bash
pnpm add react-hook-form @hookform/resolvers
```

**Basic Pattern:**

```typescript
// src/components/forms/device-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const deviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ip: z.string().ip('Invalid IP address'),
  tags: z.array(z.string()),
});

type DeviceFormData = z.infer<typeof deviceSchema>;

export function DeviceForm({ device, onSubmit }: Props) {
  const form = useForm<DeviceFormData>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      name: device?.name ?? '',
      ip: device?.ip ?? '',
      tags: device?.tags ?? [],
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input
        label="Device Name"
        placeholder="router-01"
        error={form.formState.errors.name?.message}
        {...form.register('name')}
      />

      <Input
        label="IP Address"
        placeholder="192.168.1.1"
        error={form.formState.errors.ip?.message}
        {...form.register('ip')}
      />

      <Button
        type="submit"
        disabled={!form.formState.isDirty || form.formState.isSubmitting}
      >
        Save Changes
      </Button>
    </form>
  );
}
```

**With Custom Components:**

```typescript
<Controller
  control={form.control}
  name="verificationStatus"
  render={({ field }) => (
    <Select
      value={field.value}
      onValueChange={field.onChange}
      options={[
        { value: 'CANDIDATE', label: 'Candidate' },
        { value: 'VERIFIED', label: 'Verified' },
        { value: 'EXCLUDED', label: 'Excluded' },
      ]}
    />
  )}
/>
```

**Benefits for Our Project:**
- ✅ Consistent form validation across app
- ✅ Better error handling
- ✅ Form state management (isDirty, isValid)
- ✅ Easy reset/clear
- ✅ Works with our existing Zod schemas

**Implementation Priority:** 🔥 **High** - Would improve form quality significantly

---

## Modal Management

### Pushmodal vs Our Current Approach

**Our Current Pattern:**

```typescript
// modals/index.ts
export const { pushModal, popModal } = createModal({
  AddDevice: lazy(() => import('./AddDevice')),
  EditDevice: lazy(() => import('./EditDevice')),
});

// Usage
pushModal('AddDevice', { organizationId });
```

**OpenPanel Pattern (similar but more features):**

```typescript
// They also have:
export const showConfirm = (props: ConfirmProps) =>
  pushModal('Confirm', props);

export const useOnPushModal = (
  modalName: string,
  callback: (props: any) => void
) => {
  // Hook to react to modal being pushed
};

// Usage
showConfirm({
  title: 'Delete device?',
  text: 'This cannot be undone',
  confirmText: 'Delete',
  variant: 'destructive',
  onConfirm: () => deleteMutation.mutate({ id }),
});
```

**Recommendation:** Add `showConfirm` helper to our modal system

---

## URL State Management

### Nuqs Pattern for Filters

**Example: Device Filters**

```typescript
// hooks/use-device-filters.ts
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';

const filterParser = parseAsArrayOf(
  parseAsJson<{
    name: string;
    value: string;
    operator: 'is' | 'contains' | 'startsWith';
  }>()
);

export function useDeviceFilters() {
  const [filters, setFilters] = useQueryState(
    'filters',
    filterParser.withDefault([]).withOptions({
      history: 'push',
      clearOnDefault: true,
    })
  );

  const addFilter = useCallback((filter: Filter) => {
    setFilters((prev) => [...prev, filter]);
  }, [setFilters]);

  const removeFilter = useCallback((name: string) => {
    setFilters((prev) => prev.filter((f) => f.name !== name));
  }, [setFilters]);

  return { filters, addFilter, removeFilter };
}
```

**Recommendation:** ⚠️ **Optional** - TanStack Router search params work fine, but Nuqs is more ergonomic

---

## Loading States

### Button Loading Pattern

**Update Button Component:**

```typescript
// components/ui/button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, loading, icon: Icon, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        ref={ref}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          <>
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            {children}
          </>
        )}
      </button>
    );
  }
);
```

**Usage:**

```typescript
<Button
  onClick={() => mutation.mutate()}
  loading={mutation.isPending}
  icon={SaveIcon}
>
  Save Changes
</Button>
```

**Recommendation:** ✅ **Yes** - Cleaner than inline conditionals

---

## Custom Hooks

### Debounced Search Hook

```typescript
// hooks/use-debounced-search.ts
import { useMemo, useState } from 'react';
import { debounce } from 'lodash-es';

export function useDebouncedSearch(delay = 500) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => {
      setDebouncedSearch(value);
    }, delay),
    [delay]
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    debouncedSetSearch(value);
  };

  return {
    search,           // Immediate value for input
    debouncedSearch,  // Debounced value for queries
    setSearch: handleSearchChange,
  };
}
```

**Usage:**

```typescript
function DeviceList() {
  const { search, debouncedSearch, setSearch } = useDebouncedSearch();

  const { data } = useQuery({
    ...deviceQueries.list({ search: debouncedSearch }),
  });

  return (
    <>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search devices..."
      />
      <DeviceGrid devices={data.items} />
    </>
  );
}
```

**Recommendation:** ✅ **Yes** - Already useful for our device search

---

## Recommendations

### 🔥 High Priority (Adopt Now)

1. **React Hook Form + Zod**
   - Better form validation
   - Consistent error handling
   - Easy to integrate with existing Zod schemas
   - **Effort:** Low (1-2 days to refactor existing forms)

2. **Button Loading Prop**
   - Cleaner code
   - Consistent loading states
   - **Effort:** Very Low (2 hours)

3. **Debounced Search Hook**
   - Better UX for search inputs
   - Reduce unnecessary queries
   - **Effort:** Very Low (1 hour)

4. **Confirm Dialog Helper**
   - Consistent confirm dialogs
   - Less boilerplate
   - **Effort:** Very Low (1 hour)

### ⚠️ Medium Priority (Consider)

5. **Inline Creation Pattern**
   - Better UX for related actions
   - Good for "Save to dashboard" type flows
   - **Effort:** Medium (case-by-case implementation)

6. **Conditional Success Rendering**
   - Better feedback for complex flows
   - Good for multi-step processes
   - **Effort:** Low (can add to new modals)

### ❌ Low Priority (Skip for Now)

7. **tRPC Migration**
   - Too much work for current benefits
   - CreateServerFn is sufficient
   - **Effort:** Very High (weeks)

8. **Nuqs for URL State**
   - TanStack Router search params work fine
   - Nice to have, not essential
   - **Effort:** Medium

9. **Redux Toolkit**
   - We don't need it (they barely use it)
   - React state + TanStack Query is enough
   - **Effort:** Medium

---

## Implementation Plan

### Phase 1: Quick Wins (Week 1)

1. **Add button loading prop**
   ```typescript
   // components/ui/button.tsx
   interface ButtonProps {
     loading?: boolean;
     icon?: ComponentType;
   }
   ```

2. **Create debounced search hook**
   ```typescript
   // hooks/use-debounced-search.ts
   export function useDebouncedSearch(delay = 500) { ... }
   ```

3. **Add confirm dialog helper**
   ```typescript
   // modals/index.ts
   export const showConfirm = (props: ConfirmProps) =>
     pushModal('Confirm', props);
   ```

### Phase 2: Form Improvements (Week 2)

4. **Install React Hook Form**
   ```bash
   pnpm add react-hook-form @hookform/resolvers
   ```

5. **Refactor one modal to use RHF**
   - Start with AddDiscovery modal
   - Use as template for others

6. **Update Input component**
   - Add error prop
   - Support form.register()

### Phase 3: Pattern Adoption (Week 3-4)

7. **Refactor remaining forms**
   - EditDevice
   - AddDevice
   - Other modals

8. **Add inline creation patterns**
   - "Add to dashboard" flows
   - "Create new X" inline options

---

## Key Takeaways

### What OpenPanel Does Well

1. ✅ **Consistent form handling** - React Hook Form everywhere
2. ✅ **Simple data fetching** - No optimistic updates, just invalidate
3. ✅ **Clean modal system** - Pushmodal with helpers
4. ✅ **URL state management** - Nuqs for filters
5. ✅ **Route prefetching** - Parallel prefetch in loaders

### What We Do Better

1. ✅ **Optimistic updates** - Better for real-time status changes
2. ✅ **Smart polling** - Stop when complete (they don't poll much)
3. ✅ **Database-first architecture** - Better separation of concerns
4. ✅ **Query configuration** - More thoughtful cache management

### What We Should Learn

1. 🎯 **Form handling** - Adopt React Hook Form
2. 🎯 **Loading states** - Button loading prop
3. 🎯 **Inline creation** - Better UX patterns
4. 🎯 **Helper functions** - showConfirm, etc.

---

## Conclusion

OpenPanel demonstrates a **mature, well-architected TanStack Start application** with excellent patterns for forms, modals, and data fetching.

**Key insight:** They prioritize **simplicity and consistency** over advanced patterns like optimistic updates. This works for their analytics dashboard use case.

**For OpenScan:** We should adopt their form handling and UI patterns, but keep our optimistic updates and smart polling for real-time features like scanning and workflows.

**Next steps:**
1. Implement high-priority recommendations (Week 1)
2. Refactor forms to use React Hook Form (Week 2-3)
3. Adopt inline creation patterns where appropriate (Week 4+)

---

**Last Updated:** 2025-10-22 (Based on OpenPanel codebase analysis)