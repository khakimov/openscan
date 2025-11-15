import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { Spinner } from './components/ui/spinner'
import type { QueryClient } from '@tanstack/react-query'
import type { OnboardingStatus } from './server/types/onboarding'
import type { AppRouter } from './trpc/router'
import type { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

/**
 * Typed router context available to all routes
 * OpenPanel pattern: Only includes options proxy (not raw client)
 */
export interface RouterContext {
  queryClient: QueryClient
  trpc: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
  apiUrl: string
  onboarding?: OnboardingStatus  // Optional because not all routes have onboarding
}

/**
 * Onboarding route context - guarantees onboarding is present
 */
export interface OnboardingRouteContext extends RouterContext {
  onboarding: OnboardingStatus  // Required for onboarding routes
}

// Create a new router instance
export const getRouter = () => {
  const apiUrl = import.meta.env.VITE_API_URL ?? ''
  const rqContext = TanstackQuery.getContext(apiUrl)

  const router = createRouter({
    routeTree,
    context: {
      queryClient: rqContext.queryClient,
      trpc: rqContext.trpc,
      apiUrl: rqContext.apiUrl,
    } satisfies RouterContext,

    // Navigation optimization settings (prevents laggy feel)
    defaultPreload: 'intent',              // Preload on hover/focus (not click)
    defaultPreloadStaleTime: 10000,        // Cache preloaded data for 10s (prevents duplicate fetches)

    // Smooth loading state timing (prevents jarring flashes)
    defaultPendingMs: 1000,                // Show pending UI after 1s
    defaultPendingMinMs: 500,              // Keep pending UI for min 500ms

    // Global pending component shown during slow navigation
    defaultPendingComponent: () => (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    ),

    // Restore scroll position on back/forward navigation
    scrollRestoration: true,

    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <TanstackQuery.Provider
          queryClient={rqContext.queryClient}
          apiUrl={rqContext.apiUrl}
        >
          {props.children}
        </TanstackQuery.Provider>
      )
    },
  })

  setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

  return router
}
