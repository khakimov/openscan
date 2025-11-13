import { queryOptions } from '@tanstack/react-query';
import {
  completeOnboarding,
  createOrganizationOnboarding,
  createProjectOnboarding,
  updateOrganizationOnboarding,
  getOrganizationById,
} from '@/server/organization';
import { getOrganizationProjects } from '@/server/projects';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { onboardingStatusQuery } from '@/queries/onboarding-queries';

/**
 * Organization Query & Mutation Hooks (OpenPanel pattern)
 *
 * Pattern from: https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/queries/organization.ts
 *
 * Benefits:
 * - Query helpers provide single source of truth for query keys
 * - Mutations automatically invalidate related queries
 * - Type-safe across loaders, components, and mutations
 * - Consistent staleTime for related data
 *
 * Usage in route loaders:
 * const result = await context.queryClient.ensureQueryData(
 *   organizationDetailQuery(params.organizationId)
 * );
 *
 * Usage in components:
 * const { data } = useQuery(organizationDetailQuery(orgId));
 */

// ========================================
// Query Helpers
// ========================================

/**
 * Get organization by ID or slug
 * Used in route loaders to validate access and hydrate SSR data
 */
export const organizationDetailQuery = (identifier: string) =>
  queryOptions({
    queryKey: ['organizations', identifier, 'detail'],
    queryFn: () => getOrganizationById({ data: identifier }),
    staleTime: 60_000, // 1 minute
  });

/**
 * Get projects for an organization
 * Used in sidebar navigation and project selection
 * Note: orgId is for cache scoping only - server reads current org from session
 */
export const organizationProjectsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['organizations', orgId, 'projects'],
    queryFn: () => getOrganizationProjects(),
    staleTime: 60_000, // 1 minute
  });

// ========================================
// Mutation Hooks
// ========================================

/**
 * Organization mutation hooks (following TanStack Router best practice)
 *
 * Benefits:
 * - Centralized invalidation logic
 * - Reusable across components
 * - Type-safe
 * - Follows official TanStack pattern from kitchen-sink-react-query example
 *
 * Usage in components:
 * const completeOnboardingMutation = useCompleteOnboardingMutation();
 * completeOnboardingMutation.mutate({ organizationId: '123' });
 */

export const useCompleteOnboardingMutation = () =>
  useMutationWithToast({
    mutationKey: ['organization', 'complete-onboarding'],
    mutationFn: async (data: { organizationId: string }) => {
      const response = await completeOnboarding({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to complete onboarding');
      }
      return response;
    },
    successMessage: "Onboarding completed successfully!",
    invalidateKeys: [onboardingStatusQuery.queryKey],
  });

export const useCreateOrganizationMutation = () =>
  useMutationWithToast({
    mutationKey: ['organization', 'create'],
    mutationFn: async (data: { name: string; slug?: string; timezone?: string }) => {
      const response = await createOrganizationOnboarding({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create organization');
      }
      return response;
    },
    successMessage: (response) =>
      `Organization "${response.organization.name}" created`,
    invalidateKeys: [['organizations'], onboardingStatusQuery.queryKey],
  });

export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationKey: ['project', 'create'],
    mutationFn: async (data: {
      projectName: string;
      organizationId: string;
      projectId?: string | null;
      domain?: string;
    }) => {
      const response = await createProjectOnboarding({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create project');
      }
      return response;
    },
    successMessage: (response) =>
      `Project "${response.project.name}" created`,
    invalidateKeys: [
      ['organizations'], // Invalidate all org-scoped data
      onboardingStatusQuery.queryKey,
    ],
  });

export const useUpdateOrganizationMutation = () =>
  useMutationWithToast({
    mutationKey: ['organization', 'update'],
    mutationFn: async (data: { organizationId: string; name: string; timezone?: string | null }) => {
      const response = await updateOrganizationOnboarding({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to update organization');
      }
      return response;
    },
    successMessage: "Organization updated successfully",
    invalidateKeys: [['organizations'], onboardingStatusQuery.queryKey],
  });
