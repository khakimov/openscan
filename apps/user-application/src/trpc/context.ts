import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getAuth } from '@repo/data-ops/auth/server';
import { getActiveOrganizationId, getOrganizationAPI } from '@repo/data-ops/auth/organization-api';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'trpc-context' });

export type TrpcContext = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
    organizationId: string | null;
  } | null;
  request: Request;
};

async function buildContextFromRequest(req: Request): Promise<TrpcContext> {
  // Read session directly from the request (don't use getCurrentUser which calls getRequest())
  // Inside fetchRequestHandler we're outside TanStack's server function context
  const auth = getAuth();
  const session = await auth.api.getSession(req).catch(() => null);

  if (!session?.user) {
    return { user: null, request: req };
  }

  // Get active organization from session
  let organizationId = session ? (getActiveOrganizationId(session) ?? null) : null;

  // Fallback: If no active org, use first org from list (matches legacy getCurrentOrganizationId behavior)
  // This is critical for onboarding flows where activeOrganizationId isn't set yet
  if (!organizationId) {
    try {
      const orgAPI = getOrganizationAPI(auth);
      const orgs = await orgAPI.listOrganizations({ headers: req.headers });

      if (orgs && orgs.length > 0) {
        organizationId = orgs[0].id;

        // Set as active organization for future requests
        await orgAPI.setActiveOrganization({
          body: { organizationId },
          headers: req.headers,
        });

        logger.info('Set active organization from first org (onboarding fallback)', {
          userId: session.user.id,
          organizationId,
        });
      }
    } catch (error) {
      logger.warn('Failed to resolve organization fallback', {
        userId: session.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const user = {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    emailVerified: Boolean(session.user.emailVerified),
    organizationId,
  };

  return { user, request: req };
}

export async function createTrpcContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  return buildContextFromRequest(opts.req);
}

export async function createTrpcContextFromRequest(req: Request): Promise<TrpcContext> {
  return buildContextFromRequest(req);
}
