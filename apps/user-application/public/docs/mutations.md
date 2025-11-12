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
    mutationFn: async (data) => {
      const response = await updateDevice({ data });
      // Guard against { success: false } responses
      if (!response.success) {
        throw new Error(response.error || 'Failed to update device');
      }
      return response;
    },
    successMessage: "Device updated successfully",
    invalidateKeys: [
      ['devices'],
      ['device-detail', deviceId],
    ],
  });
```

**Important**: Always guard against `{ success: false }` responses in the `mutationFn`. Server functions that return discriminated unions (success/error) don't throw by default - React Query would treat them as "successful" mutations even when `success: false`. Throwing an error ensures proper error handling, toast notifications, and prevents false-positive UX.

### Dynamic Success Messages

Success messages can use response data (after guarding against failures):

```typescript
import { onboardingStatusQuery } from '@/queries/onboarding-status';

export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationKey: ['project', 'create'],
    mutationFn: async (data) => {
      const response = await createProject({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create project');
      }
      return response;
    },
    // Now we can safely access response.project since we threw on failure
    successMessage: (response) =>
      `Project "${response.project.name}" created`,
    // Use exported query keys for proper invalidation
    invalidateKeys: [['projects'], onboardingStatusQuery.queryKey],
  });
```

**Key Points**:
- Guard against `{ success: false }` before returning - this ensures `successMessage` only receives success payloads
- Use exported query keys (e.g., `onboardingStatusQuery.queryKey`) instead of hardcoded strings to prevent invalidation mismatches

### Custom Success Handler

For complex post-success logic (navigation, cache seeding, etc.):

```typescript
import { onboardingStatusQuery } from '@/queries/onboarding-status';

export const useCompleteOnboardingMutation = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutationWithToast({
    mutationKey: ['organization', 'complete-onboarding'],
    mutationFn: async (data) => {
      const response = await completeOnboarding({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to complete onboarding');
      }
      return response;
    },
    successMessage: "Onboarding completed!",
    invalidateKeys: [onboardingStatusQuery.queryKey],
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

## Critical Pattern: Success Handling

### The Problem

Our server functions return discriminated unions like `{ success: true, data } | { success: false, error }`. These functions **don't throw errors** - they return `{ success: false }` as a normal response.

React Query treats any non-thrown response as "success", which means:
- ❌ Helper shows success toast even when `success: false`
- ❌ Cache gets invalidated on failures
- ❌ `onSuccess` callback runs on failures
- ❌ Users see false-positive feedback

### The Solution

**Always guard against `{ success: false }` in `mutationFn`**:

```typescript
// ❌ WRONG - React Query treats { success: false } as success
mutationFn: (data) => createDevice({ data }),

// ✅ CORRECT - Throw on failure, ensuring proper error handling
mutationFn: async (data) => {
  const response = await createDevice({ data });
  if (!response.success) {
    throw new Error(response.error || 'Failed to create device');
  }
  return response;
},
```

### Why This Works

1. **Throwing converts failure to error state** - React Query's `onError` runs instead of `onSuccess`
2. **Helper shows error toast automatically** - The thrown error message appears in the toast
3. **Cache invalidation only on real success** - `invalidateKeys` only runs when mutation succeeds
4. **Type narrowing in callbacks** - After the guard, TypeScript knows `response.success === true`

### Example: Before vs After

**Before (Broken)**:
```typescript
export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationFn: (data) => createProject({ data }), // ❌ No guard
    successMessage: (response) =>
      response.success && response.project
        ? `Project "${response.project.name}" created`
        : "Project created successfully", // ❌ Fallback for failures!
    invalidateKeys: [['projects']], // ❌ Invalidates even on failure
  });
```

**After (Fixed)**:
```typescript
export const useCreateProjectMutation = () =>
  useMutationWithToast({
    mutationFn: async (data) => {
      const response = await createProject({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to create project');
      }
      return response; // ✅ Only success payloads reach here
    },
    successMessage: (response) =>
      `Project "${response.project.name}" created`, // ✅ No need to check success
    invalidateKeys: [['projects']], // ✅ Only invalidates on success
  });
```

## Invalidation Key Best Practices

### Use Exported Query Keys

**Problem**: Hardcoded query keys can mismatch with actual query definitions, causing invalidations to silently fail.

```typescript
// ❌ WRONG - Hardcoded key doesn't match actual query
invalidateKeys: [['onboarding-status']], // Actual key is ['onboarding', 'status']

// ✅ CORRECT - Use exported query key
import { onboardingStatusQuery } from '@/queries/onboarding-status';
invalidateKeys: [onboardingStatusQuery.queryKey], // ['onboarding', 'status']
```

### Invalidate Broadly for Dynamic Queries

**Problem**: Invalidating with specific params misses other variants of the same query.

```typescript
// ❌ WRONG - Only invalidates scans without projectId
import { scanQueries } from '@/queries/scan-queries';
invalidateKeys: [scanQueries.list().queryKey], // ['scans', undefined]

// ✅ CORRECT - Invalidate all scan queries (list and table, all projects)
invalidateKeys: [['scans'], ['scans-table']],
```

**When to use broad invalidation**:
- Queries with optional filters (projectId, status, etc.)
- Multiple query variants (list vs table, paginated vs all)
- Mutations that affect many related queries

**When to use specific invalidation**:
- Single-resource queries (device detail, user profile)
- Queries that won't be affected by the mutation

### Example: Discovery Scan Mutation

```typescript
export const useStartDiscoveryMutation = () =>
  useMutationWithToast({
    mutationKey: ['discovery', 'start'],
    mutationFn: async (data) => {
      const response = await startDiscoveryWorkflow({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to start discovery');
      }
      return response;
    },
    successMessage: (response) => `Discovery started for ${response.target}`,
    // Broad invalidation - catches all scan queries across all projects
    invalidateKeys: [['scans'], ['scans-table']],
  });
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
