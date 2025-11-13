import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getDefaultProject, getOrganizationById as getOrgByIdData } from "@repo/data-ops";
import { getCurrentUser } from "../utils/auth";
import { getUserOrganizations } from "./onboarding";
import type {
  OnboardingOrganizationSummary,
  OnboardingProjectSummary,
  OnboardingStatus,
  OnboardingUserSummary,
} from "../types/onboarding";

const logger = createLogger({ name: "organization-server:status" });

/**
 * Determine onboarding progress for the current user.
 */
export const getOnboardingStatus = createServerFn({
  method: "GET",
}).handler(async (): Promise<OnboardingStatus> => {
  let currentUser: OnboardingUserSummary | null = null;
  let organizations: OnboardingOrganizationSummary[] = [];

  try {
    try {
      const rawUser = await getCurrentUser();
      currentUser = {
        id: rawUser.id,
        email: rawUser.email ?? null,
        name: rawUser.name ?? null,
        emailVerified: Boolean(rawUser.emailVerified),
        organizationId: rawUser.organizationId,
      };
    } catch (error) {
      logger.debug("No authenticated user while fetching onboarding status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const organizationsResult = await getUserOrganizations();
    // getUserOrganizations already normalizes metadata - no need to re-parse
    // Map to OnboardingOrganizationSummary to ensure metadata is never undefined
    organizations = organizationsResult.organizations.map(org => ({
      id: org.id,
      name: org.name,
      metadata: org.metadata ?? null,
    }));

    if (!organizationsResult.success && organizationsResult.error) {
      logger.warn("Proceeding without organizations due to fetch error", {
        error: organizationsResult.error,
      });
    }

    const primaryOrganizationId = organizations[0]?.id ?? null;

    if (!primaryOrganizationId) {
      return {
        success: true,
        step: 1,
        organizationId: null,
        projectId: null,
        user: currentUser,
        organizations,
        onboardingCompleted: false,
      } satisfies OnboardingStatus;
    }

    // CRITICAL FIX: Bypass better-auth cache and read directly from database
    // better-auth caches organization metadata, so after completeOnboarding() is called,
    // getUserOrganizations() still returns stale data without onboardingCompleted=true
    const freshOrgData = await getOrgByIdData(primaryOrganizationId);

    let organizationMetadata: Record<string, {}> = {};
    if (freshOrgData?.metadata) {
      try {
        organizationMetadata = JSON.parse(freshOrgData.metadata) as Record<string, {}>;
        logger.debug("Organization metadata from database (fresh)", {
          organizationId: primaryOrganizationId,
          metadata: organizationMetadata,
          onboardingCompleted: organizationMetadata?.onboardingCompleted,
        });
      } catch (err) {
        logger.warn("Failed to parse fresh organization metadata", {
          organizationId: primaryOrganizationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const organizationRecord = organizationsResult.organizations.find(
      (org) => org.id === primaryOrganizationId,
    );

    const defaultProject = await getDefaultProject(primaryOrganizationId);
    const hasProject = Boolean(defaultProject);

    const organizationSummary: OnboardingOrganizationSummary = {
      id: primaryOrganizationId,
      name: organizationRecord?.name ?? null,
      slug: organizationRecord?.slug ?? null,
      metadata: organizationMetadata,
    };

    const projectSummary: OnboardingProjectSummary | null = defaultProject
      ? {
          id: defaultProject.id,
          name: defaultProject.name ?? null,
          domain: defaultProject.domain ?? null,
        }
      : null;

    const onboardingCompleted =
      organizationMetadata?.onboardingCompleted === true;

    const storedMaxStep =
      typeof organizationMetadata?.maxOnboardingStep === "number"
        ? organizationMetadata.maxOnboardingStep
        : undefined;

    const inferredStep = hasProject ? 3 : 2;
    const maxStep =
      storedMaxStep !== undefined
        ? Math.max(storedMaxStep, inferredStep)
        : inferredStep;

    return {
      success: true,
      step: maxStep as 2 | 3,
      organizationId: primaryOrganizationId,
      projectId: defaultProject?.id ?? null,
      user: currentUser,
      organization: organizationSummary,
      project: projectSummary,
      organizations,
      onboardingCompleted,
    } satisfies OnboardingStatus;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("Failed to compute onboarding status", {
      error: errorMessage,
    });

    return {
      success: false,
      step: 1,
      organizationId: null,
      projectId: null,
      user: currentUser,
      organizations: [],
      onboardingCompleted: false,
      error: errorMessage,
    } satisfies OnboardingStatus;
  }
});

