import {
  completeOnboarding,
  createOrganizationOnboarding,
  createProjectOnboarding,
  updateOrganizationOnboarding,
} from '@/server/organization';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { onboardingStatusQuery } from '@/queries/onboarding-status';

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
    invalidateKeys: [['projects'], onboardingStatusQuery.queryKey],
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
