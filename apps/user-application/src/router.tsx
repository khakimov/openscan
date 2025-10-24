import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { Spinner } from './components/ui/spinner'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
    routeTree,
    context: { ...rqContext },

    // Navigation optimization settings (prevents laggy feel)
    defaultPreload: 'intent',              // Preload on hover/focus (not click)
    defaultPreloadStaleTime: 0,            // Always check cache freshness

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
        <TanstackQuery.Provider {...rqContext}>
          {props.children}
        </TanstackQuery.Provider>
      )
    },
  })

  setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

  return router
}
