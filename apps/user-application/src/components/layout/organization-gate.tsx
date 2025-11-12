/**
 * OrganizationGate - Context provider for organization-scoped routes
 *
 * Provides organization data from loader to child routes via context.
 * Follows OpenPanel's "gate" pattern for keeping loader data accessible.
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
 * Usage in child components:
 * ```tsx
 * const organization = useOrganization();
 * ```
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface Organization {
  id: string;
  name: string | null;
  slug: string | null;
}

const OrganizationContext = createContext<Organization | null>(null);

export interface OrganizationGateProps {
  organization: Organization;
  children: ReactNode;
}

export function OrganizationGate({ organization, children }: OrganizationGateProps) {
  return (
    <OrganizationContext.Provider value={organization}>
      {children}
    </OrganizationContext.Provider>
  );
}

/**
 * Hook to access organization from context
 * @throws Error if used outside OrganizationGate
 */
export function useOrganization(): Organization {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationGate');
  }
  return context;
}

/**
 * Hook to optionally access organization from context
 * Returns null if used outside OrganizationGate
 */
export function useOrganizationOptional(): Organization | null {
  return useContext(OrganizationContext);
}
