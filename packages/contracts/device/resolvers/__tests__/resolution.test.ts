/**
 * Service Resolution Tests
 *
 * Tests the core policy: which evidence wins in various scenarios
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeNmap,
  normalizeHttpx,
  normalizeManual,
  resolveService,
  getResolutionStats,
} from '../index';
import type { NmapServiceDetection, HttpxProbeData } from '../normalizers';

describe('Service Resolution', () => {
  describe('Priority Policy', () => {
    it('manual override beats httpx', () => {
      const manual = normalizeManual({
        name: 'Custom Service',
        version: '2.0',
        notes: 'User confirmed',
        overriddenAt: new Date().toISOString(),
        overriddenBy: 'user123',
      });

      const httpx = normalizeHttpx({
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
        screenshot: 'screenshot.png',
        webServer: 'nginx',
      });

      const result = resolveService([manual!, httpx!]);

      expect(result.resolved?.kind).toBe('manual');
      expect(result.resolved?.displayName).toBe('Custom Service 2.0');
      expect(result.resolved?.resolvedFrom).toEqual(['manual', 'httpx']);
    });

    it('httpx beats nmap', () => {
      const httpx = normalizeHttpx({
        id: 'probe1',
        scheme: 'http',
        statusCode: 403,
        screenshot: 'screenshot.png',
      });

      const nmap: NmapServiceDetection = {
        name: 'rwhois',
        confidence: 3,
        method: 'table',
      };

      const nmapEvidence = normalizeNmap(nmap, 4321);

      // Nmap should be suppressed (confidence 3 < threshold 5)
      // HTTPx should win (confidence 8)
      const result = resolveService([httpx!, nmapEvidence!]);

      expect(result.resolved?.kind).toBe('httpx');
      expect(result.resolved?.displayName).toContain('HTTP service (403)');
      expect(result.resolved?.suppressed?.[0]).toContain('nmap:rwhois');
    });

    it('high-confidence nmap beats no httpx', () => {
      const nmap: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        version: '8.2p1',
        confidence: 9,
        cpe: 'cpe:/a:openbsd:openssh:8.2p1',
        method: 'probed',
      };

      const result = resolveService([normalizeNmap(nmap, 22)!]);

      expect(result.resolved?.kind).toBe('nmap');
      expect(result.resolved?.displayName).toBe('OpenSSH 8.2p1');
      expect(result.resolved?.confidence).toBeGreaterThan(9); // Boosted by common port + CPE
    });
  });

  describe('Confidence Thresholds', () => {
    it('discards nmap below confidence threshold (5)', () => {
      const lowConfidence: NmapServiceDetection = {
        name: 'unknown',
        confidence: 3,
        method: 'table',
      };

      const result = resolveService([normalizeNmap(lowConfidence, 9999)!]);

      expect(result.resolved?.kind).toBe('unknown');
      expect(result.failureReason).toBe('all_below_threshold');
      expect(result.resolved?.suppressed?.[0]).toContain('nmap:unknown');
    });

    it('discards httpx below threshold (7)', () => {
      const weakHttpx: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 500, // Server error = confidence 6
      };

      const result = resolveService([normalizeHttpx(weakHttpx)!]);

      expect(result.resolved?.kind).toBe('unknown');
      expect(result.failureReason).toBe('all_below_threshold');
    });

    it('accepts borderline nmap at exactly threshold (5)', () => {
      const borderline: NmapServiceDetection = {
        name: 'http',
        confidence: 5,
        method: 'table',
      };

      const result = resolveService([normalizeNmap(borderline, 8080)!]);

      expect(result.resolved?.kind).toBe('nmap');
      expect(result.resolved?.displayName).toBe('http');
    });
  });

  describe('Confidence Scoring - Nmap', () => {
    it('boosts common ports', () => {
      const detection: NmapServiceDetection = {
        name: 'http',
        confidence: 5,
      };

      const commonPort = normalizeNmap(detection, 80)!; // Common
      const uncommonPort = normalizeNmap(detection, 8888)!; // Uncommon

      expect(commonPort.confidence).toBeGreaterThan(uncommonPort.confidence);
      expect(commonPort.confidence).toBe(6); // 5 + 1 for common port
    });

    it('boosts CPE identifiers', () => {
      const withCpe: NmapServiceDetection = {
        name: 'ssh',
        confidence: 5,
        cpe: 'cpe:/a:openbsd:openssh:8.2p1',
      };

      const withoutCpe: NmapServiceDetection = {
        name: 'ssh',
        confidence: 5,
      };

      const cpeEvidence = normalizeNmap(withCpe, 9999)!;
      const noCpeEvidence = normalizeNmap(withoutCpe, 9999)!;

      expect(cpeEvidence.confidence).toBeGreaterThan(noCpeEvidence.confidence);
    });

    it('boosts version info', () => {
      const withVersion: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        version: '8.2p1',
        confidence: 5,
      };

      const withoutVersion: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        confidence: 5,
      };

      const versionEvidence = normalizeNmap(withVersion, 22)!;
      const noVersionEvidence = normalizeNmap(withoutVersion, 22)!;

      expect(versionEvidence.confidence).toBeGreaterThan(
        noVersionEvidence.confidence
      );
    });

    it('caps confidence at 10', () => {
      const maxed: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        version: '8.2p1',
        confidence: 10,
        cpe: 'cpe:/a:openbsd:openssh:8.2p1',
      };

      const evidence = normalizeNmap(maxed, 22)!; // Common port

      // Even with all boosts, should not exceed 10
      expect(evidence.confidence).toBeLessThanOrEqual(10);
    });
  });

  describe('Confidence Scoring - HTTPx', () => {
    it('scores 2xx + screenshot as 10', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'https',
        statusCode: 200,
        screenshot: 'screenshot.png',
        bodyPreview: 'HTML content',
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(10);
    });

    it('scores 2xx + body (no screenshot) as 9', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
        bodyPreview: 'Response body',
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(9);
    });

    it('scores 2xx headers-only as 8', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
        webServer: 'nginx',
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(8);
    });

    it('scores 4xx + screenshot as 8', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 403,
        screenshot: 'forbidden.png',
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(8);
    });

    it('scores 4xx + body as 7', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 404,
        bodyPreview: 'Not found',
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(7);
    });

    it('scores 4xx headers-only as 6', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 401,
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(6);
    });

    it('scores 5xx as 6', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 500,
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.confidence).toBe(6);
    });

    it('returns null for failed probes', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        failed: true,
        failureReason: 'Connection timeout',
      };

      const evidence = normalizeHttpx(probe);
      expect(evidence).toBeNull();
    });
  });

  describe('Quality Scoring', () => {
    it('scores nmap with CPE + fingerprint + version as 10', () => {
      const detection: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        version: '8.2p1',
        cpe: 'cpe:/a:openbsd:openssh:8.2p1',
        method: 'probed',
        fingerprintMatches: [{ name: 'OpenSSH', pattern: 'SSH-2.0-OpenSSH' }],
      };

      const evidence = normalizeNmap(detection, 22)!;
      expect(evidence.quality).toBe(10);
    });

    it('scores httpx with screenshot + body + headers as high quality', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'https',
        statusCode: 200,
        screenshot: 'screenshot.png',
        bodyPreview: 'HTML',
        webServer: 'nginx',
        contentType: 'text/html',
        responseTime: 150,
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.quality).toBeGreaterThanOrEqual(9);
    });

    it('scores status-only httpx as low quality', () => {
      const probe: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
      };

      const evidence = normalizeHttpx(probe)!;
      expect(evidence.quality).toBeLessThan(5);
    });
  });

  describe('Real-World Scenarios', () => {
    it('port 4321 rwhois case: httpx overrides low-confidence nmap', () => {
      // The real bug: Nmap detected "rwhois" with confidence 3
      // HTTPx confirmed HTTP with 403 status + screenshot
      const nmap: NmapServiceDetection = {
        name: 'rwhois',
        confidence: 3,
        method: 'table',
      };

      const httpx: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 403,
        screenshot: 'screenshots/4321-forbidden.png',
      };

      const result = resolveService([
        normalizeNmap(nmap, 4321)!,
        normalizeHttpx(httpx)!,
      ]);

      expect(result.resolved?.kind).toBe('httpx');
      expect(result.resolved?.displayName).toContain('HTTP service (403)');
      expect(result.resolved?.confidence).toBe(8);
      expect(result.resolved?.suppressed?.[0]).toContain('nmap:rwhois');
      expect(result.resolved?.resolvedFrom).toEqual(['httpx']);
    });

    it('port 22 SSH case: high-confidence nmap preferred when no httpx', () => {
      const nmap: NmapServiceDetection = {
        name: 'ssh',
        product: 'OpenSSH',
        version: '8.2p1 Ubuntu 4ubuntu0.5',
        confidence: 10,
        cpe: 'cpe:/a:openbsd:openssh:8.2p1',
        method: 'probed',
        extraInfo: 'Ubuntu Linux; protocol 2.0',
      };

      const result = resolveService([normalizeNmap(nmap, 22)!]);

      expect(result.resolved?.kind).toBe('nmap');
      expect(result.resolved?.displayName).toContain('OpenSSH');
      expect(result.resolved?.confidence).toBe(10); // Capped at 10
    });

    it('port 443 HTTPS case: httpx + nmap both contribute', () => {
      const nmap: NmapServiceDetection = {
        name: 'https',
        product: 'nginx',
        version: '1.18.0',
        confidence: 8,
        method: 'probed',
      };

      const httpx: HttpxProbeData = {
        id: 'probe1',
        scheme: 'https',
        statusCode: 200,
        screenshot: 'homepage.png',
        webServer: 'nginx/1.18.0',
        bodyPreview: '<html>',
        contentType: 'text/html',
      };

      const result = resolveService([
        normalizeNmap(nmap, 443)!,
        normalizeHttpx(httpx)!,
      ]);

      expect(result.resolved?.kind).toBe('httpx'); // Higher priority
      expect(result.resolved?.confidence).toBe(10); // Perfect score
      expect(result.resolved?.resolvedFrom).toEqual(['httpx', 'nmap']);
      expect(result.allEvidence).toHaveLength(2);
    });

    it('unknown port with no service detection', () => {
      const nmap: NmapServiceDetection = {
        name: 'tcpwrapped',
        confidence: 2,
      };

      const result = resolveService([normalizeNmap(nmap, 12345)!]);

      expect(result.resolved?.kind).toBe('unknown');
      expect(result.resolved?.displayName).toBe('Unknown service');
      expect(result.failureReason).toBe('all_below_threshold');
    });
  });

  describe('Edge Cases', () => {
    it('handles no evidence gracefully', () => {
      const result = resolveService([]);

      expect(result.resolved).toBeNull();
      expect(result.failureReason).toBe('no_evidence');
      expect(result.allEvidence).toHaveLength(0);
    });

    it('handles null evidence in array', () => {
      const nmap = normalizeNmap(null, 80);
      const httpx = normalizeHttpx(null);

      expect(nmap).toBeNull();
      expect(httpx).toBeNull();

      const result = resolveService([nmap, httpx].filter(Boolean));
      expect(result.resolved).toBeNull();
    });

    it('preserves all evidence for analytics', () => {
      const nmap: NmapServiceDetection = {
        name: 'http',
        confidence: 5,
      };

      const httpx: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
      };

      const result = resolveService([
        normalizeNmap(nmap, 80)!,
        normalizeHttpx(httpx)!,
      ]);

      expect(result.allEvidence).toHaveLength(2);
      expect(result.allEvidence[0].raw).toBeDefined();
      expect(result.allEvidence[1].raw).toBeDefined();
    });

    it('generates resolution stats', () => {
      const nmap: NmapServiceDetection = {
        name: 'http',
        confidence: 6,
      };

      const httpx: HttpxProbeData = {
        id: 'probe1',
        scheme: 'http',
        statusCode: 200,
        screenshot: 'screenshot.png',
      };

      const result = resolveService([
        normalizeNmap(nmap, 80)!,
        normalizeHttpx(httpx)!,
      ]);

      const stats = getResolutionStats(result);

      expect(stats.totalEvidence).toBe(2);
      expect(stats.evidenceKinds).toContain('nmap');
      expect(stats.evidenceKinds).toContain('httpx');
      expect(stats.winningKind).toBe('httpx');
      expect(stats.avgConfidence).toBeGreaterThan(0);
    });
  });

  describe('Tie-Breaking', () => {
    it('uses confidence when priorities are equal', () => {
      // Two nmap detections with different confidence
      const highConf: NmapServiceDetection = {
        name: 'ssh',
        confidence: 9,
      };

      const lowConf: NmapServiceDetection = {
        name: 'telnet',
        confidence: 5,
      };

      const result = resolveService([
        normalizeNmap(lowConf, 23)!,
        normalizeNmap(highConf, 22)!,
      ]);

      expect(result.resolved?.displayName).toBe('ssh');
    });

    it('uses quality when priority and confidence are equal', () => {
      const richData: NmapServiceDetection = {
        name: 'http',
        product: 'nginx',
        version: '1.18.0',
        confidence: 7,
        cpe: 'cpe:/a:nginx:nginx:1.18.0',
        method: 'probed',
      };

      const poorData: NmapServiceDetection = {
        name: 'http',
        confidence: 7,
      };

      const result = resolveService([
        normalizeNmap(poorData, 8080)!,
        normalizeNmap(richData, 8081)!,
      ]);

      expect(result.resolved?.displayName).toContain('nginx');
    });
  });
});
