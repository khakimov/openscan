import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutationWithToast } from "@/hooks/use-mutation-with-toast";
import {
  createOrganizationOnboarding,
  createProjectOnboarding,
  updateOrganizationOnboarding,
} from "@/server/organization";
import { onboardingStatusQuery } from "@/queries/onboarding-queries";

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
  const [error, setError] = useState<string | null>(null);

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

    // Step 1: Create or update organization
    if (!hasOrganization || !organizationId) {
      console.log(
        "[useOrganizationLifecycle] Creating organization:",
        formData.organizationName
      );

      const orgResult = await createOrganizationOnboarding({
        data: {
          name: formData.organizationName,
          timezone: formData.timezone,
        },
      });

      if (!orgResult.success || !orgResult.organization) {
        throw new Error(
          orgResult.error || "Failed to create organization"
        );
      }

      organizationId = orgResult.organization.id;
      console.log(
        "[useOrganizationLifecycle] Organization created:",
        orgResult.organization
      );
    } else {
      const updateResult = await updateOrganizationOnboarding({
        data: {
          organizationId,
          name: formData.organizationName,
          timezone: formData.timezone,
        },
      });

      if (!updateResult.success) {
        throw new Error(
          updateResult.error || "Failed to update organization"
        );
      }

      console.log(
        "[useOrganizationLifecycle] Organization updated:",
        organizationId
      );
    }

    if (!organizationId) {
      throw new Error("Organization ID not available");
    }

    // Step 2: Create or update project
    console.log(
      "[useOrganizationLifecycle] Saving project:",
      formData.projectName
    );

    const projectResult = await createProjectOnboarding({
      data: {
        projectName: formData.projectName,
        domain: formData.domain || undefined,
        organizationId,
        projectId,
      },
    });

    if (!projectResult.success) {
      throw new Error(projectResult.error || "Failed to save project");
    }

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
    invalidateKeys: [onboardingStatusQuery.queryKey],
    toastOnSuccess: false, // Silent - onboarding flow handles navigation
    onSuccess: async (result) => {
      if (!result.success) return;

      // Seed React Query cache with fresh onboarding status
      // This triggers instant UI updates across all components using useQuery(onboardingStatusQuery)
      const nextStatus = await queryClient.fetchQuery(onboardingStatusQuery);
      queryClient.setQueryData(onboardingStatusQuery.queryKey, nextStatus);

      console.log("[useOrganizationLifecycle] Cache seeded with fresh onboarding status");
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
