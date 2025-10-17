/**
 * Port Merger Unit Tests
 *
 * Tests the port discovery combination and merging logic used in
 * multi-scanner orchestration (masscan + rustscan + nmap).
 */

import { describe, it, expect } from 'vitest';
import { combinePortDiscoveries, extractPortNumbers, formatPortSpec } from '../port-merger';
import type { DiscoveredPort } from '../scanners/masscan';

describe('Port Merger - combinePortDiscoveries', () => {
  it('should combine ports from multiple scanners with attribution', () => {
    const masscanPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const rustscanPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['rustscan'],
        firstSeen: 1100,
        lastSeen: 1100,
      },
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['rustscan'],
        firstSeen: 1100,
        lastSeen: 1100,
      },
    ];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);

    // Should have 3 unique ports (22, 80, 443)
    expect(combined.length).toBe(3);

    // Port 22 should be discovered by both scanners
    const port22 = combined.find((p) => p.port === 22);
    expect(port22).toBeDefined();
    expect(port22?.discoveredBy).toContain('masscan');
    expect(port22?.discoveredBy).toContain('rustscan');
    expect(port22?.discoveredBy.length).toBe(2);

    // Port 80 should only be from masscan
    const port80 = combined.find((p) => p.port === 80);
    expect(port80).toBeDefined();
    expect(port80?.discoveredBy).toEqual(['masscan']);

    // Port 443 should only be from rustscan
    const port443 = combined.find((p) => p.port === 443);
    expect(port443).toBeDefined();
    expect(port443?.discoveredBy).toEqual(['rustscan']);
  });

  it('should use earliest firstSeen timestamp', () => {
    const masscanPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const rustscanPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['rustscan'],
        firstSeen: 1500, // Later
        lastSeen: 1500,
      },
    ];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);

    const port22 = combined.find((p) => p.port === 22);
    expect(port22?.firstSeen).toBe(1000); // Earlier timestamp
  });

  it('should use latest lastSeen timestamp', () => {
    const masscanPorts: DiscoveredPort[] = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1200,
      },
    ];

    const rustscanPorts: DiscoveredPort[] = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['rustscan'],
        firstSeen: 1100,
        lastSeen: 1800, // Later
      },
    ];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);

    const port80 = combined.find((p) => p.port === 80);
    expect(port80?.lastSeen).toBe(1800); // Later timestamp
  });

  it('should prefer existing service info when merging', () => {
    const nmapPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'ssh',
          product: 'OpenSSH',
          version: '8.2',
        },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
    ];

    const masscanPorts: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        // No service info from masscan
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    // Nmap goes first (has service info)
    const combined = combinePortDiscoveries(nmapPorts, masscanPorts);

    const port22 = combined.find((p) => p.port === 22);
    expect(port22?.service).toBeDefined();
    expect(port22?.service?.name).toBe('ssh');
    expect(port22?.service?.product).toBe('OpenSSH');
  });

  it('should handle empty arrays gracefully', () => {
    const result = combinePortDiscoveries([], []);
    expect(result).toEqual([]);
  });

  it('should handle single source', () => {
    const ports: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const result = combinePortDiscoveries(ports);
    expect(result.length).toBe(1);
    expect(result[0].port).toBe(22);
  });

  it('should deduplicate by protocol:port key', () => {
    const tcpPort: DiscoveredPort[] = [
      {
        port: 53,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const udpPort: DiscoveredPort[] = [
      {
        port: 53,
        protocol: 'udp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const combined = combinePortDiscoveries(tcpPort, udpPort);

    // Should have both TCP/53 and UDP/53
    expect(combined.length).toBe(2);
    expect(combined.find((p) => p.protocol === 'tcp')).toBeDefined();
    expect(combined.find((p) => p.protocol === 'udp')).toBeDefined();
  });
});

describe('Port Merger - extractPortNumbers', () => {
  it('should extract unique port numbers', () => {
    const ports: DiscoveredPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
      {
        port: 22,
        protocol: 'udp', // Same port, different protocol
        state: 'open',
        discoveredBy: ['masscan'],
        firstSeen: 1000,
        lastSeen: 1000,
      },
    ];

    const portNumbers = extractPortNumbers(ports);

    // Should deduplicate port 22 (even though it's different protocols)
    expect(portNumbers).toEqual([22, 80]);
  });

  it('should return sorted port numbers', () => {
    const ports: DiscoveredPort[] = [
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    const portNumbers = extractPortNumbers(ports);
    expect(portNumbers).toEqual([22, 80, 443]);
  });

  it('should filter out invalid port numbers', () => {
    const ports: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 0, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 65536, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    const portNumbers = extractPortNumbers(ports);
    expect(portNumbers).toEqual([22, 80]); // 0 and 65536 are invalid
  });

  it('should handle empty array', () => {
    const portNumbers = extractPortNumbers([]);
    expect(portNumbers).toEqual([]);
  });
});

describe('Port Merger - formatPortSpec', () => {
  it('should format single port', () => {
    expect(formatPortSpec([80])).toBe('80');
  });

  it('should format comma-separated ports', () => {
    expect(formatPortSpec([22, 80, 443])).toBe('22,80,443');
  });

  it('should compress consecutive ports into ranges', () => {
    expect(formatPortSpec([22, 23, 24, 25])).toBe('22-25');
  });

  it('should mix ranges and individual ports', () => {
    expect(formatPortSpec([22, 80, 81, 82, 443, 8080])).toBe('22,80-82,443,8080');
  });

  it('should handle complex mixed patterns', () => {
    expect(formatPortSpec([21, 22, 23, 80, 443, 3000, 3001, 3002, 8080]))
      .toBe('21-23,80,443,3000-3002,8080');
  });

  it('should handle single-port ranges', () => {
    expect(formatPortSpec([22, 80, 81, 443])).toBe('22,80-81,443');
  });

  it('should handle empty array', () => {
    expect(formatPortSpec([])).toBe('');
  });

  it('should sort ports before formatting', () => {
    expect(formatPortSpec([443, 22, 80])).toBe('22,80,443');
  });

  it('should handle large ranges efficiently', () => {
    const ports = Array.from({ length: 100 }, (_, i) => 1000 + i); // 1000-1099
    expect(formatPortSpec(ports)).toBe('1000-1099');
  });
});

describe('Port Merger - Integration Scenarios', () => {
  it('should handle realistic masscan + rustscan + nmap scenario', () => {
    // Masscan finds many ports quickly
    const masscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 8080, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    // Rustscan validates and finds a few more
    const rustscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 3306, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
    ];

    // Nmap provides detailed service information for discovered ports
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
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http', product: 'nginx', version: '1.18.0' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'https', product: 'nginx', version: '1.18.0' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
      {
        port: 8080,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http-proxy', product: 'Tomcat' },
        discoveredBy: ['nmap'],
        firstSeen: 2000,
        lastSeen: 2000,
      },
    ];

    // Combine all three
    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts, nmapPorts);

    // Should have 5 unique ports
    expect(combined.length).toBe(5);

    // Port 22 should be discovered by all three
    const port22 = combined.find((p) => p.port === 22);
    expect(port22?.discoveredBy).toContain('masscan');
    expect(port22?.discoveredBy).toContain('rustscan');
    expect(port22?.discoveredBy).toContain('nmap');
    expect(port22?.service?.product).toBe('OpenSSH');

    // Port 3306 only discovered by rustscan (nmap didn't scan it)
    const port3306 = combined.find((p) => p.port === 3306);
    expect(port3306?.discoveredBy).toEqual(['rustscan']);
    expect(port3306?.service).toBeUndefined();

    // Verify timestamps
    expect(port22?.firstSeen).toBe(1000); // Earliest
    expect(port22?.lastSeen).toBe(2000); // Latest
  });

  it('should prepare correct nmap port spec from prescan discoveries', () => {
    const masscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 23, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 80, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
      { port: 443, protocol: 'tcp', state: 'open', discoveredBy: ['masscan'], firstSeen: 1000, lastSeen: 1000 },
    ];

    const rustscanPorts: DiscoveredPort[] = [
      { port: 22, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 3306, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 3307, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
      { port: 8080, protocol: 'tcp', state: 'open', discoveredBy: ['rustscan'], firstSeen: 1100, lastSeen: 1100 },
    ];

    const combined = combinePortDiscoveries(masscanPorts, rustscanPorts);
    const portNumbers = extractPortNumbers(combined);
    const portSpec = formatPortSpec(portNumbers);

    // Should target nmap at only these specific ports
    expect(portSpec).toBe('22-23,80,443,3306-3307,8080');
  });
});
