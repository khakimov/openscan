import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/trpc/router';
import { createTrpcContext } from '@/trpc/context';

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: ({ request }) =>
        fetchRequestHandler({
          endpoint: '/api/trpc',
          router: appRouter,
          req: request,
          createContext: (opts) => createTrpcContext(opts),
        }),
      POST: ({ request }) =>
        fetchRequestHandler({
          endpoint: '/api/trpc',
          router: appRouter,
          req: request,
          createContext: (opts) => createTrpcContext(opts),
        }),
    },
  },
});
