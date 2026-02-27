import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutationWithToast } from "@/hooks/use-mutation-with-toast";
import { useTRPCClient } from "@/integrations/trpc/react";
import { onboardingQueries, organizationQueries } from "@/queries/organization-queries";
import { projectQueries } from "@/queries/project-queries";

export interface OrganizationFormData {
  organizationName: string;
  timezone: string;
  projectName: string;
  domain?: string;
}

export interface UseOrganizationLifecycleOptions {
  /**
   * Whether an organization already exists
   */
  hasOrganization: boolean;

  /**
   * Persisted organization ID from previous steps
   */
  persistedOrganizationId: string | null;

  /**
   * Persisted project ID from previous steps
   */
  projectId: string | null;
}

export interface OrganizationSetupResult {
  success: boolean;
  organizationId?: string;
  projectId?: string;
  error?: string;
}

/**
 * Custom hook to handle organization and project lifecycle
 * Uses React Query mutation with cache seeding for instant UI updates
 */
export function useOrganizationLifecycle({
  hasOrganization,
  persistedOrganizationId,
  projectId,
}: UseOrganizationLifecycleOptions) {
  const queryClient = useQueryClient();
  const trpcClient = useTRPCClient();
  const [error, setError] = useState<string | null>(null);

  // Use base path for invalidation (matches all onboarding status queries)

  /**
   * Mutation function: Sets up organization and project
   * Handles both new organization creation and existing organization updates
   */
  const setupMutationFn = async (
    formData: OrganizationFormData
  ): Promise<OrganizationSetupResult> => {
    // Require explicit organization ID when updating existing org
    if (hasOrganization && !persistedOrganizationId) {
      throw new Error(
        "Organization ID is required when updating an existing organization"
      );
    }

    let organizationId = persistedOrganizationId;

    // Step 1: Create or update organization (using tRPC)
    if (!hasOrganization || !organizationId) {
      console.log(
        "[useOrganizationLifecycle] Creating organization:",
        formData.organizationName
      );

      const orgResult = await trpcClient.onboarding.createOrganization.mutate({
        name: formData.organizationName,
        timezone: formData.timezone,
      });

      organizationId = orgResult.organization.id;
      console.log(
        "[useOrganizationLifecycle] Organization created:",
        orgResult.organization
      );
    } else {
      await trpcClient.onboarding.updateOrganization.mutate({
        organizationId,
        name: formData.organizationName,
        timezone: formData.timezone,
      });

      console.log(
        "[useOrganizationLifecycle] Organization updated:",
        organizationId
      );
    }

    if (!organizationId) {
      throw new Error("Organization ID not available");
    }

    // Step 2: Create or update project (using tRPC)
    console.log(
      "[useOrganizationLifecycle] Saving project:",
      formData.projectName
    );

    const projectResult = await trpcClient.onboarding.createProject.mutate({
      projectName: formData.projectName,
      domain: formData.domain || undefined,
      organizationId,
      projectId,
    });

    console.log(
      "[useOrganizationLifecycle] Project saved:",
      projectResult.project
    );

    return {
      success: true,
      organizationId,
      projectId: projectResult.project.id,
    };
  };

  const mutation = useMutationWithToast({
    mutationKey: ["onboarding", "setup"],
    mutationFn: setupMutationFn,
    successMessage: `${hasOrganization ? "Updated" : "Created"} organization and project`,
    invalidateKeys: [
      onboardingQueries.status.base,
      organizationQueries.list.base,
    ],
    toastOnSuccess: false, // Silent - onboarding flow handles navigation
    onSuccess: async (result) => {
      if (!result.success) return;

      // Seed React Query cache with fresh onboarding status
      // This triggers instant UI updates across all components using tRPC query
      const nextStatus = await trpcClient.onboarding.status.query();
      queryClient.setQueryData(onboardingQueries.status.key(), nextStatus);

      // Also seed organization and project data for instant sidebar updates
      const orgs = await trpcClient.organization.list.query();
      queryClient.setQueryData(organizationQueries.list.key(), orgs);

      if (result.organizationId) {
        // Invalidate and seed specific organization detail
        const org = await trpcClient.organization.get.query({
          organizationId: result.organizationId,
        });
        queryClient.setQueryData(
          organizationQueries.detail.key(result.organizationId),
          org
        );

        // Invalidate and seed projects for this organization
        const projects = await trpcClient.project.listByOrg.query({
          organizationId: result.organizationId,
        });
        queryClient.setQueryData(
          projectQueries.listByOrg.key(result.organizationId),
          projects
        );
      }

      console.log("[useOrganizationLifecycle] Cache seeded with fresh data");
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      console.error("[useOrganizationLifecycle] Error:", err);
      setError(errorMessage);
    },
  });

  return {
    setupOrganizationAndProject: mutation.mutateAsync,
    error: error || (mutation.error ? String(mutation.error) : null),
    setError,
    isPending: mutation.isPending,
  };
}
