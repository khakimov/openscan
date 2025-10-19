import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  completeOnboarding,
  createOrganizationOnboarding,
  createProjectOnboarding,
  updateOrganizationOnboarding,
} from '@/server/organization';

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

export const useCompleteOnboardingMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['organization', 'complete-onboarding'],
    mutationFn: (data: { organizationId: string }) => completeOnboarding({ data }),
    onSuccess: () => {
      // Invalidate onboarding status to reflect completion
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
};

export const useCreateOrganizationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['organization', 'create'],
    mutationFn: (data: { name: string; slug?: string; timezone?: string }) =>
      createOrganizationOnboarding({ data }),
    onSuccess: () => {
      // Invalidate user organizations list
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
};

export const useCreateProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['project', 'create'],
    mutationFn: (data: {
      projectName: string;
      organizationId: string;
      projectId?: string | null;
      domain?: string;
    }) => createProjectOnboarding({ data }),
    onSuccess: () => {
      // Invalidate projects list and onboarding status
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
};

export const useUpdateOrganizationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['organization', 'update'],
    mutationFn: (data: { organizationId: string; name: string; timezone?: string | null }) =>
      updateOrganizationOnboarding({ data }),
    onSuccess: () => {
      // Invalidate organization data
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
};
