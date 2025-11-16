# Project Operations Reference

**Project Operations:**

- **Create (Onboarding + Standalone)**:
  - Onboarding path calls `trpc.onboarding.createProject` (`apps/user-application/src/trpc/routers/onboarding.ts:379`), which verifies organization access with `validateOrganizationAccess` before delegating.
  - Standalone project creation uses `trpc.project.create` (`apps/user-application/src/trpc/routers/project.ts:33`), sharing the same access check and logging.
  - Both routes persist through `createProject` in data-ops (`packages/data-ops/src/queries/projects.ts:23`), inserting the record with optional domain/description/isDefault.
  - React mutations (`useCreateProjectMutation` and `useOrganizationLifecycle`) invoke the same procedure and invalidate organization caches (`apps/user-application/src/queries/organization-mutations.ts:35`, `apps/user-application/src/features/onboarding/hooks/use-organization-lifecycle.ts:104`).

- **Update (Rename / Domain tweaks)**:
  - Onboarding updates reuse `trpc.onboarding.createProject` with an existing `projectId` (`apps/user-application/src/trpc/routers/onboarding.ts:406`), switching to the update branch when the ID is provided.
  - Updates persist via `updateProject` in data-ops (`packages/data-ops/src/queries/projects.ts:155`), scoped by organizationId to prevent cross-tenant edits.
  - Mutation hook `useOrganizationLifecycle` handles optimistic UX for onboarding edits; add a dedicated `useUpdateProjectMutation` here if standalone editing is introduced.

- **Read / Guard Access**:
  - Project layout loader (`apps/user-application/src/routes/_app.$organizationId.$projectId.tsx:64`) fetches organization first, then validates project membership via `trpc.project.get` (`apps/user-application/src/trpc/routers/project.ts:10`) which calls `validateProjectAccess`.
  - Sidebar/project lists use `trpc.project.listByOrg` (`apps/user-application/src/trpc/routers/project.ts:49`) pulling from `getProjectsForOrganization` (`packages/data-ops/src/queries/projects.ts:87`).
  - `ProjectGate` component exposes loader data through context (`apps/user-application/src/components/layout/project-gate.tsx:27`), and `useProject()` enforces usage inside scoped routes.
  - Helpers `validateProjectAccess` and `getOrganizationIdFromProject` (dropped into multiple routers/postbacks) are the single source of truth for slug→ID resolution and membership (`packages/data-ops/src/queries/projects.ts:214`, `:72`).

- **Delete (Data layer ready)**:
  - `deleteProject` exists in data-ops (`packages/data-ops/src/queries/projects.ts:179`) removing a project scoped to an organization; no tRPC endpoint yet.
  - When exposing deletion, mirror the create pattern: validate with `validateOrganizationAccess`, call `deleteProject`, then invalidate project/organization caches.

Reference this sheet when adjusting project scoped behaviours to ensure loaders, mutations, and access guards stay aligned across UI → tRPC → data-ops.
