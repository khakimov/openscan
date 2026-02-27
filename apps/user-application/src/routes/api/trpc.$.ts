import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';
import { getAuth } from '@repo/data-ops/auth/server';
import { getActiveOrganizationId } from '@repo/data-ops/auth/organization-api';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createLogger } from '@repo/logger';

import { appRouter } from '@/trpc/router';
import type { TrpcContext } from '@/trpc/trpc';

const logger = createLogger({ name: 'api-trpc-route' });

async function createTrpcContext(request: Request): Promise<TrpcContext> {
  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  const pendingCookies: string[] = [];

  return {
    env,
    request,
    session,
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          name: session.user.name ?? null,
          emailVerified: Boolean(session.user.emailVerified),
          organizationId: getActiveOrganizationId(session) ?? null,
        }
      : null,
    pendingCookies,
    setPendingCookies: (cookies: string[]) => {
      pendingCookies.push(...cookies);
    },
  };
}

async function handleTrpc(request: Request) {
  const ctx = await createTrpcContext(request);

  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => ctx,
    onError({ path, error, type }) {
      logger.error('tRPC handler error', {
        path,
        type,
        message: error.message,
      });
    },
  });

  if (ctx.pendingCookies.length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const cookie of ctx.pendingCookies) {
    headers.append('set-cookie', cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: async ({ request }) => handleTrpc(request),
      POST: async ({ request }) => handleTrpc(request),
    },
  },
});
