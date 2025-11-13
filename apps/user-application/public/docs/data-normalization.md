# Data Normalization Pattern

This guide documents the **data normalization pattern** used to eliminate duplication between server and client data transformations.

## Overview

**Problem**: Server functions and UI components duplicate data transformation logic (Date → ISO strings, type guards, field defaults). This creates:
- **Drift Risk**: Server and client diverge over time
- **Maintainability Burden**: Field changes require updates in multiple locations
- **Security Gaps**: Type/severity guards scattered across codebase
- **Performance Waste**: Repeated conversions in UI (e.g., `new Date()` called multiple times)

**Solution**: Centralize transformations in feature-specific normalization utilities, following OpenPanel's pattern ([source](https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts)).

## Architecture

```
Database (Date objects, any types)
    ↓
@repo/data-ops (raw DB queries)
    ↓
Server Function (uses normalizer)
    ↓
Normalizer (Date → ISO, guards, defaults) ✅ Single Source of Truth
    ↓
Client (receives ISO strings, no guards needed)
```

**Key Principle**: Normalize **once** in server functions, consume normalized data everywhere else.

## Pattern Structure

Each feature has normalization utilities in `src/features/<feature>/utils/`:

```
src/features/
├── notifications/
│   └── utils/
│       ├── normalize-notification.ts   # Normalizer functions
│       └── index.ts                    # Barrel export
├── discovery/
│   └── utils/
│       ├── normalize-workflow-results.ts
│       └── index.ts
└── schedules/
    └── utils/
        ├── normalize-schedule.ts
        └── index.ts
```

## Implementation Examples

### 1. Notifications (Highest Drift Risk)

**File**: `src/features/notifications/utils/normalize-notification.ts`

#### Problem Solved

Before normalization:
- **Server**: Manually mapped `createdAt.toISOString()` and `readAt?.toISOString()` in 2 places
- **Client**: Re-validated type/severity guards, converted ISO strings back to Date
- **Divergence**: UI used `new Set(['CRITICAL', ...])`, server had similar but not identical list

#### Normalizer

```typescript
import type { NotificationItem } from '@/server/notifications/types';

const ALLOWED_TYPES = new Set([
  'NEW_PORT',
  'CLOSED_PORT',
  'NEW_CVE',
  'CVE_SEVERITY_INCREASE',
  'CVE_FIXED',
  'CVE_REGRESSED',
  'SERVICE_DRIFT',
] as const);

const ALLOWED_SEVERITIES = new Set([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
] as const);

/**
 * Normalize raw database notification record to client-safe structure
 *
 * Guards:
 * - Filters out unknown types (returns null for invalid records)
 * - Defaults severity to 'INFO' if invalid
 * - Converts Date objects to ISO strings
 * - Ensures all required fields have safe defaults
 */
export function normalizeNotification(record: any): NotificationItem | null {
  if (!record) return null;

  // Type guard: Only allow whitelisted types
  const type = typeof record.type === 'string' && ALLOWED_TYPES.has(record.type as any)
    ? record.type
    : null;

  // Reject records with invalid types (security)
  if (!type) return null;

  // Severity guard: Default to INFO if invalid
  const severity = typeof record.severity === 'string' && ALLOWED_SEVERITIES.has(record.severity as any)
    ? record.severity
    : 'INFO';

  return {
    id: String(record.id),
    type,
    severity,
    title: record.title ?? 'Notification',
    message: record.message ?? null,
    data: record.data ?? null,
    readAt: record.readAt ? (record.readAt instanceof Date ? record.readAt.toISOString() : record.readAt) : null,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    deviceId: record.deviceId ?? null,
    scanRunId: record.scanRunId ?? null,
  };
}

export function normalizeNotificationList(records: any[]): NotificationItem[] {
  return records.map(normalizeNotification).filter((item): item is NotificationItem => item !== null);
}
```

#### Usage in Server

**Before**:
```typescript
// src/server/notifications.ts (OLD)
return {
  success: true,
  items: result.items.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    readAt: item.readAt ? item.readAt.toISOString() : null,
  })),
  total: result.total,
  hasMore: result.hasMore,
};
```

**After**:
```typescript
// src/server/notifications.ts (NEW)
import { normalizeNotificationList } from '@/features/notifications/utils';

const result = await getNotifications(params);
const normalized = normalizeNotificationList(result.items); // ✅ One line

return {
  success: true,
  items: normalized,
  total: result.total,
  hasMore: result.hasMore,
};
```

#### Usage in Client

Client now receives pre-normalized data (no guards needed):

```typescript
// src/components/notifications/NotificationList.tsx
import type { NotificationItem } from '@/server/notifications/types';

interface NotificationListProps {
  notifications: NotificationItem[]; // ✅ Already normalized (ISO strings)
  onMarkAsRead: (id: string) => void;
  isMarkingAsRead: boolean;
}

// Type-safe severity config (exhaustive, compiler-enforced)
const severityConfig: Record<
  NotificationItem['severity'],
  { icon: typeof ShieldAlert; bgColor: string; borderColor: string; iconColor: string; badgeVariant: 'destructive' | 'outline' | 'secondary' }
> = {
  CRITICAL: { icon: ShieldAlert, bgColor: 'bg-red-50', borderColor: 'border-red-200', iconColor: 'text-red-600', badgeVariant: 'destructive' },
  HIGH: { icon: AlertTriangle, bgColor: 'bg-orange-50', borderColor: 'border-orange-200', iconColor: 'text-orange-600', badgeVariant: 'outline' },
  MEDIUM: { icon: AlertCircle, bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', iconColor: 'text-yellow-600', badgeVariant: 'outline' },
  LOW: { icon: Info, bgColor: 'bg-blue-50', borderColor: 'border-blue-200', iconColor: 'text-blue-600', badgeVariant: 'outline' },
  INFO: { icon: Info, bgColor: 'bg-gray-50', borderColor: 'border-gray-200', iconColor: 'text-gray-600', badgeVariant: 'secondary' },
};

// Type-safe type labels (exhaustive)
const typeLabels: Record<NotificationItem['type'], string> = {
  NEW_PORT: 'New Port',
  CLOSED_PORT: 'Port Closed',
  NEW_CVE: 'New CVE',
  CVE_SEVERITY_INCREASE: 'CVE Severity Increased',
  CVE_FIXED: 'CVE Fixed',
  CVE_REGRESSED: 'CVE Regressed',
  SERVICE_DRIFT: 'Service Drift',
};

export function NotificationList({ notifications, onMarkAsRead, isMarkingAsRead }: NotificationListProps) {
  return (
    <div className="space-y-2">
      {notifications.map((notification) => {
        const createdAt = new Date(notification.createdAt); // ✅ Just-in-time conversion (once per render)
        const readAt = notification.readAt ? new Date(notification.readAt) : null;
        const config = severityConfig[notification.severity]; // ✅ Type-safe (compiler checks exhaustiveness)
        const typeLabel = typeLabels[notification.type]; // ✅ Type-safe

        return (
          <div key={notification.id} className={cn('rounded-lg border p-4', config.bgColor, config.borderColor)}>
            {/* Render notification with type-safe config */}
          </div>
        );
      })}
    </div>
  );
}
```

**Removed from client** (70 lines total):
- ❌ `DisplayNotification` type (70 lines) - now uses `NotificationItem` from server
- ❌ `ALLOWED_TYPES` set (now in normalizer)
- ❌ `ALLOWED_SEVERITIES` set (now in normalizer)
- ❌ `toDisplayNotification()` function (35 lines) - server pre-normalizes
- ❌ Duplicated type guards and defaults

**NotificationBell** also simplified:
```typescript
// Before: Re-normalized server data
const notifications: DisplayNotification[] = (notificationsData?.items ?? [])
  .map(toDisplayNotification)
  .filter((notification): notification is DisplayNotification => notification !== null);

// After: Consume server-normalized data directly
const notifications = notificationsData?.items ?? [];
```

### 2. Discovery Workflow Results

**File**: `src/features/discovery/utils/normalize-workflow-results.ts`

#### Problem Solved

Before normalization:
- **Server**: Inline payload rebuilding (238-284 in discovery-handler.ts)
  - Map devices → results
  - Filter subdomains
  - Determine success from errors
  - Build nested result structure
- **Future Risk**: Any shape change requires touching every consumer

#### Normalizer

```typescript
export interface NormalizedDiscoveryResult {
  request: { target: string; scanType: 'basic' | 'advanced'; tools: string[] };
  results: Array<{
    target: string;
    subdomains: string[];
    results: Array<{ host: string; ip: string }>;
    tool: string;
    timestamp: string;
    success: boolean;
    errors?: string[];
  }>;
  totalSubdomains: number;
  uniqueSubdomains: Array<{ subdomain: string; ip: string }>;
  executionTime: number;
  errors?: string[];
}

export function normalizeDiscoveryResult(
  summary: any,
  fallbackTarget: string = 'unknown'
): NormalizedDiscoveryResult {
  const target = summary?.target ?? fallbackTarget;
  const devices = Array.isArray(summary?.devices) ? summary.devices : [];

  const normalizedDevices = devices.map((device: any) => ({
    host: device.hostname ?? device.host ?? '',
    ip: device.ipAddress ?? device.ip ?? '',
  }));

  const subdomains = devices
    .map((d: any) => d.hostname ?? d.host)
    .filter((host: unknown): host is string => typeof host === 'string' && host.length > 0);

  const errors = Array.isArray(summary?.errors) ? summary.errors : undefined;
  const success = !errors || errors.length === 0;

  return {
    request: {
      target,
      scanType: summary?.scanType ?? 'basic',
      tools: Array.isArray(summary?.tools) ? summary.tools : ['subfinder'],
    },
    results: [{
      target,
      subdomains,
      results: normalizedDevices,
      tool: summary?.tool ?? 'restate-scanner',
      timestamp: summary?.completedAt ?? new Date().toISOString(),
      success,
      errors,
    }],
    totalSubdomains: normalizedDevices.length,
    uniqueSubdomains: normalizedDevices.map((device: { host: string; ip: string }) => ({
      subdomain: device.host,
      ip: device.ip,
    })),
    executionTime: summary?.executionTime ?? 0,
    errors,
  };
}
```

#### Usage in Server

**Before** (50+ lines of inline mapping):
```typescript
// src/server/discovery/workflows/discovery-handler.ts (OLD)
const resultSummary = scanRun.resultSummary as any;
const target = resultSummary?.target || scanRun.target || 'unknown';
const devices = resultSummary?.devices || [];

const results = devices.map((device: any) => ({
  host: device.hostname,
  ip: device.ipAddress || '',
}));

const subdomains = devices
  .filter((d: any) => d.hostname && d.hostname.length > 0)
  .map((d: any) => d.hostname);

return {
  success: true,
  result: {
    request: { /* ... */ },
    results: [{ /* ... */ }],
    totalSubdomains: results.length,
    uniqueSubdomains: results.map(/* ... */),
    executionTime: resultSummary?.executionTime || 0,
    errors: resultSummary?.errors || undefined,
  },
};
```

**After** (3 lines):
```typescript
// src/server/discovery/workflows/discovery-handler.ts (NEW)
import { normalizeDiscoveryResult } from '@/features/discovery/utils';

const scanRun = await getScanRunByRestateWorkflowId(organizationId, scanId);
const result = normalizeDiscoveryResult(scanRun.resultSummary, scanRun.target || undefined);

return { success: true, result };
```

### 3. Notification Preferences

**File**: `src/features/notifications/utils/normalize-preferences.ts`

#### Problem Solved

Before normalization:
- **Server**: No shared logic for notification preferences
- **Business Rule**: "Empty array disables alerts" contract scattered
- **UI**: Forms duplicate default flags (vulnerabilityAlertsEnabled, weeklySummaryEnabled)

#### Normalizer

```typescript
export interface RawNotificationPreferences {
  severities?: string[];
  vulnerabilityAlertsEnabled?: boolean;
  weeklySummaryEnabled?: boolean;
}

export interface NormalizedNotificationPreferences {
  vulnerabilityAlertsEnabled: boolean;
  alertSeverities: string[];
  weeklySummaryEnabled: boolean;
}

const ALLOWED_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const);

/**
 * Normalize notification preferences from raw database/API response
 *
 * Business Rules:
 * - If `severities` array is empty → alerts are disabled
 * - If `severities` array has items → alerts are enabled
 * - Only allowed severities are preserved (security whitelist)
 * - Weekly summary defaults to true
 */
export function normalizeNotificationPreferences(
  raw: RawNotificationPreferences | null | undefined
): NormalizedNotificationPreferences {
  // Filter severities to only allowed values (security guard)
  const severities = Array.isArray(raw?.severities)
    ? raw.severities.filter((severity): severity is string =>
        typeof severity === 'string' && ALLOWED_SEVERITIES.has(severity as any)
      )
    : [];

  // Business rule: alerts are enabled if severities array is not empty
  const enabled = raw?.vulnerabilityAlertsEnabled ?? severities.length > 0;

  return {
    vulnerabilityAlertsEnabled: enabled,
    alertSeverities: enabled ? severities : [], // Empty array when disabled
    weeklySummaryEnabled: raw?.weeklySummaryEnabled ?? true,
  };
}
```

#### Usage

**Fetching preferences**:
```typescript
// src/server/notifications.ts
const raw = await preferencesService.getNotificationPreferences({ organizationId, userId });
const normalized = normalizeNotificationPreferences(raw);
return { success: true, preferences: normalized };
```

**Saving preferences**:
```typescript
// src/server/notifications.ts
const normalized = normalizeNotificationPreferences(input);
await preferencesService.saveNotificationPreferences({
  organizationId,
  userId,
  severities: normalized.alertSeverities, // Empty array = disabled
});
```

**UI forms** (React Query):
```typescript
const { data } = useQuery({
  queryKey: ['notification-preferences'],
  queryFn: () => getNotificationPreferences(),
});

// data.preferences is already normalized - use directly
const initialValues = data?.preferences ?? normalizeNotificationPreferences(null);
```

### 4. Schedules

**File**: `src/features/schedules/utils/normalize-schedule.ts`

#### Problem Solved

Before normalization:
- **Server**: Repeated `.map(schedule => ({ ...schedule, nextRunAt: schedule.nextRunAt?.toISOString() }))` in 3 handlers
- **Client**: Would need to duplicate same conversion for safe rendering

#### Normalizer

```typescript
export interface ScheduleEntity {
  id: string;
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  preset: string;
  interval: any;
  status: string;
  isActive: boolean;
  nextRunAt: Date | null;
  lastRunAt?: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  createdBy?: string | null;
  [key: string]: any;
}

export interface NormalizedSchedule {
  // Same fields but with ISO strings instead of Date objects
  nextRunAt: string | null;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string | null;
  // ...
}

export function normalizeSchedule(schedule: ScheduleEntity): NormalizedSchedule {
  return {
    ...schedule,
    nextRunAt: schedule.nextRunAt
      ? schedule.nextRunAt instanceof Date ? schedule.nextRunAt.toISOString() : schedule.nextRunAt
      : null,
    lastRunAt: schedule.lastRunAt
      ? schedule.lastRunAt instanceof Date ? schedule.lastRunAt.toISOString() : schedule.lastRunAt
      : null,
    createdAt: schedule.createdAt instanceof Date ? schedule.createdAt.toISOString() : schedule.createdAt,
    updatedAt: schedule.updatedAt
      ? schedule.updatedAt instanceof Date ? schedule.updatedAt.toISOString() : schedule.updatedAt
      : null,
  };
}

export function normalizeScheduleList(schedules: ScheduleEntity[]): NormalizedSchedule[] {
  return schedules.map(normalizeSchedule);
}
```

#### Usage in Server

**Before** (duplicated in 3+ handlers):
```typescript
// src/server/schedules.ts (OLD)
return {
  success: true,
  schedules: schedules.map(schedule => ({
    ...schedule,
    nextRunAt: schedule.nextRunAt ? schedule.nextRunAt.toISOString() : null,
  })),
};
```

**After** (reusable across all handlers):
```typescript
// src/server/schedules.ts (NEW)
import { normalizeScheduleList, normalizeSchedule } from '@/features/schedules/utils';

// List schedules handler
const schedules = await getSchedulesForDevice(deviceId, organizationId);
return {
  success: true,
  schedules: normalizeScheduleList(schedules), // ✅ DRY
};

// Create schedule handler - success path
const normalized = normalizeSchedule({
  ...dbSchedule,
  nextRunAt: new Date(restateResult.nextRunAt), // From Restate workflow
});
return { success: true, schedule: normalized };

// Create schedule handler - error path (still returns schedule)
const normalized = normalizeSchedule({
  ...dbSchedule,
  status: 'PAUSED',
  isActive: false,
});
return { success: false, error: 'Failed to start schedule timer', schedule: normalized };
```

**Benefits**:
- ✅ Mutations return normalized data (both success and error paths)
- ✅ UI immediately receives ISO strings after mutations
- ✅ No client-side post-processing needed

## Adding New Normalizers

When you encounter repeated data transformations, follow this pattern:

### Step 1: Create Normalizer

```typescript
// src/features/<feature>/utils/normalize-<entity>.ts

/**
 * <Feature> Normalization Utilities
 *
 * Centralizes data transformation between database records and client-safe structures.
 * Pattern from OpenPanel: https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
 */

// Define allowed values (security whitelists)
const ALLOWED_STATUSES = new Set(['ACTIVE', 'PAUSED', 'DELETED'] as const);

/**
 * Normalize raw database record to client-safe structure
 *
 * Guards:
 * - Type guards for enums
 * - Default values for optional fields
 * - Date → ISO string conversion
 * - Null-safe field access
 */
export function normalizeEntity(record: any): NormalizedEntity | null {
  if (!record) return null;

  // Type guards
  const status = ALLOWED_STATUSES.has(record.status) ? record.status : 'ACTIVE';

  return {
    id: String(record.id),
    status,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    // ... other fields
  };
}

export function normalizeEntityList(records: any[]): NormalizedEntity[] {
  return records.map(normalizeEntity).filter((item): item is NormalizedEntity => item !== null);
}
```

### Step 2: Export via Barrel

```typescript
// src/features/<feature>/utils/index.ts
export {
  normalizeEntity,
  normalizeEntityList,
  type NormalizedEntity,
} from './normalize-<entity>';
```

### Step 3: Use in Server Functions

```typescript
// src/server/<feature>.ts
import { normalizeEntityList } from '@/features/<feature>/utils';

export const getEntitiesData = createServerFn({
  method: 'POST',
})
  .inputValidator(/* ... */)
  .handler(async ({ data }) => {
    const result = await getEntities(data);

    // Normalize before returning
    const normalized = normalizeEntityList(result.items);

    return {
      success: true,
      items: normalized,
    };
  });
```

### Step 4: Remove Client-Side Duplication

Client components now receive pre-normalized data:

```typescript
// src/components/<feature>/EntityList.tsx
interface EntityListProps {
  entities: NormalizedEntity[]; // Already has ISO strings, guards applied
}

export function EntityList({ entities }: EntityListProps) {
  return (
    <div>
      {entities.map((entity) => (
        <div key={entity.id}>
          {/* Convert ISO string to Date exactly once for display */}
          <span>{formatDistanceToNow(new Date(entity.createdAt), { addSuffix: true })}</span>
        </div>
      ))}
    </div>
  );
}
```

## Benefits

### 1. Simplicity & Readability

- **Before**: Server functions had 10-50 lines of inline transformations
- **After**: One-line normalizer call (`normalizeEntityList(records)`)

### 2. Maintainability

- **Before**: Adding a field required updating server + client (2-5 locations)
- **After**: Add field in normalizer (1 location), consumers automatically updated

### 3. Performance

- **Before**: UI components repeatedly called `new Date()` for same data
- **After**: Server converts once, client receives ISO strings (lightweight)

### 4. Security

- **Before**: Type guards scattered across server and client (divergence risk)
- **After**: Guards centralized in normalizer (single audit point)

### 5. Scalability

- **Before**: New notification types required updating server + UI guards
- **After**: Add to `ALLOWED_TYPES` set in normalizer (one place)

## Best Practices

1. **Normalize in Server Functions**: Always call normalizer before returning data to client
2. **Single Conversion**: Convert Date → ISO string **once** in normalizer, not in UI
3. **Type Guards**: Use `Set<const>` for allowed values (fast lookup, clear intent)
4. **Null Safety**: Use nullish coalescing (`??`) for default values
5. **Filter Nulls**: Use `.filter((item): item is T => item !== null)` for type-safe filtering
6. **Document Guards**: Explain WHY each guard exists (security, data quality, etc.)
7. **Keep Pure**: Normalizers should be pure functions (no side effects, easy to test)

## Testing Normalizers

Normalizers are pure functions, making them easy to unit test:

```typescript
// src/features/notifications/utils/__tests__/normalize-notification.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeNotification } from '../normalize-notification';

describe('normalizeNotification', () => {
  it('should convert Date objects to ISO strings', () => {
    const record = {
      id: 1,
      type: 'NEW_PORT',
      severity: 'HIGH',
      title: 'New port detected',
      message: 'Port 443 opened',
      data: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      readAt: null,
      deviceId: 'device-123',
      scanRunId: null,
    };

    const result = normalizeNotification(record);

    expect(result).toEqual({
      id: '1',
      type: 'NEW_PORT',
      severity: 'HIGH',
      title: 'New port detected',
      message: 'Port 443 opened',
      data: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      readAt: null,
      deviceId: 'device-123',
      scanRunId: null,
    });
  });

  it('should reject records with invalid types', () => {
    const record = {
      id: 1,
      type: 'UNKNOWN_TYPE', // Invalid
      severity: 'HIGH',
      // ...
    };

    const result = normalizeNotification(record);

    expect(result).toBeNull(); // Security: filter out unknown types
  });

  it('should default severity to INFO if invalid', () => {
    const record = {
      id: 1,
      type: 'NEW_PORT',
      severity: 'INVALID_SEVERITY', // Invalid
      // ...
    };

    const result = normalizeNotification(record);

    expect(result?.severity).toBe('INFO'); // Default to safe value
  });
});
```

## Migration Strategy

For existing codebases with duplication:

1. **Start with highest drift risk** (notifications, complex payloads)
2. **Create normalizer** following pattern above
3. **Refactor server functions** to use normalizer
4. **Update client components** to consume normalized data
5. **Remove duplicated guards** from client
6. **Add unit tests** for normalizer
7. **Repeat for other features** (discovery, schedules, etc.)

## References

- **OpenPanel Normalization Pattern**: https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
- **TanStack Query Best Practices**: https://tanstack.com/query/latest/docs/react/guides/important-defaults
- **TypeScript Discriminated Unions**: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## See Also

- [Mutation Best Practices](./mutations.md) - For mutation-specific patterns
- [Error Boundary Best Practices](./error-boundaries.md) - For error handling patterns
