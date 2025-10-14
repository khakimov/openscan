/**
 * XML Parser Unit Tests - Baseline Behavior
 *
 * These tests lock down current XML parsing behavior BEFORE refactoring.
 * After splitting into modules, re-run these tests to verify identical behavior.
 *
 * CRITICAL: DO NOT MODIFY THESE TESTS DURING REFACTORING.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseNmapXml,
  extractSingleHostResult,
  needsRetry,
  getFilteredPorts,
} from '../../xml-parser';

const FIXTURES_DIR = join(__dirname, 'fixtures');

function loadFixture(filename: string): string {
  return readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
}

describe('XML Parser - Baseline Behavior', () => {
  describe('Single host parsing', () => {
    it('parses nmap-sample.xml with full metadata', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      // Scanner metadata
      expect(result.scanner).toBe('nmap');
      expect(result.version).toBe('7.98');
      expect(result.args).toContain('nmap -sS -O -sV');

      // Host data
      const hosts = Object.keys(result.hosts);
      expect(hosts).toHaveLength(1);
      expect(hosts[0]).toBe('144.76.82.253');

      const hostData = result.hosts['144.76.82.253'];
      expect(hostData.host.address).toBe('144.76.82.253');
      expect(hostData.host.addressType).toBe('ipv4');
      expect(hostData.host.status).toBe('up');
      expect(hostData.host.hostnames).toContain('static.253.82.76.144.clients.your-server.de');

      // Ports
      expect(hostData.ports).toHaveLength(4);
      const ports = hostData.ports;

      // SSH port
      const sshPort = ports.find(p => p.port === 22);
      expect(sshPort).toBeDefined();
      expect(sshPort?.state).toBe('open');
      expect(sshPort?.protocol).toBe('tcp');
      expect(sshPort?.transportProtocol).toBe('tcp');
      expect(sshPort?.service?.name).toBe('ssh');
      expect(sshPort?.service?.product).toBe('OpenSSH');
      expect(sshPort?.service?.version).toBe('9.6p1 Ubuntu 3ubuntu13.11');
      expect(sshPort?.service?.cpe).toContain('cpe:/a:openbsd:openssh:9.6p1');
      expect(sshPort?.service?.cpe).toContain('cpe:/o:linux:linux_kernel');

      // HTTP port
      const httpPort = ports.find(p => p.port === 80);
      expect(httpPort).toBeDefined();
      expect(httpPort?.service?.name).toBe('http');
      expect(httpPort?.service?.product).toBe('nginx');
      expect(httpPort?.service?.version).toBe('1.24.0');

      // HTTPS port (tunneled)
      const httpsPort = ports.find(p => p.port === 443);
      expect(httpsPort).toBeDefined();
      expect(httpsPort?.service?.tunnel).toBe('ssl');

      // tcpwrapped port (should still be present)
      const tcpwrappedPort = ports.find(p => p.port === 25);
      expect(tcpwrappedPort).toBeDefined();
      expect(tcpwrappedPort?.service?.name).toBe('tcpwrapped');

      // Filtered ports tracking
      expect(hostData.filteredPorts.tcp).toEqual([135, 137, 138, 139, 445]);
      expect(hostData.filteredPorts.udp).toEqual([]);

      // OS information
      expect(hostData.osInfo?.matches).toBeDefined();
      expect(hostData.osInfo!.matches.length).toBeGreaterThan(0);

      const topOsMatch = hostData.osInfo!.matches[0];
      expect(topOsMatch.name).toBe('Linux 4.19 - 5.15');
      expect(topOsMatch.accuracy).toBe(92);
      expect(topOsMatch.cpe).toContain('cpe:/o:linux:linux_kernel:4');

      // OS CPE extraction
      expect(hostData.osMatches.length).toBeGreaterThan(0);
      expect(hostData.osMatches).toContain('cpe:/o:linux:linux_kernel:4');

      // Timing data
      expect(result.timing.start).toBe(1758862412);
      expect(result.timing.elapsed).toBe(32.08);

      // Run stats
      expect(result.runStats).toBeDefined();
      expect(result.runStats!.hosts.up).toBe(1);
      expect(result.runStats!.hosts.down).toBe(0);
      expect(result.runStats!.hosts.total).toBe(1);
      expect(result.runStats!.finished.exit).toBe('success');

      // Scan info
      expect(result.scanInfo).toBeDefined();
      expect(result.scanInfo!.type).toBe('syn');
      expect(result.scanInfo!.protocol).toBe('tcp');
      expect(result.scanInfo!.numServices).toBe(1000);
    });

    it('parses service fingerprints correctly', async () => {
      const xml = loadFixture('138.199.147.65.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['138.199.147.65'];
      expect(hostData).toBeDefined();

      // Port 2377 (Docker Swarm) has extensive servicefp
      const swarmPort = hostData.ports.find(p => p.port === 2377);
      expect(swarmPort).toBeDefined();
      expect(swarmPort?.service?.name).toBe('swarm');
      expect(swarmPort?.service?.fingerprint).toBeDefined();
      expect(swarmPort?.service?.fingerprintMatches).toBeDefined();
      expect(swarmPort?.service?.fingerprintMatches!.length).toBeGreaterThan(0);

      // Verify fingerprint match structure
      const firstMatch = swarmPort?.service?.fingerprintMatches![0];
      expect(firstMatch).toHaveProperty('probe');
      expect(firstMatch).toHaveProperty('response');
      expect(firstMatch?.response).toBeTruthy();

      // Port 3000 has CPE
      const nodePort = hostData.ports.find(p => p.port === 3000);
      expect(nodePort?.service?.name).toBe('http');
      expect(nodePort?.service?.product).toBe('Node.js Express framework');
      expect(nodePort?.service?.cpe).toContain('cpe:/a:nodejs:node.js');

      // Port 7946 has unknown service with fingerprint
      const unknownPort = hostData.ports.find(p => p.port === 7946);
      expect(unknownPort?.service?.name).toBe('unknown');
      expect(unknownPort?.service?.fingerprint).toBeDefined();
    });
  });

  describe('Port state tracking', () => {
    it('tracks filtered ports for retry logic', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const filteredPorts = getFilteredPorts(result, '144.76.82.253');
      expect(filteredPorts.tcp).toEqual([135, 137, 138, 139, 445]);
      expect(filteredPorts.udp).toEqual([]);

      // Verify needsRetry logic
      expect(needsRetry(result, '144.76.82.253')).toBe(true);
    });

    it('returns all port states (open, closed, filtered)', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];

      // Should have open ports
      const openPorts = hostData.ports.filter(p => p.state === 'open');
      expect(openPorts.length).toBe(4);

      // Filtered ports tracked separately in filteredPorts object
      expect(hostData.filteredPorts.tcp.length).toBe(5);

      // Port status map should include all ports
      expect(hostData.portStatusMap).toBeDefined();
      expect(Object.keys(hostData.portStatusMap!).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Protocol normalization', () => {
    it('preserves transport protocol while normalizing service names', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];
      const sshPort = hostData.ports.find(p => p.port === 22);

      // Transport protocol MUST stay as tcp
      expect(sshPort?.protocol).toBe('tcp');
      expect(sshPort?.transportProtocol).toBe('tcp');

      // Service name is normalized to application protocol
      expect(sshPort?.service?.name).toBe('ssh');
    });

    it('handles tcpwrapped services correctly', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];
      const tcpwrappedPort = hostData.ports.find(p => p.port === 25);

      expect(tcpwrappedPort).toBeDefined();
      expect(tcpwrappedPort?.service?.name).toBe('tcpwrapped');
      expect(tcpwrappedPort?.state).toBe('open');
    });
  });

  describe('CPE extraction', () => {
    it('extracts service CPE strings', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];
      const sshPort = hostData.ports.find(p => p.port === 22);

      expect(sshPort?.service?.cpe).toBeDefined();
      expect(sshPort?.service?.cpe!.length).toBeGreaterThan(0);

      // All CPE strings should start with 'cpe:'
      sshPort?.service?.cpe!.forEach(cpe => {
        expect(cpe).toMatch(/^cpe:/);
      });
    });

    it('extracts OS CPE strings from matches', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];

      expect(hostData.osMatches.length).toBeGreaterThan(0);

      // All OS CPE strings should be normalized
      hostData.osMatches.forEach(cpe => {
        expect(cpe).toMatch(/^cpe:/);
      });

      // Should have CPE from osclass
      const topMatch = hostData.osInfo!.matches[0];
      expect(topMatch.cpe.length).toBeGreaterThan(0);
    });
  });

  describe('Legacy compatibility', () => {
    it('extractSingleHostResult returns first host for backward compatibility', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const singleHost = extractSingleHostResult(result);
      expect(singleHost).not.toBeNull();
      expect(singleHost!.host.address).toBe('144.76.82.253');
      expect(singleHost!.ports.length).toBe(4);
      expect(singleHost!.timing).toEqual(result.timing);
      expect(singleHost!.scanInfo).toEqual(result.scanInfo);
    });

    it('extractSingleHostResult returns null for zero-host scans', async () => {
      // Create minimal XML with no hosts but successful scan
      const zeroHostXml = `<?xml version="1.0"?>
        <nmaprun scanner="nmap" version="7.93" start="1000000000" startstr="Test">
          <scaninfo type="syn" protocol="tcp" numservices="100" services="1-100"/>
          <runstats>
            <finished time="1000000100" timestr="Test End" elapsed="100" exit="success"/>
            <hosts up="0" down="1" total="1"/>
          </runstats>
        </nmaprun>`;

      const result = await parseNmapXml(zeroHostXml);
      const singleHost = extractSingleHostResult(result);

      expect(singleHost).toBeNull();
      expect(Object.keys(result.hosts).length).toBe(0);

      // But scan metadata should still be valid
      expect(result.scanner).toBe('nmap');
      expect(result.runStats?.finished.exit).toBe('success');
    });

    it('maintains ports field for backward compatibility', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];

      // Both scanData and ports should have same data
      expect(hostData.scanData).toEqual(hostData.ports);
      expect(hostData.ports.length).toBe(4);
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles scans with no open ports', async () => {
      const noPortsXml = `<?xml version="1.0"?>
        <nmaprun scanner="nmap" version="7.93" start="1000000000" startstr="Test">
          <scaninfo type="syn" protocol="tcp" numservices="100" services="1-100"/>
          <host>
            <status state="up" reason="echo-reply"/>
            <address addr="192.168.1.1" addrtype="ipv4"/>
            <hostnames/>
            <ports>
              <extraports state="closed" count="100">
                <extrareasons reason="reset" count="100" proto="tcp"/>
              </extraports>
            </ports>
          </host>
          <runstats>
            <finished time="1000000100" timestr="Test End" elapsed="100" exit="success"/>
            <hosts up="1" down="0" total="1"/>
          </runstats>
        </nmaprun>`;

      const result = await parseNmapXml(noPortsXml);

      const hostData = result.hosts['192.168.1.1'];
      expect(hostData).toBeDefined();
      expect(hostData.ports).toEqual([]);
      expect(hostData.host.status).toBe('up');
    });

    it('throws error on invalid XML', async () => {
      const invalidXml = '<?xml version="1.0"?><invalid></invalid>';

      await expect(parseNmapXml(invalidXml)).rejects.toThrow('Invalid nmap XML');
    });

    it('handles missing optional fields gracefully', async () => {
      const minimalXml = `<?xml version="1.0"?>
        <nmaprun scanner="nmap" version="7.93" start="1000000000" startstr="Test">
          <host>
            <status state="up"/>
            <address addr="192.168.1.1" addrtype="ipv4"/>
            <ports>
              <port protocol="tcp" portid="80">
                <state state="open"/>
              </port>
            </ports>
          </host>
        </nmaprun>`;

      const result = await parseNmapXml(minimalXml);

      const hostData = result.hosts['192.168.1.1'];
      expect(hostData).toBeDefined();
      expect(hostData.ports.length).toBe(1);

      const port = hostData.ports[0];
      expect(port.port).toBe(80);
      expect(port.state).toBe('open');
      expect(port.service).toBeUndefined(); // No service info
    });

    it('handles ports without service information', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      const hostData = result.hosts['144.76.82.253'];

      // All ports in this fixture should have service info, but structure allows undefined
      hostData.ports.forEach(port => {
        if (port.service) {
          expect(typeof port.service).toBe('object');
        }
      });
    });
  });

  describe('Timing and metadata', () => {
    it('parses timing information correctly', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      expect(result.timing.start).toBe(1758862412);
      expect(result.timing.end).toBe(1758862444);
      expect(result.timing.elapsed).toBe(32.08);
    });

    it('parses runstats with host counts', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      expect(result.runStats).toBeDefined();
      expect(result.runStats!.finished.time).toBe(1758862444);
      expect(result.runStats!.finished.elapsed).toBe(32.08);
      expect(result.runStats!.finished.exit).toBe('success');

      expect(result.runStats!.hosts.up).toBe(1);
      expect(result.runStats!.hosts.down).toBe(0);
      expect(result.runStats!.hosts.total).toBe(1);
    });

    it('parses scan info', async () => {
      const xml = loadFixture('nmap-sample.xml');
      const result = await parseNmapXml(xml);

      expect(result.scanInfo).toBeDefined();
      expect(result.scanInfo!.type).toBe('syn');
      expect(result.scanInfo!.protocol).toBe('tcp');
      expect(result.scanInfo!.numServices).toBe(1000);
      expect(result.scanInfo!.services).toBe('1-1000');
    });
  });

  describe('Real-world fixture coverage', () => {
    it('parses all available fixtures without errors', async () => {
      const fixtures = [
        'nmap-sample.xml',
        'nmap-sample-2.xml',
        '138.199.147.65.xml',
        'rustscan-status.openpanel.dev.xml',
      ];

      for (const fixture of fixtures) {
        const xml = loadFixture(fixture);
        const result = await parseNmapXml(xml);

        expect(result).toBeDefined();
        expect(result.scanner).toBe('nmap');
        expect(result.version).toBeTruthy();
        expect(Object.keys(result.hosts).length).toBeGreaterThan(0);
      }
    });
  });
});
