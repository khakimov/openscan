/**
 * Onboarding Query Key Helpers
 *
 * All onboarding queries have been migrated to tRPC procedures.
 * These helpers generate tRPC-compatible query keys for cache invalidation.
 *
 * Usage in loaders/components:
 * - Onboarding status: context.trpc.onboarding.status.queryOptions()
 * - Discovery devices: context.trpc.onboarding.discoveryDevices.queryOptions({ organizationId })
 * - Notification preferences: context.trpc.notification.preferences.queryOptions()
 *
 * Usage in mutations (for invalidation):
 * - invalidateKeys: [onboardingStatusQueryKey()]
 * - invalidateKeys: [discoveryDevicesQueryKey(organizationId)]
 */

/**
 * Generate tRPC-compatible query key for onboarding status
 * Matches: context.trpc.onboarding.status.queryOptions().queryKey
 */
export const onboardingStatusQueryKey = () =>
  [['onboarding', 'status'], { input: undefined, type: 'query' as const }] as const;

/**
 * Generate tRPC-compatible query key for discovery devices
 * Matches: context.trpc.onboarding.discoveryDevices.queryOptions({ organizationId }).queryKey
 */
export const discoveryDevicesQueryKey = (organizationId: string) =>
  [
    ['onboarding', 'discoveryDevices'],
    { input: { organizationId }, type: 'query' as const },
  ] as const;

/**
 * Generate tRPC-compatible query key for notification preferences
 * Matches: context.trpc.notification.preferences.queryOptions().queryKey
 */
export const notificationPreferencesQueryKey = () =>
  [['notification', 'preferences'], { input: undefined, type: 'query' as const }] as const;
