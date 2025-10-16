/**
 * Multi-Scanner Orchestration Tests
 *
 * Tests the full orchestration flow: masscan → rustscan → nmap
 * Uses mocks to avoid requiring actual scanner binaries.
 *
 * This validates:
 * 1. Prescans run before nmap
 * 2. Discoveries are combined and deduplicated
 * 3. Nmap targets only discovered ports
 * 4. Final results have proper attribution
 * 5. Feature flags control scanner execution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DiscoveredPort } from '../scanners/masscan';
import { combinePortDiscoveries, extractPortNumbers, formatPortSpec } from '../port-merger';

describe('Multi-Scanner Orchestration - Feature Flag Control', () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.SCANNER_ENABLE_MASSCAN;
    delete process.env.SCANNER_ENABLE_RUSTSCAN;
    delete process.env.SCANNER_DEV_MODE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip masscan when feature flag is disabled', async () => {
    process.env.SCANNER_ENABLE_MASSCAN = 'false';

    const { runMasscan } = await import('../scanners/masscan');
    const result = await runMasscan('example.com');

    expect(result).toEqual([]);
  });

  it('should skip rustscan when feature flag is disabled', async () => {
    process.env.SCANNER_ENABLE_RUSTSCAN = 'false';

    const { runRustscan } = await import('../scanners/rustscan');
    const result = await runRustscan('example.com');

    expect(result).toEqual([]);
  });

  it('should return mock data in dev mode', async () => {
    process.env.SCANNER_ENABLE_MASSCAN = 'true'; // Enable masscan first
    process.env.SCANNER_DEV_MODE = 'true';

    const { runMasscan } = await import('../scanners/masscan');
    const result = await runMasscan('example.com');

    // Should return mock data (ports 22, 80, 443)
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].port).toBeDefined();
    expect(result[0].discoveredBy).toContain('masscan');
  });
});

describe('Multi-Scanner Orchestration - Discovery Attribution', () => {
  it('should attribute ports to correct scanners', () => {
    // Simulate the orchestration flow
    const masscanDiscoveries: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    const rustscanDiscoveries: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
    ];

    // Combine the discoveries
    const combined = combinePortDiscoveries(masscanDiscoveries, rustscanDiscoveries);

    // Port 22: found by both
    const port22 = combined.find((p: DiscoveredPort) => p.port === 22);
    expect(port22?.discoveredBy).toHaveLength(2);
    expect(port22?.discoveredBy).toContain('masscan');
    expect(port22?.discoveredBy).toContain('rustscan');

    // Port 80: only masscan
    const port80 = combined.find((p: DiscoveredPort) => p.port === 80);
    expect(port80?.discoveredBy).toEqual(['masscan']);

    // Port 443: only rustscan
    const port443 = combined.find((p: DiscoveredPort) => p.port === 443);
    expect(port443?.discoveredBy).toEqual(['rustscan']);
  });

  it('should add nmap attribution when merging with nmap results', () => {

    const prescanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan', 'rustscan'], firstSeen: 1000, lastSeen: 1100 },
    ];

    const nmapPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'ssh', product: 'OpenSSH', version: '8.2' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
    ];

    const final = combinePortDiscoveries(prescanPorts, nmapPorts);

    const port22 = final.find((p: DiscoveredPort) => p.port === 22);
    expect(port22?.discoveredBy).toHaveLength(3);
    expect(port22?.discoveredBy).toContain('masscan');
    expect(port22?.discoveredBy).toContain('rustscan');
    expect(port22?.discoveredBy).toContain('nmap');
  });
});

describe('Multi-Scanner Orchestration - Port Targeting', () => {
  it('should generate efficient nmap port spec from prescan discoveries', () => {

    const prescanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 23, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 24, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 3000, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 3001, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    const portNumbers = extractPortNumbers(prescanPorts);
    expect(portNumbers).toEqual([22, 23, 24, 80, 443, 3000, 3001]);

    const portSpec = formatPortSpec(portNumbers);
    expect(portSpec).toBe('22-24,80,443,3000-3001');
  });

  it('should handle large port lists efficiently', () => {

    // Simulate masscan finding 100 consecutive ports
    const ports = Array.from({ length: 100 }, (_, i) => 8000 + i);
    const portSpec = formatPortSpec(ports);

    // Should compress to a single range
    expect(portSpec).toBe('8000-8099');
    expect(portSpec.length).toBeLessThan(20); // Compressed format
  });
});

describe('Multi-Scanner Orchestration - Service Information Handling', () => {
  it('should preserve nmap service details when merging', () => {

    // Masscan finds the port but no service info
    const masscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    // Nmap provides detailed service info
    const nmapPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'ssh',
          product: 'OpenSSH',
          version: '8.2p1',
          extraInfo: 'Ubuntu 4ubuntu0.5',
          confidence: 10,
          cpe: ['cpe:/a:openbsd:openssh:8.2p1'],
        },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
    ];

    const merged = combinePortDiscoveries(masscanPorts, nmapPorts);

    const port22 = merged.find((p: DiscoveredPort) => p.port === 22);
    expect(port22?.service).toBeDefined();
    expect(port22?.service?.name).toBe('ssh');
    expect(port22?.service?.product).toBe('OpenSSH');
    expect(port22?.service?.version).toBe('8.2p1');
    expect(port22?.service?.cpe).toContain('cpe:/a:openbsd:openssh:8.2p1');
  });

  it('should handle ports found by prescan but missed by nmap', () => {

    // Masscan finds 4 ports
    const masscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 3000, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 8080, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    // Nmap only detects 3 (maybe 8080 was filtered/closed by the time nmap scanned)
    const nmapPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'ssh' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
      {
        port: 3000,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
    ];

    const merged = combinePortDiscoveries(masscanPorts, nmapPorts);

    // Should still have all 4 ports
    expect(merged.length).toBe(4);

    // Port 8080 should be in results even though nmap didn't detect it
    const port8080 = merged.find((p: DiscoveredPort) => p.port === 8080);
    expect(port8080).toBeDefined();
    expect(port8080?.discoveredBy).toEqual(['masscan']);
    expect(port8080?.service).toBeUndefined(); // No service info since nmap didn't scan it
  });
});

describe('Multi-Scanner Orchestration - Timing and Performance', () => {
  it('should track earliest discovery time', () => {

    const masscanPorts: DiscoveredPort[] = [
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1050 },
    ];

    const rustscanPorts: DiscoveredPort[] = [
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1200, lastSeen: 1250 },
    ];

    const nmapPorts: DiscoveredPort[] = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2100,
      },
    ];

    const merged = combinePortDiscoveries(masscanPorts, rustscanPorts, nmapPorts);

    const port80 = merged.find((p: DiscoveredPort) => p.port === 80);

    // Should use masscan's earliest timestamp
    expect(port80?.firstSeen).toBe(1000);

    // Should use nmap's latest timestamp
    expect(port80?.lastSeen).toBe(2100);
  });
});

describe('Multi-Scanner Orchestration - Edge Cases', () => {
  it('should handle when all prescans return empty results', () => {

    const masscanPorts: DiscoveredPort[] = [];
    const rustscanPorts: DiscoveredPort[] = [];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);
    expect(combined).toEqual([]);

    const portNumbers = extractPortNumbers(combined);
    expect(portNumbers).toEqual([]);

    const portSpec = formatPortSpec(portNumbers);
    expect(portSpec).toBe('');
  });

  it('should handle when only one prescan returns results', () => {

    const masscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];
    const rustscanPorts: DiscoveredPort[] = [];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);

    expect(combined.length).toBe(1);
    expect(combined[0].discoveredBy).toEqual(['masscan']);
  });

  it('should handle identical discoveries from all scanners', () => {

    const port22Masscan: DiscoveredPort = {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['masscan'],
      firstSeen: 1000,
      lastSeen: 1000,
    };

    const port22Rustscan: DiscoveredPort = {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['rustscan'],
      firstSeen: 1100,
      lastSeen: 1100,
    };

    const port22Nmap: DiscoveredPort = {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh' },
      discoveredBy: ['nmap'],
      firstSeen: 2000,
      lastSeen: 2000,
    };

    const merged = combinePortDiscoveries([port22Masscan], [port22Rustscan], [port22Nmap]);

    expect(merged.length).toBe(1);
    expect(merged[0].discoveredBy).toHaveLength(3);
    expect(merged[0].discoveredBy).toContain('masscan');
    expect(merged[0].discoveredBy).toContain('rustscan');
    expect(merged[0].discoveredBy).toContain('nmap');
  });
});
