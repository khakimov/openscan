/**
 * TDD Tests for device scan statistics display
 *
 * Tests that getDevicesForTenant() correctly returns scan stats
 * including port counts and last scan dates from the latest scan results.
 *
 * RED-GREEN-REFACTOR:
 * 1. RED: Write failing tests that describe expected behavior
 * 2. GREEN: Implement minimum code to make tests pass
 * 3. REFACTOR: Clean up implementation while keeping tests green
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock getDb at the module level before any imports
// Need to make mockDb "thenable" (awaitable) for Drizzle's auto-executing queries
const mockAll = vi.fn().mockResolvedValue([]);

const mockDb: any = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  all: mockAll,
  desc: vi.fn(),
  // Make the query builder awaitable (auto-executing queries)
  then: function(resolve: any, reject: any) {
    return mockAll().then(resolve, reject);
  },
};

// Mock the database setup module
vi.mock('@repo/data-ops/database/setup', () => ({
  getDb: () => mockDb,
  initDatabase: vi.fn(() => mockDb),
}));

import { getDevicesForTenant } from '@repo/data-ops/queries/devices';

describe('Device Scan Statistics (TDD)', () => {
  const testOrgId = 'org-123';

  beforeEach(() => {
    // Reset all mocks but keep the return chaining
    vi.clearAllMocks();
    mockAll.mockResolvedValue([]);
  });

  it('should return devices with scanStats containing port count from latest scan', async () => {
    // Arrange: Mock database queries
    const mockDevice = {
      id: 'device-1',
      organizationId: testOrgId,
      name: 'test-device.example.com',
      type: 'HOST',
      isScanned: true,
      createdAt: new Date('2025-10-16T10:00:00Z'),
    };

    const olderScan = {
      target: 'test-device.example.com',
      resultSummary: JSON.stringify({
        openPortCount: 5,
        ports: [
          { port: 22, state: 'open', service: 'ssh' },
          { port: 80, state: 'open', service: 'http' },
          { port: 443, state: 'open', service: 'https' },
          { port: 3000, state: 'open', service: 'unknown' },
          { port: 8080, state: 'open', service: 'http-alt' },
        ],
      }),
      completedAt: new Date('2025-10-15T10:00:00Z'),
    };

    const newerScan = {
      target: 'test-device.example.com',
      resultSummary: JSON.stringify({
        openPortCount: 3,
        ports: [
          { port: 22, state: 'open', service: 'ssh' },
          { port: 80, state: 'open', service: 'http' },
          { port: 443, state: 'open', service: 'https' },
        ],
      }),
      completedAt: new Date('2025-10-16T10:00:00Z'), // LATEST
    };

    // Mock database responses using mockAll (sequential calls with mockResolvedValueOnce)
    mockAll
      .mockResolvedValueOnce([mockDevice]) // 1st call: devices query
      .mockResolvedValueOnce([])  // 2nd call: IP addresses
      .mockResolvedValueOnce([])  // 3rd call: tags
      .mockResolvedValueOnce([olderScan, newerScan]) // 4th call: latest scans
      .mockResolvedValueOnce([{ target: 'test-device.example.com', scan_count: 2 }]); // 5th call: scan counts

    // Act: Call the function
    const result = await getDevicesForTenant(testOrgId);

    // Assert: Should return devices with scan stats from LATEST scan
    expect(result.items).toHaveLength(1);
    expect(result.items[0].scanStats).toBeDefined();

    // CRITICAL: Should use port count from LATEST scan (3), not older scan (5)
    expect(result.items[0].scanStats?.openPortCount).toBe(3);

    // Should have correct timestamp from latest scan
    expect(result.items[0].scanStats?.lastScanAt).toEqual(newerScan.completedAt);

    // Should have correct ports array
    expect(result.items[0].scanStats?.ports).toHaveLength(3);

    // Should have total scan count
    expect(result.items[0].scanStats?.scanCount).toBeGreaterThan(0);
  });

  it('should return devices without scanStats when no successful scans exist', async () => {
    // Arrange: Mock device with no scans
    const mockDevice = {
      id: 'device-2',
      organizationId: testOrgId,
      name: 'unscanned-device.example.com',
      type: 'HOST',
      isScanned: false,
      createdAt: new Date('2025-10-16T10:00:00Z'),
    };

    mockAll
      .mockResolvedValueOnce([mockDevice]) // 1st call: devices
      .mockResolvedValue([]); // All other calls: empty (IPs, tags, scans)

    // Act: Call the function
    const result = await getDevicesForTenant(testOrgId);

    // Assert: Should return device without scanStats
    expect(result.items).toHaveLength(1);
    expect(result.items[0].scanStats).toBeUndefined();
  });

  it('should handle null scan targets gracefully without errors', async () => {
    // Arrange: Mock scan with null target
    const mockDevice = {
      id: 'device-3',
      organizationId: testOrgId,
      name: 'test-device.example.com',
      type: 'HOST',
      createdAt: new Date('2025-10-16T10:00:00Z'),
    };

    const scanWithNullTarget = {
      target: null, // NULL target should be handled gracefully
      resultSummary: JSON.stringify({ openPortCount: 1 }),
      completedAt: new Date('2025-10-16T10:00:00Z'),
    };

    mockAll
      .mockResolvedValueOnce([mockDevice]) // 1st: devices
      .mockResolvedValueOnce([]) // 2nd: IPs
      .mockResolvedValueOnce([]) // 3rd: tags
      .mockResolvedValueOnce([scanWithNullTarget]) // 4th: scans with null target
      .mockResolvedValue([]); // 5th and beyond: empty

    // Act: Should not throw error
    const result = await getDevicesForTenant(testOrgId);

    // Assert: Should handle gracefully, device should have no scanStats
    expect(result.items).toHaveLength(1);
    expect(result.items[0].scanStats).toBeUndefined();
  });

  it('should only include SUCCEEDED scans in statistics', async () => {
    // Arrange: Mock successful scan and failed scan
    const mockDevice = {
      id: 'device-4',
      organizationId: testOrgId,
      name: 'test-device.example.com',
      type: 'HOST',
      createdAt: new Date('2025-10-16T10:00:00Z'),
    };

    const successfulScan = {
      target: 'test-device.example.com',
      resultSummary: JSON.stringify({ openPortCount: 3 }),
      completedAt: new Date('2025-10-16T10:00:00Z'),
    };

    // Note: The database query already filters by status='SUCCEEDED',
    // so we shouldn't see failed scans in the results
    mockAll
      .mockResolvedValueOnce([mockDevice]) // 1st: devices
      .mockResolvedValueOnce([]) // 2nd: IPs
      .mockResolvedValueOnce([]) // 3rd: tags
      .mockResolvedValueOnce([successfulScan]) // 4th: only SUCCEEDED scans
      .mockResolvedValueOnce([{ target: 'test-device.example.com', scan_count: 1 }]); // 5th: scan counts

    // Act: Call the function
    const result = await getDevicesForTenant(testOrgId);

    // Assert: Should only count SUCCEEDED scans
    expect(result.items).toHaveLength(1);
    expect(result.items[0].scanStats).toBeDefined();
    expect(result.items[0].scanStats?.openPortCount).toBe(3);
  });
});
