/**
 * Centralized Navigation Utilities
 *
 * Single source of truth for all default routes and redirects.
 * Prevents inconsistencies when changing default landing pages.
 */

/**
 * Get the default landing route for a project
 *
 * @returns The default route path users should land on after login or project switch
 *
 * Usage:
 * - Login redirect
 * - Onboarding completion
 * - Project switching
 * - Any "go to project home" navigation
 */
export function getProjectDefaultRoute(): string {
  // Single source of truth - change here to update everywhere
  return "/$organizationId/$projectId/servers/discovery";
}

/**
 * Navigate to project default route
 * Helper for consistent navigation with params
 */
export function getProjectDefaultRouteParams(
  organizationId: string,
  projectId: string
) {
  return {
    to: getProjectDefaultRoute(),
    params: { organizationId, projectId },
  } as const;
}

/**
 * Get the default landing route for organization (no project selected)
 */
export function getOrganizationDefaultRoute(): string {
  return "/$organizationId";
}

/**
 * Navigate to organization default route
 */
export function getOrganizationDefaultRouteParams(organizationId: string) {
  return {
    to: getOrganizationDefaultRoute(),
    params: { organizationId },
  } as const;
}
