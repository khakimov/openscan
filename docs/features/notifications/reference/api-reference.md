# API Reference

### Server Functions

**File**: `apps/user-application/src/server/notifications.ts`

#### `getNotificationsData`
- **Method**: POST
- **Input**: `{ unreadOnly?: boolean, deviceId?: string, limit?: number, offset?: number }`
- **Returns**: `{ success: boolean, items: Notification[], total: number, hasMore: boolean }`
- **Description**: Get notifications for current organization

#### `getUnreadNotificationCountData`
- **Method**: GET
- **Input**: None
- **Returns**: `{ success: boolean, count: number }`
- **Description**: Get count of unread notifications for badge

#### `markNotificationAsReadData`
- **Method**: POST
- **Input**: `{ notificationId: string }`
- **Returns**: `{ success: boolean, notification: Notification }`
- **Description**: Mark single notification as read

#### `markAllNotificationsAsReadData`
- **Method**: POST
- **Input**: None
- **Returns**: `{ success: boolean, count: number }`
- **Description**: Mark all notifications as read for organization (org-wide action)

### Data-Ops Queries

**Folder**: `packages/data-ops/src/queries/notifications/`

#### `createNotifications(inputs: CreateNotificationInput[])`
Creates notifications with atomic deduplication. Skips duplicates within suppress window.

#### `getNotifications(params: GetNotificationsInput)`
Fetches notifications with pagination and filtering.

#### `getUnreadNotificationCount(params: { organizationId, userId })`
Returns count for badge display.

#### `markNotificationAsRead(params: { notificationId, organizationId })`
Marks single notification as read.

#### `markAllNotificationsAsRead(organizationId: string)`
Marks all unread notifications as read (org-wide).

#### `checkDuplicateNotification(params: { organizationId, fingerprint })`
Checks if notification should be suppressed based on fingerprint + suppressUntil.

#### `deleteOldNotifications(organizationId: string, daysOld: number)`
Deletes read notifications older than specified days.

#### `getLastSuccessfulScanForDevice(params: GetLastSuccessfulScanParams)`
Fetches baseline scan for change detection.

---
