import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { useTRPCClient } from '@/integrations/trpc/react';
import { onboardingQueries, organizationQueries } from './organization-queries';
import { projectQueries } from './project-queries';

// Re-export for convenience
export { onboardingQueries, organizationQueries, projectQueries };

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
    invalidateKeys: [
      onboardingQueries.status.base,
      organizationQueries.list.base,
      organizationQueries.detail.base,
    ],
  });
};

export const useCreateOrganizationMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['organization', 'create'],
    mutationFn: (data: { name: string; slug?: string; timezone?: string }) =>
      trpcClient.onboarding.createOrganization.mutate(data),
    successMessage: (response) => `Organization "${response.organization.name}" created`,
    invalidateKeys: [
      onboardingQueries.status.base,
      organizationQueries.list.base,
    ],
  });
};

export const useCreateProjectMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

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
      onboardingQueries.status.base,
      organizationQueries.list.base,
    ],
    onSuccess: async (_data, variables) => {
      // Also invalidate the specific project list for this organization
      await queryClient.invalidateQueries({
        queryKey: projectQueries.listByOrg.key(variables.organizationId),
      });
    },
  });
};

export const useUpdateOrganizationMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['organization', 'update'],
    mutationFn: (data: { organizationId: string; name: string; timezone?: string | null }) =>
      trpcClient.onboarding.updateOrganization.mutate(data),
    successMessage: 'Organization updated successfully',
    invalidateKeys: [
      onboardingQueries.status.base,
      organizationQueries.list.base,
    ],
    onSuccess: async (_data, variables) => {
      // Invalidate the specific organization detail
      await queryClient.invalidateQueries({
        queryKey: organizationQueries.detail.key(variables.organizationId),
      });
    },
  });
};

export const useSetActiveOrganizationMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) =>
      trpcClient.organization.setActive.mutate({ organizationId }),
    onSuccess: (_data, organizationId) => {
      // Invalidate organization queries to refresh activeOrganizationId
      queryClient.invalidateQueries({
        queryKey: organizationQueries.list.base,
      });
      queryClient.invalidateQueries({
        queryKey: organizationQueries.detail.key(organizationId),
      });
    },
  });
};
