# Data Model

This document describes the core data model hierarchy for the security scanning platform.

## Entity Hierarchy

```
Organization
  └── Project (1..*)
        └── Device (1..*)
```

### Organization

The top-level tenant entity for multi-tenant isolation.

- **Purpose**: Represents a customer/company using the platform
- **Database**: `organization` table
- **Future**: May support multiple users per organization

### Project

A logical grouping of devices within an organization.

- **Purpose**: Organize devices by deployment, environment, or business unit
- **Database**: `projects` table
- **Relationship**: Multiple projects per organization
- **Example**: "Production Infrastructure", "Staging Environment", "Remote Offices"

### Device

A scannable target (IP address, hostname, or network range).

- **Purpose**: Represents a single host or network asset to be scanned
- **Database**: `devices` table
- **Relationship**: Multiple devices per project
- **Identifier**: `deviceId` (CUID)

## Data Model in Practice

### Onboarding Flow

During onboarding (`apps/user-application/src/routes/onboarding/project.tsx`):

1. User creates an **organization**
2. User creates a **project** (represented as a device during onboarding)
3. Devices are added to the project

**Note**: Projects are also represented as devices in some contexts. See line 54 of `onboarding/project.tsx`:

```tsx
deviceId={onboarding.projectId}
```

### Workflow Execution

When executing a scan workflow:

- **Input**: Only `deviceId` is required
- **Implicit relationships**: `deviceId` → `projectId` → `organizationId`
- **Benefit**: Simplified interface - single identifier carries full context

### Database Schema

Reference: `packages/data-ops/src/schema/inventory.ts`

```typescript
export const devices = sqliteTable('devices', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id),
  // ... other fields
});
```

## Postback Pattern

When the worker posts scan results back to the server (`src/workflows/shared/activities/postback.ts`):

```typescript
export interface PostbackPayload {
  callbackUrl: string;
  deviceId: string;      // ✅ Single identifier sufficient
  workflowId: string;
  results: any;
}
```

**Why only `deviceId`?**

The server can resolve the full hierarchy from `deviceId`:

1. Query `devices` table with `deviceId`
2. Join to get `projectId` from device
3. Join to get `organizationId` from project

This keeps the worker interface simple and prevents data inconsistency (e.g., passing mismatched `organizationId` + `deviceId`).

## Future Extensions

### User Management

Future support for multiple users per organization:

```
Organization
  ├── User (1..*)       // Future
  └── Project (1..*)
        └── Device (1..*)
```

### Access Control

When implementing RBAC:

- Users belong to organizations
- Permissions granted at organization or project level
- Devices inherit permissions from project

## Migration Notes

This codebase previously used `tenantId` instead of `organizationId`. All references have been updated to use the correct field name from the database schema.

**Incorrect (legacy)**:

```typescript
interface PostbackPayload {
  tenantId: string;  // ❌ Wrong
}
```

**Correct (current)**:

```typescript
interface PostbackPayload {
  deviceId: string;  // ✅ Correct
}
```
