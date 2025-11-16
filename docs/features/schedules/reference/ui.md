# UI Workflow

> References: `apps/user-application/src/queries/schedule-queries.ts#L12-L264`, `apps/user-application/src/routes/api/internal/schedules/can-execute.tsx#L1-L110`, legacy admin interface `legacy/app/back/footprint_app/admin/scheduler.py#L40-L175`.

## React Query Adapters

- `useSchedulesQuery` / `useDeviceSchedulesQuery` wrap the server functions exposed in `schedules.ts`, filtering out soft-deleted rows (`schedule-queries.ts#L31-L90`).
- Mutation hooks (`useCreateSchedule`, `usePauseSchedule`, `useResumeSchedule`, `useDeleteSchedule`) provide optimistic updates and undo capability (`schedule-queries.ts#L107-L264`).

## Internal API Routes

- `routes/api/internal/schedules/can-execute.tsx` and `release-slot.tsx` expose lightweight endpoints used by Restate workers to ask “may I scan now?” and to release leases after completion. These routes enforce organization scoping, mirroring the server functions but optimized for worker-to-app traffic.

## Legacy UX Notes

The legacy Django admin exposed schedule controls through a bespoke admin panel (`admin/scheduler.py`). Our React flow retains similar actions—create, pause, resume, delete—while leveraging optimistic client state instead of server-rendered templates.
