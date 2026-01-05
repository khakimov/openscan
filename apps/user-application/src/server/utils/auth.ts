import { getRequest } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI, getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { initDatabase } from "@repo/data-ops/database/setup";
import { env } from 'cloudflare:workers';

/**
 * Get Workers env
 */
function getEnv(): Env {
  // Initialize database
  initDatabase(env.DB);
  return env;
}

/**
 * Get the current user's organization ID from better-auth session
 * Throws an error if no authenticated session or organization context
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const env = getEnv();
  const request = getRequest();
  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  // Better-auth organization plugin stores activeOrganizationId in session
  const organizationId = getActiveOrganizationId(session);

  if (!organizationId) {
    throw new Error("No organization context - user not assigned to an organization");
  }

  return organizationId;
}

/**
 * @deprecated Use getCurrentOrganizationId instead
 * Legacy alias for backward compatibility
 */
export const getCurrentTenant = getCurrentOrganizationId;

/**
 * Get the current user's active organization ID
 * Alias for getCurrentOrganizationId
 */
export const getCurrentOrganization = getCurrentOrganizationId;

/**
 * Require organization context and return organization ID
 * Alias for getCurrentOrganizationId for clearer intent in server functions
 */
export const requireOrganizationContext = getCurrentOrganizationId;

/**
 * @deprecated Use requireOrganizationContext instead
 */
export const requireTenantContext = getCurrentOrganizationId;

/**
 * Get the current user's session data from better-auth
 * Throws an error if no authenticated session
 */
export async function getCurrentUser() {
  const env = getEnv();
  const request = getRequest();
  
  const auth = getAuth(env);
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
    organizationId: getActiveOrganizationId(session),
  };
}

/**
 * Server function to get session (SSR-safe)
 * Returns { session: null } if not authenticated (never throws)
 * Use this in __root.tsx beforeLoad to avoid HTTP calls during SSR
 */
export const getSessionServerFn = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await getCurrentUser();
    return {
      session: {
        user,
        activeOrganizationId: user.organizationId,
      },
    };
  } catch {
    return { session: null };
  }
});
