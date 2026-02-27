/**
 * Project Query Factory
 *
 * Standardized query keys for TanStack Query + tRPC integration.
 * Follows the same pattern as device-queries.ts, organization-queries.ts, etc.
 *
 * Query Key Patterns:
 * - .base (e.g., ['project', 'listByOrg']): For invalidation, matches all queries with this prefix
 * - .key() (e.g., [['project', 'listByOrg'], { input: {...}, type: 'query' }]): For specific cache operations
 *
 * Usage:
 * ```ts
 * // In route loader (SSR):
 * const options = trpc.project.listByOrg.queryOptions({ organizationId });
 * const projects = await context.queryClient.ensureQueryData(options);
 *
 * // In component:
 * const { data } = useQuery({
 *   ...trpc.project.listByOrg.queryOptions({ organizationId }),
 *   initialData: loaderData?.projects,
 * });
 *
 * // In mutation (invalidation):
 * invalidateKeys: [projectQueries.listByOrg.base, projectQueries.detail.base]
 * ```
 */

import type { QueryKey } from '@tanstack/react-query';

/**
 * Project query key factory
 */
export const projectQueries = {
  /**
   * Project list by organization query
   * tRPC procedure: project.listByOrg
   */
  listByOrg: {
    base: ['project', 'listByOrg'] as const,
    key: (organizationId: string): QueryKey =>
      [
        ['project', 'listByOrg'],
        { input: { organizationId }, type: 'query' as const },
      ] as const,
  },

  /**
   * Single project query
   * tRPC procedure: project.get
   */
  detail: {
    base: ['project', 'get'] as const,
    key: (organizationId: string, projectId: string): QueryKey =>
      [
        ['project', 'get'],
        { input: { organizationId, projectId }, type: 'query' as const },
      ] as const,
  },
};
