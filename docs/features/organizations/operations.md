# Organization Operations Reference

**Organization Operations:**

- **Create (Onboarding step)**:
  - Validate payload and session in `trpc.onboarding.createOrganization` (`apps/user-application/src/trpc/routers/onboarding.ts:283`), logging user context and normalising slug/timezone.
  - Call Better Auth via `getOrganizationAPI().createOrganization` (`apps/user-application/src/trpc/routers/onboarding.ts:299`), passing request headers so the auth plugin captures the session.
  - Immediately set the active organization with `orgAPI.setActiveOrganization` to update the session token (`apps/user-application/src/trpc/routers/onboarding.ts:317`).
  - Return normalized metadata (handles string/object forms) for callers (`apps/user-application/src/trpc/routers/onboarding.ts:329`).
  - UI mutations:
    - `useCreateOrganizationMutation` surfaces success toasts and invalidates onboarding caches (`apps/user-application/src/queries/organization-mutations.ts:23`).
    - `useOrganizationLifecycle` auto-creates organizations during onboarding flows before creating the first project (`apps/user-application/src/features/onboarding/hooks/use-organization-lifecycle.ts:71`).

- **Update (Name/Timezone)**:
  - Authorization enforced in `trpc.onboarding.updateOrganization` via `validateOrganizationAccess` (`apps/user-application/src/trpc/routers/onboarding.ts:476`).
  - Persist changes through `updateOrganizationOnboarding` (updates metadata JSON) (`packages/data-ops/src/queries/organizations/onboarding.ts:27`).
  - Mutation hook `useUpdateOrganizationMutation` invalidates organization lists plus onboarding status cache (`apps/user-application/src/queries/organization-mutations.ts:54`).
  - Onboarding hook reuses the same procedure when editing an existing org (`apps/user-application/src/features/onboarding/hooks/use-organization-lifecycle.ts:88`).

- **List / Select Active**:
  - `trpc.organization.list` fetches all orgs for the current session through Better Auth (`apps/user-application/src/trpc/routers/organization.ts:33`), normalizing metadata strings.
  - Data access uses `getOrganizationAPI().listOrganizations` (`packages/data-ops/src/auth/organization-api.ts:35`) with request headers so the auth plugin reads the session token.
  - Active organization resolution happens in the shared tRPC context: if the session lacks `activeOrganizationId`, it auto-selects the first org and persists it via `setActiveOrganization` (`apps/user-application/src/trpc/context.ts:30`).
  - Utility `getActiveOrganizationId` exposes the same behaviour to other server utilities (`packages/data-ops/src/auth/organization-api.ts:79`).
  - Keep sidebar/session-aware routes in sync by relying on the `organization.list` loader (see `_app.$organizationId.tsx`) which uses the tRPC result directly.

Use this guide whenever changing organization onboarding, metadata updates, or session resolution. Update the cited locations as code moves so both new and existing developers have an accurate UI → tRPC → data-ops map.
