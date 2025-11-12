# Mutation Best Practices

This guide covers the recommended patterns for handling mutations in the application using `useMutationWithToast`.

## Overview

The `useMutationWithToast` helper provides a standardized way to handle mutations with:
- Automatic success/error toast notifications
- Centralized error logging
- Declarative cache invalidation
- Type-safe success messages
- Support for custom callbacks and optimistic updates

## Basic Usage

### Simple Mutation

```typescript
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { updateDevice } from '@/server/devices';

export const useUpdateDeviceMutation = (deviceId: string) =>
  useMutationWithToast({
    mutationKey: ['devices', 'update', deviceId],
    mutationFn: (data) => updateDevice({ data }),
    successMessage: "Device updated successfully",
    invalidateKeys: [
      ['devices'],
      ['device-detail', deviceId],
    ],
  });
```

### Dynamic Success Messages

Success messages can use response data:

```typescript
export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationKey: ['project', 'create'],
    mutationFn: (data) => createProject({ data }),
    successMessage: (response, vars) =>
      response.success && response.project
        ? `Project "${response.project.name}" created`
        : "Project created successfully",
    invalidateKeys: [['projects'], ['onboarding-status']],
  });
```

### Custom Success Handler

For complex post-success logic (navigation, cache seeding, etc.):

```typescript
export const useCompleteOnboardingMutation = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutationWithToast({
    mutationKey: ['organization', 'complete-onboarding'],
    mutationFn: (data) => completeOnboarding({ data }),
    successMessage: "Onboarding completed!",
    invalidateKeys: [['onboarding-status']],
    onSuccess: async (response, variables) => {
      // Seed cache for immediate UI update
      const nextStatus = await queryClient.fetchQuery(onboardingStatusQuery);
      queryClient.setQueryData(onboardingStatusQuery.queryKey, nextStatus);

      // Navigate to dashboard
      navigate({ to: "/$organizationId", params: { organizationId: variables.organizationId } });
    },
  });
};
```

## Advanced Patterns

### Optimistic Updates

The helper supports `onMutate` and `onSettled` for optimistic updates:

```typescript
export const useStartDeviceScanMutation = (deviceId: string) => {
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['devices', 'scan', deviceId],
    mutationFn: (data) => startDeviceScan({ data }),
    successMessage: "Scan started",

    // Optimistic update - add temporary scan immediately
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['active-scans', deviceId] });

      const previousScans = queryClient.getQueryData(['active-scans', deviceId]);

      queryClient.setQueryData(['active-scans', deviceId], (old) => [
        ...(old || []),
        { id: `temp-${Date.now()}`, status: 'PENDING', ...variables }
      ]);

      return { previousScans };
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousScans) {
        queryClient.setQueryData(['active-scans', deviceId], context.previousScans);
      }
    },

    // Sync with real data
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['active-scans', deviceId] });
    },
  });
};
```

### Silent Mutations

For background operations that shouldn't show toasts:

```typescript
export const useTrackAnalyticsMutation = () =>
  useMutationWithToast({
    mutationKey: ['analytics', 'track'],
    mutationFn: (data) => trackEvent({ data }),
    toastOnSuccess: false,
    toastOnError: false,
  });
```

### Custom Error Handling

```typescript
export const useDeleteDeviceMutation = () =>
  useMutationWithToast({
    mutationKey: ['devices', 'delete'],
    mutationFn: (data) => deleteDevice({ data }),
    successMessage: "Device deleted",
    errorMessage: "Failed to delete device. Please try again.",
    invalidateKeys: [['devices']],
    onError: (error, variables) => {
      // Custom error handling (e.g., redirect to error page)
      console.error('Delete failed:', error.message, 'for device:', variables.deviceId);
    },
  });
```

## API Reference

### useMutationWithToast Options

| Option | Type | Description |
|--------|------|-------------|
| `mutationFn` | `Function` | Required. The mutation function to execute |
| `mutationKey` | `QueryKey` | Optional. Query key for DevTools visibility |
| `successMessage` | `string \| (data, vars) => string` | Success toast message (static or dynamic) |
| `errorMessage` | `string` | Error toast fallback (default: "Something went wrong") |
| `invalidateKeys` | `QueryKey[]` | Query keys to invalidate after success |
| `onSuccess` | `(data, vars, context) => void \| Promise<void>` | Custom success callback |
| `onError` | `(error, vars, context) => void \| Promise<void>` | Custom error callback |
| `toastOnSuccess` | `boolean` | Show success toast (default: true) |
| `toastOnError` | `boolean` | Show error toast (default: true) |
| `onMutate` | `(vars) => Promise<context>` | Optimistic update callback |
| `onSettled` | `() => void \| Promise<void>` | Cleanup callback |

## When NOT to Use

The helper is designed for most mutations, but in some cases you may want to use raw `useMutation`:

1. **Extremely complex optimistic logic** - If your optimistic update logic is very complex and requires fine-grained control, use raw `useMutation`
2. **Custom toast implementation** - If you need highly customized toast behavior (e.g., toast with custom actions, persistent toasts)
3. **No UI feedback needed** - For truly silent background operations where even error logging might be excessive

## Migration Guide

### Before (raw useMutation)

```typescript
export const useUpdateDeviceMutation = (deviceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'update', deviceId],
    mutationFn: (data) => updateDevice({ data }),
    onSuccess: () => {
      toast.success("Device updated");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update device");
    },
  });
};
```

### After (useMutationWithToast)

```typescript
export const useUpdateDeviceMutation = (deviceId: string) =>
  useMutationWithToast({
    mutationKey: ['devices', 'update', deviceId],
    mutationFn: (data) => updateDevice({ data }),
    successMessage: "Device updated successfully",
    invalidateKeys: [
      ['devices'],
      ['device-detail', deviceId],
    ],
  });
```

**Benefits:**
- 8 lines reduced to 7 lines
- Automatic error logging
- Consistent toast styling
- Type-safe success messages
- No repeated invalidation logic

## Examples in Codebase

- **Simple mutation**: `src/queries/organization-queries.ts` - `useCompleteOnboardingMutation`
- **Dynamic message**: `src/queries/device-queries.ts` - `useCreateDevicesFromDiscoveryMutation`
- **Custom success**: `src/modals/AddProject.tsx` - Custom toast with navigation action
- **Optimistic updates**: `src/queries/device-queries.ts` - `useDeleteDeviceMutation` (kept as raw `useMutation` for complex logic)

## Testing

When testing components that use `useMutationWithToast`, mock the helper:

```typescript
import { vi } from 'vitest';

vi.mock('@/hooks/use-mutation-with-toast', () => ({
  useMutationWithToast: (config) => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));
```

## See Also

- [TanStack Query Mutations](https://tanstack.com/query/latest/docs/react/guides/mutations)
- [OpenPanel Mutation Patterns](https://github.com/Openpanel-dev/openpanel) - Inspiration for this helper
