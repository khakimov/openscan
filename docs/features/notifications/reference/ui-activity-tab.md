# Server Activity Tab

## Overview

Timeline view showing all security changes for a specific server: port changes, CVE discoveries, fixes, and regressions.

**Location:** `/$organizationId/$projectId/servers/$deviceId/activity`

## Implementation Steps

### Step 1: Create Route File

**File:** `apps/user-application/src/routes/_app.$organizationId.$projectId.servers.$deviceId.activity.tsx`

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { ActivityTimeline } from "@/features/notifications/components/activity-timeline";

export const Route = createFileRoute(
  "/_app/$organizationId/$projectId/servers/$deviceId/activity"
)({
  component: ServerActivity,
});

function ServerActivity() {
  const { deviceId } = Route.useParams();
  return <ActivityTimeline deviceId={deviceId} />;
}
```

### Step 2: Add Tab to Device Layout

**File:** `apps/user-application/src/routes/_app.$organizationId.$projectId.servers.$deviceId.tsx`

Add new PageTabsLink after Vulnerabilities tab (around line 300):

```typescript
<PageTabsLink
  to="/$organizationId/$projectId/servers/$deviceId/activity"
  params={{ organizationId: orgParam, projectId: project.id, deviceId }}
  isActive={pathname.includes('/activity')}
>
  Activity
</PageTabsLink>
```

### Step 3: Add tRPC Endpoint

**File:** `apps/user-application/src/trpc/routers/notification.ts`

Create new router or add to existing:

```typescript
import { protectedProcedure, createTRPCRouter } from '../trpc';
import { getNotifications } from '@repo/data-ops';
import { z } from 'zod';

export const notificationRouter = createTRPCRouter({
  listByDevice: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const organizationId = ctx.user.organizationId;

      return getNotifications({
        organizationId,
        deviceId: input.deviceId,
        limit: input.limit,
        offset: input.offset,
      });
    }),
});
```

**Add to root router:** `apps/user-application/src/trpc/index.ts`

```typescript
import { notificationRouter } from './routers/notification';

export const appRouter = createTRPCRouter({
  // ... existing routers
  notification: notificationRouter,
});
```

### Step 4: Create Query Hook

**File:** `apps/user-application/src/queries/notification-queries.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';

export const notificationQueries = {
  listByDevice: {
    key: (deviceId: string) => [
      ['notification', 'listByDevice'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
};

export const useDeviceNotifications = (deviceId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.notification.listByDevice.queryOptions({ deviceId }),
    queryFn: () => trpcClient.notification.listByDevice.query({ deviceId }),
  });
};
```

### Step 5: Create Timeline Component

**File:** `apps/user-application/src/features/notifications/components/activity-timeline.tsx`

```typescript
import { useDeviceNotifications } from '@/queries/notification-queries';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface ActivityTimelineProps {
  deviceId: string;
}

export function ActivityTimeline({ deviceId }: ActivityTimelineProps) {
  const { data, isLoading } = useDeviceNotifications(deviceId);

  if (isLoading) return <div>Loading...</div>;

  const notifications = data?.items || [];

  return (
    <div className="space-y-6">
      {notifications.map((notification) => (
        <TimelineItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

function TimelineItem({ notification }: { notification: any }) {
  return (
    <div className="flex gap-4 border-l-2 pl-4 pb-4">
      <SeverityBadge severity={notification.severity} />
      <div>
        <h4 className="font-semibold">{notification.title}</h4>
        {notification.message && (
          <p className="text-sm text-muted-foreground">{notification.message}</p>
        )}
        <EventDetails data={notification.data} type={notification.type} />
        <p className="text-xs text-muted-foreground mt-2">
          {formatDistanceToNow(new Date(notification.createdAt))} ago
        </p>
      </div>
    </div>
  );
}

function EventDetails({ data, type }: { data: any; type: string }) {
  if (!data) return null;

  if (type === 'NEW_PORT' || type === 'CLOSED_PORT') {
    return (
      <div className="text-sm mt-1">
        Port {data.port}/{data.protocol} - {data.service}
        {data.version && ` ${data.version}`}
      </div>
    );
  }

  if (type.includes('CVE')) {
    return (
      <div className="text-sm mt-1">
        {data.cveId} - CVSS {data.cvssScore}
        {data.affectedService && ` (${data.affectedService})`}
      </div>
    );
  }

  return null;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    CRITICAL: 'bg-red-500',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-yellow-500',
    LOW: 'bg-blue-500',
    INFO: 'bg-gray-500',
  };

  return (
    <div className={`h-3 w-3 rounded-full ${colors[severity] || 'bg-gray-400'}`} />
  );
}
```

## Data Model

Notifications come from `packages/data-ops/src/schema/notifications.ts`:

**Key fields:**
- `type`: NEW_PORT, CLOSED_PORT, NEW_CVE, CVE_FIXED, etc.
- `severity`: CRITICAL, HIGH, MEDIUM, LOW, INFO
- `title`: Human-readable summary
- `message`: Optional details
- `data`: JSON with event-specific details
- `createdAt`: Timestamp
- `deviceId`: Linked device
- `scanRunId`: Linked scan

**Data structure by type:**

```typescript
// NEW_PORT / CLOSED_PORT
{
  port: 443,
  protocol: "tcp",
  service: "https",
  version: "nginx 1.25.0"
}

// NEW_CVE / CVE_FIXED
{
  cveId: "CVE-2024-1234",
  severity: "CRITICAL",
  cvssScore: 9.8,
  description: "...",
  affectedService: "nginx",
  port: 443
}

// CVE_SEVERITY_INCREASE
{
  cveId: "CVE-2024-1234",
  oldSeverity: "HIGH",
  newSeverity: "CRITICAL",
  cvssScore: 9.8
}
```

## How Notifications Are Created

**Location:** `apps/user-application/src/server/postback/handlers/port-scan.ts`

**Flow:**
1. Scan completes → postback handler receives results
2. Change detector compares current vs previous scan (lines 410-433)
3. Detects changes (ports, CVEs, service drift)
4. Creates notification records via `createNotifications()` from data-ops
5. UI polls for new notifications every 30 seconds

**Change detection logic:**
- **Ports:** `src/server/notifications/change-detector/diff-ports.ts`
- **CVEs:** `src/server/notifications/change-detector/diff-cves.ts`
- **Service drift:** `src/server/notifications/change-detector/diff-service-drift.ts`

## Filters & Enhancements

**Add type filter:**
```typescript
const [filter, setFilter] = useState<string>('all');

const filtered = notifications.filter(n =>
  filter === 'all' || n.module === filter
);

// Filter buttons
<Button onClick={() => setFilter('NETWORK_SECURITY')}>Ports</Button>
<Button onClick={() => setFilter('VULNERABILITY_MANAGEMENT')}>CVEs</Button>
```

**Add severity filter:**
```typescript
const filtered = notifications.filter(n =>
  selectedSeverities.includes(n.severity)
);
```

**Group by date:**
```typescript
import { format, isToday, isYesterday } from 'date-fns';

const grouped = notifications.reduce((acc, n) => {
  const date = new Date(n.createdAt);
  const label = isToday(date) ? 'Today'
    : isYesterday(date) ? 'Yesterday'
    : format(date, 'MMM d, yyyy');

  if (!acc[label]) acc[label] = [];
  acc[label].push(n);
  return acc;
}, {});
```

## Related Documentation

- **Data model:** `data-model.md`
- **Change detection:** `change-detection.md`
- **Notification types:** `catalog.md`
- **Backend logic:** `../../../architecture/backend/postback-architecture.md`
