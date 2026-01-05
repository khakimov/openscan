import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { useMemo, type ReactNode } from 'react';
import superjson from 'superjson';

import { TRPCProvider, createTRPCClientWithHeaders } from '@/integrations/trpc/react';
import type { AppRouter } from '@/trpc/router';

export function getContext(appUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnReconnect: false,
      },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  const client = createTRPCClientWithHeaders(appUrl);

  const trpc = createTRPCOptionsProxy<AppRouter>({
    client,
    queryClient,
  });

  return {
    queryClient,
    trpc,
    appUrl,
  };
}

export function Provider({
  children,
  queryClient,
  appUrl,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  appUrl: string;
}) {
  const client = useMemo(() => createTRPCClientWithHeaders(appUrl), [appUrl]);

  return (
    <TRPCProvider trpcClient={client} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}
