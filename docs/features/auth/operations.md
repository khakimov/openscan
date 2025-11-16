# Authentication Session Operations

## Login (OAuth via Better Auth)
- **Gate unauthenticated route**: `apps/user-application/src/routes/_login.tsx:5` fetches `auth.session` via tRPC and redirects signed-in users before rendering the form.
- **Render provider buttons**: `apps/user-application/src/routes/_login.login.tsx:49` embeds OAuth triggers so the landing page stays static.
- **Start Google OAuth**: `apps/user-application/src/features/auth/components/google-oauth-button.tsx:14` calls `authClient.signIn.social({ provider: 'google', callbackURL: '/login' })` and surfaces UI loading/error states.
- **Start GitHub OAuth**: `apps/user-application/src/features/auth/components/github-oauth-button.tsx:15` mirrors the Google flow, pointing to the same Better Auth callback.
- **Proxy Better Auth endpoints**: `apps/user-application/src/routes/api/auth.$.tsx:4` forwards `/api/auth/*` GET/POST traffic to `getAuth().handler`, enabling OAuth and session callbacks inside TanStack Router.

## Session Hydration & Guards
- **Build request-scoped context**: `apps/user-application/src/trpc/context.ts:19` reads the Better Auth session, backfills `organizationId`, and exposes `{ user, request }` to every procedure.
- **Expose session over tRPC**: `apps/user-application/src/trpc/routers/auth.ts:19` returns `{ session | null }` without throwing so guards can branch without try/catch.
- **Hydrate QueryClient with superjson**: `apps/user-application/src/integrations/tanstack-query/root-provider.tsx:13` applies OpenPanel defaults (stale/gc times, superjson serialize/deserialize) ensuring SSR and browser share the same cache.
- **Preserve cookies during SSR**: `apps/user-application/src/integrations/trpc/react.ts:31` returns a real `Headers` object from `getIsomorphicHeaders`, letting Better Auth cookies flow into `httpBatchLink`.
- **Guard the authenticated shell**: `apps/user-application/src/routes/_app.tsx:74` ensures `auth.session` exists before loading sidebar data, otherwise redirects back to `/` with a `redirect` query param.
- **Handle marketing vs. app redirect**: `apps/user-application/src/routes/index.tsx:8` reuses the same session query to decide between showing the landing page, onboarding, or deep-linking into an org/project.
- **Server helpers for legacy code**: `apps/user-application/src/server/utils/auth.ts:9` exports `getCurrentOrganizationId()` that reads Better Auth session + organization plugin for server-only utilities.

## Logout & Session Refresh
- **Client-side sign out**: `apps/user-application/src/components/auth/account-dialog.tsx:130` invokes `authClient.signOut()`, resets loading state, and router-navigates to `/` once the Better Auth cookies clear.
- **Shared auth client**: `apps/user-application/src/lib/auth-client.ts:4` initializes `createAuthClient` with the organization plugin and re-exports `useSession/signOut` helpers for components.
- **Invalidate cached session**: `apps/user-application/src/routes/_app.tsx:93` reuses `context.trpc.auth.session.queryOptions()` so TanStack Query automatically refetches once the sign-out mutation completes or cookies expire.
