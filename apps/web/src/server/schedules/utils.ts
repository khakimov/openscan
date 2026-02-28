import type { ScheduleInterval } from '@repo/data-ops';
import { getRestateUrl, getRestateApiKey, type EnvBindings } from '@/lib/config';

type ScheduleFrequency =
  | 'EVERY_30_MINUTES'
  | 'EVERY_HOUR'
  | 'EVERY_6_HOURS'
  | 'EVERY_12_HOURS'
  | 'DAILY';

/**
 * Restate HTTP Client for DeviceScanner Virtual Object
 * Responsible for orchestrating scan schedule lifecycle operations.
 */
export class RestateScheduleClient {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;

  constructor(baseUrl?: string, apiKey?: string, env?: EnvBindings) {
    // Use lazy evaluation to get env values at call time, not module load time
    this.baseUrl = baseUrl ?? getRestateUrl(env);
    this.headers = {
      'Content-Type': 'application/json',
    };

    const key = apiKey ?? getRestateApiKey(env);
    if (key) {
      this.headers['Authorization'] = `Bearer ${key}`;
    }
  }

  async scheduleDeviceScan(
    scheduleId: string,
    input: {
      config: {
        scheduleId: string;
        deviceId: string;
        deviceTarget: string;
        organizationId: string;
        interval: ScheduleInterval;
        preset: string;
        createdBy: string;
      };
      startImmediately?: boolean;
    }
  ): Promise<{ success: true; scheduleId: string; nextRunAt: string }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/scheduleDeviceScan`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate scheduleDeviceScan failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  async pauseSchedule(scheduleId: string, pausedBy: string): Promise<{ success: true }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/pauseSchedule`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ pausedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate pauseSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  async resumeSchedule(
    scheduleId: string,
    resumedBy: string
  ): Promise<{ success: true; nextRunAt: string }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/resumeSchedule`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ resumedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate resumeSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  async deleteSchedule(scheduleId: string, deletedBy: string): Promise<{ success: true }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/deleteSchedule`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ deletedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate deleteSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  async getScheduleState(
    scheduleId: string
  ): Promise<{
    scheduleId: string;
    status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
    nextExecutionTime?: string;
    consecutiveFailures: number;
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    lastRunAt?: string;
    currentLeaseId?: string;
  }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/getScheduleState`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate getScheduleState failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}

/**
 * Factory for Restate schedule client.
 * Creates a new instance per call to ensure env bindings are fresh (Cloudflare Workers).
 */
export function getRestateScheduleClient(env?: EnvBindings) {
  return new RestateScheduleClient(undefined, undefined, env);
}

/**
 * Server-controlled frequency mapping
 * Client sends semantic intent, server controls exact values.
 */
export const FREQUENCY_TO_INTERVAL: Record<
  Exclude<ScheduleFrequency, 'DAILY'>,
  { kind: 'duration'; value: number; unit: 'minutes' | 'hours' | 'days' }
> = {
  EVERY_30_MINUTES: { kind: 'duration', value: 30, unit: 'minutes' },
  EVERY_HOUR: { kind: 'duration', value: 1, unit: 'hours' },
  EVERY_6_HOURS: { kind: 'duration', value: 6, unit: 'hours' },
  EVERY_12_HOURS: { kind: 'duration', value: 12, unit: 'hours' },
};

/**
 * Build schedule interval configuration from client-selected frequency.
 * Ensures the server controls exact timing semantics.
 */
export function resolveIntervalConfig(
  frequency: ScheduleFrequency,
  dailyTime?: string
): ScheduleInterval {
  if (frequency === 'DAILY') {
    const [hourStr, minuteStr] = (dailyTime || '02:00').split(':');
    return {
      kind: 'daily',
      hour: parseInt(hourStr, 10),
      minute: parseInt(minuteStr, 10),
      timezone: 'UTC',
    };
  }

  const interval = FREQUENCY_TO_INTERVAL[frequency];
  if (!interval) {
    throw new Error(`Unsupported schedule frequency: ${frequency}`);
  }

  return interval;
}

/**
 * Calculate the next execution time based on interval configuration.
 */
export function calculateNextExecutionTime(interval: ScheduleInterval): Date {
  const now = new Date();

  if (interval.kind === 'duration') {
    const ms = convertToMilliseconds(interval.value, interval.unit);
    return new Date(now.getTime() + ms);
  }

  const next = new Date(now);
  next.setHours(interval.hour, interval.minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Convert a duration interval into milliseconds for scheduling calculations.
 */
function convertToMilliseconds(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  } as const;

  return value * multipliers[unit];
}
