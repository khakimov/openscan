import { createFileRoute } from '@tanstack/react-router';
import { getAuth } from '@repo/data-ops/auth/server';
import { env } from 'cloudflare:workers';

/**
 * Better Auth handler route
 * Direct mount of auth.handler - no custom hooks or middleware
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth(env).handler(request),
      POST: ({ request }) => getAuth(env).handler(request),
    },
  },
});
