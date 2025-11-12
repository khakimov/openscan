import { queryOptions } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/server/organization/status";

/**
 * Centralized query definition for onboarding status
 *
 * Benefits:
 * - Single source of truth for query key and fetch logic
 * - Enables cache seeding after mutations (no refetch needed)
 * - Supports invalidation across all consuming components
 * - SSR-compatible with prefetchQuery in route loaders
 *
 * Usage:
 * - In routes: await context.queryClient.prefetchQuery(onboardingStatusQuery)
 * - In components: const { data } = useQuery(onboardingStatusQuery)
 * - After mutations: queryClient.setQueryData(onboardingStatusQuery.queryKey, newStatus)
 */
export const onboardingStatusQuery = queryOptions({
  queryKey: ["onboarding", "status"],
  queryFn: async () => {
    const status = await getOnboardingStatus();
    return status;
  },
  // Keep data fresh for 5 minutes (prevents unnecessary refetches during onboarding flow)
  staleTime: 5 * 60 * 1000,
});
