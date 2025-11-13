import { queryOptions } from '@tanstack/react-query';
import { validateProjectAccessFn } from '@/server/projects';

/**
 * Project Query Helpers (OpenPanel pattern)
 *
 * Pattern from: https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/queries/projects.ts
 *
 * Benefits:
 * - Single source of truth for project query keys
 * - Consistent staleTime for project data
 * - Type-safe access validation in loaders
 *
 * Usage in route loaders:
 * const result = await context.queryClient.ensureQueryData(
 *   projectAccessQuery(orgId, projectId)
 * );
 *
 * Usage in components:
 * const { data } = useQuery(projectDetailQuery(orgId, projectId));
 */

// ========================================
// Query Helpers
// ========================================

/**
 * Get project by ID with access validation
 * Used in route loaders to validate user has access to project
 */
export const projectAccessQuery = (organizationId: string, projectId: string) =>
  queryOptions({
    queryKey: ['organizations', organizationId, 'projects', projectId, 'access'],
    queryFn: () => validateProjectAccessFn({ data: { organizationId, projectId } }),
    staleTime: 60_000, // 1 minute
  });

/**
 * Alias for projectAccessQuery (more semantic in some contexts)
 */
export const projectDetailQuery = projectAccessQuery;
