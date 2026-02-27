/**
 * Organization Query Factory
 *
 * Standardized query keys for TanStack Query + tRPC integration.
 * Follows the same pattern as device-queries.ts, scan-queries.ts, etc.
 *
 * Query Key Patterns:
 * - .base (e.g., ['organization', 'list']): For invalidation, matches all queries with this prefix
 * - .key() (e.g., [['organization', 'list'], { input: {...}, type: 'query' }]): For specific cache operations
 *
 * Usage:
 * ```ts
 * // In route loader (SSR):
 * const options = trpc.organization.list.queryOptions();
 * const organizations = await context.queryClient.ensureQueryData(options);
 *
 * // In component:
 * const { data } = useQuery({
 *   ...trpc.organization.list.queryOptions(),
 *   initialData: loaderData?.organizations,
 * });
 *
 * // In mutation (invalidation):
 * invalidateKeys: [organizationQueries.list.base]
 * ```
 */

import type { QueryKey } from '@tanstack/react-query';

/**
 * Organization query key factory
 */
export const organizationQueries = {
  /**
   * Organization list query
   * tRPC procedure: organization.list
   */
  list: {
    base: ['organization', 'list'] as const,
    key: (): QueryKey =>
      [['organization', 'list'], { input: undefined, type: 'query' as const }] as const,
  },

  /**
   * Single organization query
   * tRPC procedure: organization.get
   */
  detail: {
    base: ['organization', 'get'] as const,
    key: (organizationId: string): QueryKey =>
      [
        ['organization', 'get'],
        { input: { organizationId }, type: 'query' as const },
      ] as const,
  },
};

/**
 * Onboarding query key factory
 * (kept here for related queries, mutations are in organization-mutations.ts)
 */
export const onboardingQueries = {
  status: {
    base: ['onboarding', 'status'] as const,
    key: (): QueryKey =>
      [['onboarding', 'status'], { input: undefined, type: 'query' as const }] as const,
  },
};
