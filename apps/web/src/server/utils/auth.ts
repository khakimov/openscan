/**
 * Auth utilities for the worker context.
 *
 * In the SPA architecture, auth is handled by tRPC context (ctx.user, ctx.env).
 * These functions exist for Hono routes and postback handlers that need auth
 * outside the tRPC context.
 */

import { getAuth } from "@repo/data-ops/auth/server";
import { getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { initDatabase } from "@repo/data-ops/database/setup";

/**
 * Get the current user from request headers + env.
 * Use this in Hono routes where you don't have tRPC context.
 */
export async function getCurrentUser(request: Request, env: Env) {
  initDatabase(env.DB);
  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });

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
 * Get the current user's organization ID from request headers + env.
 * Throws if no authenticated session or no organization context.
 */
export async function getCurrentOrganizationId(
  request: Request,
  env: Env
): Promise<string> {
  const user = await getCurrentUser(request, env);

  if (!user.organizationId) {
    throw new Error(
      "No organization context - user not assigned to an organization"
    );
  }

  return user.organizationId;
}

// Aliases
export const getCurrentTenant = getCurrentOrganizationId;
export const getCurrentOrganization = getCurrentOrganizationId;
export const requireOrganizationContext = getCurrentOrganizationId;
export const requireTenantContext = getCurrentOrganizationId;
