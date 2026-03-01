import { TRPCError } from '@trpc/server';
import { validateProjectAccess, getOrganizationIdFromProject } from '@repo/data-ops';
import { requireOrganizationId, type TrpcContext } from '../trpc';

/**
 * Resolve project context from optional projectId.
 *
 * If projectId is provided:
 *   - Derives organizationId from the project
 *   - Validates user has access to the project
 *   - Returns both organizationId and projectId (normalized from access record)
 *
 * If projectId is NOT provided:
 *   - Returns organizationId from session context
 *   - projectId is undefined
 *
 * @throws TRPCError NOT_FOUND if project doesn't exist
 * @throws TRPCError FORBIDDEN if user lacks access
 */
export async function resolveProjectContext(
  ctx: TrpcContext,
  projectId: string | undefined
): Promise<{ organizationId: string; projectId?: string }> {
  if (projectId) {
    const derivedOrgId = await getOrganizationIdFromProject(projectId);
    if (!derivedOrgId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const access = await validateProjectAccess(ctx.user.id, projectId, derivedOrgId);
    if (!access) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Project not found or access denied',
      });
    }

    return {
      organizationId: access.organization.id,
      projectId: access.project.id,
    };
  }

  return { organizationId: requireOrganizationId(ctx) };
}
