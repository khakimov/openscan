import { createTRPCClient, httpBatchLink, type TRPCClientErrorBase } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import superjson from 'superjson';
import { toast, type ExternalToast } from 'sonner';

import type { AppRouter } from '@/trpc/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export const getIsomorphicHeaders = createIsomorphicFn()
  .server(() => {
    return getRequestHeaders();
  })
  .client(() => {
    return {};
  });

export function createTRPCClientWithHeaders(appUrl: string) {
  if (!appUrl) {
    throw new Error('createTRPCClientWithHeaders requires appUrl');
  }

  const trpcUrl = new URL('/api/trpc', appUrl).toString();

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: trpcUrl,
        headers: () => getIsomorphicHeaders(),
        fetch: async (url, options) => {
          const response = await fetch(url, {
            ...options,
            credentials: 'include',
          });

          if (!response.ok) {
            let bodySnippet: string | undefined;

            try {
              const clone = response.clone();
              const text = await clone.text();
              bodySnippet = text.slice(0, 200);
            } catch {
              bodySnippet = undefined;
            }

            console.error('tRPC fetch failure', {
              url: typeof url === 'string' ? url : url.toString(),
              status: response.status,
              contentType: response.headers.get('content-type'),
              bodySnippet,
            });
          }

          return response;
        },
      }),
    ],
  });
}

export function handleError(error: TRPCClientErrorBase<any>) {
  toast('Error', {
    description: error.message,
  });
}

export function handleErrorToastOptions(options: ExternalToast) {
  return (error: TRPCClientErrorBase<any>) => {
    toast('Error', {
      description: error.message,
      ...options,
    });
  };
}
