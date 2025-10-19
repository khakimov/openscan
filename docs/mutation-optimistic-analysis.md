# Mutation Optimistic UI Analysis

Complete analysis of all mutations in the codebase for optimistic update candidates.

**Generated:** 2025-10-19
**Total Mutations:** 11

---

## Summary

| Status | Count | Mutations |
|--------|-------|-----------|
| ✅ Implemented | 2 | `useDeleteDeviceMutation`, `useCreateDevicesFromDiscoveryMutation` |
| ⚠️ Good Candidates | 3 | `useUpdateDeviceMutation`, `useVerifyDeviceMutation`, `useToggleDeviceVerificationMutation` |
| ❌ Not Recommended | 6 | All others |

---

## Detailed Analysis

### ✅ Currently Implemented (2)

#### 1. `useDeleteDeviceMutation`

**File:** `src/queries/device-queries.ts:176`

**Type:** Delete operation

**Implementation:**
```typescript
const optimistic = createOptimisticDeleteHandlers([['devices']]);

return useMutation({
  mutationKey: ['devices', 'delete'],
  mutationFn: (data: { deviceId: string }) => deleteDevice({ data }),
  onMutate: (variables) => optimistic.onMutate(variables, queryClient),
  onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
  onSettled: () => optimistic.onSettled(queryClient),
});
```

**Status:** ✅ **Optimistic updates implemented**

**Benefits:**
- Device disappears instantly from list
- Rollback on error
- User sees "Deleting..." confirmation in modal

---

#### 2. `useCreateDevicesFromDiscoveryMutation`

**File:** `src/queries/device-queries.ts:263`

**Type:** Create operation (batch)

**Implementation:**
```typescript
const optimistic = createOptimisticCreateHandlers([['devices']]);

return useMutation({
  mutationKey: ['devices', 'create-from-discovery'],
  mutationFn: (data) => createDevicesFromDiscovery({ data }),
  onMutate: (variables) => optimistic.onMutate(variables, queryClient),
  onSuccess: (data, variables, context) => optimistic.onSuccess(data, variables, context, queryClient),
  onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
});
```

**Status:** ✅ **Optimistic updates implemented**

**Rationale for Implementation:**
- ✅ Mutation returns full device objects (no need to refetch!)
- ✅ Can create valid placeholder objects from mutation variables
- ✅ User just completed discovery - expects to see devices immediately
- ✅ Server success rate is high (validation already done during discovery)
- ✅ Rollback is acceptable (devices disappear if error)

**Benefits:**
- Devices appear **instantly** in inventory (0ms vs 500-700ms)
- No waiting for server + refetch
- Modal closes immediately
- Placeholders replaced with real server data in background

**User Experience:**
- **Before:** Click "Add 3 Targets" → Wait 500ms (server) → Wait 200ms (refetch) → Devices appear (700ms total)
- **After:** Click "Add 3 Targets" → Devices appear **INSTANTLY** → Modal closes → (Background: server confirms, replaces with real data)

**Used in:**
- `AddDiscovery.tsx` - Creates devices from discovery results
- `3-discovery.tsx` - Onboarding flow

---

### ⚠️ Good Candidates for Optimistic UI (3)

#### 3. `useUpdateDeviceMutation`

**File:** `src/queries/device-queries.ts:193`

**Type:** Update operation (device fields)

**Current Implementation:**
```typescript
return useMutation({
  mutationKey: ['devices', 'update', deviceId],
  mutationFn: (data: { deviceId, updates }) => updateDeviceData({ data }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['devices'] });
    queryClient.invalidateQueries({ queryKey: deviceQueries.detail(deviceId).queryKey });
    queryClient.invalidateQueries({ queryKey: ['deviceTagSuggestions'] });
  },
});
```

**Recommendation:** ⚠️ **Add optimistic update**

**Rationale:**
- ✅ Simple field updates (name, ip, tags, notes)
- ✅ User expects instant feedback
- ✅ Low risk of failure
- ✅ Easy rollback

**Implementation Plan:**
```typescript
// Create new helper in optimistic-updates.ts
const optimistic = createOptimisticUpdateHandlers([
  ['devices'],
  ['device-detail', deviceId],
]);

return useMutation({
  mutationKey: ['devices', 'update', deviceId],
  mutationFn: (data) => updateDeviceData({ data }),
  onMutate: (vars) => optimistic.onMutate(vars, queryClient),
  onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
  onSettled: () => optimistic.onSettled(queryClient),
});
```

**User Experience Impact:**
- **Before:** Edit name → Click save → Wait → Modal closes
- **After:** Edit name → Click save → **Name updates instantly** → Modal closes (or rollback on error)

---

#### 4. `useVerifyDeviceMutation`

**File:** `src/queries/device-queries.ts:220`

**Type:** Status change (verification)

**Current Implementation:**
```typescript
return useMutation({
  mutationKey: ['devices', 'verify'],
  mutationFn: (data: { deviceId, status, note }) => verifyDevice({ data }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['devices'] });
  },
});
```

**Recommendation:** ⚠️ **Add optimistic update**

**Rationale:**
- ✅ Simple status toggle
- ✅ User expects instant feedback
- ✅ Low risk
- ✅ Easy rollback

**Implementation Plan:**
```typescript
// Use future createOptimisticToggleHandlers
const optimistic = createOptimisticToggleHandlers([['devices']]);

return useMutation({
  mutationFn: verifyDevice,
  onMutate: async (variables) => {
    await queryClient.cancelQueries({ queryKey: ['devices'] });
    const previous = queryClient.getQueryData(['devices']);

    queryClient.setQueriesData({ queryKey: ['devices'] }, (old: any) => {
      if (!old) return old;
      const items = old.items || old;
      const updated = items.map((d: any) =>
        d.id === variables.deviceId
          ? { ...d, verificationStatus: variables.status }
          : d
      );
      return old.items ? { ...old, items: updated } : updated;
    });

    return { previous };
  },
  onError: (_, __, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['devices'], context.previous);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['devices'] });
  },
});
```

**User Experience Impact:**
- **Before:** Click "Verify" → Wait → Badge changes to "Verified"
- **After:** Click "Verify" → **Badge changes instantly** → Stays verified (or rollback on error)

---

#### 5. `useToggleDeviceVerificationMutation`

**File:** `src/queries/device-queries.ts:235`

**Type:** Toggle operation (verification + monitoring)

**Current Implementation:**
```typescript
return useMutation({
  mutationKey: ['devices', 'toggle-verification'],
  mutationFn: (data: { deviceId, verify, interval }) => toggleDeviceVerification({ data }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['devices'] });
  },
});
```

**Recommendation:** ⚠️ **Add optimistic update**

**Rationale:**
- ✅ Toggle operation (binary state)
- ✅ User expects instant feedback (button clicked)
- ✅ Low risk
- ✅ Easy rollback

**Implementation Plan:**
Similar to `useVerifyDeviceMutation` - toggle `verificationStatus` field optimistically.

**User Experience Impact:**
- **Before:** Click "Verify & Monitor" → Wait → Status changes
- **After:** Click "Verify & Monitor" → **Status changes instantly** → (rollback on error)

---

### ❌ Not Recommended for Optimistic UI (6)

#### 6. `useStartDiscoveryMutation`

**File:** `src/queries/discovery-queries.ts:47`

**Type:** Long-running workflow

**Why NOT optimistic:**
- ❌ Long-running process (minutes)
- ❌ User expects to wait
- ❌ No immediate UI state to update
- ❌ Only initiates workflow, doesn't change existing data

**Current behavior is correct:** Show loading state, poll for results

---

#### 7. `useStartDeviceScanMutation`

**File:** `src/queries/device-queries.ts:244`

**Type:** Initiate scan workflow

**Why NOT optimistic:**
- ❌ Long-running process (seconds to minutes)
- ❌ User expects to see "Scanning..." state
- ❌ Only initiates workflow
- ❌ UI already shows loading state (animated border, "Scanning..." button)

**Current behavior is correct:** Show loading/scanning state during execution

**Used in:**
- `device-card.tsx` - Scan device button

---

#### 8. `useCompleteOnboarding Mutation`

**File:** `src/queries/organization-queries.ts:16`

**Type:** One-time onboarding completion

**Why NOT optimistic:**
- ❌ Navigation happens immediately after (doesn't matter)
- ❌ User is navigating away from page
- ❌ Low frequency operation (once per user)

**Current behavior is correct:** Mark complete, then navigate

**Used in:**
- `3-discovery.tsx` - Skip discovery button

---

#### 9. `useCreateOrganizationMutation`

**File:** `src/queries/organization-queries.ts:26`

**Type:** Create organization

**Why NOT optimistic:**
- ❌ Complex validation (name uniqueness, etc.)
- ❌ Happens during onboarding (user expects process)
- ❌ Navigation depends on success
- ❌ Higher chance of failure (validation errors)

**Current behavior is correct:** Wait for server confirmation

---

#### 10. `useCreateProjectMutation`

**File:** `src/queries/organization-queries.ts:37`

**Type:** Create project

**Why NOT optimistic:**
- ❌ Server-side validation
- ❌ Happens during onboarding
- ❌ Navigation depends on success

**Current behavior is correct:** Wait for confirmation

---

#### 11. `useUpdateOrganizationMutation`

**File:** `src/queries/organization-queries.ts:48`

**Type:** Update organization

**Why NOT optimistic:**
- ❌ Low frequency (settings page)
- ❌ User expects to see "Saving..." confirmation
- ❌ Not as critical for instant feedback

**Current behavior is acceptable:** Could add optimistic, but not high priority

**Priority:** Low - settings page, infrequent use

---

## Recommendations by Priority

### High Priority (Implement Soon)

1. **`useUpdateDeviceMutation`** - Device edit form
   - **Impact:** High - frequently used
   - **Effort:** Low - simple field updates
   - **Benefit:** Much better UX for editing devices

2. **`useToggleDeviceVerificationMutation`** - Verify & Monitor button
   - **Impact:** Medium - used in device cards
   - **Effort:** Low - simple toggle
   - **Benefit:** Instant feedback for common action

### Medium Priority (Consider Later)

3. **`useVerifyDeviceMutation`** - Manual verification
   - **Impact:** Low - less frequently used than toggle
   - **Effort:** Low
   - **Benefit:** Consistent UX with other operations

### Low Priority (Keep Current)

4. **`useUpdateOrganizationMutation`** - Settings
   - **Impact:** Very low - infrequent
   - **Effort:** Low
   - **Benefit:** Minimal - settings page is acceptable as-is

### No Action Needed

All other mutations should **NOT** use optimistic updates:
- `useStartDiscoveryMutation` ❌
- `useStartDeviceScanMutation` ❌
- `useCompleteOnboardingMutation` ❌
- `useCreateOrganizationMutation` ❌
- `useCreateProjectMutation` ❌
- `useUpdateOrganizationMutation` ❌

---

## Implementation Roadmap

### Phase 1: Create Helper Functions

Add to `src/lib/optimistic-updates.ts`:

```typescript
export const createOptimisticUpdateHandlers = <T extends { id: string }>(
  queryKeys: unknown[][]
) => {
  // Implementation for update operations
  // See optimistic-ui-guide.md for pattern
};

export const createOptimisticToggleHandlers = <T extends { id: string }>(
  queryKeys: unknown[][],
  fieldName: string
) => {
  // Implementation for toggle operations
  // Similar to update but for boolean fields
};
```

### Phase 2: Implement High Priority Mutations

1. Update `useUpdateDeviceMutation`
2. Update `useToggleDeviceVerificationMutation`
3. Test thoroughly (success + error cases)

### Phase 3: Medium Priority (Optional)

1. Update `useVerifyDeviceMutation`
2. Consider `useUpdateOrganizationMutation`

---

## Testing Checklist

For each mutation with optimistic updates:

- [ ] **Success path:** UI updates instantly, stays updated
- [ ] **Error path:** UI updates, then **rolls back**, error toast shows
- [ ] **Network delay:** Loading state shows during server processing
- [ ] **Concurrent mutations:** Multiple clicks handled correctly
- [ ] **Navigation during mutation:** No state leaks
- [ ] **Cache consistency:** Refetch ensures server state matches

---

## Related Documentation

- [Optimistic UI Guide](./optimistic-ui-guide.md) - Complete guide and best practices
- [TanStack Query Pattern Analysis](./tanstack-query-pattern-analysis.md) - Query patterns
- [Optimistic Updates Helper](../apps/user-application/src/lib/optimistic-updates.ts) - Implementation

---

## Summary

**Total mutations:** 11

**Status:**
- ✅ Optimistic updates implemented: **2** (delete device, create devices from discovery)
- ⚠️ Recommended to add: **3** (update device, verify device, toggle verification)
- ❌ Should NOT be optimistic: **6** (workflows, onboarding, organization management)

**Next steps:**
1. Create update/toggle helpers in `optimistic-updates.ts`
2. Implement optimistic updates for `useUpdateDeviceMutation` (highest impact)
3. Add optimistic updates for verification toggles
4. Test thoroughly
5. Document patterns for future mutations
