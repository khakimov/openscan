import { describe, it, expect } from 'vitest';
import { normalizeNotification, normalizeNotificationList } from '../normalize-notification';

describe('normalizeNotification', () => {
  it('should normalize valid notification with all fields', () => {
    const record = {
      id: '123',
      type: 'NEW_PORT',
      severity: 'CRITICAL',
      title: 'Port 443 opened',
      message: 'HTTPS port detected',
      data: { port: 443 },
      readAt: new Date('2025-01-15T10:00:00Z'),
      createdAt: new Date('2025-01-15T09:00:00Z'),
      deviceId: 'device-1',
      scanRunId: 'scan-1',
    };

    const result = normalizeNotification(record);

    expect(result).toEqual({
      id: '123',
      type: 'NEW_PORT',
      severity: 'CRITICAL',
      title: 'Port 443 opened',
      message: 'HTTPS port detected',
      data: { port: 443 },
      readAt: '2025-01-15T10:00:00.000Z',
      createdAt: '2025-01-15T09:00:00.000Z',
      deviceId: 'device-1',
      scanRunId: 'scan-1',
    });
  });

  it('should convert Date objects to ISO strings', () => {
    const record = {
      id: '456',
      type: 'NEW_CVE',
      severity: 'HIGH',
      title: 'Vulnerability detected',
      createdAt: new Date('2025-01-15T12:00:00Z'),
      readAt: new Date('2025-01-15T13:00:00Z'),
    };

    const result = normalizeNotification(record);

    expect(result?.createdAt).toBe('2025-01-15T12:00:00.000Z');
    expect(result?.readAt).toBe('2025-01-15T13:00:00.000Z');
  });

  it('should handle ISO strings as-is (idempotent)', () => {
    const record = {
      id: '789',
      type: 'CLOSED_PORT',
      severity: 'INFO',
      title: 'Port closed',
      createdAt: '2025-01-15T14:00:00.000Z',
      readAt: '2025-01-15T15:00:00.000Z',
    };

    const result = normalizeNotification(record);

    expect(result?.createdAt).toBe('2025-01-15T14:00:00.000Z');
    expect(result?.readAt).toBe('2025-01-15T15:00:00.000Z');
  });

  it('should return null for invalid notification type', () => {
    const record = {
      id: '999',
      type: 'INVALID_TYPE',
      severity: 'CRITICAL',
      title: 'Test',
      createdAt: new Date(),
    };

    const result = normalizeNotification(record);

    expect(result).toBeNull();
  });

  it('should return null for missing type', () => {
    const record = {
      id: '888',
      severity: 'CRITICAL',
      title: 'Test',
      createdAt: new Date(),
    };

    const result = normalizeNotification(record);

    expect(result).toBeNull();
  });

  it('should default severity to INFO if invalid', () => {
    const record = {
      id: '777',
      type: 'NEW_PORT',
      severity: 'INVALID_SEVERITY',
      title: 'Test',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    };

    const result = normalizeNotification(record);

    expect(result?.severity).toBe('INFO');
  });

  it('should default severity to INFO if missing', () => {
    const record = {
      id: '666',
      type: 'NEW_PORT',
      title: 'Test',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    };

    const result = normalizeNotification(record);

    expect(result?.severity).toBe('INFO');
  });

  it('should use default title if missing', () => {
    const record = {
      id: '555',
      type: 'SERVICE_DRIFT',
      severity: 'MEDIUM',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    };

    const result = normalizeNotification(record);

    expect(result?.title).toBe('Notification');
  });

  it('should handle null optional fields', () => {
    const record = {
      id: '444',
      type: 'CVE_FIXED',
      severity: 'LOW',
      title: 'CVE resolved',
      message: null,
      data: null,
      readAt: null,
      createdAt: new Date('2025-01-15T10:00:00Z'),
      deviceId: null,
      scanRunId: null,
    };

    const result = normalizeNotification(record);

    expect(result).toEqual({
      id: '444',
      type: 'CVE_FIXED',
      severity: 'LOW',
      title: 'CVE resolved',
      message: null,
      data: null,
      readAt: null,
      createdAt: '2025-01-15T10:00:00.000Z',
      deviceId: null,
      scanRunId: null,
    });
  });

  it('should handle missing optional fields', () => {
    const record = {
      id: '333',
      type: 'CVE_REGRESSED',
      severity: 'HIGH',
      title: 'CVE reappeared',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    };

    const result = normalizeNotification(record);

    expect(result?.message).toBeNull();
    expect(result?.data).toBeNull();
    expect(result?.readAt).toBeNull();
    expect(result?.deviceId).toBeNull();
    expect(result?.scanRunId).toBeNull();
  });

  it('should return null for null input', () => {
    const result = normalizeNotification(null);
    expect(result).toBeNull();
  });

  it('should return null for undefined input', () => {
    const result = normalizeNotification(undefined);
    expect(result).toBeNull();
  });

  it('should accept all allowed notification types', () => {
    const allowedTypes = [
      'NEW_PORT',
      'CLOSED_PORT',
      'NEW_CVE',
      'CVE_SEVERITY_INCREASE',
      'CVE_FIXED',
      'CVE_REGRESSED',
      'SERVICE_DRIFT',
    ];

    allowedTypes.forEach((type) => {
      const record = {
        id: '1',
        type,
        severity: 'INFO',
        title: 'Test',
        createdAt: new Date(),
      };

      const result = normalizeNotification(record);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(type);
    });
  });

  it('should accept all allowed severities', () => {
    const allowedSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

    allowedSeverities.forEach((severity) => {
      const record = {
        id: '1',
        type: 'NEW_PORT',
        severity,
        title: 'Test',
        createdAt: new Date(),
      };

      const result = normalizeNotification(record);
      expect(result?.severity).toBe(severity);
    });
  });
});

describe('normalizeNotificationList', () => {
  it('should normalize array of valid notifications', () => {
    const records = [
      {
        id: '1',
        type: 'NEW_PORT',
        severity: 'CRITICAL',
        title: 'Port 1',
        createdAt: new Date('2025-01-15T10:00:00Z'),
      },
      {
        id: '2',
        type: 'NEW_CVE',
        severity: 'HIGH',
        title: 'CVE 1',
        createdAt: new Date('2025-01-15T11:00:00Z'),
      },
    ];

    const result = normalizeNotificationList(records);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('2');
  });

  it('should filter out null results (invalid types)', () => {
    const records = [
      {
        id: '1',
        type: 'NEW_PORT',
        severity: 'CRITICAL',
        title: 'Valid',
        createdAt: new Date(),
      },
      {
        id: '2',
        type: 'INVALID_TYPE',
        severity: 'HIGH',
        title: 'Invalid',
        createdAt: new Date(),
      },
      {
        id: '3',
        type: 'CLOSED_PORT',
        severity: 'INFO',
        title: 'Valid',
        createdAt: new Date(),
      },
    ];

    const result = normalizeNotificationList(records);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
  });

  it('should handle empty array', () => {
    const result = normalizeNotificationList([]);
    expect(result).toEqual([]);
  });

  it('should handle all invalid records', () => {
    const records = [
      { id: '1', type: 'INVALID', createdAt: new Date() },
      { id: '2', type: 'ALSO_INVALID', createdAt: new Date() },
    ];

    const result = normalizeNotificationList(records);
    expect(result).toEqual([]);
  });
});
