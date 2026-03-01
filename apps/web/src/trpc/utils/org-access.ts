import { TRPCError } from '@trpc/server';
import { validateOrganizationAccess } from '@repo/data-ops';

/**
 * Require organization access for a user.
 * Throws FORBIDDEN if user doesn't have access to the organization.
 *
 * @returns The validated organization ID (normalized from access record)
 */
export async function requireOrgAccess(
  userId: string,
  organizationId: string
): Promise<string> {
  const orgAccess = await validateOrganizationAccess(userId, organizationId);
  if (!orgAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Organization not found or access denied',
    });
  }
  return orgAccess.id;
}
