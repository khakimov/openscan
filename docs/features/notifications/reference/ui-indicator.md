# Notification Indicator Component

## Overview

A subtle pulsing dot indicator that shows notification status based on severity. Inspired by the OpenPanel event listener design.

## Component Location

`apps/user-application/src/components/notifications/NotificationIndicator.tsx`

## Visual Design

**Pulsing colored dot** that changes based on unread notification severity:

| Color | Severity | Meaning |
|-------|----------|---------|
| 🔴 Red | CRITICAL or HIGH | Urgent security issues requiring immediate attention |
| 🟡 Yellow | MEDIUM | Moderate issues that should be reviewed |
| 🟢 Green | LOW or INFO | Low-priority informational notifications |
| ⚪ Gray | None | No unread notifications |

## Features

- **Real-time polling**: Updates every 30 seconds
- **Severity-aware**: Color reflects highest severity unread notification
- **Tooltip**: Hover to see breakdown (e.g., "8 notifications: 1 high, 1 medium")
- **Pulsing animation**: Only pulses when unread notifications exist
- **Minimal footprint**: Small 2×2px dot, doesn't interfere with UI

## Usage

### Add to Sidebar Navigation

Recommended placement: Next to "Assets" or other high-traffic navigation items.

```tsx
import { NotificationIndicator } from '@/components/notifications/NotificationIndicator';

// In your sidebar navigation item
<Link to="/assets">
  <div className="flex items-center gap-2">
    Assets
    <NotificationIndicator />
  </div>
</Link>
```

### Standalone Usage

```tsx
import { NotificationIndicator } from '@/components/notifications/NotificationIndicator';

<div className="flex items-center gap-3">
  <span>System Status</span>
  <NotificationIndicator />
</div>
```

## Backend API

### Server Function

`apps/user-application/src/server/notifications.ts`

```typescript
export const getUnreadNotificationCountData = createServerFn({
  method: 'GET',
})
  .inputValidator(() => ({}))
  .handler(async () => {
    // Returns:
    // {
    //   count: 8,
    //   criticalCount: 0,
    //   highCount: 1,
    //   mediumCount: 1,
    //   lowCount: 5,
    //   infoCount: 1
    // }
  });
```

### Data-Ops Query

`packages/data-ops/src/queries/notifications/read.ts`

```typescript
export async function getUnreadNotificationCountWithSeverity(
  input: GetUnreadCountInput
): Promise<{
  total: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
}>;
```

**SQL Query:**
```sql
SELECT
  count(*) as total,
  count(case when severity = 'CRITICAL' then 1 end) as criticalCount,
  count(case when severity = 'HIGH' then 1 end) as highCount,
  count(case when severity = 'MEDIUM' then 1 end) as mediumCount,
  count(case when severity = 'LOW' then 1 end) as lowCount,
  count(case when severity = 'INFO' then 1 end) as infoCount
FROM notifications
WHERE organization_id = ? AND read_at IS NULL AND is_active = 1
```

## Color Logic

```typescript
const getColorClass = () => {
  if (criticalCount > 0 || highCount > 0) return 'bg-red-500';    // 🔴 Red
  if (mediumCount > 0) return 'bg-yellow-500';                    // 🟡 Yellow
  if (unreadCount > 0) return 'bg-emerald-500';                   // 🟢 Green
  return 'bg-gray-400';                                            // ⚪ Gray
};
```

## Animation

- **Pulsing**: `animate-ping` Tailwind class applied when `unreadCount > 0`
- **Static inner dot**: Always visible, provides base color
- **Outer ring**: Fades in/out continuously (ping animation)

## Tooltip Content

Dynamic message based on severity breakdown:

| Scenario | Tooltip Message |
|----------|-----------------|
| No notifications | "No new notifications" |
| Only LOW/INFO | "8 notifications" |
| With HIGH | "8 notifications: 1 high, 1 medium" |
| With CRITICAL | "5 notifications: 2 critical, 1 high" |

## Performance

- **Polling interval**: 30 seconds (configurable via `refetchInterval`)
- **Background polling**: Continues even when tab is not focused (`refetchIntervalInBackground: true`)
- **Lightweight query**: Only fetches counts, no notification content
- **Cached**: TanStack Query caches results, prevents duplicate requests

## Accessibility

- **Tooltip**: Provides context for screen readers and keyboard users
- **No interactive element**: Purely informational, doesn't require click interaction
- **High contrast**: Color combinations meet WCAG AA standards

## Future Enhancements

- [ ] Click indicator to open notification panel/sheet
- [ ] Add subtle sound/vibration on new CRITICAL notification
- [ ] Configurable polling interval (user preference)
- [ ] WebSocket support for real-time updates (eliminate polling)
- [ ] Animation intensity based on severity (faster pulse for critical)

## Related Components

- **NotificationBell**: Full bell icon with badge and slide-out sheet
- **NotificationList**: Complete list of notifications with actions
- **NotificationIndicator**: This component (minimal status dot)

## Design Reference

Inspired by: `/Users/nailert/Projects/current/automate/ui/openpanel/apps/start/src/components/events/event-listener.tsx`

Original design: Green pulsing dot with "Listening" state for real-time event monitoring.

## Testing

Check the indicator with different notification states:

```bash
# Create test notifications
wrangler d1 execute sec-db --remote --command="
  -- Test RED (1 HIGH)
  UPDATE notifications SET severity='HIGH', read_at=NULL WHERE id='xxx';

  -- Test YELLOW (1 MEDIUM)
  UPDATE notifications SET severity='MEDIUM', read_at=NULL WHERE id='yyy';

  -- Test GREEN (1 LOW)
  UPDATE notifications SET severity='LOW', read_at=NULL WHERE id='zzz';

  -- Test GRAY (all read)
  UPDATE notifications SET read_at=unixepoch('now')*1000 WHERE organization_id='org_id';
"
```

Verify colors appear correctly and tooltip shows accurate breakdown.
