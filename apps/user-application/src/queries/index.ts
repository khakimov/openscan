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
