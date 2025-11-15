import { createTRPCRouter, publicProcedure } from '../trpc';

/**
 * Auth Router - OpenPanel Pattern
 *
 * Provides session and authentication queries for the root loader.
 * Uses publicProcedure (not protected) to allow checking if session exists.
 */
export const authRouter = createTRPCRouter({
  /**
   * Get current session with user and active organization
   * Returns { session: null } if not authenticated (NEVER throws)
   *
   * OpenPanel pattern: Non-protected routes can check auth without try/catch.
   * Callers decide whether to redirect based on null session.
   *
   * Used by: _app.tsx root loader, onboarding routes, login guards
   */
  session: publicProcedure.query(async ({ ctx }) => {
    // Session is already available in context from createTrpcContext
    // Context builder calls auth.api.getSession(req) once per request
    if (!ctx.user) {
      return { session: null };
    }

    return {
      session: {
        user: ctx.user,
        activeOrganizationId: ctx.user.organizationId,
      },
    };
  }),
});
