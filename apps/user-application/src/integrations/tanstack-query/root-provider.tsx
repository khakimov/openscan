import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { createTrpcClientWithHeaders, TRPCProvider } from '@/integrations/trpc/react'
import type { AppRouter } from '@/trpc/router'
import superjson from 'superjson'

/**
 * OpenPanel pattern: Create router context with unified tRPC client
 * Single client handles both SSR and browser requests with isomorphic headers
 */
export function getContext(apiUrl: string = '') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry guard queries (403/404 won't succeed on retry)
        retry: false,
        // OpenPanel defaults: reasonable cache times
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
        refetchOnReconnect: false,
      },
      dehydrate: {
        // OpenPanel pattern: Only dehydrate successful queries
        shouldDehydrateQuery: (query) => query.state.status === 'success',
        // Superjson serialization for Date objects and other complex types
        serializeData: superjson.serialize,
      },
      hydrate: {
        // Superjson deserialization for proper type restoration
        deserializeData: superjson.deserialize,
      },
    },
  })

  const resolvedApiUrl = apiUrl || import.meta.env.VITE_API_URL || ''

  // OpenPanel pattern: Single client with isomorphic headers for SSR and browser
  const client = createTrpcClientWithHeaders(resolvedApiUrl)

  // Create options proxy for loaders (SSR) and components (browser)
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client,
    queryClient,
  })

  return {
    queryClient,
    trpc,
    apiUrl: resolvedApiUrl,
  }
}

/**
 * OpenPanel pattern: Provider with memoized client
 */
export function Provider({
  children,
  queryClient,
  apiUrl,
}: {
  children: React.ReactNode
  queryClient: QueryClient
  apiUrl: string
}) {
  // Memoize client creation based on apiUrl
  const trpcClient = useMemo(
    () => createTrpcClientWithHeaders(apiUrl),
    [apiUrl],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
