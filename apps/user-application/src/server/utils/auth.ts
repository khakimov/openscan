import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "@repo/data-ops/auth/server";

/**
 * Get the current user's organization ID from better-auth session
 * Throws an error if no authenticated session or organization context
 */
export async function getCurrentTenant(): Promise<string> {
  const request = getRequest();
  const auth = getAuth();
  const session = await auth.api.getSession(request);

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  // Better-auth organization plugin stores activeOrganizationId in session
  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    throw new Error("No organization context - user not assigned to an organization");
  }

  return organizationId;
}

/**
 * Get the current user's active organization ID
 * Alias for getCurrentTenant (kept for backward compatibility)
 */
export const getCurrentOrganization = getCurrentTenant;

/**
 * Require organization context and return organization ID
 * Alias for getCurrentTenant for clearer intent in server functions
 */
export const requireTenantContext = getCurrentTenant;

/**
 * Get the current user's session data from better-auth
 * Throws an error if no authenticated session
 */
export async function getCurrentUser() {
  const request = getRequest();
  const auth = getAuth();
  const session = await auth.api.getSession(request);

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
    organizationId: session.session.activeOrganizationId,
  };
}
