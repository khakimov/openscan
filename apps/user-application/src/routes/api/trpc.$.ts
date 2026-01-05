import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { getAuth } from '@repo/data-ops/auth/server';
import { createLogger } from '@repo/logger';
import { env } from 'cloudflare:workers';

import { appRouter } from '@/trpc/router';
import type { TrpcContext } from '@/trpc/trpc';

const logger = createLogger({ name: 'trpc-route' });

/**
 * tRPC handler with Better Auth session guard
 * Rejects unauthorized requests, passes userId to context
 */
async function createTrpcContext(request: Request, env: Env, pendingCookies: string[]): Promise<TrpcContext> {
  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  logger.info('tRPC context created', {
    userId: session.user.id,
    hasSession: true,
  });

  return {
    env,
    request,
    session,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      emailVerified: Boolean(session.user.emailVerified),
      organizationId: (session as any).activeOrganizationId ?? null,
    },
    pendingCookies,
    setPendingCookies: (cookies: string[]) => {
      pendingCookies.push(...cookies);
      logger.info('Stored pending cookies in context', { count: cookies.length, total: pendingCookies.length });
    },
  };
}

function createHandler(method: 'GET' | 'POST') {
  return async ({ request }: { request: Request }) => {
    const started = Date.now();

    // Create mutable array for this request (not shared across requests)
    const pendingCookies: string[] = [];

    try {
      const response = await fetchRequestHandler({
        endpoint: '/api/trpc',
        req: request,
        router: appRouter,
        createContext: async () => {
          try {
            return await createTrpcContext(request, env, pendingCookies);
          } catch (error) {
            // Unauthorized - return 401
            if (error instanceof Error && error.message === 'Unauthorized') {
              throw error;
            }
            logger.error('Failed to create tRPC context', {
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      });

      // Check if any mutations stashed Set-Cookie headers (e.g., org selection)
      if (pendingCookies.length > 0) {
        logger.info('Forwarding Set-Cookie headers from tRPC mutation', {
          count: pendingCookies.length
        });

        const headers = new Headers(response.headers);
        pendingCookies.forEach((cookie) => {
          logger.info('Appending Set-Cookie header', { cookie: cookie.substring(0, 50) });
          headers.append('set-cookie', cookie);
        });

        const finalResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });

        logger.info('tRPC request completed (with cookies)', {
          method,
          durationMs: Date.now() - started,
          status: finalResponse.status,
        });

        return finalResponse;
      }

      logger.info('tRPC request completed', {
        method,
        durationMs: Date.now() - started,
        status: response.status,
      });

      return response;
    } catch (error) {
      logger.error('tRPC request failed', {
        method,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return 401 for unauthorized
      if (error instanceof Error && error.message === 'Unauthorized') {
        return new Response('Unauthorized', { status: 401 });
      }

      throw error;
    }
  };
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: createHandler('GET'),
      POST: createHandler('POST'),
    },
  },
});
