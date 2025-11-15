import { createTRPCClient, httpBatchLink, type TRPCClientErrorBase } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '@/trpc/router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { toast, type ExternalToast } from 'sonner';

/**
 * OpenPanel pattern: React Query-aware tRPC provider and hooks
 * This creates a context provider and hooks for components to access the typed tRPC client
 */
const { TRPCProvider: Provider, useTRPC: useUtils, useTRPCClient } = createTRPCContext<AppRouter>();

// Export the provider
export const TRPCProvider = Provider;

// Export the utils hook (for cache invalidation)
export const useTRPC = useUtils;

// Export the client hook
export { useTRPCClient };

/**
 * Get headers in an isomorphic way using TanStack's pattern:
 * - On server (SSR): Forward Headers instance (preserves superjson metadata)
 * - On client: Return empty Headers instance (browser handles cookies automatically)
 *
 * Returns Headers instance to preserve response metadata for superjson
 */
export const getIsomorphicHeaders = createIsomorphicFn()
  .server(() => getRequestHeaders())
  .client(() => new Headers());

/**
 * Create a tRPC client with isomorphic headers
 * OpenPanel pattern: Single client creation used for both SSR and browser
 * This client can be used both on the server (loaders) and client (components)
 */
export function createTrpcClient(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/api/trpc`,
        transformer: superjson,
        // Pass headers as a function for lazy evaluation (OpenPanel pattern)
        headers: () => getIsomorphicHeaders(),
        // OpenPanel pattern: Include credentials for cross-origin requests
        // This ensures Better Auth cookies are sent with browser requests
        fetch: (url, opts) => fetch(url, {
          ...opts,
          credentials: 'include',
          mode: 'cors'
        }),
      }),
    ],
  });
}

// Alias for consistency with OpenPanel naming
export const createTrpcClientWithHeaders = createTrpcClient;

/**
 * Centralized error handler for tRPC errors with toast notifications
 * Use in mutations: onError: handleError
 */
export function handleError(error: TRPCClientErrorBase<any>) {
  toast.error('Error', {
    description: error.message,
  });
}

/**
 * Error handler with custom toast options
 * Use in mutations: onError: handleErrorToastOptions({ duration: 5000 })
 */
export function handleErrorToastOptions(options: ExternalToast) {
  return (error: TRPCClientErrorBase<any>) => {
    toast.error('Error', {
      description: error.message,
      ...options,
    });
  };
}
