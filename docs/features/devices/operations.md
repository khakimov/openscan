# Device Operations Reference

**Device Operations:**

- **Create (Discovery import)**:
  - Validate payload in `apps/user-application/src/trpc/routers/device.ts:538` (`createFromDiscovery`), ensuring each target has a host and the caller can access the project/organization.
  - Resolve organization/project ownership via `getOrganizationIdFromProject` and `validateProjectAccess` (`apps/user-application/src/trpc/routers/device.ts:553`).
  - Deduplicate and insert records with `createMultipleDevicesFromDiscovery` (`packages/data-ops/src/queries/devices.ts:626`), which skips existing name/IP pairs and writes the primary IP.
  - Transform database rows for the client using `transformDeviceForUI` before returning (`apps/user-application/src/trpc/routers/device.ts:590`).
  - Client hook `useCreateDevicesFromDiscoveryMutation` (`apps/user-application/src/queries/device-queries.ts:252`) calls the procedure, invalidates `deviceQueries.list.base`, and refreshes onboarding/discovery caches.

- **Delete**:
  - `trpc.device.remove` (`apps/user-application/src/trpc/routers/device.ts:276`) enforces session auth, verifies ownership with `getDeviceById`, and aborts with `NOT_FOUND` if missing.
  - Physical delete executes through `deleteDevice` (`packages/data-ops/src/queries/devices.ts:570`), scoped by organizationId to prevent cross-tenant removal.
  - `useDeleteDeviceMutation` (`apps/user-application/src/queries/device-queries.ts:114`) performs the mutation with optimistic cache removal via `createOptimisticDeleteHandlers` (`apps/user-application/src/lib/optimistic-updates.ts:30`) and invalidates `deviceQueries.list.base` on settle.

- **Update**:
  - `trpc.device.update` (`apps/user-application/src/trpc/routers/device.ts:302`) zod-validates allowed fields (name, ip, scope, tags, notes) and ensures the caller belongs to the device’s organization.
  - Storage layer `updateDevice` (`packages/data-ops/src/queries/devices.ts:676`) writes device fields, replaces primary IP, and rebuilds tag associations atomically before reloading via `getDeviceById`.
  - `useUpdateDeviceMutation` (`apps/user-application/src/queries/device-queries.ts:134`) surfaces success toasts, invalidates `deviceQueries.list.base`, `deviceQueries.detail.key(deviceId)`, and tag suggestions to keep UI in sync.

Use this cheat sheet as the single entry point when modifying device create/update/delete flows; adjust the referenced files if signatures change so future migrations remain traceable.
