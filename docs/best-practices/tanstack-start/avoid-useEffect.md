Short answer: **don’t fetch or derive app state in `useEffect`**. In TanStack Start (as of **Sept 21, 2025**) the happy path is:

1. **Fetch on navigation, not after render** → use **TanStack Router loaders** (SSR + streaming) and optionally seed TanStack Query from loaders. ([TanStack][1])
2. **Do server work on the server** → use **TanStack Start Server Functions** for reads/mutations, then invalidate router/queries. ([TanStack][2])
3. **Keep page/UI state in the URL** (typed search params) instead of mirrors in component state. ([TanStack][3])
4. **Reserve `useEffect` for true external side‑effects only** (DOM APIs, subscriptions, analytics, etc.). Most other `useEffect`s are unnecessary. ([React][4])

Below is a concrete “what to use instead” map plus copy‑pasteable patterns.

---

## What to use instead of `useEffect` (TanStack Start)

| If your `useEffect` was doing…                                  | Prefer this in Start                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fetching data on mount / when params change**                 | A **route `loader`** (runs on the server on first load, then on the client during SPA nav). You can **seed TanStack Query** with `queryClient.ensureQueryData` inside the loader for caching + hydration. ([TanStack][1])             |
| **Submitting forms / mutations, then refetch**                  | A **Server Function** (`createServerFn`) called from an event handler *or* a `<form action={serverFn.url}>`, then **`router.invalidate()`** (reload loaders) and/or **`queryClient.invalidateQueries()`** (targeted). ([TanStack][2]) |
| **Syncing UI to querystring**                                   | **Typed search params** via `validateSearch` and `Route.useSearch()`; update with `navigate({ search })`. Treat “search params as state.” ([TanStack][3])                                                                             |
| **Derived state (compute from props/data)**                     | **Compute during render** (or `useMemo` for expensive work). React’s guidance: *you might not need an Effect*. ([React][4])                                                                                                           |
| **Subscribing to external stores (WS, custom store)**           | **`useSyncExternalStore`** (correct concurrent‑safe subscription API). ([React][5])                                                                                                                                                   |
| **DOM integration (focus, non‑React widgets, event listeners)** | A **small, well‑scoped `useEffect`** (or `useLayoutEffect` if you must sync before paint). That’s one of the few legit uses. ([React][6])                                                                                             |

---

## Idiomatic code patterns

### 1) Data fetching with Router loader (+ TanStack Query cache)

```tsx
// routes/users.$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'

const userQuery = (id: string) =>
  queryOptions({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  })

export const Route = createFileRoute('/users/$id')({
  loader: ({ params, context: { queryClient } }) =>
    // Ensure data exists before render (SSR friendly)
    queryClient.ensureQueryData(userQuery(params.id)),
  component: UserPage,
})

function UserPage() {
  const { id } = Route.useParams()
  // Reads dehydrated cache and keeps it fresh
  const { data: user } = useSuspenseQuery(userQuery(id))
  return <h1>{user.name}</h1>
}
```

Why this: loaders run on the server for the first hit and coordinate fetches with navigation; when combined with Query you get cache, dehydration/rehydration, retries, background refetch, etc. ([TanStack][1])

---

### 2) Mutations with Server Functions + invalidation

```ts
// server/addTodo.ts
import { createServerFn } from '@tanstack/react-start'

export const addTodo = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    // do secure server work here (DB/write, secrets, cookies, etc.)
    const res = await fetch('https://api.example.com/todos', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) throw new Error('Failed to add todo')
    return res.json()
  })
```

```tsx
// routes/todos.tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addTodo } from '../server/addTodo'

export const Route = createFileRoute('/todos')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData({
      queryKey: ['todos'],
      queryFn: () => fetch('/api/todos').then(r => r.json()),
    }),
  component: TodosPage,
})

function TodosPage() {
  const qc = useQueryClient()
  const router = useRouter()

  const add = useMutation({
    mutationFn: (title: string) => addTodo({ data: { title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] }) // refresh Query
      router.invalidate()                           // refresh route loaders
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const title = new FormData(e.currentTarget).get('title') as string
        add.mutate(title)
      }}
    >
      <input name="title" />
      <button type="submit" disabled={add.isPending}>Add</button>
    </form>
  )
}
```

Server Functions run **only on the server**, can access request context/headers/secrets, and can be called from components, loaders, or even used as progressive‑enhancement **form actions** via `<form action={serverFn.url}>`. After a mutation, use router/query invalidation to refresh the right data. ([TanStack][2])

*(Prefer `<form action={addTodo.url} method="POST">` when you want no‑JS support and built‑in progressive enhancement; Start supports this pattern out of the box.)* ([TanStack][2])

---

### 3) Treat search params as state (typed & reactive)

```tsx
// routes/products.tsx
import { createFileRoute } from '@tanstack/react-router'

// Validate & type the querystring once for the route
export const Route = createFileRoute('/products')({
  validateSearch: (s) => ({
    q: typeof s.q === 'string' ? s.q : '',
    sort: s.sort === 'price' ? 'price' : 'newest' as 'newest' | 'price',
  }),
  component: ProductsPage,
})

function ProductsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <>
      <input
        value={search.q}
        onChange={(e) =>
          navigate({ search: (prev) => ({ ...prev, q: e.target.value }) })
        }
      />
      {/* list… */}
    </>
  )
}
```

This avoids “mirror” state + effects to keep UI and URL in sync, and gives type‑safe, serializable state that survives reload/share. ([TanStack][3])

---

### 4) The few times you still want `useEffect`

```tsx
// External system (DOM/event/subscription)
useEffect(() => {
  const onResize = () => console.log(window.innerWidth)
  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}, [])
```

Per the React docs, Effects are for **synchronizing with systems outside React** (DOM, network clients, timers, logging, etc.)—not for deriving state or fetching app data after render. ([React][6])

If you’re reading from a custom store or WebSocket, prefer `useSyncExternalStore` so concurrent rendering stays consistent:

```ts
const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
```

([React][5])

---

## A quick decision checklist (2025)

* **Page needs data?** Put it in a **route `loader`** (optionally seed TanStack Query). Use **deferred/streaming** when non‑critical data can hydrate later. ([TanStack][1])
* **User submits/changes data?** Do it in a **Server Function**; then **invalidate** the router and/or relevant queries. ([TanStack][2])
* **State belongs in the URL?** Use **typed search params**. ([TanStack][3])
* **Purely derived from props/data?** Compute during render; **no effect needed**. ([React][4])
* **External integration only?** Use a **small `useEffect`** (or `useLayoutEffect` if you must sync before paint). ([React][6])
* **SSR/SEO?** Make sure you’re using loader‑based fetching and, if you use deferred data, set up SSR streaming correctly. ([TanStack][7])

---

## Bonus: React 19 niceties you can layer on

* **`useActionState`** gives you built‑in pending/error/result state for form actions. With Start, you can pair it with Server Functions or use **TanStack Form** if you want a richer form story. ([React][8])
* **`use`** lets components suspend on a promise (client or server). Frameworks can integrate this with server rendering strategies. ([React][9])

---

### Why this is the “least foot‑gun” setup in 2025

React’s own docs stress that many `useEffect`s are unnecessary and make code slower and harder to reason about. Start’s **server‑first loaders + server functions** align with that guidance while giving you coordinated SSR, streaming, progressive enhancement, and a clear invalidation model with Router/Query—so your data shows up at render time instead of “after a spinner.” ([React][4])

If you want, share a small snippet of a spot where `useEffect` is biting you—I’ll rewrite it the Start way.

[1]: https://tanstack.com/router/latest/docs/framework/react/guide/data-loading "Data Loading | TanStack Router React Docs"
[2]: https://tanstack.com/start/latest/docs/framework/react/server-functions "Server Functions | TanStack Start React Docs"
[3]: https://tanstack.com/router/latest/docs/framework/react/guide/search-params?utm_source=chatgpt.com "Search Params | TanStack Router React Docs"
[4]: https://react.dev/learn/you-might-not-need-an-effect?utm_source=chatgpt.com "You Might Not Need an Effect"
[5]: https://react.dev/reference/react/useSyncExternalStore?utm_source=chatgpt.com "useSyncExternalStore"
[6]: https://react.dev/learn/synchronizing-with-effects?utm_source=chatgpt.com "Synchronizing with Effects"
[7]: https://tanstack.com/router/v1/docs/framework/react/guide/ssr?utm_source=chatgpt.com "SSR | TanStack Router React Docs"
[8]: https://react.dev/reference/react/useActionState?utm_source=chatgpt.com "useActionState"
[9]: https://react.dev/reference/react/use?utm_source=chatgpt.com "use - React"

Great question. Zustand fits into the TanStack Start/Router story as your external client store for UI/session state and any push‑based or bespoke domain state—not as the primary data‑fetcher. You still fetch “real” data in route loaders (and mutate via Server Functions), while Zustand holds the reactive state your components read without useEffect boilerplate. TanStack Router can even dehydrate/hydrate your Zustand snapshot for SSR and streaming, and coordinate resets/invalidation on navigation.
TanStack
+1

Below is a compact, idiomatic setup that shows exactly where Zustand comes in.

When to use Zustand vs. Query in Start

Server data (CRUD, caching, refetching): Route loaders + (optionally) TanStack Query. This avoids post‑render fetching and spinners.
TanStack

Client/UI & app‑session state: Use Zustand (theme, modals, multi‑step wizards, selection, optimistic/mutation UI, WebSocket buffers, etc.). React components read the store with a selector; no effects required. Under the hood, Zustand integrates with React’s useSyncExternalStore for concurrent‑safe reads.
React

Mutations: Do the work in Server Functions, then update the store and/or router.invalidate() to refresh loader data.
TanStack
+1

Minimal integration recipe (per‑request store + SSR hydration)
1) A vanilla Zustand store you can fill from a loader
// src/stores/users.ts
import * as React from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'

type User = { id: string; name: string }
type State = { byId: Record<string, User>; status: 'idle'|'loading'|'ready'|'error'; error?: string }
type Actions = {
  bootstrap(id: string): Promise<void>
  setUser(u: User): void
  clearTransient(): void
}
export type UsersStore = StoreApi<State & Actions>

export function createUsersStore(initial?: Partial<State>): UsersStore {
  return createStore<State & Actions>((set, get) => ({
    byId: {},
    status: 'idle',
    setUser: (u) => set(s => ({ byId: { ...s.byId, [u.id]: u } })),
    async bootstrap(id) {
      if (get().byId[id]) return
      set({ status: 'loading' })
      const res = await fetch(`/api/users/${id}`)
      if (!res.ok) return set({ status: 'error', error: 'Failed to load' })
      const u: User = await res.json()
      set(s => ({ status: 'ready', byId: { ...s.byId, [u.id]: u } }))
    },
    clearTransient: () => set({ error: undefined }),
    ...initial,
  }))
}

// React glue: provide the store instance and a typed hook
const UsersCtx = React.createContext<UsersStore | null>(null)
export function UsersProvider({ store, children }: { store: UsersStore; children: React.ReactNode }) {
  return <UsersCtx.Provider value={store}>{children}</UsersProvider>
}
export function useUsers<T>(sel: (s: State & Actions) => T) {
  const store = React.useContext(UsersCtx)
  if (!store) throw new Error('UsersProvider missing')
  return useStore(store, sel) // concurrent-safe via useSyncExternalStore
}

2) Pass the store through the Router context + hydrate/dehydrate
// src/router.tsx
import { createRouter, createRootRouteWithContext, type AnyRoute } from '@tanstack/react-router'
import { UsersProvider, createUsersStore, type UsersStore } from './stores/users'

// 1) Type your router context so routes/loader get it
type RouterCtx = { users: UsersStore }
export const rootRoute = createRootRouteWithContext<RouterCtx>()()

export function makeRouter(routeTree: AnyRoute) {
  // Per-request store instance to avoid cross-request leaks on SSR
  const users = createUsersStore()

  const router = createRouter({
    routeTree,
    context: { users },

    // 2) Let Router serialize your externals along with its own payload
    dehydrate: () => ({ users: users.getState() }),
    hydrate: (d) => { if (d.users) users.setState(d.users, true) }, // replace

    // 3) Wrap the app so components can read the store with useUsers(...)
    Wrap: ({ children }) => <UsersProvider store={users}>{children}</UsersProvider>,
  })

  // Optional: clear transient mutation state after a *resolved* navigation
  router.subscribe('onResolved', () => users.getState().clearTransient()) // e.g. hide “Saved!” toasts
  return router
}


TanStack Router explicitly supports augmenting hydration with your own data (e.g., a Zustand snapshot) via dehydrate/hydrate, and using a Wrap component to install providers.
TanStack
+1

Router context is the recommended way to inject dependencies like your store so loaders can access them.
TanStack

3) Load into the store in the route loader (no useEffect)
// src/routes/users.$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useUsers } from '../stores/users'

export const Route = createFileRoute('/users/$id')({
  // Preload before render (SSR-friendly, no “flash of loading”)
  loader: async ({ params, context }) => context.users.getState().bootstrap(params.id),
  component: function UserPage() {
    const { id } = Route.useParams()
    const user = useUsers((s) => s.byId[id])
    return user ? <h1>{user.name}</h1> : <div>Loading…</div>
  },
})


This follows the Router docs: ensure data in loaders to avoid waterfall fetching/spinners and improve SEO.
TanStack

Mutations: Server Function → update store → (optionally) invalidate
// src/server/updateUser.ts
import { createServerFn } from '@tanstack/react-start'
export const updateUser = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  // Do secure server work (DB write, etc) and return the updated record
  return await db.users.update(data.id, data)
})

// src/routes/users.$id.edit.tsx
import { useRouter } from '@tanstack/react-router'
import { useUsers } from '../stores/users'
import { updateUser } from '../server/updateUser'

function EditUserForm() {
  const router = useRouter()
  const setUser = useUsers(s => s.setUser)

  async function onSubmit(values: { id: string; name: string }) {
    const updated = await updateUser({ data: values })
    setUser(updated)           // optimistic/local update
    router.invalidate()        // refresh any loaders that also depend on this data
  }

  // …render form…
}


TanStack Start Server Functions run only on the server; after a mutation, router.invalidate() refreshes loader data in the background.
TanStack
+1

Where Zustand shines in this setup

Client/session/UI state (theme, modal stack, wizard progress, toasts). If you need persistence across reloads, add persist middleware:

import { persist, createJSONStorage } from 'zustand/middleware'
// …create(persist((set) => ({}), { name: 'ui', storage: createJSONStorage(() => localStorage) }))


This pattern is SPA‑routing friendly and avoids SSR storage access.
Zustand Documentation
+1

Push‑based data (WebSockets, RTC, in‑memory CRDTs): keep the live buffer in a store; do a small effect to attach listeners, but components read state without effects. Zustand’s React binding uses useSyncExternalStore, so reads are concurrent‑safe.
React

Submission/optimistic UI state: track submissions (pending/error/success) in a tiny “mutation” store; clear it on route changes with router.subscribe('onResolved', …). This pattern is called out in the Router docs.
TanStack

Performance & correctness tips

Prefer atomic selectors: useUsers(s => s.byId[id]) re‑renders only when that slice changes. If you need object results, use useShallow / equality functions to avoid needless re‑renders.
Zustand Documentation

Instantiate one store per request (as shown) so SSR never leaks data between users. This also plays nicely with Router dehydrate/hydrate.
TanStack

Keep effects for real side‑effects only (DOM, subscriptions). Don’t fetch app data in effects—fetch in loaders; compute derived values in render. This is React’s guidance.
React

TL;DR wiring diagram

Loader ensures data → Zustand store is ready at render (SSR/SEO‑friendly).
TanStack

Components read slices with useStore (no useEffect).
React

Mutations happen in Server Functions → update store and/or router.invalidate().
TanStack
+1

SSR: Router dehydrate/hydrate shuttles your store snapshot. Wrap installs the provider.
TanStack
+1

If you share a small snippet of how you currently use useEffect to seed a Zustand store, I can rewrite it in this Start‑friendly pattern.
