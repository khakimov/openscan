/**
 * Centralized query and mutation definitions
 *
 * All TanStack Query queryOptions and mutation hooks are defined here for:
 * - Reusability in loaders and components
 * - Type-safe query keys
 * - Single source of truth
 * - Easy cache invalidation
 * - Centralized mutation logic (following TanStack Router best practice)
 */
export { deviceQueries } from './device-queries';
export { scanQueries } from './scan-queries';
export { discoveryQueries } from './discovery-queries';
export { scheduleQueries } from './schedule-queries';

// Query helpers for route loaders (OpenPanel pattern)
export {
  organizationDetailQuery,
  organizationProjectsQuery,
} from './organization-queries';

export {
  projectAccessQuery,
  projectDetailQuery,
} from './project-queries';

export {
  notificationListQuery,
  unreadNotificationCountQuery,
  notificationPreferencesQuery,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  useSaveNotificationPreferencesMutation,
} from './notification-queries';

export {
  onboardingStatusQuery,
  discoveryDevicesQuery,
} from './onboarding-queries';

// Device mutation hooks
export {
  useDeleteDeviceMutation,
  useUpdateDeviceMutation,
  useVerifyDeviceMutation,
  useToggleDeviceVerificationMutation,
  useStartDeviceScanMutation,
  useCreateDevicesFromDiscoveryMutation,
} from './device-queries';

// Discovery mutation hooks
export {
  useStartDiscoveryMutation,
} from './discovery-queries';

// Organization mutation hooks
export {
  useCompleteOnboardingMutation,
  useCreateOrganizationMutation,
  useCreateProjectMutation,
  useUpdateOrganizationMutation,
} from './organization-queries';

// Schedule mutation hooks
export {
  useCreateScheduleMutation,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useDeleteScheduleMutation,
} from './schedule-queries';
