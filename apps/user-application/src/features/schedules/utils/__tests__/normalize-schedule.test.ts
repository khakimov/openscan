import { describe, it, expect } from 'vitest';
import { normalizeSchedule, normalizeScheduleList, type ScheduleEntity } from '../normalize-schedule';

/**
 * Factory helper for creating test schedule fixtures
 * Only specify fields under test - reduces noise and improves maintainability
 */
const makeSchedule = (overrides: Partial<ScheduleEntity> = {}): ScheduleEntity => ({
  id: 'sched',
  scheduleId: 'schedule',
  deviceId: 'device',
  organizationId: 'org',
  preset: 'STANDARD',
  interval: '0 0 * * *',
  status: 'ACTIVE',
  isActive: true,
  nextRunAt: new Date('2025-01-01T00:00:00Z'),
  lastRunAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: null,
  ...overrides,
});

describe('normalizeSchedule', () => {
  it('converts nextRunAt to ISO string', () => {
    const schedule = makeSchedule({
      nextRunAt: new Date('2025-03-01T12:00:00Z'),
    });

    const result = normalizeSchedule(schedule);

    expect(result.nextRunAt).toBe('2025-03-01T12:00:00.000Z');
    expect(result).not.toBe(schedule); // Immutability: returns new object
  });

  it('returns null when nextRunAt missing', () => {
    const schedule = makeSchedule({ nextRunAt: null });

    const result = normalizeSchedule(schedule);

    expect(result.nextRunAt).toBeNull();
  });

  it('handles ISO strings as-is (idempotent)', () => {
    const schedule = makeSchedule({
      nextRunAt: '2025-01-20T15:00:00.000Z' as any,
      lastRunAt: '2025-01-20T14:45:00.000Z' as any,
      createdAt: '2025-01-18T12:00:00.000Z' as any,
      updatedAt: '2025-01-20T14:45:30.000Z' as any,
    });

    const result = normalizeSchedule(schedule);

    expect(result.nextRunAt).toBe('2025-01-20T15:00:00.000Z');
    expect(result.lastRunAt).toBe('2025-01-20T14:45:00.000Z');
    expect(result.createdAt).toBe('2025-01-18T12:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-20T14:45:30.000Z');
  });

  it('handles null lastRunAt', () => {
    const schedule = makeSchedule({
      lastRunAt: null,
      nextRunAt: new Date('2025-01-21T00:00:00Z'),
    });

    const result = normalizeSchedule(schedule);

    expect(result.lastRunAt).toBeNull();
    expect(result.nextRunAt).toBe('2025-01-21T00:00:00.000Z');
  });

  it('handles null updatedAt', () => {
    const schedule = makeSchedule({ updatedAt: null });

    const result = normalizeSchedule(schedule);

    expect(result.updatedAt).toBeNull();
  });

  it('converts all Date fields to ISO strings', () => {
    const schedule = makeSchedule({
      nextRunAt: new Date('2025-01-20T10:00:00Z'),
      lastRunAt: new Date('2025-01-19T10:00:00Z'),
      createdAt: new Date('2025-01-15T08:00:00Z'),
      updatedAt: new Date('2025-01-19T10:05:00Z'),
    });

    const result = normalizeSchedule(schedule);

    expect(result.nextRunAt).toBe('2025-01-20T10:00:00.000Z');
    expect(result.lastRunAt).toBe('2025-01-19T10:00:00.000Z');
    expect(result.createdAt).toBe('2025-01-15T08:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-19T10:05:00.000Z');
  });

  it('preserves all other fields unchanged', () => {
    const schedule = makeSchedule({
      preset: 'CUSTOM',
      status: 'PAUSED',
      isActive: false,
      createdBy: 'user-123',
      customField: 'custom-value',
    } as any);

    const result = normalizeSchedule(schedule);

    expect(result.preset).toBe('CUSTOM');
    expect(result.status).toBe('PAUSED');
    expect(result.isActive).toBe(false);
    expect(result.createdBy).toBe('user-123');
    expect((result as any).customField).toBe('custom-value');
  });
});

describe('normalizeScheduleList', () => {
  it('normalizes each schedule in list', () => {
    const list = normalizeScheduleList([
      makeSchedule({ id: 'a', nextRunAt: new Date('2025-01-01T00:00:00Z') }),
      makeSchedule({ id: 'b', nextRunAt: null }),
    ]);

    expect(list[0].nextRunAt).toBe('2025-01-01T00:00:00.000Z');
    expect(list[1].nextRunAt).toBeNull();
  });

  it('handles empty array', () => {
    const result = normalizeScheduleList([]);
    expect(result).toEqual([]);
  });

  it('returns new object references (immutability)', () => {
    const schedules = [
      makeSchedule({ id: 'sched-1' }),
      makeSchedule({ id: 'sched-2' }),
    ];

    const result = normalizeScheduleList(schedules);

    expect(result[0]).not.toBe(schedules[0]);
    expect(result[1]).not.toBe(schedules[1]);
  });

  it('handles mixed Date and ISO string fields', () => {
    const schedules = [
      makeSchedule({
        id: 'mixed-1',
        nextRunAt: new Date('2025-01-20T10:00:00Z'),
        lastRunAt: '2025-01-19T10:00:00.000Z' as any,
      }),
      makeSchedule({
        id: 'mixed-2',
        nextRunAt: '2025-01-21T00:00:00.000Z' as any,
        lastRunAt: new Date('2025-01-20T12:00:00Z'),
      }),
      makeSchedule({
        id: 'mixed-3',
        nextRunAt: null,
        lastRunAt: null,
      }),
    ];

    const result = normalizeScheduleList(schedules);

    expect(result).toHaveLength(3);
    expect(result[0].nextRunAt).toBe('2025-01-20T10:00:00.000Z');
    expect(result[0].lastRunAt).toBe('2025-01-19T10:00:00.000Z');
    expect(result[1].nextRunAt).toBe('2025-01-21T00:00:00.000Z');
    expect(result[1].lastRunAt).toBe('2025-01-20T12:00:00.000Z');
    expect(result[2].nextRunAt).toBeNull();
    expect(result[2].lastRunAt).toBeNull();
  });

  it('preserves order of schedules', () => {
    const schedules = [
      makeSchedule({ id: 'sched-3' }),
      makeSchedule({ id: 'sched-1' }),
      makeSchedule({ id: 'sched-2' }),
    ];

    const result = normalizeScheduleList(schedules);

    expect(result.map((s) => s.id)).toEqual(['sched-3', 'sched-1', 'sched-2']);
  });
});
