# Project Routes Implementation Plan

## Overview

Implement OpenPanel-style project scoping to add a hierarchical structure:
**Organization → Project → Device**

This allows multiple projects (domains/applications) per organization, with devices scoped to specific projects.

## Current Structure

```
/:org                    → Dashboard
/:org/assets             → All assets (org-level)
/:org/scans              → All scans (org-level)
/:org/:device            → Device detail
/:org/:device/scans      → Device scan history
/:org/:device/vulnerabilities → Device CVEs
```

## Proposed Structure

```
/:org                           → List all projects
/:org/settings                  → Organization settings
/:org/:project                  → Project dashboard
/:org/:project/assets           → Project assets (devices)
/:org/:project/scans            → Project scans
/:org/:project/:device          → Device detail
/:org/:project/:device/scans    → Device scan history
/:org/:project/:device/vulnerabilities → Device CVEs
```

## Implementation Steps

### Phase 1: Document & Prepare (Current)
- [x] Analyze OpenPanel routing pattern
- [x] Create implementation plan
- [x] Branch: `feature/project-routes`

### Phase 2: Database Schema
- [ ] Review existing projects table in data-ops
- [ ] Add projectId foreign key to devices table
- [ ] Create migration to add projectId column
- [ ] Update device queries to filter by projectId

### Phase 3: Project Layout Routes
- [ ] Create `_app.$organizationId.$projectId.tsx` (project layout/validation)
- [ ] Update `_app.$organizationId.index.tsx` (show project list instead of assets)
- [ ] Create `_app.$organizationId.settings.tsx` (organization settings)

### Phase 4: Move Assets/Scans to Project Scope
- [ ] Rename `_app.$organizationId.assets.tsx` → `_app.$organizationId.$projectId_.assets.tsx`
- [ ] Rename `_app.$organizationId.scans.tsx` → `_app.$organizationId.$projectId_.scans.tsx`
- [ ] Update loaders to use projectId instead of organizationId
- [ ] Update queries to filter by projectId

### Phase 5: Move Device Routes to Project Scope
- [ ] Rename `_app.$organizationId.$deviceId.tsx` → `_app.$organizationId.$projectId_.$deviceId.tsx`
- [ ] Rename `_app.$organizationId.$deviceId.index.tsx` → `_app.$organizationId.$projectId_.$deviceId.index.tsx`
- [ ] Rename `_app.$organizationId.$deviceId_.scans.tsx` → `_app.$organizationId.$projectId_.$deviceId_.scans.tsx`
- [ ] Rename `_app.$organizationId.$deviceId_.vulnerabilities.tsx` → `_app.$organizationId.$projectId_.$deviceId_.vulnerabilities.tsx`

### Phase 6: Navigation Updates
- [ ] Update sidebar to show current project
- [ ] Add project switcher to LayoutProjectSelector
- [ ] Update navigation links to include projectId
- [ ] Add breadcrumbs (Org → Project → Device)

### Phase 7: Data Layer Updates
- [ ] Update `deviceQueries` to accept projectId
- [ ] Update `scanQueries` to accept projectId
- [ ] Update server functions to validate project access
- [ ] Update onboarding flow to create default project

### Phase 8: Redirect Logic
- [ ] Landing page: redirect to `/:org/:defaultProject`
- [ ] Organization index: show project selector or redirect to default
- [ ] Handle missing projectId gracefully

## Key Patterns from OpenPanel

### 1. Pathless Layout for Projects
```typescript
// Route file: _app.$organizationId.$projectId.tsx
export const Route = createFileRoute('/_app/$organizationId/$projectId')({
  component: ProjectDashboard,
});

// URL: /:org/:project (shows project dashboard)
```

### 2. Pathless Child Routes (underscore suffix)
```typescript
// Route file: _app.$organizationId.$projectId_.assets.tsx
export const Route = createFileRoute('/_app/$organizationId/$projectId_/assets')({
  component: Assets,
});

// URL: /:org/:project/assets (not /:org/:project/:project/assets)
// The underscore prevents adding projectId to URL again
```

### 3. Project Validation in Layout
```typescript
export const Route = createFileRoute('/_app/$organizationId/$projectId')({
  beforeLoad: async ({ params }) => {
    // Validate project belongs to organization
    // Validate user has access to project
  },
  loader: async ({ context, params }) => {
    // Prefetch project data
    await context.queryClient.ensureQueryData(
      projectQueries.detail(params.projectId)
    );
  },
});
```

### 4. Reserved Project IDs
Similar to organization IDs, block reserved project IDs:
- `api`, `settings`, `billing`, `members` (org-level routes)

## Data Model

### Current
```typescript
Device {
  id: string
  organizationId: string  // Current foreign key
  name: string
  ip: string
  // ...
}
```

### Proposed
```typescript
Device {
  id: string
  organizationId: string  // Still needed for org-level queries
  projectId: string       // NEW: Scope devices to projects
  name: string
  ip: string
  // ...
}
```

### Migration Strategy
1. Add `projectId` column (nullable initially)
2. Backfill: assign all devices to organization's default project
3. Make `projectId` required
4. Update all queries

## Benefits

1. **Multi-Project Support**: Scan multiple domains/apps per organization
2. **Better Organization**: Separate production/staging/dev environments
3. **Cleaner URLs**: Follows industry standard (GitHub, Vercel, etc.)
4. **Scalability**: Projects can have their own settings/quotas
5. **Access Control**: Fine-grained permissions per project

## Example URLs

```
# Organization level
/acme-corp                          → List projects
/acme-corp/settings                 → Org settings

# Project level
/acme-corp/api-production           → Project dashboard
/acme-corp/api-production/assets    → Devices in this project
/acme-corp/api-production/scans     → Scans for this project

# Device level
/acme-corp/api-production/server-1  → Device overview
/acme-corp/api-production/server-1/scans → Device scan history
/acme-corp/api-production/server-1/vulnerabilities → Device CVEs
```

## Rollout Plan

1. **Branch**: `feature/project-routes` (current)
2. **Migration**: Add projectId to devices table
3. **Routes**: Implement new route structure
4. **Data**: Update queries to use projectId
5. **UI**: Update navigation and selectors
6. **Testing**: Verify all routes work correctly
7. **Deploy**: Merge to main with data migration

## ✅ Investigation Findings

### 1. Current State (What We Have)
- ✅ **Projects table exists** with proper schema
- ✅ **Devices have projectId** (nullable foreign key)
- ✅ **Onboarding creates project** and assigns devices to it
- ✅ **Device creation supports projectId** parameter
- ❌ **No project selection in UI yet**
- ❌ **Routes not scoped to projects yet**

### 2. OpenPanel's Project Context Pattern

**Key Finding:** OpenPanel uses **URL-based project context** (NOT session/database state)

#### How It Works
```typescript
// URL determines active project
/:organizationId/:projectId/assets

// Extract from URL using simple hook
const { organizationId, projectId } = useAppParams();

// Switching projects = Navigate to new URL
router.navigate({
  to: '/$organizationId/$projectId',
  params: { organizationId, projectId: newProjectId }
});
```

#### Benefits of URL-Based Context
1. **No session state needed** - URL is the source of truth
2. **Shareable links** - Share exact project view
3. **Browser back/forward works** naturally
4. **Refreshing preserves context**
5. **Simpler architecture** - No "active project" in database

#### Project Selector Component
```typescript
// OpenPanel: project-selector.tsx
// - Dropdown showing current project
// - List of all projects with checkmark on active
// - "Create new project" button
// - Also shows organizations for switching
```

### 3. Implementation Logic

#### Device Creation Flow
```
User at: /:org/:project/assets
         ↓
Clicks "Add Discovery"
         ↓
Modal opens, gets projectId from URL params
         ↓
Creates devices with projectId from URL context
         ↓
Devices appear in current project
```

#### Project Switching Flow
```
User at: /:org/project-a/assets
         ↓
Opens project selector, selects "project-b"
         ↓
Navigate to: /:org/project-b (project dashboard)
         ↓
User clicks "Assets" in sidebar
         ↓
Navigate to: /:org/project-b/assets
         ↓
Shows only devices in project-b
```

### 4. Migration Strategy

**Good News:** No migration needed!

- Devices already have `projectId` (nullable)
- Onboarding already assigns to project
- Existing devices with `projectId = null` will be handled organically:
  - User selects a project
  - Views devices (filters by projectId)
  - Can bulk-assign old devices to projects via UI

**OR** Simple backfill during deployment:
```typescript
// One-time: Assign orphaned devices to default project
UPDATE devices
SET projectId = (SELECT id FROM projects WHERE organizationId = devices.organizationId AND isDefault = 1)
WHERE projectId IS NULL
```

## OpenPanel's Project Selection Logic (Investigated)

### Landing & Navigation Flow

**Root Path (`/`) Logic:**
1. **No organizations** → Redirect to `/onboarding/project`
2. **Exactly 1 organization** → Redirect to `/:organizationId` (shows project list)
3. **Multiple organizations** → Show organization picker page

**Organization Index (`/:org`) Logic:**
- **No projects** → Shows empty state with "Create project" button
- **Has projects** → Shows grid/list of all projects (NO automatic redirect to default)
- User manually selects which project to open

**After Onboarding:**
- Creates organization + project during onboarding
- Redirects to `/:organizationId/:projectId` (the newly created project's dashboard)
- Project becomes the first project in the list

### Key Insights

**OpenPanel does NOT have a "default project" concept in navigation:**
- ❌ No automatic redirect to a default/first project
- ✅ Organization index shows ALL projects as a selection screen
- ✅ Users explicitly click which project they want to view
- ✅ After onboarding, goes directly to the newly created project

**Project Selection Pattern:**
- URL is the source of truth (no stored "active project")
- Switching projects = Navigate to new URL
- Project selector in sidebar navigates to `/:org/:project` when clicked

### Our Implementation Decision (Hybrid Approach)

We use a **smart hybrid** of OpenPanel's pattern with convenience for single-project users:

1. **`/:org` route** → Smart behavior:
   - **0 projects** → Empty state with "Create Project" button
   - **1 project** → Auto-redirect to `/:org/:projectId` ✨ (convenience)
   - **2+ projects** → Show project list/grid (OpenPanel pattern)

2. **After onboarding** → Redirect to `/:org/:projectId` (newly created project)

3. **Root `/` path** → OpenPanel logic:
   - No org → `/onboarding`
   - One org → `/:org` (which may auto-redirect if 1 project)
   - Multiple orgs → Org picker (future feature)

4. **Keep `isDefault` flag** → Use for backend/API defaults, NOT for navigation

### Why This Hybrid?

**Benefits:**
- ✅ Convenience for 90% of users (single project = instant access)
- ✅ Clear project picker for multi-project users
- ✅ URL-based state (no localStorage needed)
- ✅ Browser history works naturally

**Difference from OpenPanel:**
- OpenPanel: Always shows project list, even for 1 project
- Us: Auto-redirect for 1 project (saves a click for most users)

## Answers to Key Questions

1. **Default Project**: ✅ Yes, created during onboarding, but NO special "default" behavior
2. **Migration**: ✅ No migration needed (nullable + auto-assign in UI)
3. **URL Params**: ✅ Use project **ID** (OpenPanel pattern)
4. **Project Context**: ✅ URL-based (extract from route params)
5. **Permissions**: ⏭️ Later (start with org-level permissions)
6. **Organization Index**: ✅ Shows project list (not auto-redirect)

## Next Steps

1. ✅ ~~Review schema~~ - Already good
2. ✅ ~~Decide on migration~~ - No migration needed
3. ✅ ~~Create useAppParams hook~~ - Done
4. ✅ ~~Update LayoutProjectSelector~~ - Done (with AddProject modal)
5. ✅ ~~Update `/:org` index route~~ - Hybrid approach implemented (auto-redirect if 1 project)
6. ✅ ~~Update `/` root route~~ - Already correct (redirects to /:org)
7. ▶️ **Update onboarding** → Redirect to `/:org/:projectId` after completion
8. ▶️ **Migrate routes** to project-scoped structure (`/:org/:project/*`)
9. ▶️ **Update device queries** to filter by projectId from URL

## Implementation Status (Latest)

### ✅ Completed (Current Session)

**Organization Index Route** (`_app.$organizationId.index.tsx`):
- Implemented smart auto-redirect: 1 project → auto to `/:org/:projectId`
- Created project list UI: 2+ projects → grid view with cards
- Empty state: 0 projects → "Create Project" CTA
- Uses `getOrganizationProjects()` server function in loader

**Project Creation Modal** (`AddProject.tsx`):
- Full form: name, domain (optional), description (optional)
- Server function: `createProjectData()` with validation
- Success toast with "View project" action
- Invalidates projects query on success

**Project Selector Component** (`LayoutProjectSelector.tsx`):
- Shows organization name + current project name
- Navigate to project dashboard on project selection
- "Create new project" triggers AddProject modal
- Uses `useAppParams()` to get active project from URL

**URL-Based Project Context** (`useAppParams.ts`):
- Simple hook extracting org/project from URL
- No localStorage/cookies needed
- URL is the single source of truth

### ⏭️ Next Up

**Route Migration:**
- Move assets/scans/devices to `/:org/:project/*` structure
- Create `_app.$organizationId.$projectId.tsx` layout route
- Update all navigation links to include projectId

**Data Layer:**
- Update device queries to filter by projectId from URL
- Update onboarding to redirect to `/:org/:projectId`
- Ensure all server functions use projectId context
