# Optimistic UI Guide

Complete guide to implementing optimistic updates with TanStack Query in our codebase.

## Table of Contents
- [What is Optimistic UI?](#what-is-optimistic-ui)
- [When to Use Optimistic Updates](#when-to-use-optimistic-updates)
- [When NOT to Use Optimistic Updates](#when-not-to-use-optimistic-updates)
- [Our Implementation](#our-implementation)
- [Usage Examples](#usage-examples)
- [Codebase Analysis](#codebase-analysis)
- [Future Improvements](#future-improvements)

---

## What is Optimistic UI?

**Optimistic UI** updates the user interface **immediately** when a user performs an action, **before** the server confirms success. If the server returns an error, the UI **rolls back** to the previous state.

### Benefits
- ⚡ **Instant feedback** - Users see results immediately
- 🎯 **Better UX** - Feels fast and responsive
- ✅ **Error recovery** - Rollback on failure with proper error messages

### How It Works
```
User clicks delete → Item disappears (optimistic) → Server processes → Success ✓ or Rollback ✗
```

**With optimistic updates:**
1. Click delete → Item **instantly** disappears
2. Server processes request (in background)
3. Success: Item stays gone, refetch from server
4. Error: Item **reappears**, show error toast

**Without optimistic updates:**
1. Click delete → Button shows "Deleting..."
2. Wait for server...
3. Success: Item disappears

---

## When to Use Optimistic Updates

### ✅ Good Candidates for Optimistic UI

1. **Delete operations**
   - User intent is clear
   - Low risk (can rollback)
   - Instant gratification matters
   - Example: Delete device, delete scan

2. **Toggle operations**
   - Binary state changes
   - Instant feedback expected
   - Example: Verify/unverify device, enable/disable feature

3. **Simple updates**
   - Single field changes
   - High confidence of success
   - Example: Update device name, change status

4. **Low-stakes create operations**
   - Creating simple records
   - No complex validation
   - Example: Add tag, create note

### Decision Criteria

Use optimistic updates when **ALL** of these are true:
- ✅ User expects instant feedback
- ✅ Operation is likely to succeed (>95%)
- ✅ Rollback is acceptable UX
- ✅ No complex server-side validation
- ✅ Operation affects currently visible data

---

## When NOT to Use Optimistic Updates

### ❌ Poor Candidates for Optimistic UI

1. **Long-running workflows**
   - Discovery scans (takes minutes)
   - Port scans (takes seconds/minutes)
   - Background jobs
   - **Why:** User expects to wait, optimistic update confuses state

2. **Complex server validation**
   - Payment processing
   - File uploads
   - API integrations
   - **Why:** High chance of failure, rollback is jarring

3. **Batch operations**
   - Import 100 devices
   - Bulk delete
   - Mass updates
   - **Why:** Partial failures are complex to handle

4. **Critical operations**
   - Delete organization
   - Revoke permissions
   - Financial transactions
   - **Why:** User needs explicit confirmation

5. **Operations with side effects**
   - Sending emails
   - Triggering webhooks
   - Starting external workflows
   - **Why:** Can't rollback external effects

### Red Flags

**Don't use optimistic updates if:**
- ❌ Operation involves external systems (email, webhooks, payments)
- ❌ Failure rate is high (>5%)
- ❌ User needs to see processing state
- ❌ Rollback would be confusing
- ❌ Operation is not idempotent

---

## Our Implementation

### Location
`src/lib/optimistic-updates.ts`

### Available Helpers

#### 1. `createOptimisticDeleteHandlers()`

Handles optimistic delete with automatic rollback on error.

**Features:**
- ✅ Cancels in-flight queries (prevents race conditions)
- ✅ Snapshots current data (for rollback)
- ✅ Optimistically removes item from cache
- ✅ Rollbacks on error
- ✅ Refetches after completion (ensures server consistency)

**Signature:**
```typescript
createOptimisticDeleteHandlers<T extends { id: string }>(
  queryKeys: unknown[][]
)
```

**Parameters:**
- `queryKeys`: Array of query keys to update (e.g., `[['devices'], ['device-detail', deviceId]]`)

**Returns:**
Object with `onMutate`, `onError`, `onSettled` handlers to spread into `useMutation`.

---

## Usage Examples

### Example 1: Delete Device (Current Implementation)

**File:** `src/queries/device-queries.ts:176`

```typescript
import { createOptimisticDeleteHandlers } from '@/lib/optimistic-updates';

export const useDeleteDeviceMutation = () => {
  const queryClient = useQueryClient();

  // Create optimistic handlers for all device queries
  const optimistic = createOptimisticDeleteHandlers([
    ['devices'], // Update all device list queries
  ]);

  return useMutation({
    mutationKey: ['devices', 'delete'],
    mutationFn: (data: { deviceId: string }) => deleteDevice({ data }),
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};
```

**User Experience:**
1. Click "Delete" → Device **instantly** disappears from list
2. Modal shows "Deleting..." button
3. Success: Modal closes, toast shows confirmation
4. Error: Device **reappears**, error toast shows, modal stays open

**Code in Modal:** `src/modals/DeleteDeviceConfirm.tsx:24`
```typescript
const handleDelete = async () => {
  deleteMutation.mutate(
    { deviceId },
    {
      onSuccess: async () => {
        toast.success("Device deleted");
        await router.invalidate();
        popModal("DeleteDeviceConfirm");
      },
      onError: (error) => {
        toast.error("Failed to delete device");
      },
    }
  );
};
```

**✨ Result:** Best of both worlds - instant feedback + clear confirmation

---

### Example 2: Multiple Query Keys

If deleting a device should also clear related queries:

```typescript
const optimistic = createOptimisticDeleteHandlers([
  ['devices'],                    // All device lists
  ['device-detail', deviceId],    // Specific device detail
  ['device-scan-history', deviceId], // Scan history
]);
```

---

## Codebase Analysis

### Current Mutations

#### ✅ Using Optimistic Updates

1. **`useDeleteDeviceMutation`** - `src/queries/device-queries.ts:176`
   - Uses `createOptimisticDeleteHandlers`
   - Updates `['devices']` cache
   - ✅ Good candidate - instant delete feedback

#### ❌ NOT Using Optimistic Updates (Correctly)

1. **`useStartDiscoveryMutation`** - `src/queries/discovery-queries.ts`
   - Starts long-running discovery workflow
   - ❌ Correctly NOT optimistic - takes minutes to complete
   - User expects to wait and see progress

2. **`useCreateDevicesFromDiscoveryMutation`** - `src/queries/device-queries.ts`
   - Creates multiple devices from discovery results
   - ❌ Correctly NOT optimistic - batch operation with potential validation errors
   - Current: Waits for confirmation before closing modal

3. **`useUpdateDeviceMutation`** - `src/queries/device-queries.ts:193`
   - Updates device fields
   - ⚠️ **Potential candidate** for optimistic updates
   - **Recommendation:** Add optimistic update for simple field changes

4. **`useVerifyDeviceMutation`** - `src/queries/device-queries.ts:214`
   - Changes device verification status
   - ⚠️ **Potential candidate** for optimistic updates
   - **Recommendation:** Add optimistic toggle for verification status

5. **`useToggleDeviceVerificationMutation`** - `src/queries/device-queries.ts:229`
   - Toggles verification + monitoring
   - ⚠️ **Potential candidate** for optimistic updates
   - **Recommendation:** Add optimistic toggle

### AddDiscovery.tsx Analysis

**File:** `src/modals/AddDiscovery.tsx`

**Mutations:**
1. `startDiscoveryMutation` (line 46)
   - **Action:** Starts discovery workflow
   - **Duration:** Minutes
   - **Decision:** ❌ NOT a good candidate for optimistic updates
   - **Reason:** Long-running process, user expects to wait

2. `addDevicesMutation` (line 43)
   - **Action:** Creates devices from discovery results
   - **Usage:** `handleAddDevices()` at line 163
   - **Current behavior:** Waits for server, then closes modal
   - **Decision:** ⚠️ **Maybe** - depends on validation complexity
   - **Analysis:**
     ```typescript
     addDevicesMutation.mutate(
       { targets: targetsData },
       {
         onSuccess: async (response) => {
           toast.success("Devices created successfully");
           await router.invalidate(); // ← Could be optimistic
           popModal("AddDiscovery");
         },
       }
     );
     ```
   - **Recommendation:** Keep current behavior
     - Batch operation (multiple devices)
     - Potential for partial failures
     - User just completed discovery - not urgent to close modal
     - Current UX is clear: "Adding to Inventory..." → Success toast

**Verdict for AddDiscovery.tsx:**
✅ **Current implementation is correct** - No optimistic updates needed here.

---

## Future Improvements

### Patterns to Implement

#### 1. Optimistic Update Helper

For updating existing items:

```typescript
// Future: src/lib/optimistic-updates.ts
export const createOptimisticUpdateHandlers = <T extends { id: string }>(
  queryKeys: unknown[][]
) => ({
  onMutate: async (variables: { id: string; updates: Partial<T> }, queryClient: QueryClient) => {
    await queryClient.cancelQueries({ queryKey: queryKeys[0] });
    const snapshots = queryKeys.map(key => ({
      key,
      data: queryClient.getQueryData(key),
    }));

    queryKeys.forEach(key => {
      queryClient.setQueriesData({ queryKey: key }, (old: any) => {
        if (!old) return old;
        const items = Array.isArray(old) ? old : old.items;
        const updated = items?.map((item: T) =>
          item.id === variables.id ? { ...item, ...variables.updates } : item
        );
        return Array.isArray(old) ? updated : { ...old, items: updated };
      });
    });

    return { snapshots };
  },
  // ... onError, onSettled
});
```

**Usage:**
```typescript
const optimistic = createOptimisticUpdateHandlers([['devices']]);

export const useUpdateDeviceMutation = (deviceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDeviceData,
    onMutate: (vars) => optimistic.onMutate(vars, queryClient),
    onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};
```

#### 2. Optimistic Toggle Helper

For boolean field toggles:

```typescript
// Future implementation
export const createOptimisticToggleHandlers = (/* ... */) => {
  // Toggle boolean field optimistically
  // Example: verified: true → false
};
```

---

## Best Practices

### 1. Always Provide Rollback

```typescript
onError: (err, variables, context) => {
  // ✅ Rollback
  if (context?.previousData) {
    queryClient.setQueryData(queryKey, context.previousData);
  }

  // ✅ Show error to user
  toast.error("Operation failed", {
    description: err.message
  });
}
```

### 2. Cancel In-Flight Queries

```typescript
onMutate: async (variables) => {
  // ✅ Prevent race conditions
  await queryClient.cancelQueries({ queryKey: ['devices'] });

  // Then do optimistic update
}
```

### 3. Always Refetch After Completion

```typescript
onSettled: () => {
  // ✅ Ensure consistency with server
  queryClient.invalidateQueries({ queryKey: ['devices'] });
}
```

### 4. Provide Clear Loading States

Even with optimistic updates, show loading:

```typescript
<Button disabled={mutation.isPending}>
  {mutation.isPending ? "Deleting..." : "Delete"}
</Button>
```

User sees:
1. Item disappears (optimistic)
2. Button shows "Deleting..." (confirmation)
3. Modal closes OR error appears

---

## Testing Optimistic Updates

### Manual Testing Checklist

Test these scenarios for each optimistic mutation:

- [ ] **Success case:** Item updates immediately, stays updated
- [ ] **Error case:** Item updates, then rolls back, error toast shows
- [ ] **Network delay:** Loading state shows, then resolves
- [ ] **Multiple rapid clicks:** Only one request sent
- [ ] **Navigation during mutation:** State doesn't leak
- [ ] **Concurrent mutations:** Both handled correctly

### Test Error Rollback

Simulate server error:

```typescript
// In dev, mock error response
mutationFn: async (data) => {
  if (data.deviceId === 'test-error') {
    throw new Error('Simulated error');
  }
  return deleteDevice({ data });
}
```

Expected behavior:
1. Device disappears
2. Error thrown
3. Device **reappears**
4. Error toast shows

---

## Related Documentation

- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [TanStack Query Pattern Analysis](./tanstack-query-pattern-analysis.md)
- [Avoid useEffect Guide](./best-practices/tanstack-start/avoid-useEffect.md)

---

## Summary

### Current State
- ✅ Optimistic delete implemented for devices
- ✅ Helper function available for reuse
- ✅ Proper rollback and error handling

### Recommended Next Steps
1. ✅ **Keep current**: Discovery operations (long-running)
2. ✅ **Keep current**: Batch device creation (complex validation)
3. ⚠️ **Consider adding**: Device field updates (simple fields)
4. ⚠️ **Consider adding**: Verification toggles (binary state)
5. 📝 **Future**: Create update/toggle helpers as needed

### Key Takeaway

**Not everything needs optimistic updates!**

Use them for:
- ✅ Delete operations
- ✅ Simple toggles
- ✅ Single field updates

Skip them for:
- ❌ Long-running workflows
- ❌ Complex validation
- ❌ Batch operations
- ❌ Critical actions
