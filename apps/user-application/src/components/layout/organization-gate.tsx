/**
 * OrganizationGate - Context provider for organization-scoped routes
 *
 * Wraps child routes to provide organization context.
 * Organization data should come from parent route loader.
 *
 * Usage in route:
 * ```tsx
 * function OrganizationLayout() {
 *   const { organization } = Route.useLoaderData();
 *   return (
 *     <OrganizationGate organization={organization}>
 *       <Outlet />
 *     </OrganizationGate>
 *   );
 * }
 * ```
 *
 * Usage in child routes:
 * ```tsx
 * // ✅ Each route has its own loader that returns the data it needs
 * loader: async ({ params }) => {
 *   const organization = await getOrganization({ data: params.organizationId });
 *   return { organization };
 * }
 *
 * // Then use Route.useLoaderData() to get the data
 * const { organization } = Route.useLoaderData();
 * ```
 */

import { type ReactNode } from 'react';

export interface Organization {
  id: string;
  name: string | null;
  slug?: string | null;
}

export interface OrganizationGateProps {
  organization: Organization;
  children: ReactNode;
}

export function OrganizationGate({ organization, children }: OrganizationGateProps) {
  // Simple validation that organization exists
  // In practice, this should never fail since parent route loader would throw first
  if (!organization) {
    throw new Error('Organization is required');
  }

  return <>{children}</>;
}
