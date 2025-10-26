# Security Audit & Code Quality Review - January 2025

**Date:** 2025-01-25 (Audit) | 2025-01-26 (Fixes Completed)
**Scope:** Project-scoped routing implementation & data access security
**Reviewer:** Post-refactor security audit
**Status:** ✅ ALL CRITICAL ISSUES FIXED

---

## 🎉 Resolution Summary

**All 4 critical security vulnerabilities have been fixed and tested.**

Following the migration to project-scoped routing (`/:org/:project/*`), a comprehensive security audit identified authorization gaps. All vulnerabilities have now been resolved with comprehensive test coverage.

**Fixes Completed:**
- ✅ VULN-001: Project route validation - FIXED (commit: e15c895)
- ✅ VULN-002: Organization membership check - FIXED (commit: ba3d6a9)
- ✅ VULN-003: Device creation projectId validation - FIXED (commit: 30ee6dd)
- ✅ VULN-004: Scan schedule deletion validation - FIXED (commit: 2485271)

**Test Coverage:**
- ✅ 18/18 security tests passing
- ✅ 11 server function security tests
- ✅ 7 route security tests

**Branch:** `feature/security-fixes`

---

## Executive Summary (Original Audit - 2025-01-25)

Following the migration to project-scoped routing (`/:org/:project/*`), a comprehensive security audit was conducted to identify:
1. Authorization gaps where IDs (organizationId, projectId, deviceId) are not validated
2. Unused code from the pre-migration implementation
3. Architectural inconsistencies that could lead to security issues

**Critical Findings (ALL NOW FIXED):**
- ✅ 4 critical security vulnerabilities allowing cross-organization access - FIXED
- ⏭️ 2 high-priority architectural violations - Deferred
- ⏭️ 3 medium-priority code quality issues - Deferred

**Original Impact:** Without fixes, authenticated users could potentially access or modify resources belonging to other organizations.
**Current Status:** All critical vulnerabilities resolved with defense-in-depth patterns.

---

## 🔴 Critical Security Vulnerabilities (ALL FIXED)

### VULN-001: Unvalidated Project Access in Route Loader ✅ FIXED

**Severity:** 🔴 CRITICAL
**Status:** ✅ FIXED (commit: e15c895)
**Impact:** Any authenticated user can access any project by modifying the URL
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

#### Location
```
File: apps/user-application/src/routes/_app.$organizationId.$projectId.tsx
Lines: 36-39
Function: Route loader
```

#### Vulnerable Code
```typescript
loader: async ({ params }) => {
  // TODO: Validate project exists and belongs to organization
  // TODO: Validate user has access to project
  // For now, just pass through params

  logger.info("Project layout loaded", {
    organizationId: params.organizationId,
    projectId: params.projectId,
  });
```

#### Issue Description
The route layout accepts `organizationId` and `projectId` from URL parameters without any validation that:
1. The project exists
2. The project belongs to the specified organization
3. The current user has access to the project

This is the **root layout for all project-scoped routes**, meaning if this check is bypassed, all child routes (assets, scans, devices) are also compromised.

#### Attack Scenario
```
1. User Alice is authenticated and belongs to org "alice-corp"
2. Alice discovers Bob's project ID "proj_bob_123"
3. Alice navigates to: /alice-corp/proj_bob_123/assets
4. System loads without validation
5. Alice sees Bob's devices/scans if they exist in that project
```

#### Recommended Fix

**Step 1:** Create validation function in `packages/data-ops/src/queries/projects.ts`:

```typescript
/**
 * Validate project exists and belongs to organization
 * Returns project if valid, null if invalid
 */
export async function validateProjectAccess(
  projectId: string,
  organizationId: string
): Promise<Project | null> {
  const db = getDb();

  const [project] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId)
    ))
    .limit(1);

  return project || null;
}
```

**Step 2:** Export from data-ops:
```typescript
// packages/data-ops/src/index.ts
export { validateProjectAccess } from './queries/projects';
```

**Step 3:** Use in route loader:
```typescript
import { validateProjectAccess } from '@repo/data-ops';

loader: async ({ params, context }) => {
  const organizationId = await getCurrentOrganizationId();

  // Validate project belongs to organization
  const project = await validateProjectAccess(
    params.projectId,
    organizationId
  );

  if (!project) {
    throw new Error('Project not found or access denied');
  }

  logger.info("Project layout loaded", {
    organizationId: params.organizationId,
    projectId: params.projectId,
    projectName: project.name,
  });

  return { project };
}
```

**Priority:** ✅ FIXED

**Implementation Details:**
- Created `validateProjectAccess()` server function in `src/server/projects.ts`
- Updated route loader in `_app.$organizationId.$projectId.tsx`
- Added multi-layer validation (user→org, project→org)
- Throws `notFound()` on validation failure (prevents information disclosure)
- Test coverage: 7/7 route security tests passing

---

### VULN-002: Organization Data Exposed Without Membership Check ✅ FIXED

**Severity:** 🔴 CRITICAL
**Status:** ✅ FIXED (commit: ba3d6a9)
**Impact:** Any authenticated user can query metadata for any organization
**CWE:** CWE-285 (Improper Authorization)

#### Location
```
File: apps/user-application/src/server/organization.ts
Lines: 611-675
Function: getOrganizationById()
```

#### Vulnerable Code
```typescript
export const getOrganizationById = createServerFn({ method: "POST" })
  .inputValidator(GetOrganizationByIdSchema.parse)
  .handler(async ({ data }) => {
    try {
      const db = getDb();

      // Get organization by slug or ID
      const whereClause = data.slug
        ? eq(organization.slug, data.slug)
        : eq(organization.id, data.id);

      const [result] = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          metadata: organization.metadata,
          logo: organization.logo,
          createdAt: organization.createdAt,
        })
        .from(organization)
        .where(whereClause)
        .limit(1);

      if (!result) {
        return { success: false, data: null };
      }

      // TODO: Add membership check once we have member/role tables
      // For now, assume user has access if organization exists

      return { success: true, data: result };
    } catch (error) {
      ...
    }
  });
```

#### Issue Description
The function validates that an organization exists but **does not verify the current user is a member**. This allows any authenticated user to:
- Query organization names, slugs, metadata
- Enumerate valid organization IDs
- Gather intelligence on other tenants

#### Attack Scenario
```
1. User Alice wants to discover competitor organizations
2. Alice writes a script that calls getOrganizationById with sequential IDs
3. System returns data for ALL organizations (not just Alice's)
4. Alice builds a database of competitor organizations
```

#### Recommended Fix

**Option A: Database-Level Membership Check (Preferred)**

If you have a membership/roles table:

```typescript
export const getOrganizationById = createServerFn({ method: "POST" })
  .inputValidator(GetOrganizationByIdSchema.parse)
  .handler(async ({ data }) => {
    try {
      const db = getDb();
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        return { success: false, error: "Not authenticated", data: null };
      }

      // Get organization by slug or ID
      const whereClause = data.slug
        ? eq(organization.slug, data.slug)
        : eq(organization.id, data.id);

      const [result] = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          metadata: organization.metadata,
          logo: organization.logo,
          createdAt: organization.createdAt,
        })
        .from(organization)
        .innerJoin(
          organizationMembers,
          eq(organization.id, organizationMembers.organizationId)
        )
        .where(and(
          whereClause,
          eq(organizationMembers.userId, currentUser.id)
        ))
        .limit(1);

      if (!result) {
        return {
          success: false,
          error: "Organization not found or access denied",
          data: null
        };
      }

      return { success: true, data: result };
    } catch (error) {
      ...
    }
  });
```

**Option B: Session-Based Check (Temporary)**

If membership table doesn't exist yet:

```typescript
const currentOrganizationId = await getCurrentOrganizationId();
const requestedOrgId = data.id;

// Only allow access to user's current organization
if (requestedOrgId !== currentOrganizationId) {
  return {
    success: false,
    error: "Access denied",
    data: null,
  };
}
```

**Priority:** ✅ FIXED

**Implementation Details:**
- Added membership validation to `getOrganizationById()` in `src/server/organization.ts`
- Queries `member` table to verify user belongs to organization
- Logs unauthorized access attempts
- Prevents organization enumeration attacks
- Test coverage: Included in 11 server function tests

---

### VULN-003: Device Creation with Unvalidated Project ID ✅ FIXED

**Severity:** 🔴 CRITICAL
**Status:** ✅ FIXED (commit: 30ee6dd)
**Impact:** Users can create devices in other organizations' projects
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

#### Location
```
File: apps/user-application/src/server/devices.ts
Lines: 607-634
Function: createDevicesFromDiscovery()
```

#### Vulnerable Code
```typescript
export const createDevicesFromDiscovery = createServerFn({
  method: "POST",
})
  .inputValidator(CreateDevicesFromDiscoverySchema.parse)
  .handler(async ({ data }) => {
    try {
      logger.info('Starting createDevicesFromDiscovery handler', {
        targetCount: data.targets.length,
        projectId: data.projectId,  // ❌ ACCEPTED FROM CLIENT WITHOUT VALIDATION
        options: data.options,
        hasOrganizationId: !!data.organizationId
      });

      const organizationId = data.organizationId || await getCurrentOrganizationId();

      const createdDevices = await createMultipleDevicesFromDiscovery(
        data.targets,
        organizationId,
        {
          ...data.options,
          projectId: data.projectId,  // ❌ PASSED TO DATABASE WITHOUT CHECK
        }
      );
```

#### Issue Description
The server function accepts `projectId` from the client payload and passes it directly to the database layer without verifying:
1. The projectId exists
2. The projectId belongs to the user's organization
3. The user has write access to that project

This creates a **write vulnerability** where malicious users can inject devices into other organizations' projects.

#### Attack Scenario
```
1. User Alice discovers Bob's project ID "proj_bob_456"
2. Alice calls createDevicesFromDiscovery with:
   {
     targets: [{ ip: "10.0.0.1", ... }],
     projectId: "proj_bob_456"  // Bob's project!
   }
3. Device is created in Bob's project
4. Bob sees a rogue device in his asset list
5. Alice has polluted Bob's data
```

#### Recommended Fix

**Step 1:** Use the validation function from VULN-001:

```typescript
import { validateProjectAccess } from '@repo/data-ops';

export const createDevicesFromDiscovery = createServerFn({
  method: "POST",
})
  .inputValidator(CreateDevicesFromDiscoverySchema.parse)
  .handler(async ({ data }) => {
    try {
      logger.info('Starting createDevicesFromDiscovery handler', {
        targetCount: data.targets.length,
        projectId: data.projectId,
        options: data.options,
        hasOrganizationId: !!data.organizationId
      });

      const organizationId = data.organizationId || await getCurrentOrganizationId();

      // ✅ VALIDATE PROJECT BELONGS TO ORGANIZATION
      const project = await validateProjectAccess(
        data.projectId,
        organizationId
      );

      if (!project) {
        logger.error('Project validation failed', {
          projectId: data.projectId,
          organizationId,
        });
        return {
          success: false,
          error: 'Project not found or access denied',
          devices: [],
        };
      }

      const createdDevices = await createMultipleDevicesFromDiscovery(
        data.targets,
        organizationId,
        {
          ...data.options,
          projectId: data.projectId,  // ✅ NOW SAFE
        }
      );
```

**Priority:** ✅ FIXED

**Implementation Details:**
- Created `getOrganizationIdFromProject()` helper in `packages/data-ops/src/queries/projects.ts`
- Removed `organizationId` from client input (never accept from client)
- Derive `organizationId` securely from `projectId` lookup
- Validates project exists and belongs to derived organization
- Prevents cross-org device creation and data injection
- Test coverage: Included in 11 server function tests

---

### VULN-004: Unprotected Scan Schedule Deletion ✅ FIXED

**Severity:** 🔴 CRITICAL
**Status:** ✅ FIXED (commit: 2485271)
**Impact:** Users can delete scan schedules from any organization
**CWE:** CWE-284 (Improper Access Control)

#### Location
```
File: packages/data-ops/src/queries/devices.ts
Lines: 696-704
Function: deleteScanSchedule()
```

#### Vulnerable Code
```typescript
export async function deleteScanSchedule(scheduleId: string) {
  const db = getDb();

  const result = await db
    .delete(scanSchedules)
    .where(eq(scanSchedules.scheduleId, scheduleId))  // ❌ NO ORG FILTER
    .returning();

  return result.length > 0;
}
```

#### Issue Description
The function accepts only `scheduleId` and deletes the schedule without verifying:
1. The schedule belongs to the caller's organization
2. The caller has permission to delete schedules

**Usage Location:**
```
File: packages/data-ops/src/queries/devices.ts
Lines: 561-566
Function: toggleDeviceVerification()

// Delete scan schedule if exists
if (scheduleId) {
  await deleteScanSchedule(scheduleId);  // ❌ No org validation
}
```

#### Attack Scenario
```
1. User Alice discovers Bob's schedule ID "sched_bob_789"
2. Alice calls toggleDeviceVerification for her own device
3. Alice passes scheduleId: "sched_bob_789" in the update
4. deleteScanSchedule() deletes Bob's schedule
5. Bob's automated scans stop working
```

#### Recommended Fix

**Step 1:** Update function signature to require organizationId:

```typescript
export async function deleteScanSchedule(
  scheduleId: string,
  organizationId: string
): Promise<boolean> {
  const db = getDb();

  const result = await db
    .delete(scanSchedules)
    .where(and(
      eq(scanSchedules.scheduleId, scheduleId),
      eq(scanSchedules.organizationId, organizationId)  // ✅ ADD ORG FILTER
    ))
    .returning();

  return result.length > 0;
}
```

**Step 2:** Update caller to pass organizationId:

```typescript
// In toggleDeviceVerification() at line 565
if (scheduleId) {
  await deleteScanSchedule(scheduleId, organizationId);  // ✅ Pass org ID
}
```

**Priority:** ✅ FIXED

**Implementation Details:**
- Updated `deleteScanSchedule()` signature to require `organizationId` parameter
- Added `and()` condition with `organizationId` validation in WHERE clause
- Updated all callers to pass organizationId
- Prevents cross-org schedule deletion
- Test coverage: Included in 11 server function tests

---

## 🟡 High Priority Issues

### ISSUE-001: Direct Database Access Violates Architecture

**Severity:** 🟡 HIGH (Architecture Violation)
**Impact:** Harder to audit, inconsistent patterns, bypasses data-ops security layer
**Category:** Technical Debt

#### Location
```
File: apps/user-application/src/server/organization.ts
Lines: 285-316, 354-384, 429-465, 519-556, 623-663
Functions:
  - updateOrganizationMetadata() - line 285
  - updateOrganizationOnboarding() - line 354
  - updateOrganizationSubscription() - line 429
  - completeOnboarding() - line 519
  - getOrganizationById() - line 623
```

#### Issue Description
Multiple server functions use `getDb()` and raw Drizzle queries instead of delegating to data-ops layer. This violates the architecture guidance in `CLAUDE.md`:

> **Golden Rule #1: ALWAYS use data-ops queries, NEVER raw DB operations in apps**

Example from `updateOrganizationMetadata()`:
```typescript
export const updateOrganizationMetadata = createServerFn({ method: "POST" })
  .inputValidator(UpdateOrganizationMetadataSchema.parse)
  .handler(async ({ data }) => {
    try {
      const db = getDb();  // ❌ DIRECT DB ACCESS

      // Get existing metadata
      const [existing] = await db
        .select({
          metadata: organization.metadata,
        })
        .from(organization)
        .where(eq(organization.id, data.organizationId))
        .limit(1);
```

#### Why This Is a Problem
1. **Security:** Bypasses any future security middleware in data-ops
2. **Auditing:** Harder to trace who accessed what
3. **Consistency:** Other parts of codebase use data-ops correctly
4. **Maintainability:** Database logic scattered across multiple layers

#### Recommended Fix

**Step 1:** Create data-ops functions:

```typescript
// packages/data-ops/src/queries/organizations.ts

export async function updateOrganizationMetadata(
  organizationId: string,
  metadataUpdates: Record<string, any>
): Promise<Organization> {
  const db = getDb();

  // Get existing metadata
  const [existing] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!existing) {
    throw new Error('Organization not found');
  }

  // Merge metadata
  const mergedMetadata = {
    ...existing.metadata,
    ...metadataUpdates,
  };

  // Update
  const [updated] = await db
    .update(organizations)
    .set({ metadata: mergedMetadata })
    .where(eq(organizations.id, organizationId))
    .returning();

  return updated;
}

export async function updateOrganizationOnboarding(
  organizationId: string,
  onboardingData: {
    completedAt?: Date;
    currentStep?: string;
  }
): Promise<Organization> {
  const db = getDb();

  const [updated] = await db
    .update(organizations)
    .set({
      onboardingCompletedAt: onboardingData.completedAt,
      metadata: sql`jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{onboardingStep}',
        ${JSON.stringify(onboardingData.currentStep)}
      )`,
    })
    .where(eq(organizations.id, organizationId))
    .returning();

  return updated;
}

// Add similar functions for other operations
```

**Step 2:** Export from data-ops:
```typescript
// packages/data-ops/src/index.ts
export {
  updateOrganizationMetadata,
  updateOrganizationOnboarding,
  updateOrganizationSubscription,
  getOrganizationById,
} from './queries/organizations';
```

**Step 3:** Update server functions to use data-ops:

```typescript
// apps/user-application/src/server/organization.ts
import {
  updateOrganizationMetadata as updateOrgMetadata,
} from '@repo/data-ops';

export const updateOrganizationMetadata = createServerFn({ method: "POST" })
  .inputValidator(UpdateOrganizationMetadataSchema.parse)
  .handler(async ({ data }) => {
    try {
      // ✅ Use data-ops function
      const updated = await updateOrgMetadata(
        data.organizationId,
        data.metadata
      );

      return {
        success: true,
        data: updated,
      };
    } catch (error) {
      logger.error("Failed to update organization metadata", { error });
      return {
        success: false,
        error: error.message,
      };
    }
  });
```

**Priority:** 🟡 Fix after critical vulnerabilities - refactoring work

---

### ISSUE-002: Unsafe Deletion Operations Missing Organization Filters

**Severity:** 🟡 HIGH (Defense in Depth)
**Impact:** Fragile security pattern, relies on upstream validation
**Category:** Code Quality / Security Hardening

#### Location

**IP Deletion:**
```
File: packages/data-ops/src/queries/devices.ts
Lines: 492-496
Function: updateDevice()
```

**Tag Deletion:**
```
File: packages/data-ops/src/queries/devices.ts
Lines: 510-514
Function: updateDevice()
```

#### Vulnerable Code

**IP Deletion:**
```typescript
// Update IP if provided
if (ip !== undefined) {
  // Delete existing IPs
  await db
    .delete(deviceIps)
    .where(eq(deviceIps.deviceId, deviceId));  // ❌ MISSING ORG FILTER

  // Insert new IP if provided
  if (ip) {
    await db.insert(deviceIps).values({
      deviceId,
      organizationId,
      ip,
    });
  }
}
```

**Tag Deletion:**
```typescript
if (newTags !== undefined) {
  // Delete existing tags
  await db
    .delete(deviceTags)
    .where(eq(deviceTags.deviceId, deviceId));  // ❌ MISSING ORG FILTER

  // Insert new tags
  if (newTags.length > 0) {
    await db.insert(deviceTags).values(
      newTags.map((tag) => ({
        deviceId,
        organizationId,
        tag,
      }))
    );
  }
}
```

#### Issue Description
Both deletion operations lack an `organizationId` filter. While this is **currently mitigated** by the fact that the `deviceId` is validated against the organization at line 481-482:

```typescript
const [device] = await db
  .select()
  .from(devices)
  .where(and(
    eq(devices.id, deviceId),
    eq(devices.organizationId, organizationId)  // ✅ Validated here
  ));
```

This creates a **fragile security pattern** that:
1. Relies on upstream validation (defense not in depth)
2. Could be exploited if the upstream check is ever removed/bypassed
3. Makes code review harder (requires checking call chain)
4. Violates principle of least privilege

#### Attack Scenario (If Upstream Check Removed)
```
1. Developer refactors updateDevice() and removes org check
2. User Alice knows Bob's deviceId "dev_bob_123"
3. Alice calls updateDevice(deviceId: "dev_bob_123", tags: [])
4. Bob's device tags are deleted
```

#### Recommended Fix

Add organizationId filter for **defense in depth**:

```typescript
// Update IP if provided
if (ip !== undefined) {
  // Delete existing IPs with org filter
  await db
    .delete(deviceIps)
    .where(and(
      eq(deviceIps.deviceId, deviceId),
      eq(deviceIps.organizationId, organizationId)  // ✅ ADD ORG FILTER
    ));

  // Insert new IP if provided
  if (ip) {
    await db.insert(deviceIps).values({
      deviceId,
      organizationId,
      ip,
    });
  }
}

// Similar for tags:
if (newTags !== undefined) {
  // Delete existing tags with org filter
  await db
    .delete(deviceTags)
    .where(and(
      eq(deviceTags.deviceId, deviceId),
      eq(deviceTags.organizationId, organizationId)  // ✅ ADD ORG FILTER
    ));

  // Insert new tags
  if (newTags.length > 0) {
    await db.insert(deviceTags).values(
      newTags.map((tag) => ({
        deviceId,
        organizationId,
        tag,
      }))
    );
  }
}
```

**Priority:** 🟡 Fix after critical vulnerabilities - hardening measure

---

## 🔵 Medium Priority Issues

### ISSUE-003: Mock Vulnerability Data in Production Code

**Severity:** 🔵 MEDIUM (Code Quality)
**Impact:** Confusing for developers, may mislead users if exposed
**Category:** Technical Debt

#### Location
```
File: apps/user-application/src/server/devices.ts
Lines: 351-413
Function: getDeviceVulnerabilitiesData()
```

#### Issue Description
The function returns hardcoded mock CVE data:

```typescript
export const getDeviceVulnerabilitiesData = createServerFn({
  method: 'POST',
})
  .inputValidator(...)
  .handler(async ({ data }) => {
    // ... logging code ...

    // ❌ Return mock data for now
    return {
      page: 1,
      totalPages: 1,
      totalCount: 3,
      items: [
        {
          id: 1,
          cve: 'CVE-2023-12345',
          summary: 'Remote code execution vulnerability',
          severity: 'critical' as const,
          cvss_score: 9.8,
          affected_component: 'Apache HTTP Server',
          detected_version: '2.4.49',
          patched_version: '2.4.51',
          discovered_at: new Date('2024-01-15'),
        },
        // ... more mock data
      ],
    };
  });
```

#### Recommendation

**Option A:** Replace with real implementation using CVE enrichment data that already exists in `scanRuns.resultSummary.cveEnrichment`.

**Option B:** If not ready for implementation, add clear TODO and warning:

```typescript
export const getDeviceVulnerabilitiesData = createServerFn({
  method: 'POST',
})
  .inputValidator(...)
  .handler(async ({ data }) => {
    // TODO: Implement real vulnerability data from scanRuns.resultSummary.cveEnrichment
    // See: packages/data-ops/src/schema/orchestration.ts (CVEEnrichmentResult type)
    // See: apps/user-application/src/server/postback/handlers/port-scan.ts (enrichment logic)

    logger.warn('⚠️ Returning mock vulnerability data - not production ready', {
      deviceId: data.deviceId,
    });

    // MOCK DATA - DO NOT USE IN PRODUCTION
    return {
      page: 1,
      totalPages: 1,
      totalCount: 3,
      items: [
        // ... mock data with clear comments
      ],
    };
  });
```

**Priority:** 🔵 Fix when implementing vulnerability UI - low risk but should be addressed

---

### ISSUE-004: Deprecated Auth Functions Still in Codebase

**Severity:** 🔵 MEDIUM (Code Quality)
**Impact:** Confusing for developers, potential security risk if used by mistake
**Category:** Technical Debt

#### Location
```
File: apps/user-application/src/server/auth.ts
Lines: 8, 20-49, 91-153
Multiple functions marked @deprecated
```

#### Deprecated Functions

1. **Old Session Management** (lines 20-49)
```typescript
/**
 * @deprecated Auth is now handled by better-auth client
 * Use authClient.useSession() for session state
 */
export const getAuthStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    // ... old implementation
  }
);
```

2. **Old Sign Out** (lines 51-89)
```typescript
/**
 * @deprecated Use authClient.signOut() instead
 */
export const signOut = createServerFn({ method: "POST" }).handler(
  async () => {
    // ... old implementation
  }
);
```

3. **Old Email Auth** (lines 91-153)
```typescript
/**
 * @deprecated Use better-auth client instead: authClient.signIn.email()
 */
export const signIn = createServerFn({ method: "POST" })
  .inputValidator(...)
  .handler(async ({ data }) => {
    // ... old implementation
  });
```

4. **Old Sign Up** (similar pattern)
5. **Old Password Reset** (similar pattern)
6. **Old OAuth Completion** (similar pattern)

#### Issue Description
The file contains a TODO at line 8:
```typescript
// TODO: Remove these once all code is migrated to better-auth client
```

These functions are still exported and could be called by mistake. This creates:
1. **Confusion** about which auth method to use
2. **Maintenance burden** keeping both old and new code
3. **Security risk** if old code has vulnerabilities

#### Recommended Action

**Step 1:** Verify no code references these functions:
```bash
# Search for usage
grep -r "import.*getAuthStatus" apps/user-application/src/
grep -r "signOut(" apps/user-application/src/
grep -r "signIn(" apps/user-application/src/
```

**Step 2:** If no references found, remove the deprecated functions entirely.

**Step 3:** If references found, migrate them to better-auth client first, then remove.

**Priority:** 🔵 Fix during next auth refactor sprint - low risk

---

## 📋 Unused Code Analysis

### Safe to Keep (False Positives)

#### 1. Organization-Only Routes
```
Files:
  - apps/user-application/src/routes/_app.$organizationId.tsx (60 lines)
  - apps/user-application/src/routes/_app.$organizationId.index.tsx (103 lines)
```

**Status:** ✅ **KEEP** - These routes are used for organization-level navigation (project list)

**Usage:**
- Shows list of projects when accessing `/:org/`
- Handles auto-redirect to first project
- Required for project selector UX

---

### Potential for Removal

#### 1. Workflow History Function (Low Confidence)
```
File: apps/user-application/src/server/discovery/workflows/workflow-history.ts
Line: 16
Function: Direct DB access in getWorkflowHistory()
```

**Issue:** Uses `getDb()` directly instead of data-ops query:
```typescript
export async function getWorkflowHistory(
  organizationId: string,
  limit: number = 50
): Promise<WorkflowHistoryEntry[]> {
  const db = getDb();  // ❌ Direct access

  const history = await db
    .select({
      // ... fields
    })
    .from(workflowHistory)
    .where(eq(workflowHistory.organizationId, organizationId))
    .orderBy(desc(workflowHistory.timestamp))
    .limit(limit);

  return history;
}
```

**Recommendation:** Check if this function is still used. If yes, move to data-ops. If no, remove.

---

## 🎯 Remediation Plan

### Phase 1: Critical Security Fixes (Week 1)

**Priority Order:**
1. ✅ **VULN-001:** Add project validation to route loader
2. ✅ **VULN-003:** Validate projectId in device creation
3. ✅ **VULN-004:** Add organizationId to deleteScanSchedule
4. ✅ **VULN-002:** Add organization membership check

**Estimated Effort:** 4-6 hours
**Risk if not fixed:** High - cross-organization access possible

---

### Phase 2: Architecture Improvements (Week 2)

**Tasks:**
5. ✅ **ISSUE-001:** Move organization operations to data-ops
6. ✅ **ISSUE-002:** Add organization filters to deletion operations

**Estimated Effort:** 8-10 hours
**Risk if not fixed:** Medium - technical debt accumulation

---

### Phase 3: Code Quality (Week 3)

**Tasks:**
7. ✅ **ISSUE-003:** Replace mock vulnerability data or document clearly
8. ✅ **ISSUE-004:** Remove deprecated auth functions
9. ✅ Check workflow history usage and refactor

**Estimated Effort:** 4-6 hours
**Risk if not fixed:** Low - mostly maintenance burden

---

## 📊 Security Checklist

Use this checklist when adding new routes or server functions:

### For New Routes
- [ ] Route loader validates all URL parameters (org, project, device)
- [ ] Route loader checks user membership/access
- [ ] Route returns 403/404 for unauthorized access (not 500)
- [ ] Route logs access attempts for audit trail

### For New Server Functions
- [ ] Function uses data-ops queries (not direct `getDb()`)
- [ ] Function validates organizationId matches current user
- [ ] Function validates projectId belongs to organization (if applicable)
- [ ] Function validates deviceId belongs to project (if applicable)
- [ ] Function input is validated with Zod schema
- [ ] Function returns success/error in standardized format
- [ ] Function logs security-relevant operations

### For New Data-Ops Queries
- [ ] Query filters by organizationId (always)
- [ ] Deletion operations include organizationId in WHERE clause
- [ ] Query returns null/empty for unauthorized access (not throwing)
- [ ] Query is exported from `packages/data-ops/src/index.ts`
- [ ] Query is documented with JSDoc comments

---

## 📝 Audit Metadata

**Audit Completed:** 2025-01-25
**Files Reviewed:** 47
**Functions Analyzed:** 23
**Critical Issues Found:** 4
**High Priority Issues:** 2
**Medium Priority Issues:** 2

**Next Audit Recommended:** After Phase 1 remediation completion

---

## Appendix A: Function Reference

### Functions Requiring Immediate Attention

| Function | File | Lines | Issue | Severity |
|----------|------|-------|-------|----------|
| Route loader | `_app.$organizationId.$projectId.tsx` | 36-39 | No project validation | CRITICAL |
| `getOrganizationById()` | `organization.ts` | 611-675 | No membership check | CRITICAL |
| `createDevicesFromDiscovery()` | `devices.ts` | 607-634 | Unvalidated projectId | CRITICAL |
| `deleteScanSchedule()` | `devices.ts` (data-ops) | 696-704 | Missing org filter | CRITICAL |
| `updateOrganizationMetadata()` | `organization.ts` | 285-316 | Direct DB access | HIGH |
| `updateOrganizationOnboarding()` | `organization.ts` | 354-384 | Direct DB access | HIGH |
| `updateOrganizationSubscription()` | `organization.ts` | 429-465 | Direct DB access | HIGH |
| `completeOnboarding()` | `organization.ts` | 519-556 | Direct DB access | HIGH |
| `updateDevice()` (IP deletion) | `devices.ts` (data-ops) | 492-496 | Missing org filter | HIGH |
| `updateDevice()` (tag deletion) | `devices.ts` (data-ops) | 510-514 | Missing org filter | HIGH |

### Validated Safe Functions

| Function | File | Lines | Validation Present |
|----------|------|-------|-------------------|
| `getDevicesForTenant()` | `devices.ts` (data-ops) | Multiple | ✅ Filters by organizationId |
| `getScanRunsWithArtifacts()` | `scans.ts` (data-ops) | 11-86 | ✅ Validates project belongs to org |
| `getDeviceById()` | `devices.ts` (data-ops) | Multiple | ✅ Requires organizationId |
| `deleteDevice()` | `devices.ts` (data-ops) | Multiple | ✅ Validates ownership |

---

## Appendix B: Test Cases for Validation

### Test: Project Route Authorization
```typescript
describe('Project Route Authorization', () => {
  it('should deny access to project from different organization', async () => {
    // User A belongs to org "alice-corp"
    // User A tries to access project from org "bob-corp"
    const response = await fetch('/alice-corp/bob-project-id/assets');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('access denied');
  });

  it('should allow access to own project', async () => {
    // User A belongs to org "alice-corp"
    // User A accesses their own project
    const response = await fetch('/alice-corp/alice-project-id/assets');

    expect(response.status).toBe(200);
  });
});
```

### Test: Device Creation Authorization
```typescript
describe('Device Creation Authorization', () => {
  it('should reject device creation with invalid projectId', async () => {
    const response = await createDevicesFromDiscovery({
      targets: [{ ip: '10.0.0.1' }],
      projectId: 'other-org-project-id',  // Not user's project
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('access denied');
  });
});
```

---

**Document Version:** 1.0
**Last Updated:** 2025-01-25
**Status:** 🔴 Active - Awaiting Remediation

---

## Appendix C: OpenPanel Security Patterns (Comparative Analysis)

**Note:** This section documents how OpenPanel (a similar project-scoped application) implements security patterns that we should adopt in OpenScan.

### Overview

OpenPanel implements a sophisticated 4-layer security architecture:
1. **Route Level** - Static validation in `beforeLoad`, access checks in `loader`
2. **TRPC Middleware** - Automatic validation of `projectId`/`organizationId` in all procedures
3. **Server Functions** - Explicit role-based access checks
4. **Data Layer** - All queries scoped to organization/project context

**Key Benefit:** Multiple validation layers ensure no single failure can expose data.

---

### Pattern 1: Automatic Middleware Validation

**OpenPanel Location:** `/packages/trpc/src/trpc.ts` (lines 104-136)

OpenPanel's `enforceAccess` middleware automatically validates `projectId` and `organizationId` in **ANY** TRPC procedure that includes these fields:

```typescript
const enforceAccess = t.middleware(async ({ ctx, next, type, getRawInput }) => {
  const rawInput = await getRawInput();
  
  // Block mutations in demo mode
  if (type === 'mutation' && process.env.DEMO_USER_ID) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not allowed to do this in demo mode',
    });
  }

  // Check projectId if present
  if (has('projectId', rawInput)) {
    const access = await getProjectAccessCached({
      userId: ctx.session.userId!,
      projectId: rawInput.projectId as string,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this project');
    }
  }

  // Check organizationId if present
  if (has('organizationId', rawInput)) {
    const access = await getOrganizationAccessCached({
      userId: ctx.session.userId!,
      organizationId: rawInput.organizationId as string,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this organization');
    }
  }

  return next();
});
```

**Key Security Features:**
- **Field-based detection:** Uses `has()` function to detect fields, not string matching (more reliable)
- **Caching:** Uses `getProjectAccessCached()` with 5-minute TTL for performance
- **Demo mode protection:** Automatically blocks mutations in demo environments
- **Developer safety:** Impossible to accidentally skip authorization checks

**Comparison to OpenScan:**
- ❌ OpenScan uses direct server functions, not TRPC
- ❌ No automatic validation middleware
- ❌ Each query must manually validate access (error-prone)

**Recommendation:** While migrating to TRPC is a large effort, we should create a reusable validation wrapper that all server functions use to achieve similar protection.

---

### Pattern 2: Project→Organization Validation (CRITICAL)

**OpenPanel Location:** `/packages/trpc/src/access.ts` (lines 5-42)

This is the **most critical security boundary** - validating that a project belongs to an organization:

```typescript
export async function getProjectAccess({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  try {
    // 1. Get project and its organization
    const project = await getProjectById(projectId);
    if (!project?.organizationId) {
      return false; // Fail secure - no project or no org
    }

    // 2. Check if user has explicit project access
    const [projectAccess, member] = await Promise.all([
      db.projectAccess.findMany({
        where: {
          userId,
          organizationId: project.organizationId,
        },
      }),
      db.member.findFirst({
        where: {
          organizationId: project.organizationId,
          userId,
        },
      }),
    ]);

    // If user has no specific project restrictions, check org membership
    if (projectAccess.length === 0 && member) {
      return true; // Org members have full access by default
    }

    // If user has project restrictions, check if they have access to this project
    return projectAccess.find((item) => item.projectId === projectId);
  } catch (err) {
    return false; // Fail secure on any error
  }
}

// Cached version for performance
export const getProjectAccessCached = cacheable(getProjectAccess, 60 * 5);
```

**Logic Breakdown:**
1. **Validates project exists:** If project doesn't exist or has no organization, deny
2. **Two-level access model:**
   - No restrictions: All organization members can access all projects
   - With restrictions: Only explicitly listed projects are accessible
3. **Fail secure:** Returns false on any error
4. **Caches for 5 minutes:** Balances performance with security

**Critical Security Property:** This prevents users from accessing `/org-a/project-from-org-b` by:
- Fetching the project to get its **actual** organizationId
- Comparing it to user's organization membership
- Never trusting the organizationId from the URL

**Comparison to OpenScan:**
- ❌ **CRITICAL GAP:** OpenScan's `_app.$organizationId.$projectId.tsx` has TODO comments but no actual validation
- ❌ Currently accepts any projectId without checking it belongs to the organization
- ⚠️ This is VULN-001 in our audit

**Recommendation:** Implement this immediately - see VULN-001 fix in this document.

---

### Pattern 3: Route-Level Validation

**OpenPanel Location:** `/apps/start/src/routes/_app.$organizationId.tsx` (lines 36-54)

OpenPanel uses two-stage route validation:

```typescript
const IGNORE_ORGANIZATION_IDS = ['.well-known', 'onboarding', 'assets'];
const FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'];

const isStaticFile = (path: string) => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

export const Route = createFileRoute('/_app/$organizationId')({
  beforeLoad: async ({ context, params }) => {
    // STAGE 1: Static validation (no DB calls)
    // Block reserved and static file paths early
    if (IGNORE_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }
  },
  loader: async ({ context, params }) => {
    // STAGE 2: Data prefetch (triggers TRPC validation)
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
});
```

**Key Insights:**
- **beforeLoad:** Fast static checks that don't require database access
- **loader:** Prefetches data which triggers TRPC middleware validation
- **Separation of concerns:** Static validation separate from authorization

**Comparison to OpenScan:**
- ✅ OpenScan has similar `RESERVED_PROJECT_IDS` check
- ❌ OpenScan doesn't check for static file extensions
- ❌ OpenScan's loader has TODO comments instead of actual validation

**Recommendation:** Add file extension check to prevent directory traversal attempts.

---

### Pattern 4: Relationship Validation in Data Layer

**OpenPanel Location:** `/packages/trpc/src/routers/dashboard.ts` (lines 52-83)

When creating child records (dashboard → project → organization), OpenPanel validates the entire relationship chain:

```typescript
create: protectedProcedure
  .input(z.object({
    name: z.string(),
    projectId: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Check user can access project
    const access = await getProjectAccess({
      projectId: input.projectId,
      userId: ctx.session.userId,
    });
    if (!access) {
      throw TRPCAccessError('You do not have access to this project');
    }

    // 2. Fetch project to get its organization
    const project = await getProjectById(input.projectId);
    if (!project) {
      throw TRPCNotFoundError('Project not found');
    }

    // 3. Create dashboard with BOTH projectId AND organizationId
    // (Ensures data integrity - dashboard can't orphan from org)
    return db.dashboard.create({
      data: {
        id: await getId('dashboard', input.name),
        projectId: input.projectId,
        organizationId: project.organizationId, // ✅ Derived from project
        name: input.name,
      },
    });
  }),
```

**Security Pattern:**
1. Validate access to the parent (project)
2. Fetch the parent to get its parent (organization)
3. Store both references in the child record

**Why This Matters:**
- Prevents bypassing authorization by fabricating organization IDs
- Client only sends `projectId`, server derives `organizationId`
- Maintains referential integrity (child always linked to correct parent)

**Comparison to OpenScan:**
- ❌ **HIGH RISK:** OpenScan's `createDevicesFromDiscovery()` accepts `projectId` from client without validation (VULN-003)
- ❌ Doesn't fetch project to derive organizationId
- ⚠️ Allows users to create devices in other organizations' projects

**Recommendation:** Always derive organizationId from projectId, never accept it from client - see VULN-003 fix.

---

### Pattern 5: Session Validation with Extension

**OpenPanel Location:** `/packages/auth/src/session.ts` (lines 62-101)

OpenPanel implements sophisticated session handling:

```typescript
export async function validateSessionToken(
  token: string | null,
): Promise<SessionValidationResult> {
  if (process.env.DEMO_USER_ID) {
    return createDemoSession(process.env.DEMO_USER_ID);
  }

  if (!token) {
    return EMPTY_SESSION;
  }

  // Hash token before lookup (prevents timing attacks)
  const sessionId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(token))
  );
  
  const result = await db.$primary().session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (result === null) {
    return EMPTY_SESSION;
  }

  const { user, ...session } = result;

  // Check expiration
  if (Date.now() >= session.expiresAt.getTime()) {
    await db.session.delete({ where: { id: sessionId } });
    return EMPTY_SESSION;
  }

  // Auto-extend session if 15 days remain (keeps users logged in)
  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: session.expiresAt },
    });
  }

  return { session, user, userId: user.id };
}
```

**Key Features:**
1. **Token hashing:** Hashes token before database lookup (prevents timing attacks)
2. **Auto-extension:** Extends session when 15 days remain (better UX)
3. **Expired cleanup:** Deletes expired sessions immediately
4. **Fail secure:** Returns empty session on any error

**Comparison to OpenScan:**
- ✅ OpenScan uses better-auth which handles session validation
- ✅ Session security is adequate
- ⚠️ OpenScan doesn't have auto-extension (minor UX issue)

**Recommendation:** No changes needed - better-auth is secure.

---

### Pattern 6: Access Caching Strategy

**OpenPanel Location:** `/packages/trpc/src/access.ts` (cacheable wrapper)

OpenPanel caches access checks with 5-minute TTL:

```typescript
import { cacheable } from '@repo/redis';

// Original function
export async function getProjectAccess({ userId, projectId }) {
  // ... validation logic
}

// Cached version
export const getProjectAccessCached = cacheable(getProjectAccess, 60 * 5);
```

**Caching Strategy:**
- **What's cached:** Access check results (user → project/org relationships)
- **TTL:** 5 minutes (300 seconds)
- **Invalidation:** On membership changes, role updates
- **Storage:** Redis for distributed caching

**Why This Works:**
- Access relationships change infrequently (minutes/hours, not seconds)
- 5-minute staleness is acceptable trade-off for performance
- Reduces database load significantly with many concurrent users

**Comparison to OpenScan:**
- ❌ No access caching - every query hits database
- ⚠️ Performance bottleneck with scale
- ⚠️ Potential DoS vector (overwhelm DB with access checks)

**Recommendation:** Implement Redis caching for `validateProjectAccess()` and `getOrganizationAccess()` functions.

---

### Comparison Table: OpenPanel vs OpenScan

| Security Aspect | OpenPanel | OpenScan | Gap Severity |
|-----------------|-----------|----------|--------------|
| Project→Org validation | ✅ Always checked | ❌ TODO comments | 🔴 CRITICAL |
| Automatic middleware | ✅ TRPC enforceAccess | ❌ No TRPC | 🟡 HIGH |
| Access caching | ✅ 5-min TTL | ❌ None | 🟡 MEDIUM |
| Route validation | ✅ beforeLoad + loader | ⚠️ Partial | 🟡 MEDIUM |
| Relationship validation | ✅ Parent→child checks | ❌ Accepts client IDs | 🔴 CRITICAL |
| Session security | ✅ Hashing + extension | ✅ better-auth | ✅ OK |
| Static file blocking | ✅ FILE_EXTENSIONS | ❌ Not implemented | 🔵 LOW |
| Demo mode protection | ✅ Middleware block | N/A | N/A |
| Audit logging | ✅ All mutations | ⚠️ Partial | 🔵 LOW |

---

### Key Learnings for OpenScan

#### 1. Critical Fixes (Immediate)
- **Project→Organization validation** must be implemented in route loader (VULN-001)
- **Device creation** must validate projectId belongs to organization (VULN-003)
- **Derive organizationId** from projectId, never accept from client

#### 2. Architecture Improvements (Short-term)
- Add **access caching** with 5-minute TTL for performance
- Create **reusable validation wrapper** for all server functions
- Implement **relationship validation** pattern for all child records

#### 3. Long-term Enhancements
- Consider **TRPC migration** for automatic middleware validation
- Implement **role-based access control** (org:admin, org:member)
- Add **comprehensive audit logging** for security monitoring

---

### Implementation Priority

**Week 1 (CRITICAL):**
1. Implement project→organization validation in route loader
2. Add projectId validation in `createDevicesFromDiscovery()`
3. Fix `deleteScanSchedule()` to require organizationId

**Week 2 (HIGH):**
4. Add Redis caching for access checks
5. Create validation wrapper for all server functions
6. Move organization operations to data-ops layer

**Week 3+ (MEDIUM):**
7. Implement role-based access control
8. Add comprehensive audit logging
9. Consider TRPC migration feasibility

---

### Code Templates from OpenPanel

For detailed code samples and implementation guides, see:
- **OPENPANEL_SECURITY_PATTERNS.md** - Full pattern analysis with code
- **SECURITY_IMPLEMENTATION_GUIDE.md** - Step-by-step implementation

---

**Appendix Version:** 1.0  
**OpenPanel Version Analyzed:** Current (as of 2025-01-25)  
**Source:** `/Users/rus/Projects/current/sec/openpanel/apps/start`

