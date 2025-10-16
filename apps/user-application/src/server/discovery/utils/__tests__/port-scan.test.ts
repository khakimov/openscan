/**
 * Tests for port scan utilities (TDD for callbackUrl injection)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildScannerInput } from '../port-scan';
import type { PortScanInput } from '@repo/contracts';

describe('buildScannerInput', () => {
  const originalEnv = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    // Set test server URL
    (process.env as Record<string, string>).BETTER_AUTH_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    // Restore original env
    process.env.BETTER_AUTH_URL = originalEnv;
  });

  describe('callbackUrl injection', () => {
    it('should inject callbackUrl in metadata when deviceId is present', () => {
      const input: PortScanInput = {
        target: '192.168.1.1',
        protocol: 'tcp',
        timeout: 30000,
        deviceId: 'device-123',
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'INTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.deviceId).toBe('device-123');
      expect(result.metadata?.callbackUrl).toBe('http://localhost:3000/api/internal/scan-results');
    });

    it('should inject callbackUrl in metadata even when deviceId is not present', () => {
      const input: PortScanInput = {
        target: '192.168.1.1',
        protocol: 'tcp',
        timeout: 30000,
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'INTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.callbackUrl).toBe('http://localhost:3000/api/internal/scan-results');
    });

    it('should use BETTER_AUTH_URL from environment to construct callbackUrl', () => {
      (process.env as Record<string, string>).BETTER_AUTH_URL = 'https://example.com';

      const input: PortScanInput = {
        target: '192.168.1.1',
        protocol: 'tcp',
        timeout: 30000,
        deviceId: 'device-456',
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'INTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      expect(result.metadata?.callbackUrl).toBe('https://example.com/api/internal/scan-results');
    });

    it('should handle missing BETTER_AUTH_URL gracefully', () => {
      delete (process.env as Record<string, string | undefined>).BETTER_AUTH_URL;

      const input: PortScanInput = {
        target: '192.168.1.1',
        protocol: 'tcp',
        timeout: 30000,
        deviceId: 'device-789',
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'INTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      // Should not inject callbackUrl if server URL is not configured
      expect(result.metadata?.deviceId).toBe('device-789');
      expect(result.metadata?.callbackUrl).toBeUndefined();
    });
  });

  describe('existing functionality (regression guards)', () => {
    it('should preserve deviceId in targets[0].id', () => {
      const input: PortScanInput = {
        target: '192.168.1.1',
        protocol: 'tcp',
        timeout: 30000,
        deviceId: 'device-123',
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'INTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      expect(result.targets[0].id).toBe('device-123');
    });

    it('should build correct ScannerInput structure', () => {
      const input: PortScanInput = {
        target: 'example.com',
        protocol: 'tcp',
        timeout: 30000,
        ports: [80, 443],
        scanProfile: 'PS_L3',
      };

      const result = buildScannerInput({
        tenantId: 'tenant-1',
        userId: 'user-1',
        input,
        scope: 'EXTERNAL',
        scanWorkflowId: 'workflow-1',
        scanRunId: 'run-1',
      });

      expect(result.tenantId).toBe('tenant-1');
      expect(result.workflowId).toBe('workflow-1');
      expect(result.scanRunId).toBe('run-1');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].value).toBe('example.com');
      expect(result.scanOptions?.requestedPorts).toEqual([80, 443]);
      expect(result.scanOptions?.profile).toBe('PS_L3');
    });
  });
});
