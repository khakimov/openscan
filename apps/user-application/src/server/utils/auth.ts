import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI, getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";

/**
 * Get the current user's organization ID from better-auth session
 * Throws an error if no authenticated session or organization context
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const request = getRequest();
  const auth = getAuth();
  const session = await auth.api.getSession(request);

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  // Better-auth organization plugin stores activeOrganizationId in session
  let organizationId = getActiveOrganizationId(session);

  // If no active organization, try to auto-set the first available organization
  if (!organizationId) {
    try {
      const orgAPI = getOrganizationAPI(auth);
      const organizations = await orgAPI.listOrganizations({
        headers: request.headers,
      });

      if (organizations && organizations.length > 0) {
        // Auto-set the first organization as active
        const firstOrg = organizations[0];
        await orgAPI.setActiveOrganization({
          body: {
            organizationId: firstOrg.id,
          },
          headers: request.headers,
        });

        organizationId = firstOrg.id;
      }
    } catch (error) {
      // Failed to auto-set organization, fall through to error below
    }
  }

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
    organizationId: getActiveOrganizationId(session),
  };
}
