export type UserOrganizationsResult =
  | {
      success: true;
      organizations: Array<{
        id: string;
        name: string | null;
        metadata: Record<string, {}> | null;
      }>;
      error?: undefined;
    }
  | {
      success: false;
      organizations: Array<{
        id: string;
        name: string | null;
        metadata: Record<string, {}> | null;
      }>;
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
