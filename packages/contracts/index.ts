/**
 * @repo/contracts
 *
 * Shared type definitions and schemas for the application
 * Domain types are the single source of truth across UI, workers, and data-ops
 */

// Shared result types
export * from './result';

// Domain types (shared across all apps)
export * from './device';
export * from './project';
export * from './scan';

// Organization exports (ProjectEntity already exported from project.ts)
export type {
  OrganizationEntity,
  BetterAuthOrganization,
  SimpleOrganizationEntity,
  ActiveOrganizationResult,
  OrganizationByIdResult,
  UserOrganizationsResult,
  CreateOrganizationResult,
  CreateProjectResult,
  UpdateOrganizationResult,
  CompleteOnboardingResult,
  UpdateOnboardingStepInput,
  CompleteOnboardingInput,
} from './organization';

// Postback/worker contracts
export * from './artifacts';
export * from './scanners';
export * from './postbacks';

// Network utilities (DNS resolution and IP validation)
export * from './network/ip-utils';
export * from './network/dns-resolver';

// Notification schemas (shared enums and types)
export * from './notifications';
