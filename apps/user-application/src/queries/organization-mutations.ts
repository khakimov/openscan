import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { useTRPCClient } from '@/integrations/trpc/react';
import { onboardingStatusQueryKey } from '@/queries/onboarding-queries';

/**
 * Organization Mutation Hooks (OpenPanel tRPC pattern)
 *
 * All mutations now use tRPC procedures instead of legacy server functions
 */

export const useCompleteOnboardingMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['organization', 'complete-onboarding'],
    mutationFn: (data: { organizationId: string }) =>
      trpcClient.onboarding.completeOnboarding.mutate(data),
    successMessage: 'Onboarding completed successfully!',
    invalidateKeys: [onboardingStatusQueryKey()],
  });
};

export const useCreateOrganizationMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['organization', 'create'],
    mutationFn: (data: { name: string; slug?: string; timezone?: string }) =>
      trpcClient.onboarding.createOrganization.mutate(data),
    successMessage: (response) => `Organization "${response.organization.name}" created`,
    invalidateKeys: [['organizations'], onboardingStatusQueryKey()],
  });
};

export const useCreateProjectMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['project', 'create'],
    mutationFn: (data: {
      projectName: string;
      organizationId: string;
      projectId?: string | null;
      domain?: string;
    }) => trpcClient.onboarding.createProject.mutate(data),
    successMessage: (response) => `Project "${response.project.name}" created`,
    invalidateKeys: [
      ['organizations'], // Invalidate all org-scoped data
      onboardingStatusQueryKey(),
    ],
  });
};

export const useUpdateOrganizationMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['organization', 'update'],
    mutationFn: (data: { organizationId: string; name: string; timezone?: string | null }) =>
      trpcClient.onboarding.updateOrganization.mutate(data),
    successMessage: 'Organization updated successfully',
    invalidateKeys: [['organizations'], onboardingStatusQueryKey()],
  });
};

export const useSetActiveOrganizationMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) =>
      trpcClient.organization.setActive.mutate({ organizationId }),
    onSuccess: () => {
      // Invalidate organization list to refresh activeOrganizationId
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
      });
    },
  });
};