import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { getAuth } from '@repo/data-ops/auth/server';

export interface TrpcContext {
  env: Env;
  request: Request;
  session: Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>> | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
    organizationId: string | null;
  } | null;
  pendingCookies: string[];
  setPendingCookies: (cookies: string[]) => void;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

/**
 * Helper to require organizationId from protected context
 * Throws PRECONDITION_FAILED if user has no organizations
 *
 * Context already performs fallback to first org during onboarding,
 * so this only fails when user truly has no organizations.
 */
export function requireOrganizationId(ctx: { user: NonNullable<TrpcContext['user']> }): string {
  const organizationId = ctx.user.organizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'User has no organizations. Please create an organization first.',
    });
  }
  return organizationId;
}
