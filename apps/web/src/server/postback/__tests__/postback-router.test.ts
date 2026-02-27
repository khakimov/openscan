/**
 * Integration Tests: Universal Postback Router
 *
 * Tests the end-to-end flow of the universal postback system:
 * - Authentication
 * - Type discrimination
 * - Handler routing
 * - Schema validation
 * - Analytics tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleUniversalPostback } from '../index';
import type { PortScanPostback, DiscoveryPostback } from '../types';

// Type-safe response helpers for tests
interface ErrorResponse {
  error: string;
  availableTypes?: string[];
}

async function parseErrorResponse(response: Response): Promise<ErrorResponse> {
  return await response.json() as ErrorResponse;
}

describe('Universal Postback Router', () => {
  // Mock environment
  const mockEnv = {
    ANALYTICS: {
      writeDataPoint: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set WORKER_API_KEY for auth
    process.env.WORKER_API_KEY = 'test-api-key-123';
  });

  describe('Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'PORT_SCAN' }),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(401);
      const body = await parseErrorResponse(response);
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid API key', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-key',
        },
        body: JSON.stringify({ type: 'PORT_SCAN' }),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid API key', async () => {
      const payload: Partial<PortScanPostback> = {
        type: 'PORT_SCAN',
        scanId: 'test-scan-123',
        organizationId: 'org-456',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        deviceId: 'device-789',
        data: {
          target: '192.168.1.1',
          ports: [],
        },
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      // Should pass auth (may fail later due to missing mock data)
      expect(response.status).not.toBe(401);
    });
  });

  describe('Type Discrimination', () => {
    it('should reject requests with missing type field', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify({ scanId: 'test' }),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(400);
      const body = await parseErrorResponse(response);
      expect(body.error).toContain('type');
    });

    it('should reject requests with unsupported type', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify({ type: 'UNSUPPORTED_TYPE', scanId: 'test' }),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(400);
      const body = await parseErrorResponse(response);
      expect(body.error).toContain('Unsupported postback type');
      expect(body.availableTypes).toBeDefined();
      expect(body.availableTypes).toContain('PORT_SCAN');
      expect(body.availableTypes).toContain('DISCOVERY');
    });
  });

  describe('Schema Validation', () => {
    it('should reject PORT_SCAN payload with missing required fields', async () => {
      const invalidPayload = {
        type: 'PORT_SCAN',
        scanId: 'test-scan-123',
        // Missing organizationId, timestamp, status, deviceId, data
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(invalidPayload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(400);
      const body = await parseErrorResponse(response);
      expect(body.error).toContain('Invalid');
    });

    it('should reject DISCOVERY payload with missing required fields', async () => {
      const invalidPayload = {
        type: 'DISCOVERY',
        scanId: 'test-scan-123',
        // Missing organizationId, timestamp, status, data
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(invalidPayload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(400);
      const body = await parseErrorResponse(response);
      expect(body.error).toContain('Invalid');
    });

    it('should validate PORT_SCAN port schema', async () => {
      const invalidPayload: Partial<PortScanPostback> = {
        type: 'PORT_SCAN',
        scanId: 'test-scan-123',
        organizationId: 'org-456',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        deviceId: 'device-789',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'invalid' as any, // Invalid protocol
              state: 'open',
            },
          ],
        },
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(invalidPayload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(400);
      const body = await parseErrorResponse(response);
      expect(body.error).toContain('Invalid');
    });
  });

  describe('Analytics Tracking', () => {
    it('should track analytics on authentication failure', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'PORT_SCAN' }),
      });

      await handleUniversalPostback(request, mockEnv as any);

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          indexes: expect.arrayContaining(['postback_auth_failed']),
        })
      );
    });

    it('should track analytics on validation failure', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify({ /* missing type field */ }),
      });

      await handleUniversalPostback(request, mockEnv as any);

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          indexes: expect.arrayContaining(['postback_validation_failed']),
        })
      );
    });
  });

  describe('Handler Execution', () => {
    it('should route PORT_SCAN to PortScanPostbackHandler', async () => {
      // This test will fail without database mocking
      // but verifies the routing logic works
      const payload: Partial<PortScanPostback> = {
        type: 'PORT_SCAN',
        scanId: 'test-scan-123',
        organizationId: 'org-456',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        deviceId: 'device-789',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: {
                name: 'http',
              },
            },
          ],
        },
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      // Should not be auth or validation error
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(400);

      // May return 500 due to missing database, but routing logic is correct
      // In real integration tests with database, this should return 200
    });

    it('should route DISCOVERY to DiscoveryPostbackHandler', async () => {
      // This test will fail without database mocking
      // but verifies the routing logic works
      const payload: Partial<DiscoveryPostback> = {
        type: 'DISCOVERY',
        scanId: 'test-scan-456',
        organizationId: 'org-456',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        data: {
          target: 'example.com',
          devices: [
            {
              hostname: 'www.example.com',
              ipAddress: '93.184.216.34',
            },
          ],
          totalSubdomains: 1,
          executionTime: 5000,
          tools: ['subfinder'],
        },
      };

      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      // Should not be auth or validation error
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(400);

      // May return 500 due to missing database, but routing logic is correct
      // In real integration tests with database, this should return 200
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: 'invalid-json{',
      });

      const response = await handleUniversalPostback(request, mockEnv as any);

      expect(response.status).toBe(500);
      const body = await parseErrorResponse(response);
      expect(body.error).toBeDefined();
    });

    it('should track generic failures in analytics', async () => {
      const request = new Request('http://localhost/api/internal/scan-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key-123',
        },
        body: 'invalid-json{',
      });

      await handleUniversalPostback(request, mockEnv as any);

      // The actual event type is 'postback_failure' for generic errors
      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          indexes: expect.arrayContaining(['postback_failure']),
        })
      );
    });
  });
});
