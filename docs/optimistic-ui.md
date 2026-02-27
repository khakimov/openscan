# Optimistic UI Patterns

Simplified guide for implementing optimistic updates with TanStack Query. Based on [TanStack Query best practices](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) and patterns from [Trellaux example](https://github.com/TanStack/router/tree/main/examples/react/start-trellaux).

## Philosophy

**Most mutations don't need optimistic updates.** Simple invalidation on success is sufficient for:
- Creating items (user expects to wait)
- Deleting items (optimistic delete often causes confusing re-renders)
- Complex operations (verification, imports)

**Use optimistic updates only when:**
- The user expects instant feedback (toggles, status changes)
- The operation is high-frequency (drag-and-drop, real-time collaboration)
- The UI feels sluggish without it

## The Three Patterns

### Pattern 1: Simple Invalidation (Default)

For 80% of mutations. Just invalidate the cache on success.

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

export function useUpdateDashboardMutation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation({
    ...trpc.dashboard.update.mutationOptions(),
    onSuccess: () => {
      // Invalidate all dashboard list queries
      queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
    },
  });
}
```

**When to use:**
- Creating items
- Updating forms
- Deleting items (just invalidate, don't optimistically remove)
- Operations where user expects to wait

---

### Pattern 2: Inline Optimistic Update (When Needed)

For status toggles and high-frequency operations. Inline the logic—no abstraction needed.

```tsx
export function useToggleVerificationMutation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation({
    ...trpc.device.toggleVerification.mutationOptions(),
    
    // Optimistically update the cache
    onMutate: async (variables) => {
      const queryKey = trpc.device.list.queryKey();
      
      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(queryKey);
      
      // Optimistically update
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return old.map((device) =>
          device.id === variables.deviceId
            ? { ...device, verificationStatus: variables.verify ? 'VERIFIED' : 'CANDIDATE' }
            : device
        );
      });
      
      // Return context for rollback
      return { previousData };
    },
    
    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(trpc.device.list.queryKey(), context.previousData);
      }
    },
    
    // Optional: refetch to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries(trpc.device.list.pathFilter());
    },
  });
}
```

**When to use:**
- Toggle switches (verification, enable/disable)
- Status changes that affect tab visibility
- High-frequency operations (drag-and-drop, likes)

**Keep it simple:**
- No generic helpers—inline the 10-15 lines
- Only update the specific query keys that need it
- Don't over-optimize—if it needs more than 20 lines, consider Pattern 1

---

### Pattern 3: Optimistic Creation (Special Cases)

For creating items where immediate feedback matters (chat messages, comments).

```tsx
export function useAddCommentMutation(postId: string) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation({
    ...trpc.comment.create.mutationOptions(),
    
    onMutate: async (variables) => {
      const queryKey = trpc.comment.list.queryKey({ postId });
      
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      
      // Add temporary comment
      const tempComment = {
        id: `temp-${Date.now()}`,
        content: variables.content,
        createdAt: new Date().toISOString(),
        isPending: true, // Flag for styling
      };
      
      queryClient.setQueryData(queryKey, (old) => {
        return old ? [...old, tempComment] : [tempComment];
      });
      
      return { previousData };
    },
    
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(trpc.comment.list.queryKey({ postId }), context.previousData);
      }
    },
    
    // No onSettled needed—server response replaces the temp item
  });
}
```

**When to use:**
- Chat messages
- Comments
- Real-time collaborative features

---

## Decision Tree

```
Is this a status toggle or high-frequency operation?
├── YES → Use Pattern 2: Inline Optimistic Update
│         (keep it simple, 10-15 lines inline)
│
└── NO  → Does user expect immediate visual feedback?
          ├── YES (chat, comments) → Use Pattern 3: Optimistic Creation
          │
          └── NO (forms, deletes, complex ops) → Use Pattern 1: Simple Invalidation
```

## Anti-Patterns

### ❌ Don't Create Generic Helper Factories

```tsx
// BAD: Over-engineered abstraction
export const createOptimisticDeleteHandlers = (queryKeys) => ({
  onMutate: async (vars, queryClient) => { /* 50 lines */ },
  onError: (err, vars, ctx, queryClient) => { /* 30 lines */ },
  onSettled: (queryClient) => { /* 20 lines */ },
});

// Usage requires understanding the abstraction
const optimistic = createOptimisticDeleteHandlers([['devices']]);
return useMutation({
  onMutate: (vars) => optimistic.onMutate(vars, queryClient),
  onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
  onSettled: () => optimistic.onSettled(queryClient),
});
```

**Why it's bad:**
- 236 lines of abstraction for a 10-line use case
- Harder to understand than inline code
- Couples unrelated mutations to the same abstraction
- Changes to the helper affect all consumers

### ❌ Don't Optimistically Delete

```tsx
// BAD: Optimistic delete causes visual jank
onMutate: (id) => {
  queryClient.setQueryData(['devices'], (old) =>
    old.filter((d) => d.id !== id)
  );
}
```

**Why it's bad:**
- Item disappears → server confirms → list refetches → item might briefly reappear
- User doesn't need instant feedback for destructive actions
- Just invalidate on success instead

### ❌ Don't Over-Engineer Rollbacks

```tsx
// BAD: Trying to handle every edge case
onError: (err, vars, context) => {
  context?.snapshots?.forEach(({ key, data, timestamp, queryHash }) => {
    if (shouldRestore(key, timestamp)) {
      queryClient.setQueryData(key, data, { updatedAt: timestamp });
    }
  });
}
```

**Why it's bad:**
- Simple rollback is enough: `queryClient.setQueryData(key, context.previousData)`
- Edge cases rarely happen in practice
- If optimistic updates are failing often, fix the API, not the rollback

---

## File Structure

```
src/
├── queries/
│   ├── device-queries.ts      # Keep mutations colocated with queries
│   ├── schedule-queries.ts
│   └── ...
```

No separate `optimistic-updates.ts` file. The logic belongs with the mutation that uses it.

## Examples from Our Codebase

### Simple Invalidation (Recommended Default)

```tsx
// src/queries/device-queries.ts
export const useDeleteDeviceMutation = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.device.remove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.device.list.pathFilter());
    },
  });
};
```

### Inline Optimistic Update (For Toggles)

```tsx
// src/queries/device-queries.ts
export const useToggleDeviceVerificationMutation = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.device.toggleVerification.mutationOptions(),
    
    onMutate: async (variables) => {
      const filter = { input: {}, type: 'query' };
      const queryKey: QueryKey = [['device', 'list'], filter];
      
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      
      // Update all matching queries
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d: Device) =>
            d.id === variables.deviceId
              ? { ...d, verificationStatus: variables.verify ? 'VERIFIED' : 'CANDIDATE' }
              : d
          ),
        };
      });
      
      return { previous };
    },
    
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};
```

## Migration Guide

### From Generic Helpers to Inline

**Before:**
```tsx
// src/lib/optimistic-updates.ts (236 lines)
export const createOptimisticDeleteHandlers = /* ... */;

// src/queries/device-queries.ts
const optimistic = createOptimisticDeleteHandlers([['devices']]);
return useMutation({
  onMutate: (vars) => optimistic.onMutate(vars, queryClient),
  onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
  onSettled: () => optimistic.onSettled(queryClient),
});
```

**After:**
```tsx
// src/queries/device-queries.ts (10 lines)
return useMutation({
  ...trpc.device.remove.mutationOptions(),
  onSuccess: () => {
    queryClient.invalidateQueries(trpc.device.list.pathFilter());
  },
});
```

## Summary

| Pattern | Use For | Code Size |
|---------|---------|-----------|
| **Pattern 1: Simple Invalidation** | 80% of mutations (create, update, delete) | 3 lines |
| **Pattern 2: Inline Optimistic** | Status toggles, high-frequency ops | 10-15 lines inline |
| **Pattern 3: Optimistic Creation** | Chat, comments, real-time features | 15-20 lines inline |

**Golden rule:** If you can't understand the optimistic update logic in 5 seconds, don't use it. Simple invalidation is always correct.

## References

- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [Trellaux Example](https://github.com/TanStack/router/tree/main/examples/react/start-trellaux/src/queries.ts) - Simple inline patterns
- [OpenPanel](https://github.com/Openpanel-dev/openpanel) - Production app using simple invalidation
