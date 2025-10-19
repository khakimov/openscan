# Routing Structure

This security platform application uses TanStack Router with pathless routes (using underscore prefix) for better organization and shared layouts.

## Route Structure

### Landing Page
- **Route**: `/`
- **File**: `src/routes/index.tsx`
- **Purpose**: Landing page that checks authentication and redirects to dashboard or onboarding

### Authentication & App Routes (Pathless Layout: `_auth`)
- **Layout**: `src/routes/_auth/route.tsx` - Authenticated layout with sidebar
- **Dashboard**: `/dashboard` - `src/routes/_auth/dashboard.tsx` - Main dashboard overview
- **Assets**: `/assets` - `src/routes/_auth/assets.tsx` - Device inventory and management
  - Query params: `?tab=discovery|verified` - Toggle between discovered and verified devices
- **Scans**: `/scans` - `src/routes/_auth/scans.tsx` - Port scan history and results

### Onboarding Routes
- **Layout**: `src/routes/onboarding/route.tsx` - Onboarding flow layout
- **Organization**: `/onboarding` - `src/routes/onboarding/index.tsx` - Create organization
- **Project**: `/onboarding/project` - `src/routes/onboarding/project.tsx` - Create first project
- **Connect**: `/onboarding/$projectId/connect` - `src/routes/onboarding/$projectId/connect.tsx` - Connect Restate worker
- **Discovery**: `/onboarding/$projectId/discovery` - `src/routes/onboarding/$projectId/discovery.tsx` - Run discovery scan
- **Verify**: `/onboarding/$projectId/verify` - `src/routes/onboarding/$projectId/verify.tsx` - Review and verify results

### Subscription Routes (Pathless Layout: `_auth/app`)
- **Layout**: `src/routes/_auth/app/index.tsx` - Subscription pages layout
- **Subscriptions**: `/app/polar/subscriptions` - `src/routes/_auth/app/polar/subscriptions.tsx` - Manage subscriptions
- **Portal**: `/app/polar/portal` - `src/routes/_auth/app/polar/portal.tsx` - Billing portal
- **Checkout Success**: `/app/polar/checkout/success` - `src/routes/_auth/app/polar/checkout.success.tsx` - Post-checkout confirmation

### API Routes
- **Auth Callback**: `/api/auth/$` - `src/routes/api/auth.$.tsx` - Better Auth callback handler
- **Postback Webhook**: `/api/internal/scan-results` - `src/routes/api/internal/scan-results.tsx` - Restate worker postback handler

## Pathless Routes

### `_auth` Layout
- **Purpose**: Groups all authenticated application routes
- **Shared Layout**: Sidebar navigation + main content area
- **Authentication**: Requires user session via Better Auth
- **Routes**: `/dashboard`, `/assets`, `/scans`, `/app/*`

### `onboarding` Layout
- **Purpose**: Multi-step onboarding flow for new users
- **Shared Layout**: Stepper UI with progress indicator
- **Routes**: `/onboarding`, `/onboarding/project`, `/onboarding/$projectId/*`

## Query Parameters

### `/assets` Route
- `tab`: Filters device list
  - `discovery` (default): Shows CANDIDATE and EXCLUDED devices
  - `verified`: Shows VERIFIED devices only

## Route Parameters

- `$projectId`: Dynamic project identifier used in onboarding flow

## Landing Page Behavior

The landing page (`/`) handles authentication state:

1. **If authenticated**: Redirects to `/dashboard`
2. **If not authenticated**: Redirects to `/onboarding`

## Sidebar Navigation

The sidebar in the `_auth` layout shows:
- **Dashboard**: System overview
- **Assets**: Device inventory
- **Scans**: Port scan history

## TanStack Query Integration

### Loaders with `ensureQueryData`
Routes use loaders to populate TanStack Query cache for SSR:

```typescript
export const Route = createFileRoute('/_auth/assets')({
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { queryClient }, deps: { tab } }) => {
    const verificationStatus = tab === "verified" ? "VERIFIED" : ["CANDIDATE", "EXCLUDED"];
    return queryClient.ensureQueryData(deviceQueries.list({ verificationStatus }));
  },
  component: Assets,
});
```

### Components with `useSuspenseQuery`
Components use the same query to get guaranteed non-null data:

```typescript
function Assets() {
  const { data: devicesResponse } = useSuspenseQuery(
    deviceQueries.list({ verificationStatus })
  );
  const devices = devicesResponse.items; // Non-null, guaranteed by loader
}
```

## Mutation Hooks Pattern

Following TanStack Router best practice, mutations are centralized in `/src/queries`:

```typescript
// In /queries/device-queries.ts
export const useDeleteDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'delete'],
    mutationFn: deleteDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};

// In component
const deleteMutation = useDeleteDeviceMutation();
deleteMutation.mutate({ deviceId: '123' });
```

## Adding New Routes

### For Authenticated App Routes
Create new files in `src/routes/_auth/`:

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/your-route')({
  component: YourComponent,
});
```

### For Onboarding Routes
Create new files in `src/routes/onboarding/`:

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding/your-step')({
  component: YourComponent,
});
```

### For API Routes
Create new files in `src/routes/api/`:

```typescript
import { createAPIFileRoute } from '@tanstack/start/api';

export const Route = createAPIFileRoute('/api/your-endpoint')({
  POST: async ({ request }) => {
    // Handle request
  },
});
```

## File Structure

```
src/routes/
├── __root.tsx                                    # Root layout with query client
├── index.tsx                                     # Landing page (redirects based on auth)
│
├── _auth/                                        # Authenticated app routes
│   ├── route.tsx                                 # Auth layout (sidebar + content)
│   ├── dashboard.tsx                             # /dashboard - Main dashboard
│   ├── assets.tsx                                # /assets - Device inventory
│   ├── scans.tsx                                 # /scans - Port scan history
│   └── app/                                      # Subscription routes
│       ├── index.tsx                             # App layout
│       └── polar/
│           ├── subscriptions.tsx                 # /app/polar/subscriptions
│           ├── portal.tsx                        # /app/polar/portal
│           └── checkout.success.tsx              # /app/polar/checkout/success
│
├── onboarding/                                   # Onboarding flow
│   ├── route.tsx                                 # Onboarding layout
│   ├── index.tsx                                 # /onboarding - Create organization
│   ├── project.tsx                               # /onboarding/project - Create project
│   └── $projectId/
│       ├── connect.tsx                           # /onboarding/:id/connect
│       ├── discovery.tsx                         # /onboarding/:id/discovery
│       └── verify.tsx                            # /onboarding/:id/verify
│
└── api/                                          # API routes
    ├── auth.$.tsx                                # /api/auth/* - Auth callbacks
    └── internal/
        └── scan-results.tsx                      # /api/internal/scan-results - Postback
```

## Query Organization

All queries and mutations are centralized in `/src/queries/`:

```
src/queries/
├── index.ts                                      # Re-exports all queries/mutations
├── device-queries.ts                             # Device queries + mutations
├── scan-queries.ts                               # Scan queries
└── discovery-queries.ts                          # Discovery queries
```

## Best Practices

1. **Use queryOptions() factories** for reusable queries
2. **Use ensureQueryData() in loaders** to populate cache for SSR
3. **Use useSuspenseQuery() in components** for guaranteed non-null data
4. **Centralize mutations** in query files, not inline in components
5. **Invalidate with base keys** (e.g., `['devices']` matches all device queries)
6. **Use router.invalidate()** to refresh loader data after mutations
