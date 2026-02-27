/**
 * Centralized Navigation Utilities
 *
 * Single source of truth for all default routes, redirects, and navigation items.
 * Prevents inconsistencies when changing default landing pages.
 */

import type { ComponentType } from "react";
import { Home, Shield, ScanLine, type LucideIcon } from "lucide-react";
import type { OrganizationEntity } from "@repo/contracts/organization";

export interface NavigationItem {
  name: string;
  icon: ComponentType<{ className?: string }> | LucideIcon;
  href: string;
  badge?: string | number;
}

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

/**
 * Build navigation items for the sidebar based on current context
 * 
 * @param organization - Current organization (null if not in org context)
 * @param projectId - Current project ID (undefined if not in project context)
 * @returns Array of navigation items to render
 */
export function buildNavigationItems(
  organization: OrganizationEntity | null | undefined,
  projectId: string | undefined
): NavigationItem[] {
  if (!organization) {
    return [];
  }

  const orgSlug = organization.slug || organization.id;

  if (projectId) {
    // Project-scoped navigation
    return [
      {
        name: "Servers",
        icon: Shield,
        href: `/${orgSlug}/${projectId}/servers`,
      },
      {
        name: "Scans",
        icon: ScanLine,
        href: `/${orgSlug}/${projectId}/scans`,
      },
    ];
  }

  // Organization-scoped navigation (no project selected)
  return [
    {
      name: "Projects",
      icon: Home,
      href: `/${orgSlug}`,
    },
  ];
}
