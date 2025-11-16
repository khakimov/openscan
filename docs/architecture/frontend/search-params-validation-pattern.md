# Search Params Validation Pattern

This document describes the best practices for handling search params in TanStack Router routes, based on the improvements made to the assets page.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Implementation Guide](#implementation-guide)
- [Code References](#code-references)
- [Common Patterns](#common-patterns)

## The Problem

### Issues with Manual Validation

Previously, our routes used manual type casting for search params validation:

```tsx
// ❌ Old approach - manual validation
export const Route = createFileRoute("/_auth/assets")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "discovery",
    };
  },
  loader: async (context: any) => {
    const tab = (context.search?.tab as string) || "discovery";
    // ...
  },
});
```

**Problems:**
1. **Type Safety Issues**: TypeScript can't infer proper types from manual casting
2. **No Runtime Validation**: Invalid values aren't caught or handled gracefully
3. **Loader Access Issues**: Search params aren't properly typed in loaders
4. **No Reactivity**: Pages don't properly re-render when search params change
5. **Query Invalidation**: Client-side queries don't sync with URL changes

### Component Re-rendering Issues

The component was using loader data directly instead of a reactive query:

```tsx
// ❌ Old approach - no reactivity
function Assets() {
  const devicesResponse = Route.useLoaderData(); // Static data, doesn't update
  const devices = devicesResponse.items || [];
  // ...
}
```

**Problems:**
1. Adding a device wouldn't update the UI (required page refresh)
2. Tab changes wouldn't filter data properly
3. Query invalidation from modals had no effect

## The Solution

### 1. Zod Schema Validation with Adapter

Use `@tanstack/zod-adapter` for proper type-safe validation:

```tsx
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

// ✅ Define schema with fallback and default values
const assetsSearchSchema = z.object({
  tab: fallback(z.enum(["discovery", "verified"]), "discovery").default("discovery"),
});

export const Route = createFileRoute("/_auth/assets")({
  validateSearch: zodValidator(assetsSearchSchema),
  // ...
});
```

**Key Points:**
- `fallback()` - Provides a fallback value for invalid inputs (no error thrown)
- `.default()` - Sets default value when param is missing
- `zodValidator()` - Provides correct input/output type inference

### 2. Loader Dependencies

Use `loaderDeps` to properly access search params in loaders:

```tsx
export const Route = createFileRoute("/_auth/assets")({
  validateSearch: zodValidator(assetsSearchSchema),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ deps: { tab } }) => {
    // Now `tab` is properly typed and the loader re-runs on changes
    const verificationStatus =
      tab === "verified"
        ? "VERIFIED"
        : (["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[]);

    const devicesResponse = await getDevicesData({
      data: { verificationStatus },
    });

    return devicesResponse;
  },
});
```

**Benefits:**
- Proper TypeScript inference
- Loader automatically re-runs when dependencies change
- Clean, declarative syntax

### 3. React Query Integration with Initial Data

Combine SSR data with reactive queries:

```tsx
import { useDevicesQuery } from "@/hooks/useDevicesQuery";

function Assets() {
  const { tab } = Route.useSearch();
  const initialData = Route.useLoaderData();

  // Map tab to verification status
  const verificationStatus =
    tab === "verified"
      ? "VERIFIED"
      : (["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[]);

  // Use query with SSR initial data
  const { data: devicesResponse } = useDevicesQuery({
    verificationStatus,
    initialData, // Prevents double-fetch on initial load
  });

  // Query data updates when invalidated
  const devices = devicesResponse?.items || [];

  return (
    // ...
  );
}
```

**Benefits:**
- No double-fetch on initial page load (uses SSR data)
- Automatically refetches when query is invalidated
- Properly responds to tab changes
- Real-time UI updates when data changes

### 4. Query Hook with Initial Data Support

Update query hooks to accept `initialData`:

```tsx
// src/hooks/useDevicesQuery.ts
interface UseDevicesQueryParams {
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[];
  initialData?: DevicesResponse; // Add this
}

export const useDevicesQuery = (params?: UseDevicesQueryParams) => {
  return useQuery<DevicesResponse>({
    queryKey: ['devices', params?.verificationStatus],
    initialData: params?.initialData, // Use SSR data first
    queryFn: async () => {
      // Fetch fresh data when needed
      const result = await getDevicesData({
        data: {
          verificationStatus: params?.verificationStatus
        }
      });
      return result;
    },
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
};
```

## Implementation Guide

### Step 1: Install Dependencies

```bash
pnpm add @tanstack/zod-adapter
```

### Step 2: Define Search Schema

Create a Zod schema for your search params:

```tsx
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const myRouteSearchSchema = z.object({
  // For enum values with fallback
  status: fallback(z.enum(["active", "inactive"]), "active").default("active"),

  // For optional strings
  filter: z.string().optional().default(""),

  // For numbers with fallback
  page: fallback(z.number(), 1).default(1),

  // For arrays
  tags: z.array(z.string()).optional().default([]),
});
```

### Step 3: Apply to Route

```tsx
export const Route = createFileRoute("/my-route")({
  validateSearch: zodValidator(myRouteSearchSchema),
  loaderDeps: ({ search }) => ({
    // Extract only the deps needed for loader
    status: search.status,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    // deps.status and deps.page are properly typed
    const data = await fetchData(deps);
    return data;
  },
  component: MyComponent,
});
```

### Step 4: Use in Component with Query

```tsx
function MyComponent() {
  const search = Route.useSearch(); // Fully typed
  const initialData = Route.useLoaderData();

  // Use reactive query with initial SSR data
  const { data } = useMyQuery({
    ...search,
    initialData,
  });

  return (
    <div>
      {/* Your component */}
    </div>
  );
}
```

## Code References

### Main Implementation

- **Route Definition**: `apps/user-application/src/routes/_auth/assets.tsx`
  - Lines 16-40: Search schema, validation, loader with deps
  - Lines 43-60: Component using search params with reactive query

### Query Hook Pattern

- **Query Hook**: `apps/user-application/src/hooks/useDevicesQuery.ts`
  - Lines 6-9: Interface with `initialData` support
  - Lines 19-44: Query implementation with initial data

### Server Function

- **Server Function**: `apps/user-application/src/server/devices.ts`
  - Lines 230-296: `getDevicesData` with verification status filtering

## Common Patterns

### Pattern 1: Tab-Based Filtering

```tsx
const searchSchema = z.object({
  tab: fallback(z.enum(["all", "active", "archived"]), "all").default("all"),
});

export const Route = createFileRoute("/items")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ deps: { tab } }) => {
    const filter = tab === "archived" ? "ARCHIVED" : ["ACTIVE", "PENDING"];
    return await getItems({ filter });
  },
});
```

### Pattern 2: Pagination with Defaults

```tsx
const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 20).default(20),
});

export const Route = createFileRoute("/paginated")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize
  }),
  loader: async ({ deps }) => {
    return await getItems({
      page: deps.page,
      pageSize: deps.pageSize,
    });
  },
});
```

### Pattern 3: Search with Debounce

```tsx
const searchSchema = z.object({
  q: z.string().optional().default(""),
  category: z.string().optional(),
});

function SearchComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const handleSearch = (query: string) => {
    navigate({
      search: (prev) => ({ ...prev, q: query, page: 1 }),
    });
  };

  return (
    <input
      value={search.q}
      onChange={(e) => handleSearch(e.target.value)}
    />
  );
}
```

### Pattern 4: Retaining Search Params Across Navigation

```tsx
import { retainSearchParams } from "@tanstack/react-router";

const searchSchema = z.object({
  debug: z.boolean().optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [
      // These params will be retained in all child route links
      retainSearchParams(["debug", "theme"]),
    ],
  },
});
```

### Pattern 5: Stripping Default Values from URL

```tsx
import { stripSearchParams } from "@tanstack/react-router";

const defaultValues = {
  sort: "newest",
  view: "grid",
};

const searchSchema = z.object({
  sort: z.string().default(defaultValues.sort),
  view: z.string().default(defaultValues.view),
});

export const Route = createFileRoute("/items")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [
      // Clean URLs: /items instead of /items?sort=newest&view=grid
      stripSearchParams(defaultValues),
    ],
  },
});
```

## Best Practices

### ✅ DO

1. **Always use Zod validation** for search params instead of manual type casting
2. **Use `fallback()` for enums** to gracefully handle invalid values
3. **Use `.default()` for optional params** to provide sensible defaults
4. **Use `loaderDeps`** to access search params in loaders
5. **Combine SSR data with queries** using `initialData` to prevent double-fetching
6. **Use type-safe navigation** with `from` prop when updating search params

### ❌ DON'T

1. **Don't use manual type casting** - Let Zod handle validation
2. **Don't access search in loader** without `loaderDeps`
3. **Don't use `any` types** - Zod provides full type inference
4. **Don't skip initial data** - Always pass SSR data to queries
5. **Don't throw errors for invalid params** - Use fallback values instead

## Troubleshooting

### Issue: Search params not updating in component

**Solution**: Make sure you're using a reactive query, not just loader data:

```tsx
// ❌ Wrong - static data
const data = Route.useLoaderData();

// ✅ Correct - reactive data
const { data } = useMyQuery({
  search: Route.useSearch(),
  initialData: Route.useLoaderData()
});
```

### Issue: Loader not re-running on search param changes

**Solution**: Use `loaderDeps` to declare dependencies:

```tsx
export const Route = createFileRoute("/route")({
  validateSearch: zodValidator(schema),
  loaderDeps: ({ search }) => ({ filter: search.filter }), // Add this
  loader: async ({ deps }) => {
    // Now re-runs when filter changes
  },
});
```

### Issue: Query invalidation not working

**Solution**: Ensure query key includes search param values:

```tsx
export const useMyQuery = (params) => {
  return useQuery({
    queryKey: ['items', params.filter, params.sort], // Include all params
    queryFn: () => fetchItems(params),
  });
};
```

### Issue: Double-fetching on initial load

**Solution**: Pass loader data as `initialData` to query:

```tsx
const { data } = useMyQuery({
  filter: search.filter,
  initialData: Route.useLoaderData(), // Prevents double-fetch
});
```

## References

- [TanStack Router Search Params Docs](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)
- [Zod Validation](https://zod.dev/)
- [TanStack Query Integration](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
- **Our Implementation**: `apps/user-application/src/routes/_auth/assets.tsx`
