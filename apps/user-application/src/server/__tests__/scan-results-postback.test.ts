/**
 * Tests for scan results postback endpoint (TDD)
 *
 * This endpoint receives scan results from the restate-worker via postback.
 * See apps/restate-worker/CLAUDE.md for architecture.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleScanResultsPostback } from '../scan-results-postback';

// Mock @repo/data-ops module
vi.mock('@repo/data-ops', async () => {
  const actual = await vi.importActual('@repo/data-ops');
  return {
    ...actual,
    getDeviceByIdGlobal: vi.fn(),
    updateDevice: vi.fn(),
    getScanWorkflowByWorkflowId: vi.fn(),
    updateScanRunStatus: vi.fn(),
    updateScanWorkflowStatus: vi.fn(),
    getDb: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    })),
    scanRuns: {},
    eq: vi.fn(),
  };
});

// Import mocked functions
import {
  getDeviceByIdGlobal,
  updateDevice,
  getScanWorkflowByWorkflowId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
  getDb,
} from '@repo/data-ops';

describe('handleScanResultsPostback', () => {
  const originalEnv = process.env.WORKER_API_KEY;

  beforeEach(() => {
    // Set test API key
    process.env.WORKER_API_KEY = 'test-api-key-12345';

    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getDeviceByIdGlobal).mockResolvedValue({
      id: 'device-123',
      organizationId: 'org-123',
      name: 'test-device',
      ip: '192.168.1.1',
      tags: [],
    } as any);

    vi.mocked(updateDevice).mockResolvedValue({} as any);
  });

  afterEach(() => {
    // Restore original env
    process.env.WORKER_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          workflowId: 'workflow-456',
          results: { ports: [] },
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(401);
      const json = await response.json() as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should reject requests with wrong API key', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-key',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          workflowId: 'workflow-456',
          results: { ports: [] },
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(401);
      const json = await response.json() as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should accept requests with correct API key', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          workflowId: 'workflow-456',
          results: {
            ports: [],
            osInfo: null,
            timing: { start: 1000, end: 2000, elapsed: 1000 },
            scanMetadata: { scanner: 'nmap' },
          },
        }),
      });

      const response = await handleScanResultsPostback(request);

      // Should not be 401
      expect(response.status).not.toBe(401);
    });
  });

  describe('Payload Validation', () => {
    it('should reject requests without deviceId', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          workflowId: 'workflow-456',
          results: { ports: [] },
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(400);
      const json = await response.json() as { error: string };
      expect(json.error).toContain('deviceId');
    });

    it('should reject requests without workflowId', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          results: { ports: [] },
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(400);
      const json = await response.json() as { error: string };
      expect(json.error).toContain('workflowId');
    });

    it('should reject requests without results', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          workflowId: 'workflow-456',
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(400);
      const json = await response.json() as { error: string };
      expect(json.error).toContain('results');
    });
  });

  describe('Persistence', () => {
    it('should return 404 if device does not exist', async () => {
      // Mock device not found
      vi.mocked(getDeviceByIdGlobal).mockResolvedValue(null);

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          deviceId: 'nonexistent-device',
          workflowId: 'workflow-456',
          results: {
            ports: [],
            osInfo: null,
            timing: {},
            scanMetadata: {},
          },
        }),
      });

      const response = await handleScanResultsPostback(request);

      expect(response.status).toBe(404);
      const json = await response.json() as { error: string };
      expect(json.error).toContain('Device not found');
    });

    it('should successfully persist scan results for valid device', async () => {
      // This test will be implemented once we have the persistence logic
      // For now, it's a placeholder to guide implementation
      expect(true).toBe(true);
    });
  });
});
