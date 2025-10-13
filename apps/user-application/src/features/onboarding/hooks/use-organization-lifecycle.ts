import { useState } from "react";
import {
  createOrganizationOnboarding,
  createProjectDevice,
  updateOrganizationOnboarding,
} from "@/server/organization";

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
   * List of existing organizations
   */
  organizations: any[];

  /**
   * Persisted device ID from previous steps
   */
  deviceId: string | null;
}

export interface OrganizationSetupResult {
  success: boolean;
  organizationId?: string;
  deviceId?: string;
  error?: string;
}

/**
 * Custom hook to handle organization and project lifecycle
 * Extracts the complex organization/device creation logic from form submission
 */
export function useOrganizationLifecycle({
  hasOrganization,
  persistedOrganizationId,
  organizations,
  deviceId,
}: UseOrganizationLifecycleOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sets up organization and project device
   * Handles both new organization creation and existing organization updates
   */
  const setupOrganizationAndProject = async (
    formData: OrganizationFormData
  ): Promise<OrganizationSetupResult> => {
    setIsProcessing(true);
    setError(null);

    try {
      let organizationId =
        persistedOrganizationId ?? organizations[0]?.id ?? null;

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

      // Step 2: Create project device
      console.log(
        "[useOrganizationLifecycle] Saving project device:",
        formData.projectName
      );

      const deviceResult = await createProjectDevice({
        data: {
          projectName: formData.projectName,
          domain: formData.domain || undefined,
          organizationId,
          deviceId,
        },
      });

      if (!deviceResult.success) {
        throw new Error(deviceResult.error || "Failed to save project");
      }

      console.log(
        "[useOrganizationLifecycle] Project device saved:",
        deviceResult.device
      );

      setIsProcessing(false);
      return {
        success: true,
        organizationId,
        deviceId: deviceResult.device.id,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      console.error("[useOrganizationLifecycle] Error:", err);
      setError(errorMessage);
      setIsProcessing(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    setupOrganizationAndProject,
    isProcessing,
    error,
    setError,
  };
}
