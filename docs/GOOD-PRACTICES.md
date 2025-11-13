# Frontend Good Practices (TanStack Router + Query)

This guide captures UI patterns worth standardizing across our apps. The notes come from auditing the OpenPanel Start project (`openpanel/apps/start`) and the official TanStack Router/Start examples (`router/examples/react`). Each section explains the intent, shows the minimal code involved, and calls out when to apply the technique.

---

## 0. Fresh Patterns Worth Copying (Feb 2025)

- **Loader + Component Share the Same Query Options** `#official` – The basic React Query file-based sample keeps `queryOptions` in a single factory, then spreads it in both the loader and the component (`router/examples/react/basic-react-query-file-based/src/routes/posts.route.tsx`). This guarantees consistent `queryKey`, `staleTime`, and typing.

  ```tsx
  // postsQueryOptions.tsx
  export const postsQueryOptions = queryOptions({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  // loader
  export const Route = createFileRoute('/posts')({
    loader: ({ context }) =>
      context.queryClient.ensureQueryData(postsQueryOptions),
    component: PostsLayout,
  });

  // component
  const { data: posts } = useSuspenseQuery(postsQueryOptions);
  ```

- **Query Error Reset + Router Invalidate for Recovery** `#official` – When a leaf route throws, the sample couples `useQueryErrorResetBoundary` with `router.invalidate()` to retry without tearing down the tree (`router/examples/react/basic-react-query-file-based/src/routes/posts.$postId.tsx`).

  ```tsx
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  <button onClick={() => router.invalidate()}>retry</button>
  ```

- **Gate-Supplied Context Instead of Re-Reading Params** `#openpanel` – Start wraps organization/project routes in gate providers so children call `useProject()` / `useOrganization()` rather than `Route.useParams()` (`openpanel/apps/start/src/routes/_app.$organizationId.$projectId.dashboards.tsx`). We mirror this in `apps/user-application/src/routes/_app.$organizationId.$projectId.*`.

  ```tsx
  export const Route = createFileRoute('/_app/$organizationId/$projectId')({
    loader: async ({ context, params }) =>
      context.queryClient.ensureQueryData(projectDetailQuery(params.projectId)),
    component: () => (
      <ProjectGate project={Route.useLoaderData().project}>
        <Outlet />
      </ProjectGate>
    ),
  });

  function ChildTab() {
    const project = useProject(); // full typed object
    …
  }
  ```

- **Timer-Based UI Hints With Cleanup** `#openpanel` – When OpenPanel needs temporary highlights it stores the timer in a ref, clears it on every update, and tears it down on unmount (`openpanel/apps/start/src/routes/_app.$organizationId.$projectId.dashboards_.$dashboardId.tsx:305-325`). We use the same pattern for discovery badges instead of bare `setTimeout`.

  ```tsx
  const resetRef = useRef<number>();

  const handleDevicesAdded = (ids: string[]) => {
    window.clearTimeout(resetRef.current);
    setNewlyAdded(new Set(ids));
    resetRef.current = window.setTimeout(() => setNewlyAdded(new Set()), 3000);
  };

  useEffect(() => () => window.clearTimeout(resetRef.current), []);
  ```

- **Pending Components Fall Back to Params** `#openpanel` – Pending shells rely on `Route.useParams()` because gates are not mounted yet (`openpanel/apps/start/src/routes/_steps.onboarding.project.tsx`). Keep using params-only pending views in our app so we don’t touch context before it exists.

  ```tsx
  const Pending = () => {
    const { organizationId, projectId } = Route.useParams();
    return (
      <AppLayout skeleton>
        <AssetsTabHeader organizationId={organizationId} projectId={projectId} disabled />
        <PageLoadingFallback compact />
      </AppLayout>
    );
  };
  ```

---

## 1. Preload-Intent Navigation

- **Why**: Keep route transitions feeling instant without over-fetching.
- **Pattern**: Set `defaultPreload: 'intent'` on the router and opt-in per link.
- **Reference**: `openpanel/apps/start/src/router.tsx:9-22`.

```tsx
// Router
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  Wrap: ({ children }) => (
    <TanstackQuery.Provider {...rqContext} apiUrl={envs.apiUrl}>
      {children}
    </TanstackQuery.Provider>
  ),
})

// Link
<Link to="/dashboard" preload="intent" className="..." />
```

Use `defaultPreload: 'intent'` when routes are fetch-heavy and the user benefits from hover/focus prefetching. Opt out (`preload={false}`) for destructive routes or admin-only screens.

---

## 2. Parent Loaders as Data Singletons

- **Why**: Prevent repeated database calls across nested onboarding flows.
- **Pattern**: Fetch shared data in a parent `beforeLoad` and expose it through context.
- **Reference**: `openpanel/apps/start/src/routes/__root.tsx:35-63` and `_steps.onboarding.project.tsx:21-61`.

```tsx
// Root route
export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context }) => {
    const [session, cookies] = await Promise.all([
      context.queryClient.ensureQueryData(context.trpc.auth.session.queryOptions()),
      getCookiesFn().catch(() => ({})),
    ])

    return { session, cookies }
  },
})

// Child route loader
export const Route = createFileRoute('/_steps/onboarding/project')({
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search)
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({ inviteId: search.data.inviteId }),
      )
    }
  },
})
```

Fetch once at the parent when the same shape is required by every step (session, onboarding status). Use the child loader only for step-specific preloads.

---

## 3. Pending UI Without Layout Jank

- **Why**: Avoid the “black screen” when TanStack Router swaps routes.
- **Pattern**: Provide a `pendingComponent` that renders inside the persistent layout.
- **Reference**: `openpanel/apps/start/src/routes/__root.tsx:64-83`, `.../_steps.onboarding.project.tsx:23`, `router/examples/react/kitchen-sink/src/main.tsx:32-60`.

```tsx
export const Route = createFileRoute('/onboarding/project')({
  pendingComponent: FullPageLoadingState,
})

function RouterSpinner() {
  const isPending = useRouterState({ select: (s) => s.status === 'pending' })
  return <Loader show={isPending} />
}
```

Embed the spinner in the shared layout so headers/sidebars never unmount. For micro-transitions within a panel, reach for inline spinners or skeleton rows.

---

## 4. Optimistic Mutations With Query Patching

- **Why**: UI stays responsive while the network round-trip completes.
- **Pattern**: Use `onMutate` to snapshot, patch the cache, and cancel conflicting queries.
- **Reference**: `router/examples/react/start-trellaux/src/queries.ts:20-108`, `.../components/Board.tsx:40-81`.

```tsx
export function useCreateColumnMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createColumn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries()
      queryClient.setQueryData(boardQueries.detail(variables.data.boardId).queryKey, (board) =>
        board
          ? {
              ...board,
              columns: [
                ...board.columns,
                { ...variables.data, order: board.columns.length + 1, id: `temp-${Date.now()}` },
              ],
            }
          : board,
      )
    },
  })
}
```

Pair `onMutate` with `onError` (rollback) and `onSettled` (refetch) for production use; the Trellaux example omits rollback for brevity. Keep IDs deterministic to reconcile optimistic records.

---

## 5. Fast Mutations With Cache Invalidation

- **Why**: Safer alternative when optimistic patching is not worth the risk.
- **Pattern**: Call `invalidateQueries` after a mutation succeeds.
- **Reference**: `openpanel/apps/start/src/components/settings/edit-project-details.tsx:40-63`.

```tsx
const mutation = useMutation(
  trpc.project.update.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries(trpc.project.get.pathFilter())
      toast.success('Project updated')
    },
  }),
)
```

Use invalidation when mutations have complex server-side validation or touching multiple tables. Combine with a subtle loading state to avoid stale flashes.

---

## 6. Intent-Based Prefetch in Loaders

- **Why**: Seed TanStack Query before the component runs, eliminating suspense waterfalls.
- **Pattern**: Call `prefetchQuery` or `ensureQueryData` in loaders with validated params.
- **Reference**: `openpanel/apps/start/src/routes/_steps.onboarding.project.tsx:23-37`, `router/examples/react/start-large/src/routes/search/searchPlaceholder.tsx:22-60`.

```tsx
// Validated search params
const validateSearch = z.object({ inviteId: z.string().optional() })

export const Route = createFileRoute('/_steps/onboarding/project')({
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search)
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({ inviteId: search.data.inviteId }),
      )
    }
  },
})
```

Validate params before prefetching to guard against malformed URLs. Use `ensureQueryData` when you need the data immediately inside the loader.

---

## 7. Reactive Form UX

- **Why**: Keep forms resilient to derived field toggles (e.g., onboarding project types).
- **Pattern**: Pair `react-hook-form` with `useWatch` and targeted `useEffect` resets.
- **Reference**: `openpanel/apps/start/src/routes/_steps.onboarding.project.tsx:64-125`.

```tsx
const form = useForm<IForm>({ resolver: zodResolver(schema), defaultValues })
const isWebsite = useWatch({ name: 'website', control: form.control })

useEffect(() => {
  if (!isWebsite) {
    form.setValue('domain', null)
    form.setValue('cors', [])
  }
}, [isWebsite, form])
```

Use this pattern when toggles enable/disable dependent fields. Clean up validation errors with `form.clearErrors()` when switches change state.

---

## 8. Router-Level Auth Guards

- **Why**: Block route access consistently on both server and client transitions.
- **Pattern**: Throw `redirect` from `beforeLoad` when the user is not authorized.
- **Reference**: `openpanel/apps/start/src/routes/_steps.onboarding.project.tsx:16-22`.

```tsx
beforeLoad: async ({ context }) => {
  if (!context.session.session) {
    throw redirect({ to: '/onboarding' })
  }
},
```

Keep guards in the router layer so components stay pure and testable. For multi-tenant routes, validate permissions alongside the session.

---

## 9. Global Transition Indicators

- **Why**: Show router progress without introducing DOM thrash.
- **Pattern**: Subscribe to router state via `useRouterState`.
- **Reference**: `router/examples/react/kitchen-sink/src/main.tsx:28-44`.

```tsx
function RouterSpinner() {
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' })
  return <Spinner show={isLoading} />
}
```

Embed the spinner in a top-level layout or sidebar. Combine with `pendingComponent` for route-specific skeletons.

---

## 10. Optimistic Field Rendering

- **Why**: Reflect mutation state inline (e.g., editing board names) without duplicate storage.
- **Pattern**: Inspect mutation `isPending` and render `variables` while waiting.
- **Reference**: `router/examples/react/start-trellaux/src/components/Board.tsx:46-78` and `/Column.tsx:150-187`.

```tsx
<EditableText
  value={
    updateBoardMutation.isPending && updateBoardMutation.variables.data.name
      ? updateBoardMutation.variables.data.name
      : board.name
  }
  onChange={(value) => updateBoardMutation.mutate({ data: { id: board.id, name: value } })}
/>
```

Use this when optimistic mutations target a single field. For broader objects, rely on cache patching instead.

---

## 11. Immediate Focus & Scroll Feedback

- **Why**: Reinforce user actions (e.g., auto-scroll new columns into view).
- **Pattern**: Track refs and mutably scroll when optimistic data arrives.
- **Reference**: `router/examples/react/start-trellaux/src/components/Board.tsx:15-39`.

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null)
const columnRef = useCallback((node: HTMLElement | null) => {
  if (scrollContainerRef.current && newColumnAddedRef.current) {
    newColumnAddedRef.current = false
    scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth
  }
}, [])
```

Deploy this for horizontally scrolling lists (dashboards, port lists). Set the “new item added” flag within the mutation success handler.

---

## 12. Server Functions & Middleware

- **Why**: Share loaders between client and server, add validation pipelines.
- **Pattern**: Compose `createServerFn` with middleware, then call through TanStack Query.
- **Reference**: `router/examples/react/start-large/src/routes/search/searchPlaceholder.tsx:6-67`.

```tsx
const middleware = createMiddleware({ type: 'function' })
  .inputValidator(searchSchema)
  .client(({ next }) => next({ context: { client: {...} }, sendContext: {...} }))
  .server(({ next }) => next({ context: { server: {...} }, sendContext: {...} }))

const fn = createServerFn().middleware([middleware]).handler(() => ({ searchPlaceholder: 0 }))

export const Route = createFileRoute('/search/searchPlaceholder')({
  context: (ctx) => ({
    searchQueryOptions: queryOptions({
      queryKey: ['searchPlaceholder'],
      queryFn: () => fn({ data: ctx.deps.search }),
    }),
  }),
})
```

Adopt this when we need shared validation between server-rendered loaders and client hydration (e.g., search pages, analytics exports).

---

## Quick Checklist Before Shipping a Flow

1. **Navigation** – Is `defaultPreload` appropriate? Do sensitive routes disable prefetch?
2. **Data** – Can shared data move to a parent loader/context?
3. **Pending UI** – Does a route-level spinner keep the layout mounted?
4. **Mutations** – Should the mutation be optimistic or invalidate on success?
5. **Forms** – Are dependent fields reset/cleared when toggles change?
6. **Feedback** – Do we surface router-level progress or mutation states inline?

---

## Further Reading

- OpenPanel Start (real-world app): `openpanel/apps/start/src/routes/*`, `.../components/*`, `.../integrations/trpc/react.ts`.
- TanStack Router Kitchen Sink (UI experiments): `router/examples/react/kitchen-sink`.
- Trellaux Sample (optimistic kanban): `router/examples/react/start-trellaux`.
- TanStack Start advanced patterns: `router/examples/react/start-large`.

Treat this document as a living playbook—add new snippets as we scale more flows.

---

## Applying These Patterns in `apps/user-application`

- **Tabs & Navigation** – Update `PageTabsLink` (`apps/user-application/src/components/navigation/page-tabs.tsx`) to pass `to`/`params` plus `preload="intent"` so tabs in `.../assets/discovery.tsx` and `.../$deviceId.tsx` prefetch consistently and stop hand-crafting URLs.
- **Router Spinner** – Reuse `InlineRouterSpinner` (`apps/user-application/src/components/ui/inline-router-spinner.tsx`) in every top-level header; add it to routes that still show manual loaders (e.g. `.../assets/verified.tsx`, `.../scans.tsx`) to give users uniform transition feedback.
- **Suspense Fallback Panel** – Keep using the `Suspense` + `<Spinner size="lg" />` panel established in `src/routes/_app.$organizationId.$projectId.scans.tsx`; wrap new data tables and detail panes the same way instead of bespoke skeletons.
- **Optimistic Mutations** – Prefer the helpers in `src/lib/optimistic-updates.ts` when mutating devices/schedules. New mutations should follow the pattern in `src/queries/device-queries.ts:182` so optimistic delete/toggle behaviour stays consistent.
- **Query Definitions** – Centralize loader + component data fetching through `queryOptions()` factories (`src/queries/*.ts`). When adding a feature, create a query module first and call `queryClient.ensureQueryData(...)` inside the route loader like `.../assets/discovery.tsx:19` to keep SSR and client usage aligned.

---

## Additional Patterns from OpenPanel Start

- **Root Context Warm-Up** – `openpanel/apps/start/src/routes/__root.tsx` fetches session + cookies in one shot so child routes inherit hydrated data without extra calls.

```tsx
export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context }) => {
    const [session, cookies] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.auth.session.queryOptions(),
      ),
      getCookiesFn().catch(() => ({})),
    ]);
    return { session, cookies };
  },
});
```

Copy this layout when several siblings need the same auth or preference bootstrap—just drop different server fns into the `Promise.all`.

- **Server-Backed Client Stores** – `openpanel/apps/start/src/hooks/use-cookie-store.tsx` marries a `createServerFn` setter with a browser event bus so cookie updates stay in sync across tabs and SSR.

```tsx
const setCookieFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ key: z.enum(VALID_COOKIES), value: z.string() }))
  .handler(({ data }) => setCookie(data.key, data.value));

export function useCookieStore<T>(key: CookieKey, defaultValue: T) {
  const { cookies } = useRouteContext({ strict: false });
  const [value, setValue] = useState<T>((cookies?.[key] ?? defaultValue) as T);

  return [
    value,
    (next: T) => {
      setValue(next);
      setCookieFn({ data: { key, value: String(next) } });
      window.dispatchEvent(new CustomEvent(COOKIE_EVENT, { detail: { key, value: next } }));
    },
  ] as const;
}
```

Reach for this pattern when a preference must persist server-side but react instantly client-side (theme, chart ranges, onboarding state).

- **Lazy Session Refresh** – `openpanel/apps/start/src/hooks/use-session-extension.ts` delays the first extend call by five seconds, then renews auth every five minutes without blocking navigation.

```tsx
useEffect(() => {
  if (!session) return;

  const extend = () => extendMutation.mutate();
  const timer = setTimeout(extend, 5_000);
  const interval = setInterval(extend, 5 * 60_000);

  return () => {
    clearTimeout(timer);
    clearInterval(interval);
  };
}, [session]);
```

This staggered schedule keeps background heartbeats from racing the user’s initial requests.

- **Immutable Env Queries** – `openpanel/apps/start/src/server/get-envs.ts` exposes environment values with `staleTime: Infinity`, guaranteeing a single fetch per session and keeping client code type-safe.

```tsx
export const getServerEnvs = createServerFn().handler(async () => ({
  apiUrl: process.env.API_URL!,
  dashboardUrl: process.env.DASHBOARD_URL!,
  isSelfHosted: Boolean(process.env.SELF_HOSTED),
}));

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ['server-envs'],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});
```

Use this when values never change at runtime (feature flags, build metadata).

- **Structured Error States** – The root route injects a branded fallback with a recovery link instead of returning raw stack traces (`openpanel/apps/start/src/routes/__root.tsx:39`).

```tsx
errorComponent: ({ error }) => (
  <FullPageErrorState
    title="Something went wrong"
    description={error.message}
  >
    <LinkButton href="/">Go back to home</LinkButton>
  </FullPageErrorState>
),
```

Adopt the same approach in our layout shells so catastrophic failures remain on-brand and help users recover quickly.

- **Parallel Prefetch for Dense Views** – Profile tabs use `Promise.all` to prepare multiple datasets before rendering, eliminating spinner waterfalls (`openpanel/apps/start/src/routes/_app.$organizationId.$projectId_.profiles.$profileId._tabs.index.tsx`).

```tsx
await Promise.all([
  context.queryClient.prefetchQuery(
    context.trpc.profile.metrics.queryOptions({ profileId, projectId }),
  ),
  context.queryClient.prefetchQuery(
    context.trpc.profile.activity.queryOptions({ profileId, projectId }),
  ),
  context.queryClient.prefetchQuery(
    context.trpc.profile.mostEvents.queryOptions({ profileId, projectId }),
  ),
  context.queryClient.prefetchQuery(
    context.trpc.profile.popularRoutes.queryOptions({ profileId, projectId }),
  ),
]);
```

Reach for this when a view needs several independent slices (metrics, charts, logs) and you want them all ready when the shell mounts.

- **Query-Driven Components** – Loader + component both use typed `queryOptions`, keeping data-fetch logic centralized. Example: notifications rules tab (`openpanel/apps/start/src/routes/_app.$organizationId.$projectId_.notifications._tabs.rules.tsx`).

```tsx
await context.queryClient.prefetchQuery(
  context.trpc.notification.rules.queryOptions({ projectId }),
);

const query = useQuery(
  trpc.notification.rules.queryOptions({ projectId }),
);
```

Do the same for our tables to avoid duplicating query keys and caching logic.

- **zod Everywhere** – OpenPanel validates search params before hitting the server, preventing malformed URLs from ever running loaders (`openpanel/apps/start/src/routes/_steps.onboarding.project.tsx`).

```tsx
const validateSearch = z.object({ inviteId: z.string().optional() });

const parsed = validateSearch.safeParse(location.search);
if (parsed.success && parsed.data.inviteId) {
  await context.queryClient.prefetchQuery(/* ... */);
}
```

Mirror this in our onboarding and filters so we never rely on ad-hoc parsing.

- **Typed Data Shaping** – Chart helpers generate `IChartEvent[]` arrays from raw query data with explicit fallbacks (`openpanel/apps/start/src/routes/_app.$organizationId.$projectId_.events._tabs.stats.tsx`).

```tsx
const fallback: IChartEvent[] = [
  { id: 'A', name: '*', displayName: 'All events', segment: 'event', filters: filters ?? [] },
];

const eventsForCharts = events.length
  ? events.map((name) => ({
      id: name,
      name,
      displayName: name,
      segment: 'event',
      filters: filters ?? [],
    }))
  : fallback;
```

Keeping transformations typed keeps downstream components simple—follow suit in our device and scan visualizations.

- **Mutation Invalidation Playbook** – Many OpenPanel modals finish by invalidating focused query families (`openpanel/apps/start/src/modals/add-integration.tsx`, `edit-event.tsx`) instead of hand-rolling optimistic patches.

```tsx
await queryClient.invalidateQueries(trpc.integration.list.pathFilter());
await queryClient.invalidateQueries(trpc.client.list.pathFilter());
```

Use the same `pathFilter()` helpers when a mutation touches complex shared state.
