# Notifications Operations

## Notification Feed & Mutations
- **UI entrypoint**: `apps/user-application/src/components/notifications/NotificationBell.tsx:37` opens the sheet and uses `useQuery` with `notificationQueries.list.key({ unreadOnly: false })` to fetch items when the panel is open.
- **Query factory reuse**: `apps/user-application/src/queries/notification-queries.ts:32` defines `notificationQueries.list.key` so both loaders and components share the tRPC tuple key.
- **tRPC list handler**: `apps/user-application/src/trpc/routers/notification.ts:48` validates org context, calls `getNotifications`, and wraps results with `normalizeNotificationList` before returning items/total/hasMore.
- **Data access layer**: `packages/data-ops/src/queries/notifications/read.ts:13` filters by organization/user/unread flags, providing pagination totals for the router.
- **Normalization guards**: `apps/user-application/src/features/notifications/utils/normalize-notification.ts:70` whitelists types/severities and converts Date → ISO strings to keep the UI trusted.
- **List rendering**: `apps/user-application/src/components/notifications/NotificationList.tsx:79` consumes normalized items and exposes `onMarkAsRead` callbacks while formatting severity badges and timestamps.
- **Mark one as read**: `apps/user-application/src/queries/notification-queries.ts:85` wraps `trpcClient.notification.markAsRead.mutate`, invalidating the list + unread count keys; the router updates DB via `markNotificationAsRead` (`apps/user-application/src/trpc/routers/notification.ts:126`).
- **Mark all as read**: `apps/user-application/src/queries/notification-queries.ts:104` calls `notification.markAllAsRead` and invalidates the same tuple keys; the router issues `markAllNotificationsAsRead` to clear org-wide unread flags (`apps/user-application/src/trpc/routers/notification.ts:184`).

## Unread Badge & Severity Indicator
- **Badge polling**: `apps/user-application/src/components/notifications/NotificationBell.tsx:41` polls `notification.unreadCount` every 30s to render the badge and “Mark all as read” state.
- **Sidebar indicator**: `apps/user-application/src/components/notifications/NotificationIndicator.tsx:29` reuses the same unread count query to color the pulsing dot based on severity tiers.
- **Query key**: `apps/user-application/src/queries/notification-queries.ts:61` exposes `notificationQueries.unreadCount.key()` so every consumer shares the cache entry.
- **tRPC unreadCount**: `apps/user-application/src/trpc/routers/notification.ts:102` delegates to `getUnreadNotificationCountWithSeverity`, returning total/critical/high/medium/low/info counts for polling widgets.
- **Severity breakdown**: `packages/data-ops/src/queries/notifications/read.ts:102` aggregates unread notifications by severity with SQL `count(case when ...)` expressions, ensuring indicator colors match backend state.

## Preference Management
- **Account dialog Suspense**: `apps/user-application/src/components/auth/account-dialog.tsx:50` uses `useSuspenseQuery` with `trpc.notification.preferences.queryOptions()` so navigation + dialog reuse the same cache.
- **Save mutation**: `apps/user-application/src/queries/notification-queries.ts:126` posts updates through `notification.savePreferences` and invalidates `notificationQueries.preferences.base` on success.
- **tRPC preferences.read**: `apps/user-application/src/trpc/routers/notification.ts:213` resolves allowed severities via `resolveEmailSeverities`, returning the normalized shape (`vulnerabilityAlertsEnabled`, `alertSeverities`, `weeklySummaryEnabled`).
- **tRPC preferences.write**: `apps/user-application/src/trpc/routers/notification.ts:235` validates payload, then calls `updateEmailSeveritiesOrDisable` so empty arrays disable alerts.
- **Data-ops storage**: `packages/data-ops/src/queries/notifications/settings.ts:205` caches severity settings with a 5-minute TTL, while `:252` clears cache and persists updates so email workers respect new thresholds.

## Change Detection & Notification Creation
- **Postback trigger**: `apps/user-application/src/server/postback/handlers/port-scan.ts:421` imports `detectScanChanges`, passes the freshly enriched `resultSummary`, and builds notification payloads with fingerprints and suppress windows.
- **Change detector**: `apps/user-application/src/server/notifications/change-detector/index.ts:53` loads the baseline scans, diffs ports/CVEs/service drift, and returns typed `ScanChange` objects with severity and human-readable titles/messages.
- **Notification upsert**: `packages/data-ops/src/queries/notifications/crud.ts:153` iterates through inputs, calling `upsertNotification` to enforce dedupe via fingerprints and extend suppress windows instead of duplicating alerts.
- **Email filtering**: `packages/data-ops/src/queries/notifications/read.ts:172` uses `resolveEmailSeverities` to fetch pending `emailSent=false` notifications at allowed severities for downstream delivery workers, respecting disabled-alert orgs.
- **Audit logging**: `packages/data-ops/src/queries/notifications/crud.ts:181` logs batch stats (new vs suppressed) so observability dashboards can track notification throughput after each scan postback.

## Supporting Utilities
- **Types exposed to UI**: `apps/user-application/src/server/notifications/types.ts:20` defines the normalized `NotificationItem` contract that React components consume.
- **Query factory barrel**: `apps/user-application/src/queries/index.ts:20` re-exports notification hooks/keys so feature modules import from a single place (`@/queries`).
- **Docs + testing references**: `docs/features/notifications/reference/TESTING_GUIDE.md:163` outlines integration tests for the change detector; keep it in sync when adding new notification types.
