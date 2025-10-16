export type OnboardingUserSummary = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  organizationId: string | undefined;
};

export type OnboardingOrganizationMetadata = Record<string, unknown>;

export type OnboardingOrganizationSummary = {
  id: string;
  name: string | null;
  metadata: OnboardingOrganizationMetadata | null;
};

export type OnboardingProjectSummary = {
  id: string;
  name: string | null;
  domain?: string | null;
};

type OnboardingBase = {
  success: boolean;
  step: number;
  organizationId: string | null;
  projectId: string | null;
  user: OnboardingUserSummary | null;
  organizations: OnboardingOrganizationSummary[];
};

export type OnboardingStatusSuccessPending = OnboardingBase & {
  success: true;
  step: 1;
  organizationId: null;
  projectId: null;
  organization?: null;
  project?: null;
  error?: undefined;
};

export type OnboardingStatusSuccessActive = OnboardingBase & {
  success: true;
  step: 2 | 3;
  organizationId: string;
  projectId: string | null;
  organization: OnboardingOrganizationSummary | null;
  project: OnboardingProjectSummary | null;
  error?: undefined;
};

export type OnboardingStatusFailure = OnboardingBase & {
  success: false;
  error: string;
  organizationId: null;
  projectId: null;
  organization?: null;
  project?: null;
};

export type OnboardingStatus =
  | OnboardingStatusSuccessPending
  | OnboardingStatusSuccessActive
  | OnboardingStatusFailure;
