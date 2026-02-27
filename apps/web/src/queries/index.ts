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
export { organizationQueries, onboardingQueries } from './organization-queries';
export { projectQueries } from './project-queries';

// Notification queries
export {
  notificationQueries,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useSaveNotificationPreferencesMutation,
} from './notification-queries';



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
  useSetActiveOrganizationMutation,
} from './organization-mutations';

// Re-export onboardingQueries from organization-queries for backward compatibility
// (previously defined in organization-mutations.ts)

// Schedule mutation hooks
export {
  useCreateScheduleMutation,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useDeleteScheduleMutation,
} from './schedule-queries';
