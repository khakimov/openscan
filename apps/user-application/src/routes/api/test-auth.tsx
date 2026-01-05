import { createFileRoute } from '@tanstack/react-router';
import { getAuth } from '@repo/data-ops/auth/server';
import { getActiveOrganizationId } from '@repo/data-ops/auth/organization-api';
import { env } from 'cloudflare:workers';

/**
 * Test endpoint to verify auth works
 */
export const Route = createFileRoute('/api/test-auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = getAuth(env);
        const session = await auth.api.getSession({ headers: request.headers });

        return new Response(JSON.stringify({
          authenticated: !!session?.user,
          user: session?.user ? {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          } : null,
          activeOrganizationId: session ? getActiveOrganizationId(session) ?? null : null,
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
