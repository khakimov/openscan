import { queryOptions } from '@tanstack/react-query';
import { getOnboardingStatus } from '@/server/organization/status';
import { getDiscoveryDevices } from '@/server/devices';
import { getNotificationPreferences } from '@/server/preferences';

/**
 * Onboarding Query Helpers
 *
 * Centralized query definitions for the onboarding flow following TanStack best practices.
 *
 * Benefits:
 * - Single source of truth for query keys and fetch logic
 * - Loader and component use identical queryOptions (DRY)
 * - Cache seeding after mutations (no unnecessary refetches)
 * - Type-safe invalidation across all consuming components
 * - SSR-compatible with ensureQueryData in route loaders
 *
 * Pattern from TanStack Router examples:
 * - Loader: await context.queryClient.ensureQueryData(onboardingStatusQuery)
 * - Component: const { data } = useQuery(onboardingStatusQuery)
 * - Mutation: queryClient.setQueryData(onboardingStatusQuery.queryKey, newData)
 */

/**
 * Onboarding status query
 *
 * Tracks current onboarding progress across the flow.
 * Used by all onboarding routes to check completion state.
 */
export const onboardingStatusQuery = queryOptions({
  queryKey: ['onboarding', 'status'],
  queryFn: async () => {
    const status = await getOnboardingStatus();
    return status;
  },
  staleTime: 5 * 60_000, // 5 minutes (prevents refetches during onboarding)
});

/**
 * Discovery devices query (onboarding step)
 *
 * Fetches devices discovered during onboarding.
 * Used in onboarding/$projectId/discovery route.
 *
 * Pattern: Factory function returning queryOptions (OpenPanel pattern)
 * - Exposes .queryKey for easy invalidation in mutations
 * - Scopes cache by organizationId to prevent cross-tenant collisions
 *
 * Usage in loader:
 * ```ts
 * const savedDevices = await context.queryClient.ensureQueryData(
 *   discoveryDevicesQuery(onboarding.organizationId!)
 * );
 * ```
 *
 * Usage in mutation invalidation:
 * ```ts
 * queryClient.invalidateQueries({
 *   queryKey: discoveryDevicesQuery(organizationId).queryKey
 * });
 * ```
 */
export const discoveryDevicesQuery = (organizationId: string) =>
  queryOptions({
    queryKey: ['onboarding', 'discovery', 'devices', organizationId] as const,
    queryFn: async () => {
      const result = await getDiscoveryDevices({ data: { organizationId } });
      return result.devices || [];
    },
    staleTime: 60_000, // 1 minute (discovery results can update frequently)
  });

/**
 * Notification preferences query (onboarding step)
 *
 * Fetches user's notification preferences for the preferences step.
 * Used in onboarding/$projectId/notifications route.
 *
 * Note: Also exported from notification-queries.ts for use in settings.
 * This re-export keeps onboarding imports consistent.
 */
export const notificationPreferencesQuery = queryOptions({
  queryKey: ['notifications', 'preferences'],
  queryFn: async () => {
    const response = await getNotificationPreferences();
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to get notification preferences');
    }
    return response.data;
  },
  staleTime: 5 * 60_000, // 5 minutes (preferences don't change often)
});
