import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "@repo/data-ops/auth/server";
import { getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";

/**
 * NOTE: Most auth functions are now handled by better-auth automatically:
 * - Sign up: POST /api/auth/sign-up/email
 * - Sign in: POST /api/auth/sign-in/email
 * - Sign out: POST /api/auth/sign-out
 * - Password reset: POST /api/auth/forget-password
 * - Email verification: Automatic on signup
 * - OAuth: GET /api/auth/sign-in/social/google
 *
 * See better-auth docs: https://www.better-auth.com/docs
 */

export type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  organizationId: string | undefined;
};

/**
 * Get current authenticated user (returns null if not authenticated)
 * This follows the TanStack Router recommended pattern for route protection
 *
 * Use this in `beforeLoad` for route guards:
 * ```ts
 * export const Route = createFileRoute('/_auth')({
 *   beforeLoad: async () => {
 *     const user = await getCurrentUser()
 *     if (!user) {
 *       throw redirect({ to: '/login' })
 *     }
 *     return { user }
 *   },
 * })
 * ```
 */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<User | null> => {
    const request = getRequest();
    const auth = getAuth();
    const session = await auth.api.getSession(request);

    if (!session?.user) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      emailVerified: Boolean(session.user.emailVerified),
      organizationId: getActiveOrganizationId(session),
    };
  }
);

/**
 * @deprecated Auth is now handled by better-auth client
 * Use authClient.useSession() for session state
 */
export const checkAuthStatus = createServerFn({
  method: "GET",
}).handler(
  async (): Promise<{ isAuthenticated: boolean; user: any | null; tenant: any | null }> => {
    // Use better-auth client instead
    return { isAuthenticated: false, user: null, tenant: null };
  },
);

/**
 * @deprecated Use authClient.signOut() instead
 */
export const logoutUser = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ success: boolean }> => {
  // Use better-auth client instead
  return { success: false };
});

// Legacy functions below - kept for backward compatibility during migration
// TODO: Remove these once all code is migrated to better-auth client

/**
 * @deprecated Use better-auth client instead: authClient.signIn.email()
 */
export const loginWithCredentials = createServerFn({
  method: "POST",
}).handler(async () => {
  throw new Error(
    "This function is deprecated. Use better-auth client: authClient.signIn.email()"
  );
});

/**
 * @deprecated Use better-auth client instead: authClient.signUp.email()
 */
export const signUpWithEmail = createServerFn({
  method: "POST",
}).handler(async () => {
  throw new Error(
    "This function is deprecated. Use better-auth client: authClient.signUp.email()"
  );
});

/**
 * @deprecated Use better-auth client instead: authClient.forgetPassword()
 */
export const requestPasswordReset = createServerFn({
  method: "POST",
}).handler(async () => {
  throw new Error(
    "This function is deprecated. Use better-auth client: authClient.forgetPassword()"
  );
});

/**
 * @deprecated Use better-auth client instead: authClient.resetPassword()
 */
export const resetPassword = createServerFn({
  method: "POST",
}).handler(async () => {
  throw new Error(
    "This function is deprecated. Use better-auth client: authClient.resetPassword()"
  );
});

/**
 * Initiate Google OAuth flow
 * Better-auth handles this automatically at /api/auth/sign-in/social/google
 */
export const initiateGoogleOAuth = createServerFn({
  method: "POST",
})
  .inputValidator((data: { returnTo?: string }) => {
    return z.object({ returnTo: z.string().optional() }).parse(data);
  })
  .handler(async ({ data }): Promise<{ url: string }> => {
    // Redirect to better-auth Google OAuth endpoint
    const returnTo = data.returnTo || "/";
    const url = `/api/auth/sign-in/social/google?callbackURL=${encodeURIComponent(returnTo)}`;
    return { url };
  });

/**
 * @deprecated OAuth is now handled automatically by better-auth
 */
export const completeGoogleOAuth = createServerFn({
  method: "POST",
}).handler(async () => {
  throw new Error(
    "OAuth completion is now handled automatically by better-auth"
  );
});
