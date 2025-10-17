import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { RestateTestEnvironment } from '@restatedev/restate-sdk-testcontainers';
import * as clients from '@restatedev/restate-sdk-clients';

/**
 * Discovery Workflow Integration Test (sec-29)
 *
 * This test verifies the complete discovery workflow end-to-end:
 * 1. Input validation phase
 * 2. Discovery execution (subfinder, amass, assetfinder)
 * 3. Deduplication
 * 4. Result aggregation
 * 5. State queries during execution
 *
 * Uses Restate testcontainers to test the actual service deployment.
 * Tools are mocked to avoid requiring real subfinder/amass/assetfinder.
 *
 * Note: Following TDD - test written BEFORE service implementation
 */

// Mock child_process BEFORE importing the service
vi.mock('child_process', () => ({
  execFile: vi.fn((tool: string, args: string[], _opts: any, callback: any) => {
    // Mock subfinder output
    if (tool.includes('subfinder')) {
      const domain = args[args.indexOf('-d') + 1];
      callback(null, {
        stdout: `{"host":"api.${domain}","ip":"1.2.3.4","source":"crtsh"}\n{"host":"www.${domain}","ip":"1.2.3.5","source":"alienvault"}\n`,
        stderr: '',
      });
    }
    // Mock amass output
    else if (tool.includes('amass')) {
      const domain = args[args.indexOf('-d') + 1];
      callback(null, {
        stdout: `api.${domain}\nmail.${domain}\n`,
        stderr: '',
      });
    }
    // Mock assetfinder output
    else if (args.length === 1) {
      const domain = args[0];
      callback(null, {
        stdout: `staging.${domain}\n`,
        stderr: '',
      });
    }
    return {} as any;
  }),
}));

// Import after mocking
import { discoveryService } from '../discovery-service';

// Types for the service API we'll implement
interface DiscoveryInput {
  targets: Array<{
    type: 'DOMAIN' | 'IP' | 'CIDR';
    value: string;
    scope: 'EXTERNAL' | 'INTERNAL';
  }>;
  tools?: Array<'subfinder' | 'amass' | 'assetfinder'>;
  enablePingSweep?: boolean;
  scanId?: string;
}

// Types are inferred from service - these are just for documentation

/**
 * Integration tests requiring Docker testcontainers
 * Skipped by default - run with Docker available
 */
describe.skip('Discovery Workflow Integration (sec-29)', () => {
  let restateTestEnvironment: RestateTestEnvironment;
  let restateIngress: clients.Ingress;

  beforeAll(async () => {
    // Start Restate container and register discovery service
    restateTestEnvironment = await RestateTestEnvironment.start((restateServer) => {
      restateServer.bind(discoveryService);
    });

    restateIngress = clients.connect({ url: restateTestEnvironment.baseUrl() });
  }, 60000); // Testcontainers needs time

  afterAll(async () => {
    if (restateTestEnvironment) {
      await restateTestEnvironment.stop();
    }
  });

  describe('Single Domain Discovery', () => {
    it('should discover subdomains for a single domain', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          {
            type: 'DOMAIN',
            value: 'example.com',
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      // Verify output structure
      expect(result.scanId).toBeDefined();
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();

      // Verify devices were found
      expect(result.devices.length).toBeGreaterThan(0);
      expect(result.devices[0]).toMatchObject({
        scope: 'EXTERNAL',
        hostname: expect.stringContaining('example.com'),
        discoveryMethod: 'subfinder',
        confidence: expect.any(Number),
        metadata: {
          originalDomain: 'example.com',
        },
      });

      // Verify aggregation
      expect(result.totalTargetsProcessed).toBe(1);
      expect(result.errors).toEqual([]);

      // Verify performance metrics
      expect(result.performance.executionTimeMs).toBeGreaterThan(0);
      expect(result.performance.devicesPerSecond).toBeGreaterThan(0);
    });

    it('should use all specified tools for discovery', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          {
            type: 'DOMAIN',
            value: 'example.com',
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder', 'amass', 'assetfinder'],
      };

      const result = await client.discover(input);

      // Should have devices from all three tools
      const methods = new Set(result.devices.map((d) => d.discoveryMethod));
      expect(methods.has('subfinder')).toBe(true);
      expect(methods.has('amass')).toBe(true);
      expect(methods.has('assetfinder')).toBe(true);
    });

    it('should deduplicate devices found by multiple tools', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          {
            type: 'DOMAIN',
            value: 'example.com',
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder', 'amass'], // Both will find api.example.com
      };

      const result = await client.discover(input);

      // Count how many times api.example.com appears
      const apiDevices = result.devices.filter((d) => d.hostname === 'api.example.com');

      // Should be deduplicated to 1 (keeping highest confidence)
      expect(apiDevices.length).toBe(1);
    });
  });

  describe('Multiple Domain Discovery', () => {
    it('should process multiple domains in sequence', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
          { type: 'DOMAIN', value: 'test.org', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      expect(result.totalTargetsProcessed).toBe(2);

      // Should have devices from both domains
      const domains = new Set(result.devices.map((d) => d.metadata.originalDomain));
      expect(domains.has('example.com')).toBe(true);
      expect(domains.has('test.org')).toBe(true);
    });

    it('should handle mixed target types', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      // Should process domain with tools, IP directly
      expect(result.totalTargetsProcessed).toBe(2);

      // Should have subdomain discoveries
      const domainDevices = result.devices.filter((d) => d.scope === 'EXTERNAL');
      expect(domainDevices.length).toBeGreaterThan(0);

      // Should have IP device added directly
      const ipDevices = result.devices.filter((d) => d.scope === 'INTERNAL');
      expect(ipDevices.length).toBe(1);
      expect(ipDevices[0].ipAddress).toBe('192.168.1.1');
      expect(ipDevices[0].discoveryMethod).toBe('direct');
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid domain format', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          {
            type: 'DOMAIN',
            value: 'invalid;domain',
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder'],
      };

      await expect(client.discover(input)).rejects.toThrow(/invalid.*domain/i);
    });

    it('should reject shell metacharacters', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          {
            type: 'DOMAIN',
            value: 'example.com; rm -rf /',
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder'],
      };

      await expect(client.discover(input)).rejects.toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject empty targets array', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [],
        tools: ['subfinder'],
      };

      await expect(client.discover(input)).rejects.toThrow(/empty|no targets/i);
    });
  });

  describe('Error Handling', () => {
    it('should continue with other targets if one fails', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'invalid;domain', scope: 'EXTERNAL' }, // Will fail validation
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' }, // Will succeed
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      // Should complete with 1 successful target
      expect(result.totalTargetsProcessed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('invalid;domain');

      // Should have devices from the successful target
      expect(result.devices.length).toBeGreaterThan(0);
    });

    it('should include error details in output', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'bad$(whoami)', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('bad$(whoami)');
      expect(result.errors[0]).toMatch(/shell metacharacter|dangerous/i);
    });
  });

  describe('State Queries', () => {
    it('should provide state information during execution', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        scanId: 'test-scan-123',
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      // Start discovery (non-blocking if possible, but for this test we'll just complete it)
      const result = await client.discover(input);

      // Query final state
      const state = await client.getState({ scanId: result.scanId });

      expect(state).toMatchObject({
        phase: 'COMPLETED',
        totalTargets: 1,
        processedTargets: 1,
        devicesFound: expect.any(Number),
        errors: [],
      });
    });
  });

  describe('Scope Configuration', () => {
    it('should respect EXTERNAL scope', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      expect(result.devices.every((d) => d.scope === 'EXTERNAL')).toBe(true);
    });

    it('should respect INTERNAL scope', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
      };

      const result = await client.discover(input);

      expect(result.devices.every((d) => d.scope === 'INTERNAL')).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate devices per second', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      const { executionTimeMs, devicesPerSecond } = result.performance;

      expect(executionTimeMs).toBeGreaterThan(0);
      expect(devicesPerSecond).toBeGreaterThan(0);

      // Sanity check: devicesPerSecond = (devices / executionTimeMs) * 1000
      const calculatedRate = (result.devices.length / executionTimeMs) * 1000;
      expect(Math.abs(devicesPerSecond - calculatedRate)).toBeLessThan(0.1);
    });

    it('should include timing information', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      // Verify timestamps are valid ISO strings
      expect(new Date(result.startedAt).toISOString()).toBe(result.startedAt);
      expect(new Date(result.completedAt).toISOString()).toBe(result.completedAt);

      // completedAt should be after startedAt
      expect(new Date(result.completedAt).getTime()).toBeGreaterThan(
        new Date(result.startedAt).getTime()
      );
    });
  });

  describe('Custom Scan ID', () => {
    it('should use provided scanId if specified', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const customScanId = 'my-custom-scan-id-123';

      const input: DiscoveryInput = {
        scanId: customScanId,
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      expect(result.scanId).toBe(customScanId);
    });

    it('should generate scanId if not provided', async () => {
      const client = restateIngress.serviceClient(discoveryService);

      const input: DiscoveryInput = {
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      };

      const result = await client.discover(input);

      expect(result.scanId).toBeDefined();
      expect(result.scanId.length).toBeGreaterThan(0);
    });
  });
});
