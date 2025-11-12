/**
 * Shared organization types for server functions
 * These types eliminate the need for defensive casts in route loaders
 */

// Organization entity (shared structure)
// metadata is ALWAYS normalized to object by all handlers (never raw string)
// NOTE: Uses Record<string, {}> instead of Record<string, unknown> for TanStack compatibility
export interface OrganizationEntity {
  id: string;
  name: string | null;
  slug?: string | null;
  metadata: Record<string, {}> | null;  // Required, always normalized
}

/**
 * Better-auth Organization API response structure (JSON-serialized & normalized)
 * This is returned by createOrganization/listOrganizations after normalization
 * Note: Handlers normalize metadata from raw JSON string to parsed object
 */
export interface BetterAuthOrganization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata: Record<string, {}> | null;  // Normalized to object by handlers
  createdAt: string;  // ISO string after JSON serialization
}

// Simple organization entity (minimal info)
export interface SimpleOrganizationEntity {
  id: string;
  name: string | null;
  slug: string | null;
}

// Project entity (shared structure)
export interface ProjectEntity {
  id: string;
  name: string;
  domain?: string | null;
  isDefault?: boolean;
}

/**
 * getActiveOrganization return type
 */
export type ActiveOrganizationResult =
  | {
      success: true;
      organization: SimpleOrganizationEntity;
      error?: undefined;
    }
  | {
      success: false;
      organization: null;
      error?: string;
    };

/**
 * getOrganizationById return type
 */
export type OrganizationByIdResult =
  | {
      success: true;
      organization: OrganizationEntity;
      error?: undefined;
      statusCode?: undefined;
    }
  | {
      success: false;
      organization: null;
      error: string;
      statusCode?: 403 | 404;
    };

/**
 * getUserOrganizations return type
 */
export type UserOrganizationsResult =
  | {
      success: true;
      organizations: OrganizationEntity[];
      error?: undefined;
    }
  | {
      success: false;
      organizations: OrganizationEntity[];
      error: string;
    };

/**
 * createOrganizationOnboarding return type
 */
export type CreateOrganizationResult =
  | {
      success: true;
      organization: BetterAuthOrganization;
      error?: undefined;
    }
  | {
      success: false;
      organization?: undefined;
      error: string;
    };

/**
 * createProjectOnboarding return type
 */
export type CreateProjectResult =
  | {
      success: true;
      project: ProjectEntity;
      error?: undefined;
    }
  | {
      success: false;
      project?: undefined;
      error: string;
    };

/**
 * updateOrganizationOnboarding return type
 */
export type UpdateOrganizationResult =
  | {
      success: true;
      error?: undefined;
    }
  | {
      success: false;
      error: string;
    };

/**
 * completeOnboarding return type
 */
export type CompleteOnboardingResult =
  | {
      success: true;
      error?: undefined;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Helper type to extract step payload for updateOnboardingStep server fn
 * Re-exported so consumers don't need to depend on zod schemas directly.
 */
export type UpdateOnboardingStepInput = {
  organizationId: string;
  step: number;
};

export type CompleteOnboardingInput = {
  organizationId: string;
};
