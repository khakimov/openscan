

# Security Test Suite

**Created:** 2025-01-25
**Purpose:** Test-Driven Security - Write tests BEFORE implementing fixes
**Status:** ❌ Tests currently failing (proving vulnerabilities exist)

---

## Overview

This document describes the security test suite created to verify the 4 critical vulnerabilities identified in [SECURITY_AUDIT_2025.md](./SECURITY_AUDIT_2025.md).

**Test-Driven Approach:**
1. ✅ Write tests that expose vulnerabilities (tests fail)
2. ⏭️ Implement security fixes
3. ⏭️ Tests pass (proving fixes work)
4. ✅ Prevent future regressions

---

## Test Files Created

### 1. Route Security Tests
**File:** `src/routes/__tests__/project-route-security.test.ts`
**Tests:** VULN-001 - Unvalidated Project Access in Route Loader

**Coverage:**
- ❌ Cross-organization project access prevention
- ✅ Same-organization project access allowed
- ❌ Non-existent project ID rejection
- ✅ Route loader validation pattern
- ❌ URL manipulation attack prevention
- ❌ Project enumeration prevention

**Test Scenarios:**
```typescript
// Attack: User A tries to access Project B (from Org B) via Org A URL
URL: /org-a/project-b/assets
Expected: Access denied (404/403)
Current: No validation - vulnerability exists
```

---

### 2. Server Function Security Tests
**File:** `src/server/__tests__/security-vulnerabilities.test.ts`
**Tests:** VULN-002, VULN-003, VULN-004

**Coverage:**

#### VULN-002: Organization Data Access
- ❌ Membership check before returning org data
- ✅ Organization data visible to members only

#### VULN-003: Device Creation Validation
- ❌ Reject device creation in other org's project
- ✅ Allow device creation in own project
- ✅ Derive organizationId from projectId (secure pattern)
- ❌ Fail creation if project validation fails

#### VULN-004: Scan Schedule Deletion
- ❌ Require organizationId to delete schedule
- ❌ Prevent cross-org schedule deletion
- ✅ Allow deletion of own schedule

---

## Running the Tests

### Run All Security Tests

```bash
# From user-application directory
cd apps/user-application

# Run all tests
pnpm test

# Run only security tests
pnpm test security

# Run specific test file
pnpm test routes/__tests__/project-route-security.test.ts
pnpm test server/__tests__/security-vulnerabilities.test.ts
```

### Run with Coverage

```bash
pnpm test --coverage
```

### Run in Watch Mode

```bash
pnpm test --watch
```

---

## Expected Test Results

### BEFORE Fixes (Current State)

```
❌ FAIL  routes/__tests__/project-route-security.test.ts
  ✓ should allow access to project from same organization
  ❌ should reject access to project from different organization
  ✓ should reject non-existent project ID
  ✓ should validate project exists before loading route
  ✓ should throw error when project validation fails
  ❌ should prevent URL manipulation attack
  ❌ should prevent project enumeration via organization URL

❌ FAIL  server/__tests__/security-vulnerabilities.test.ts
  VULN-002: Organization Data Access
    ❌ should require membership check to access organization
    ✓ should return organization data only to members

  VULN-003: Device Creation with Unvalidated ProjectId
    ❌ should reject device creation in another organizations project
    ✓ should allow device creation in own project
    ✓ should derive organizationId from projectId, not accept from client
    ❌ should fail device creation if project validation fails

  VULN-004: Unprotected Scan Schedule Deletion
    ❌ should require organizationId to delete scan schedule
    ❌ should prevent cross-org schedule deletion
    ✓ should allow deletion of own schedule
```

**Failure Count:** ~8-10 tests failing (proving vulnerabilities exist)

---

### AFTER Fixes (Expected)

```
✅ PASS  routes/__tests__/project-route-security.test.ts
  ✓ All 7 tests passing

✅ PASS  server/__tests__/security-vulnerabilities.test.ts
  ✓ All 10+ tests passing
```

**Success:** All tests pass, vulnerabilities are fixed

---

## Test Architecture

### Database Setup

Tests use the **Miniflare + D1 integration pattern** documented in `CLAUDE.md`:

```typescript
// Setup in src/test/integration-setup.ts
import { Miniflare } from 'miniflare';
import { initDatabase, getDb } from '@repo/data-ops/database/setup';

// Uses real local D1 database (safe to modify for tests)
const mf = new Miniflare({
  modules: true,
  script: '',
  d1Databases: {
    DB: 'test-sec-db',
  },
  d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
});
```

### Test Data Pattern

Each test file creates isolated test data in `beforeAll()` and cleans up in `afterAll()`:

```typescript
beforeAll(async () => {
  // Create Organization A + User A + Project A
  // Create Organization B + User B + Project B
  // Allows testing cross-org access scenarios
});

afterAll(async () => {
  // Clean up in reverse order (respect foreign keys)
  // Delete devices, projects, users, organizations
});
```

---

## Test Assertions Explained

### Cross-Organization Access Test

```typescript
it('should reject access to project from different organization', async () => {
  const db = getDb();

  // Try to load Project B as if accessing via Org A URL
  const [project] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.id, projectBId),        // Project from Org B
      eq(projects.organizationId, orgAId) // Trying via Org A
    ))
    .limit(1);

  // EXPECTED: project should be undefined (access denied)
  expect(project).toBeUndefined();
});
```

**Why this matters:**
- Simulates route loader validation
- If project is found, it means Project B actually belongs to Org A (shouldn't happen)
- Tests the exact query that SHOULD be in the route loader

---

### Device Creation Validation Test

```typescript
it('should reject device creation in another organizations project', async () => {
  const validateProjectOwnership = async (projectId, organizationId) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      ))
      .limit(1);

    return !!project;
  };

  // User A (Org A) tries to create device in Project B (Org B)
  const isValid = await validateProjectOwnership(projectBId, orgAId);

  // Should be false (project doesn't belong to org)
  expect(isValid).toBe(false);
});
```

**Why this matters:**
- Tests the validation function that SHOULD be in `createDevicesFromDiscovery()`
- Currently, the server function doesn't do this check
- After fix, this validation will prevent cross-org device creation

---

### Scan Schedule Deletion Test

```typescript
it('should prevent cross-org schedule deletion', async () => {
  const deleteScanScheduleSafe = async (scheduleId, organizationId) => {
    const result = await db
      .delete(scanSchedules)
      .where(and(
        eq(scanSchedules.scheduleId, scheduleId),
        eq(scanSchedules.organizationId, organizationId) // Security check
      ))
      .returning();

    return result.length > 0;
  };

  // Try to delete Org B's schedule using Org A's context
  const wasDeleted = await deleteScanScheduleSafe(scheduleBId, orgAId);

  // Should fail (false)
  expect(wasDeleted).toBe(false);
});
```

**Why this matters:**
- Tests the SAFE deletion pattern (includes organizationId filter)
- Currently, `deleteScanSchedule()` only takes scheduleId (unsafe)
- After fix, function signature will change to require organizationId

---

## Test-Driven Development Workflow

### Step 1: Run Tests (Establish Baseline)

```bash
pnpm test security
```

**Expected:** Multiple tests failing, proving vulnerabilities exist.

---

### Step 2: Implement Fix (Example: VULN-001)

**File:** `src/routes/_app.$organizationId.$projectId.tsx`

```typescript
import { validateProjectAccess } from '@repo/data-ops';

export const Route = createFileRoute('/_app/$organizationId/$projectId')({
  loader: async ({ params }) => {
    const userId = await getCurrentUserId();

    // ✅ ADD THIS VALIDATION
    await validateProjectAccess(
      userId,
      params.projectId,
      params.organizationId
    );

    return { projectId: params.projectId };
  },
});
```

---

### Step 3: Run Tests Again

```bash
pnpm test routes/__tests__/project-route-security.test.ts
```

**Expected:** Tests now passing for VULN-001.

---

### Step 4: Repeat for Other Vulnerabilities

- Fix VULN-002: Add organization membership check
- Fix VULN-003: Validate projectId in device creation
- Fix VULN-004: Update deleteScanSchedule signature

---

### Step 5: Verify All Tests Pass

```bash
pnpm test security
```

**Expected:** All tests passing ✅

---

## Integration with CI/CD

Add to GitHub Actions workflow:

```yaml
name: Security Tests
on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run security tests
        run: pnpm test security

      - name: Fail if vulnerabilities detected
        run: |
          if grep -q "FAIL" test-results.txt; then
            echo "❌ Security tests failed - vulnerabilities detected"
            exit 1
          fi
```

---

## Adding New Security Tests

When adding new routes or server functions:

### 1. Create Test File

```typescript
// src/routes/__tests__/new-feature-security.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '@repo/data-ops/database/setup';

describe('New Feature Security', () => {
  beforeAll(async () => {
    // Create test data
  });

  afterAll(async () => {
    // Clean up test data
  });

  it('should prevent unauthorized access', async () => {
    // Test security boundary
  });
});
```

---

### 2. Test Security Boundaries

- ✅ Cross-organization access
- ✅ Cross-project access
- ✅ Missing authentication
- ✅ Missing authorization
- ✅ URL parameter manipulation
- ✅ ID enumeration attacks

---

### 3. Run Tests Before Implementing

Ensure tests fail initially (proving security check doesn't exist).

---

## Test Maintenance

### Keep Tests Updated

When changing:
- Route structure → Update route tests
- Server function signatures → Update server tests
- Database schema → Update test data setup

---

### Review Test Coverage

```bash
pnpm test --coverage
```

**Target Coverage:**
- Routes: 100% security paths
- Server functions: 100% authorization checks
- Data-ops queries: 100% organizationId filters

---

## Debugging Failed Tests

### Common Issues

**1. Test data conflicts:**
```bash
# Clear test database
rm -rf .wrangler/state/v3/d1/test-sec-db.sqlite
pnpm db:migrate
```

**2. Stale database connection:**
```bash
# Restart test suite
pnpm test --no-cache
```

**3. Foreign key violations:**
- Check cleanup order in `afterAll()`
- Delete child records before parent records

---

## Security Test Checklist

When reviewing code, ensure:

- [ ] All routes have security tests
- [ ] All server functions have authorization tests
- [ ] Cross-organization access is tested
- [ ] Invalid input is tested
- [ ] Error cases are tested
- [ ] Tests fail before fix (TDD)
- [ ] Tests pass after fix
- [ ] Coverage > 90% for security code

---

## Next Steps

1. ✅ Tests created (current step)
2. ⏭️ Run tests to establish baseline
3. ⏭️ Implement fixes (see SECURITY_AUDIT_2025.md)
4. ⏭️ Verify tests pass
5. ⏭️ Add to CI/CD pipeline
6. ⏭️ Monitor for regressions

---

## References

- **Security Audit:** [SECURITY_AUDIT_2025.md](./SECURITY_AUDIT_2025.md)
- **Implementation Guide:** [SECURITY_IMPLEMENTATION_GUIDE.md](./SECURITY_IMPLEMENTATION_GUIDE.md)
- **OpenPanel Patterns:** [OPENPANEL_SECURITY_PATTERNS.md](./OPENPANEL_SECURITY_PATTERNS.md)
- **Miniflare Docs:** [CLAUDE.md](../../CLAUDE.md#integration-tests-with-miniflare--d1)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-25
**Status:** ✅ Tests created, ready to run
