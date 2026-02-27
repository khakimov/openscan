# Organization
---
## Overview

The organization plugin allows you to manage your organization's members and teams. It simplifies access and permissions management with role assignments that streamline project execution, collaboration, and partnerships.

---

## Installation

### Step 1: Add the plugin to your auth config

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization(),
  ],
});
```

### Step 2: Migrate the database

Run the migration or generate the schema to add the necessary fields and tables to the database.

```bash
# Migrate
npx @better-auth/cli migrate

# or generate
npx @better-auth/cli generate
```

See the schema section below if you prefer to add the fields manually.

### Step 3: Add the client plugin

```ts
// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
  ],
});
```

---

## Usage

Once installed you can manage organization members and teams via the `auth.api` server endpoints or the `authClient.organization` client helpers.

---

## Organization

### Create an organization

#### Client side

```ts
const { data, error } = await authClient.organization.create({
  name: "My Organization",
  slug: "my-org",
  logo: "https://example.com/logo.png",
  metadata: {},
  userId: "some_user_id",
  keepCurrentActiveOrganization: false,
});
```

#### Server side

```ts
const data = await auth.api.createOrganization({
  body: {
    name: "My Organization",
    slug: "my-org",
    logo: "https://example.com/logo.png",
    metadata: {},
    userId: "some_user_id",
    keepCurrentActiveOrganization: false,
  },
  headers: await headers(), // requires session cookies
});
```

#### Type definition

```ts
type createOrganization = {
  /**
   * The organization name.
   * @default "My Organization"
   */
  name: string;
  /**
   * The organization slug.
   * @default "my-org"
   */
  slug: string;
  /**
   * The organization logo URL.
   * @default "https://example.com/logo.png"
   */
  logo?: string;
  /**
   * Arbitrary metadata for the organization.
   */
  metadata?: Record<string, any>;
  /**
   * The user ID of the organization creator. Falls back to the current user.
   * @serverOnly
   */
  userId?: string;
  /**
   * Keep the current active organization after creating a new one.
   * @default false
   */
  keepCurrentActiveOrganization?: boolean;
};
```

#### Restrict who can create an organization

By default any user can create an organization. Supply `allowUserToCreateOrganization` as a boolean or an async function to restrict access.

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

const auth = betterAuth({
  plugins: [
    organization({
      allowUserToCreateOrganization: async (user) => {
        const subscription = await getSubscription(user.id);
        return subscription.plan === "pro";
      },
    }),
  ],
});
```

#### Check if a slug is taken

```ts
// Client
const { data, error } = await authClient.organization.checkSlug({
  slug: "my-org",
});

// Server
const data = await auth.api.checkOrganizationSlug({
  body: { slug: "my-org" },
});
```

```ts
type checkOrganizationSlug = {
  /**
   * The organization slug to check.
   * @default "my-org"
   */
  slug: string;
};
```

### Organization hooks

Hooks let you run code before and after organization operations.

#### Organization creation and management hooks

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization({
      organizationHooks: {
        beforeCreateOrganization: async ({ organization, user }) => {
          return {
            data: {
              ...organization,
              metadata: {
                customField: "value",
              },
            },
          };
        },
        afterCreateOrganization: async ({ organization }) => {
          await setupDefaultResources(organization.id);
        },
        beforeUpdateOrganization: async ({ organization }) => {
          return {
            data: {
              ...organization,
              name: organization.name?.toLowerCase(),
            },
          };
        },
        afterUpdateOrganization: async ({ organization }) => {
          await syncOrganizationToExternalSystems(organization);
        },
      },
    }),
  ],
});
```

> Legacy `organizationCreation` hooks are still supported but deprecated. Prefer `organizationHooks`.

#### Member hooks

```ts
// auth.ts
export const auth = betterAuth({
  plugins: [
    organization({
      organizationHooks: {
        beforeAddMember: async ({ member, user, organization }) => {
          console.log(`Adding ${user.email} to ${organization.name}`);
          return {
            data: {
              ...member,
              role: "custom-role",
            },
          };
        },
        afterAddMember: async ({ user, organization }) => {
          await sendWelcomeEmail(user.email, organization.name);
        },
        beforeRemoveMember: async ({ user, organization }) => {
          await cleanupUserResources(user.id, organization.id);
        },
        afterRemoveMember: async ({ user, organization }) => {
          await logMemberRemoval(user.id, organization.id);
        },
        beforeUpdateMemberRole: async ({
          newRole,
          user,
        }) => {
          if (newRole === "owner" && !hasOwnerUpgradePermission(user)) {
            throw new Error("Cannot upgrade to owner role");
          }
          return {
            data: { role: newRole },
          };
        },
        afterUpdateMemberRole: async ({ member, previousRole, user }) => {
          await logRoleChange(user.id, previousRole, member.role);
        },
      },
    }),
  ],
});
```

#### Invitation hooks

```ts
// auth.ts
export const auth = betterAuth({
  plugins: [
    organization({
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation }) => {
          const customExpiration = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
          return {
            data: {
              ...invitation,
              expiresAt: customExpiration,
            },
          };
        },
        afterCreateInvitation: async ({ invitation, organization }) => {
          await sendCustomInvitationEmail(invitation, organization);
        },
        beforeAcceptInvitation: async ({ user, organization }) => {
          await validateUserEligibility(user, organization);
        },
        afterAcceptInvitation: async ({ user, organization }) => {
          await setupNewMemberResources(user, organization);
        },
        beforeRejectInvitation: async () => {
          // Optional: log rejection intent
        },
        afterRejectInvitation: async ({ invitation, user }) => {
          await notifyInviterOfRejection(invitation.inviterId, user.email);
        },
        beforeCancelInvitation: async () => {
          // Optional permission checks
        },
        afterCancelInvitation: async ({ invitation, cancelledBy }) => {
          await logInvitationCancellation(invitation.id, cancelledBy.id);
        },
      },
    }),
  ],
});
```

#### Team hooks

```ts
// auth.ts
export const auth = betterAuth({
  plugins: [
    organization({
      teams: { enabled: true },
      organizationHooks: {
        beforeCreateTeam: async ({ team }) => {
          return {
            data: {
              ...team,
              name: team.name.toLowerCase().replace(/\s+/g, "-"),
            },
          };
        },
        afterCreateTeam: async ({ team }) => {
          await createDefaultTeamResources(team.id);
        },
        beforeUpdateTeam: async ({ updates }) => {
          return {
            data: {
              ...updates,
              name: updates.name?.toLowerCase(),
            },
          };
        },
        afterUpdateTeam: async ({ team }) => {
          await syncTeamChangesToExternalSystems(team);
        },
        beforeDeleteTeam: async ({ team }) => {
          await backupTeamData(team.id);
        },
        afterDeleteTeam: async ({ team }) => {
          await cleanupTeamResources(team.id);
        },
        beforeAddTeamMember: async ({ team }) => {
          const memberCount = await getTeamMemberCount(team.id);
          if (memberCount >= 10) {
            throw new Error("Team is full");
          }
        },
        afterAddTeamMember: async ({ user, team }) => {
          await grantTeamAccess(user.id, team.id);
        },
        beforeRemoveTeamMember: async ({ user, team }) => {
          await backupTeamMemberData(user.id, team.id);
        },
        afterRemoveTeamMember: async ({ user, team }) => {
          await revokeTeamAccess(user.id, team.id);
        },
      },
    }),
  ],
});
```

#### Hook error handling

Throwing in a `before` hook prevents the operation from completing.

```ts
// auth.ts
import { APIError } from "better-auth/api";

export const auth = betterAuth({
  plugins: [
    organization({
      organizationHooks: {
        beforeAddMember: async ({ user }) => {
          const violations = await checkUserViolations(user.id);
          if (violations.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message:
                "User has pending violations and cannot join organizations",
            });
          }
        },
        beforeCreateTeam: async ({ team, organization }) => {
          const existingTeam = await findTeamByName(team.name, organization.id);
          if (existingTeam) {
            throw new APIError("BAD_REQUEST", {
              message: "Team name already exists in this organization",
            });
          }
        },
      },
    }),
  ],
});
```

---

## List a user's organizations

Use the `useListOrganizations` hook for reactive access.

```tsx
// React
import { authClient } from "@/lib/auth-client";

function App() {
  const { data: organizations } = authClient.useListOrganizations();
  return (
    <div>
      {organizations?.map((org) => (
        <p key={org.id}>{org.name}</p>
      ))}
    </div>
  );
}
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { authClient } from "$lib/auth-client";
  const organizations = authClient.useListOrganizations();
</script>

{#if $organizations.isPending}
<p>Loading...</p>
{:else if !$organizations.data?.length}
<p>No organizations found.</p>
{:else}
  <ul>
    {#each $organizations.data as organization}
      <li>{organization.name}</li>
    {/each}
  </ul>
{/if}
```

```vue
<!-- Vue -->
<script lang="ts">
export default {
  setup() {
    const organizations = authClient.useListOrganizations();
    return { organizations };
  },
};
</script>

<template>
  <div>
    <h1>Organizations</h1>
    <div v-if="organizations.isPending">Loading...</div>
    <div v-else-if="organizations.data === null">No organizations found.</div>
    <ul v-else>
      <li v-for="organization in organizations.data" :key="organization.id">
        {{ organization.name }}
      </li>
    </ul>
  </div>
</template>
```

Alternatively call `organization.list`:

```ts
// Client
const { data, error } = await authClient.organization.list({});

// Server
const data = await auth.api.listOrganizations({
  headers: await headers(), // requires session cookies
});
```

---

## Active organization

The active organization represents the user's current workspace. It defaults to `null` when a session starts.

> You can manage the active organization purely on the client if you prefer per-tab state. Persisting in the session is optional.

### Set active organization

```ts
// Client
const { data, error } = await authClient.organization.setActive({
  organizationId: "org-id",
  organizationSlug: "org-slug",
});

// Server
const data = await auth.api.setActiveOrganization({
  body: {
    organizationId: "org-id",
    organizationSlug: "org-slug",
  },
});
```

```ts
type setActiveOrganization = {
  /**
   * Organization ID to set active. Use `null` to unset.
   */
  organizationId?: string | null;
  /**
   * Organization slug to set active. Supports null for unsetting.
   */
  organizationSlug?: string | null;
};
```

Set the active organization during session creation with database hooks:

```ts
// auth.ts
export const auth = betterAuth({
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const organization = await getActiveOrganization(session.userId);
          return {
            data: {
              ...session,
              activeOrganizationId: organization.id,
            },
          };
        },
      },
    },
  },
});
```

### Use active organization

```tsx
// React
import { authClient } from "@/lib/auth-client";

function App() {
  const { data: activeOrganization } = authClient.useActiveOrganization();
  return (
    <div>{activeOrganization ? <p>{activeOrganization.name}</p> : null}</div>
  );
}
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { authClient } from "$lib/auth-client";
  const activeOrganization = authClient.useActiveOrganization();
</script>

{#if $activeOrganization.isPending}
<p>Loading...</p>
{:else if $activeOrganization.data === null}
<p>No active organization found.</p>
{:else}
<p>{$activeOrganization.data.name}</p>
{/if}
```

```vue
<!-- Vue -->
<script lang="ts">
export default {
  setup() {
    const activeOrganization = authClient.useActiveOrganization();
    return { activeOrganization };
  },
};
</script>

<template>
  <div>
    <h2>Active organization</h2>
    <div v-if="activeOrganization.isPending">Loading...</div>
    <div v-else-if="activeOrganization.data === null">
      No active organization.
    </div>
    <div v-else>
      {{ activeOrganization.data.name }}
    </div>
  </div>
</template>
```

---

## Get full organization

```ts
// Client
const { data, error } = await authClient.organization.getFullOrganization({
  organizationId: "org-id",
  organizationSlug: "org-slug",
  membersLimit: 100,
});

// Server
const data = await auth.api.getFullOrganization({
  query: {
    organizationId: "org-id",
    organizationSlug: "org-slug",
    membersLimit: 100,
  },
  headers: await headers(),
});
```

```ts
type getFullOrganization = {
  organizationId?: string;
  organizationSlug?: string;
  membersLimit?: number;
};
```

---

## Update organization

```ts
// Client
const { data, error } = await authClient.organization.update({
  data: {},
  name: "updated-name",
  slug: "updated-slug",
  logo: "https://example.com/new-logo.png",
  metadata: {},
});

// Server
const data = await auth.api.updateOrganization({
  body: {
    data: {},
    name: "updated-name",
    slug: "updated-slug",
    logo: "https://example.com/new-logo.png",
    metadata: {},
  },
  headers: await headers(),
});
```

```ts
type updateOrganization = {
  data: {
    name?: string;
    slug?: string;
    logo?: string;
    metadata?: Record<string, any> | null;
  };
};
```

---

## Delete organization

```ts
// Client
const { data, error } = await authClient.organization.delete({
  organizationId: "org-id",
});

// Server
const data = await auth.api.deleteOrganization({
  body: { organizationId: "org-id" },
  headers: await headers(),
});
```

```ts
type deleteOrganization = {
  organizationId: string;
};
```

> Only users with the necessary permissions (owner by default) can delete an organization. Members, invitations, and related data are removed. Configure deletion behavior via `organizationDeletion` options.

```ts
const auth = betterAuth({
  plugins: [
    organization({
      disableOrganizationDeletion: true,
      organizationHooks: {
        beforeDeleteOrganization: async (data, request) => {
          // run before deleting
        },
        afterDeleteOrganization: async (data, request) => {
          // run after deleting
        },
      },
    }),
  ],
});
```

---

## Invitations

### Setup invitation email

Provide `sendInvitationEmail` so invitations can be delivered.

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { sendOrganizationInvitation } from "./email";

export const auth = betterAuth({
  plugins: [
    organization({
      async sendInvitationEmail(data) {
        const inviteLink = `https://example.com/accept-invitation/${data.id}`;
        await sendOrganizationInvitation({
          email: data.email,
          invitedByUsername: data.inviter.user.name,
          invitedByEmail: data.inviter.user.email,
          teamName: data.organization.name,
          inviteLink,
        });
      },
    }),
  ],
});
```

### Send invitation

```ts
// Client
const { data, error } = await authClient.organization.inviteMember({
  email: "example@gmail.com",
  role: "member",
  organizationId: "org-id",
  resend: true,
  teamId: "team-id",
});

// Server
const data = await auth.api.createInvitation({
  body: {
    email: "example@gmail.com",
    role: "member",
    organizationId: "org-id",
    resend: true,
    teamId: "team-id",
  },
});
```

```ts
type createInvitation = {
  email: string;
  role: string | string[];
  organizationId?: string;
  resend?: boolean;
  teamId?: string;
};
```

> If the user is already a member the invitation is cancelled. If they were already invited it is not resent unless `resend` is `true`. Set `cancelPendingInvitationsOnReInvite` to `true` to cancel previous invitations automatically.

### Accept invitation

```ts
// Client
const { data, error } = await authClient.organization.acceptInvitation({
  invitationId: "invitation-id",
});

// Server
const data = await auth.api.acceptInvitation({
  body: { invitationId: "invitation-id" },
});
```

```ts
type acceptInvitation = {
  invitationId: string;
};
```

> Enable `requireEmailVerificationOnInvitation` to require verified emails before accepting invitations.

```ts
export const auth = betterAuth({
  plugins: [
    organization({
      requireEmailVerificationOnInvitation: true,
      async sendInvitationEmail(data) {
        // custom email logic
      },
      async onInvitationAccepted(data) {
        // triggered when invitation is accepted
      },
    }),
  ],
});
```

### Cancel invitation

```ts
// Client
const { data, error } = await authClient.organization.cancelInvitation({
  invitationId: "invitation-id",
});

// Server
await auth.api.cancelInvitation({
  body: { invitationId: "invitation-id" },
});
```

```ts
type cancelInvitation = {
  invitationId: string;
};
```

### Reject invitation

```ts
// Client
const { data, error } = await authClient.organization.rejectInvitation({
  invitationId: "invitation-id",
});

// Server
await auth.api.rejectInvitation({
  body: { invitationId: "invitation-id" },
});
```

```ts
type rejectInvitation = {
  invitationId: string;
};
```

> Email verification is also required here when `requireEmailVerificationOnInvitation` is enabled.

### Get invitation

```ts
// Client
const { data, error } = await authClient.organization.getInvitation({
  id: "invitation-id",
});

// Server
const data = await auth.api.getInvitation({
  query: { id: "invitation-id" },
  headers: await headers(),
});
```

```ts
type getInvitation = {
  id: string;
};
```

### List invitations

```ts
// Client
const { data, error } = await authClient.organization.listInvitations({
  organizationId: "organization-id",
});

// Server
const data = await auth.api.listInvitations({
  query: { organizationId: "organization-id" },
});
```

```ts
type listInvitations = {
  organizationId?: string;
};
```

### List user invitations

```ts
// Client
const invitations = await authClient.organization.listUserInvitations();

// Server
const invitations = await auth.api.listUserInvitations({
  query: {
    email: "user@example.com",
  },
});
```

> The `email` query parameter is server-only for requesting invitations of another user.

---

## Members

### List members

```ts
// Client
const { data, error } = await authClient.organization.listMembers({
  organizationId: "organization-id",
  limit: 100,
  offset: 0,
  sortBy: "createdAt",
  sortDirection: "desc",
  filterField: "createdAt",
  filterOperator: "eq",
  filterValue: "value",
});

// Server
const data = await auth.api.listMembers({
  query: {
    organizationId: "organization-id",
    limit: 100,
    offset: 0,
    sortBy: "createdAt",
    sortDirection: "desc",
    filterField: "createdAt",
    filterOperator: "eq",
    filterValue: "value",
  },
});
```

```ts
type listMembers = {
  organizationId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterOperator?:
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "nin"
    | "contains";
  filterValue?: string;
};
```

### Remove member

```ts
// Client
const { data, error } = await authClient.organization.removeMember({
  memberIdOrEmail: "user@example.com",
  organizationId: "org-id",
});

// Server
const data = await auth.api.removeMember({
  body: {
    memberIdOrEmail: "user@example.com",
    organizationId: "org-id",
  },
});
```

```ts
type removeMember = {
  memberIdOrEmail: string;
  organizationId?: string;
};
```

### Update member role

```ts
// Client
const { data, error } = await authClient.organization.updateMemberRole({
  role: ["admin", "sale"],
  memberId: "member-id",
  organizationId: "organization-id",
});

// Server
await auth.api.updateMemberRole({
  body: {
    role: ["admin", "sale"],
    memberId: "member-id",
    organizationId: "organization-id",
  },
});
```

```ts
type updateMemberRole = {
  role: string | string[];
  memberId: string;
  organizationId?: string;
};
```

### Get active member

```ts
// Client
const { data, error } = await authClient.organization.getActiveMember({});

// Server
const member = await auth.api.getActiveMember({
  headers: await headers(),
});
```

```ts
type getActiveMember = Record<string, never>;
```

### Get active member role

```ts
// Client
const { data, error } = await authClient.organization.getActiveMemberRole({});

// Server
const { role } = await auth.api.getActiveMemberRole({
  headers: await headers(),
});
```

```ts
type getActiveMemberRole = Record<string, never>;
```

### Add member

```ts
// Client
const { data, error } = await authClient.organization.addMember({
  userId: "user-id",
  role: ["admin", "sale"],
  organizationId: "org-id",
  teamId: "team-id",
});

// Server
const data = await auth.api.addMember({
  body: {
    userId: "user-id",
    role: ["admin", "sale"],
    organizationId: "org-id",
    teamId: "team-id",
  },
});
```

```ts
type addMember = {
  userId?: string | null;
  role: string | string[];
  organizationId?: string;
  teamId?: string;
};
```

### Leave organization

```ts
// Client
const { data, error } = await authClient.organization.leave({
  organizationId: "organization-id",
});

// Server
await auth.api.leaveOrganization({
  body: { organizationId: "organization-id" },
  headers: await headers(),
});
```

```ts
type leaveOrganization = {
  organizationId: string;
};
```

---

## Access control

The organization plugin includes a flexible access control system. By default there are three roles:

- `owner` – full control.
- `admin` – full control except deleting the organization or changing ownership.
- `member` – limited control, mostly read-only with project creation permissions.

Default resources and actions include:

- `organization`: `update`, `delete`
- `member`: `create`, `update`, `delete`
- `invitation`: `create`, `cancel`

> Users may hold multiple roles stored as comma-separated strings.

### Custom permissions

Create your own statement, roles, and register them with the plugin.

```ts
// permissions.ts
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  project: ["create", "share", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
  project: ["create"],
});

export const admin = ac.newRole({
  project: ["create", "update"],
});

export const owner = ac.newRole({
  project: ["create", "update", "delete"],
});

export const myCustomRole = ac.newRole({
  project: ["create", "update", "delete"],
  organization: ["update"],
});
```

When extending default roles merge the shipped statements.

```ts
// permissions.ts
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  project: ["create", "share", "update", "delete"],
} as const;

const ac = createAccessControl(statement);

const admin = ac.newRole({
  project: ["create", "update"],
  ...adminAc.statements,
});
```

Pass the roles to the server and client plugins.

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { ac, owner, admin, member, myCustomRole } from "@/auth/permissions";

export const auth = betterAuth({
  plugins: [
    organization({
      ac,
      roles: {
        owner,
        admin,
        member,
        myCustomRole,
      },
    }),
  ],
});
```

```ts
// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { ac, owner, admin, member, myCustomRole } from "@/auth/permissions";

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: {
        owner,
        admin,
        member,
        myCustomRole,
      },
    }),
  ],
});
```

### Access control usage

Check permissions on the server:

```ts
// api.ts
import { auth } from "@/auth";

await auth.api.hasPermission({
  headers: await headers(),
  body: {
    permissions: {
      project: ["create"],
      sale: ["create"],
    },
  },
});
```

Check permissions on the client:

```ts
const canCreateProject =
  await authClient.organization.hasPermission({
    permissions: {
      project: ["create"],
    },
  });
```

Check role permissions synchronously:

```ts
const canDeleteOrganization =
  authClient.organization.checkRolePermission({
    permissions: {
      organization: ["delete"],
      member: ["delete"],
    },
    role: "admin",
  });
```

> Dynamic roles created at runtime are not reflected in `checkRolePermission`. Use `hasPermission` when runtime roles are involved.

---

## Dynamic access control

Enable runtime role creation by turning on `dynamicAccessControl` on both server and client.

```ts
// auth.ts
import { ac } from "@/auth/permissions";

export const auth = betterAuth({
  plugins: [
    organization({
      ac,
      dynamicAccessControl: {
        enabled: true,
      },
    }),
  ],
});
```

```ts
// auth-client.ts
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      dynamicAccessControl: {
        enabled: true,
      },
    }),
  ],
});
```

> Enabling this requires migrations that add the `organizationRole` table.

### Create a role

```ts
// Client
const { data, error } = await authClient.organization.createRole({
  role: "my-unique-role",
  permission: {
    project: ["create"],
  },
  organizationId: "organization-id",
});

// Server
await auth.api.createOrgRole({
  body: {
    role: "my-unique-role",
    permission: {
      project: ["create"],
    },
    organizationId: "organization-id",
  },
  headers: await headers(),
});
```

```ts
type createOrgRole = {
  role: string;
  permission?: Record<string, string[]>;
  organizationId?: string;
};
```

### Delete a role

```ts
// Client
const { data, error } = await authClient.organization.deleteRole({
  roleName: "my-role",
  roleId: "role-id",
  organizationId: "organization-id",
});

// Server
await auth.api.deleteOrgRole({
  body: {
    roleName: "my-role",
    roleId: "role-id",
    organizationId: "organization-id",
  },
  headers: await headers(),
});
```

```ts
type deleteOrgRole = {
  roleName?: string;
  roleId?: string;
  organizationId?: string;
};
```

### List roles

```ts
// Client
const { data, error } = await authClient.organization.listRoles({
  organizationId: "organization-id",
});

// Server
const roles = await auth.api.listOrgRoles({
  query: { organizationId: "organization-id" },
  headers: await headers(),
});
```

```ts
type listOrgRoles = {
  organizationId?: string;
};
```

### Get a specific role

```ts
// Client
const { data, error } = await authClient.organization.getRole({
  roleName: "my-role",
  roleId: "role-id",
  organizationId: "organization-id",
});

// Server
const role = await auth.api.getOrgRole({
  query: {
    roleName: "my-role",
    roleId: "role-id",
    organizationId: "organization-id",
  },
  headers: await headers(),
});
```

```ts
type getOrgRole = {
  roleName?: string;
  roleId?: string;
  organizationId?: string;
};
```

### Update a role

```ts
// Client
const { data, error } = await authClient.organization.updateRole({
  roleName: "my-role",
  roleId: "role-id",
  organizationId: "organization-id",
  data: {
    permission: {
      project: ["create", "update", "delete"],
    },
  },
});

// Server
const updatedRole = await auth.api.updateOrgRole({
  body: {
    roleName: "my-role",
    roleId: "role-id",
    organizationId: "organization-id",
    data: {
      permission: {
        project: ["create", "update", "delete"],
      },
    },
  },
  headers: await headers(),
});
```

```ts
type updateOrgRole = {
  roleName?: string;
  roleId?: string;
  organizationId?: string;
  data: {
    permission?: Record<string, string[]>;
  };
};
```

### Dynamic access control options

- `enabled`: `true` to enable the feature.
- `maximumRolesPerOrganization`: limit role count per organization. Accepts a number or async function.
- `additionalFields`: extend `organizationRole` with custom columns.

```ts
organization({
  dynamicAccessControl: {
    enabled: true,
    maximumRolesPerOrganization: async (organizationId) => {
      const organization = await getOrganization(organizationId);
      return organization.plan === "pro" ? 100 : 10;
    },
  },
});
```

Extend the schema:

```ts
organization({
  schema: {
    organizationRole: {
      additionalFields: {
        color: {
          type: "string",
          defaultValue: "#ffffff",
        },
      },
    },
  },
});
```

Infer additional fields in the client:

```ts
import {
  organizationClient,
  inferOrgAdditionalFields,
} from "better-auth/client/plugins";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      schema: inferOrgAdditionalFields<typeof auth>(),
    }),
  ],
});
```

---

## Teams

Enable teams to group members inside an organization.

```ts
// auth.ts
export const auth = betterAuth({
  plugins: [
    organization({
      teams: {
        enabled: true,
        maximumTeams: 10,
        allowRemovingAllTeams: false,
      },
    }),
  ],
});
```

```ts
// auth-client.ts
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
  ],
});
```

### Manage teams

#### Create team

```ts
// Client
const { data, error } = await authClient.organization.createTeam({
  name: "my-team",
  organizationId: "organization-id",
});

// Server
const data = await auth.api.createTeam({
  body: {
    name: "my-team",
    organizationId: "organization-id",
  },
});
```

```ts
type createTeam = {
  name: string;
  organizationId?: string;
};
```

#### List teams

```ts
// Client
const { data, error } = await authClient.organization.listTeams({
  query: {},
  organizationId: "organization-id",
});

// Server
const data = await auth.api.listOrganizationTeams({
  query: {
    query: {},
    organizationId: "organization-id",
  },
  headers: await headers(),
});
```

```ts
type listOrganizationTeams = {
  query?: Record<string, unknown>;
  organizationId?: string;
};
```

#### Update team

```ts
// Client
const { data, error } = await authClient.organization.updateTeam({
  teamId: "team-id",
  data: {
    name: "My new team name",
    organizationId: "organization-id",
  },
});

// Server
const data = await auth.api.updateTeam({
  body: {
    teamId: "team-id",
    data: {
      name: "My new team name",
      organizationId: "organization-id",
    },
  },
  headers: await headers(),
});
```

```ts
type updateTeam = {
  teamId: string;
  data: {
    name?: string;
    organizationId?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };
};
```

#### Remove team

```ts
// Client
const { data, error } = await authClient.organization.removeTeam({
  teamId: "team-id",
  organizationId: "organization-id",
});

// Server
const data = await auth.api.removeTeam({
  body: {
    teamId: "team-id",
    organizationId: "organization-id",
  },
});
```

```ts
type removeTeam = {
  teamId: string;
  organizationId?: string;
};
```

#### Set active team

```ts
// Client
const { data, error } = await authClient.organization.setActiveTeam({
  teamId: "team-id",
});

// Server
const data = await auth.api.setActiveTeam({
  body: {
    teamId: "team-id",
  },
});
```

```ts
type setActiveTeam = {
  teamId?: string | null;
};
```

#### List user teams

```ts
// Client
const { data, error } = await authClient.organization.listUserTeams({});

// Server
const data = await auth.api.listUserTeams({});
```

```ts
type listUserTeams = Record<string, never>;
```

#### List team members

```ts
// Client
const { data, error } = await authClient.organization.listTeamMembers({
  teamId: "team-id",
});

// Server
const data = await auth.api.listTeamMembers({
  body: {
    teamId: "team-id",
  },
});
```

```ts
type listTeamMembers = {
  teamId?: string;
};
```

#### Add team member

```ts
// Client
const { data, error } = await authClient.organization.addTeamMember({
  teamId: "team-id",
  userId: "user-id",
});

// Server
const data = await auth.api.addTeamMember({
  body: {
    teamId: "team-id",
    userId: "user-id",
  },
});
```

```ts
type addTeamMember = {
  teamId: string;
  userId: string;
};
```

#### Remove team member

```ts
// Client
const { data, error } = await authClient.organization.removeTeamMember({
  teamId: "team-id",
  userId: "user-id",
});

// Server
const data = await auth.api.removeTeamMember({
  body: {
    teamId: "team-id",
    userId: "user-id",
  },
});
```

```ts
type removeTeamMember = {
  teamId: string;
  userId: string;
};
```

> Team management requires the `team:create`, `team:update`, and `team:delete` permissions. Owners and admins have these by default.

Configure maximums dynamically:

```ts
teams: {
  enabled: true,
  maximumTeams: async ({ organizationId }) => {
    const plan = await getPlan(organizationId);
    return plan === "pro" ? 20 : 5;
  },
  maximumMembersPerTeam: async ({ teamId, organizationId }) => {
    const plan = await getPlan(organizationId, teamId);
    return plan === "pro" ? 50 : 10;
  },
}
```

When inviting members you can attach a team:

```ts
await authClient.organization.inviteMember({
  email: "user@example.com",
  role: "member",
  teamId: "team-id",
});
```

> Enabling teams adds `team` and `teamMember` tables to your database schema.

---

## Schema

The organization plugin adds the following tables.

### Organization

| Field       | Type   | Notes                                   |
| ----------- | ------ | --------------------------------------- |
| id          | string | Primary key                             |
| name        | string | Organization name                       |
| slug        | string | Unique slug                             |
| logo        | string | Optional logo URL                       |
| metadata    | string | Optional metadata JSON string           |
| createdAt   | Date   | Creation timestamp                      |

### Member

| Field           | Type   | Notes                                   |
| --------------- | ------ | --------------------------------------- |
| id              | string | Primary key                             |
| userId          | string | Foreign key to user                     |
| organizationId  | string | Foreign key to organization             |
| role            | string | Member role                             |
| createdAt       | Date   | Added timestamp                         |

### Invitation

| Field          | Type   | Notes                                   |
| -------------- | ------ | --------------------------------------- |
| id             | string | Primary key                             |
| email          | string | Invitee email                           |
| inviterId      | string | Foreign key to inviter member           |
| organizationId | string | Foreign key to organization             |
| role           | string | Role granted upon acceptance            |
| status         | string | Invitation status                       |
| expiresAt      | Date   | Expiration timestamp                    |
| teamId         | string | Optional team when teams are enabled    |

### Session

Add `activeOrganizationId` and `activeTeamId` fields to persist active context.

### Teams (optional)

| Field          | Type   | Notes                            |
| -------------- | ------ | -------------------------------- |
| id             | string | Primary key                      |
| name           | string | Team name                        |
| organizationId | string | Foreign key                      |
| createdAt      | Date   | Creation timestamp               |
| updatedAt      | Date   | Optional update timestamp        |

### Team member (optional)

| Field    | Type   | Notes                            |
| -------- | ------ | -------------------------------- |
| id       | string | Primary key                      |
| teamId   | string | Foreign key to team              |
| userId   | string | Foreign key to user              |
| createdAt| Date   | Creation timestamp               |

> Customize table names, field mappings, or add extra columns via the `schema` option. Additional fields automatically appear in the relevant API payloads when `input: true`.

```ts
const auth = betterAuth({
  plugins: [
    organization({
      schema: {
        organization: {
          modelName: "organizations",
          fields: {
            name: "title",
          },
          additionalFields: {
            myCustomField: {
              type: "string",
              input: true,
              required: false,
            },
          },
        },
      },
    }),
  ],
});
```

Infer additional fields on the client:

```ts
import {
  organizationClient,
  inferOrgAdditionalFields,
} from "better-auth/client/plugins";
import type { auth } from "@/auth";

const client = createAuthClient({
  plugins: [
    organizationClient({
      schema: inferOrgAdditionalFields<typeof auth>(),
    }),
  ],
});
```

---

## Options

- `allowUserToCreateOrganization`: boolean or function to gate organization creation. Defaults to `true`.
- `organizationLimit`: number or function to cap organizations per user. Defaults to `5`.
- `creatorRole`: `"admin"` or `"owner"`. Defaults to `"owner"`.
- `membershipLimit`: number limiting members per organization. Defaults to `100`.
- `sendInvitationEmail`: async function to send invitation emails.
- `invitationExpiresIn`: seconds the invitation remains valid. Defaults to 172800 (48h).
- `cancelPendingInvitationsOnReInvite`: boolean to cancel existing invitations. Defaults to `false`.
- `invitationLimit`: number or function limiting invitations per user. Defaults to `100`.
- `requireEmailVerificationOnInvitation`: boolean to require verified email before accepting/rejecting invitations. Defaults to `false`.
