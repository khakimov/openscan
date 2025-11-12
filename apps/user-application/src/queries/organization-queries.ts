import {
  completeOnboarding,
  createOrganizationOnboarding,
  createProjectOnboarding,
  updateOrganizationOnboarding,
} from '@/server/organization';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

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
    mutationFn: (data: { organizationId: string }) => completeOnboarding({ data }),
    successMessage: "Onboarding completed successfully!",
    invalidateKeys: [['onboarding-status']],
  });

export const useCreateOrganizationMutation = () =>
  useMutationWithToast({
    mutationKey: ['organization', 'create'],
    mutationFn: (data: { name: string; slug?: string; timezone?: string }) =>
      createOrganizationOnboarding({ data }),
    successMessage: (response) =>
      response.success && response.organization
        ? `Organization "${response.organization.name}" created`
        : "Organization created successfully",
    invalidateKeys: [['organizations'], ['onboarding-status']],
  });

export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationKey: ['project', 'create'],
    mutationFn: (data: {
      projectName: string;
      organizationId: string;
      projectId?: string | null;
      domain?: string;
    }) => createProjectOnboarding({ data }),
    successMessage: (response) =>
      response.success && response.project
        ? `Project "${response.project.name}" created`
        : "Project created successfully",
    invalidateKeys: [['projects'], ['onboarding-status']],
  });

export const useUpdateOrganizationMutation = () =>
  useMutationWithToast({
    mutationKey: ['organization', 'update'],
    mutationFn: (data: { organizationId: string; name: string; timezone?: string | null }) =>
      updateOrganizationOnboarding({ data }),
    successMessage: "Organization updated successfully",
    invalidateKeys: [['organizations'], ['onboarding-status']],
  });
