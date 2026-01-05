## Notification Delivery Queue – Implementation Plan

### Trigger Flow (runtime sequence)

- **`changeDetector.handleDeviceEvent`** → identify new `NotificationItem`s and call `enqueueNotificationDelivery(job)` with org/device/event metadata.
- **Cloudflare Queue** receives job payload (JSON) and hands it to a consumer Worker (`notificationDeliveryWorker`).
- **`notificationDeliveryWorker`** fetches enriched notification detail via tRPC (`notification.getById`) to avoid stale payloads.
- **Channel adapters** (`sendEmailAlert`, `sendTelegramAlert`) fan out per user preference; successes/failures are logged via `logDeliveryAttempt`.

### Codebase Tasks

1. **Queue Producer**
   - Add `enqueueNotificationDelivery` helper under `apps/user-application/src/server/notifications/delivery-queue.ts`.
   - Wire helper into `changeDetector.handleDeviceEvent` (after `storeNotifications`).
2. **Delivery Preferences**
   - **Existing schema**: `organizationNotificationSettings` (Drizzle table) already stores `emailAllowedSeverities` (JSON array). Keep this as the org-level severity filter.
   - **New fields**:
     - Extend the _organization_ settings row (in `packages/data-ops/src/schema/notifications.ts`) with booleans for `emailEnabled` and `telegramEnabled` plus optional `telegramChatId`.
     - Add a per-user override table later (`userNotificationChannels`) if individual routing is needed; MVP remains org-wide.
   - Add a Drizzle migration for the new columns + default values.
   - Update `notificationRouter.preferences` Zod schema + queries to read/write the new columns.
   - Update `AccountDialog` form + optimistic mutation to persist new fields.
3. **Cloudflare Worker**
   - Reuse the existing Hono-based worker in `apps/data-service` (already part of the Cloudflare starter) instead of spinning up a brand-new service.
   - Bind a Cloudflare Queue to this worker via `wrangler.jsonc` and add a `queue` event handler that processes notification delivery jobs.
   - Keep the Hono `fetch` handler for health/debug endpoints (e.g., `/status`, `/preview`).
   - Implement per-channel adapters (`sendEmailAlert`, `sendTelegramAlert`) with retry-safe errors; share helpers between queue handler and any manual test routes.
   - Report delivery outcome back to Supabase via `notifications.recordDelivery` (new data-ops method).
4. **Data Access Support**
   - Add `getNotificationForDelivery(notificationId)` to `packages/data-ops/src/queries/notifications.ts` returning device, project, severity.
   - Add `recordNotificationDelivery` with status + channel audit trail.
5. **Observability & Ops**
   - Emit Cloudflare Worker logs with request IDs.
   - Provide runbook snippet in `docs/features/notifications/operations.md` referencing this plan once shipped.

### Email Template Pattern (Reference: `mkdirs-boilerplatehunt`)
- Templates live as React components under an `emails/` directory (e.g., `emails/reset-password.tsx`, `emails/notify-submission-to-user.tsx`).
- Each mail helper imports the JSX component and renders via Resend’s React support.
- Centralized Resend client (`src/lib/mail.ts`) exports functions such as `sendVerificationEmail`, `sendNotifySubmissionEmail`, each calling `resend.emails.send({ react: <Template/> })`.
- Environment variables used:
  - `RESEND_API_KEY`
  - `RESEND_EMAIL_FROM`
  - Optional admin targets (`RESEND_EMAIL_ADMIN`)
- Suggested adaptation (now scaffolded):
  - `apps/data-service/emails/` – houses `layout.tsx`, `components/`, and templates such as `notification-critical-port.tsx` and `notification-new-cve.tsx`.
  - `apps/data-service/src/lib/resend.ts` – wraps the Resend client with helpers `sendCriticalPortEmail` / `sendNewCveEmail`.
  - Queue handler dispatches based on `job.eventType` and reuses the helpers.

Wire Up Notification Delivery

1. Provision Cloudflare pieces
   - Create the queue: `wrangler queues create notification-delivery`.
   - Bind it in `apps/data-service/wrangler.jsonc` (already stubbed) and in environment-specific Wrangler configs.
   - Add secrets:
     `wrangler secret put RESEND_API_KEY`
     `wrangler secret put RESEND_EMAIL_FROM`
     `wrangler secret put TELEGRAM_BOT_TOKEN` (optional for now).
2. Schema + preferences

   - Extend packages/data-ops/src/schema/notifications.ts (organizationNotificationSettings) with:

     emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(true)
     telegramEnabled: integer('telegram_enabled', { mode: 'boolean' }).notNull().default(false)
     telegramChatId: text('telegram_chat_id')

   - Generate migration with Drizzle and apply.
   - Update queries in packages/data-ops/src/queries/notifications/settings.ts to read/write new columns.
   - Update notificationRouter.preferences (app router) Zod schema + resolvers to expose the new flags.
   - Extend AccountDialog form and hooks to edit the flags + chat ID (rely on optimistic mutation, base keys).

3. Queue producer in backend

   - Create apps/user-application/src/server/notifications/delivery-queue.ts:

     import { createQueueClient } from '@repo/cloudflare-queue';
     export async function enqueueNotificationDelivery(payload) { /_ call queue _/ }
     Use fetch to CF queue API or if deployed in same worker, use bindings.

   - In changeDetector.handleDeviceEvent, after storing notifications, call enqueueNotificationDelivery for each NotificationItem that meets severity/
     channel criteria (respect org settings).
   - Reuse existing notification.list data to populate payload: notificationId, organizationId, deviceId, channels.

4. Fetch notification detail in worker

   - Add helper in apps/data-service/src/index.ts:

     async function loadNotificationDetail(id: string, env: Env) {
     const response = await fetch(`${env.DATA_OPS_API_URL}/internal/notifications/${id}`);
     return response.json();
     }
     Or call a tRPC HTTP endpoint; whichever you prefer.

   - Build a render helper for email/Telegram bodies (separate module for templates).

5. Implement channel adapters
   - deliverEmail: call provider (e.g., Resend) with API key; include link back to server detail.
   - deliverTelegram: POST https://api.telegram.org/bot${token}/sendMessage with chat ID from settings.
   - Handle provider errors; throw to let queue retry.
6. Record delivery outcome
   - Add recordNotificationDelivery in packages/data-ops/src/queries/notifications with columns deliveryChannel, status, error.
   - Update worker to call it on success/failure for observability.
   - Optional: append delivery entries to Activity timeline.
7. Testing + deployment
   - Unit test the queue producer (mock fetch).
   - Local worker test: pnpm --filter data-service dev and push sample message via wrangler queues enqueue.
   - Integration check: run change detector path in dev environment, ensure message enqueued, worker processes, logs success.
   - Deploy worker: pnpm --filter data-service deploy.
   - Update docs (docs/features/notifications/operations.md, plan doc) once verified.

Follow this flow and you’ll have a full end-to-end notification delivery path without touching Restate.
