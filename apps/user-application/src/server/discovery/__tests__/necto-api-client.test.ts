/**
 * Tests for Necto API HTTP Client
 *
 * Tests the HTTP client that integrates with the Necto vulnerability mapping API.
 * Uses mock fixtures to test without requiring a live API.
 *
 * Issue: sec-68
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NectoAPIClient,
  createNectoAPIClient,
  NectoAPIClientError,
  type NectoAPIRequest,
} from '../services/necto-api-client';
import type { PortScanPort, PortScanOSInfo } from '@repo/data-ops';

// Import mock fixtures
import linuxResponse from './__fixtures__/necto-api-linux-response.json';
import windowsResponse from './__fixtures__/necto-api-windows-response.json';
import macosResponse from './__fixtures__/necto-api-macos-response.json';
import errorResponse from './__fixtures__/necto-api-error-response.json';

describe('NectoAPIClient', () => {
  let client: NectoAPIClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Create client with fast timeouts for testing
    client = new NectoAPIClient({
      baseUrl: 'http://localhost:5020',
      timeout: 5000,
      retries: 3,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Factory function', () => {
    it('should create client instance', () => {
      const instance = createNectoAPIClient();
      expect(instance).toBeInstanceOf(NectoAPIClient);
    });

    it('should use default configuration', () => {
      const instance = createNectoAPIClient();
      expect(instance).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const instance = createNectoAPIClient({
        baseUrl: 'http://custom-api:8080',
        timeout: 10000,
      });
      expect(instance).toBeDefined();
    });
  });

  describe('buildRequest', () => {
    it('should build request with OS information', () => {
      const osInfo: PortScanOSInfo = {
        name: 'Ubuntu Linux',
        version: '24.04',
        accuracy: 95,
        cpe: ['cpe:2.3:o:canonical:ubuntu_linux:24.04:*:*:*:lts:*:*:*'],
      };

      const ports: PortScanPort[] = [];
      const request = client.buildRequest(ports, osInfo);

      expect(request.os).toEqual({
        name: 'Ubuntu Linux',
        version: '24.04',
        cpe: ['cpe:2.3:o:canonical:ubuntu_linux:24.04:*:*:*:lts:*:*:*'],
      });
    });

    it('should build request with services from open ports', () => {
      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
            product: 'OpenSSH',
            version: '9.6p1',
          },
        },
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'http',
            product: 'nginx',
            version: '1.24.0',
          },
        },
        {
          port: 443,
          protocol: 'tcp',
          state: 'closed', // Closed port should be filtered out
          service: {
            name: 'https',
          },
        },
      ];

      const request = client.buildRequest(ports);

      expect(request.services).toHaveLength(2);
      expect(request.services).toEqual([
        { name: 'ssh', product: 'OpenSSH', version: '9.6p1', port: 22 },
        { name: 'http', product: 'nginx', version: '1.24.0', port: 80 },
      ]);
    });

    it('should build request with both OS and services', () => {
      const osInfo: PortScanOSInfo = {
        name: 'Ubuntu Linux',
        version: '24.04',
      };

      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
            product: 'OpenSSH',
            version: '9.6p1',
          },
        },
      ];

      const request = client.buildRequest(ports, osInfo);

      expect(request.os).toBeDefined();
      expect(request.services).toHaveLength(1);
    });

    it('should handle empty ports array', () => {
      const request = client.buildRequest([]);
      expect(request.services).toBeUndefined();
    });

    it('should handle ports without services', () => {
      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
        },
      ];

      const request = client.buildRequest(ports);
      expect(request.services).toBeUndefined();
    });

    it('should filter null products to undefined', () => {
      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
            product: null,
            version: null,
          },
        },
      ];

      const request = client.buildRequest(ports);
      expect(request.services?.[0].product).toBeUndefined();
      expect(request.services?.[0].version).toBeUndefined();
    });
  });

  describe('transformResponse', () => {
    it('should transform Linux response correctly', () => {
      const enrichment = client.transformResponse(linuxResponse);

      expect(enrichment.enrichedAt).toBeDefined();
      expect(enrichment.nectoVersion).toBe('1.0.0');

      // Check summary
      expect(enrichment.summary).toEqual({
        totalCves: 13,
        totalCritical: 2,
        totalHigh: 5,
        totalMedium: 4,
        totalLow: 2,
        affectedServices: 4,
        maxCvssScore: 9.8,
      });

      // Check OS vulnerabilities
      expect(enrichment.os).toBeDefined();
      expect(enrichment.os?.product).toBe('Ubuntu 24.04');
      expect(enrichment.os?.cveCount).toBe(8);
      expect(enrichment.os?.criticalCount).toBe(2);
      expect(enrichment.os?.highCount).toBe(2);
      expect(enrichment.os?.cves).toHaveLength(8);

      // Check first CVE
      const firstCVE = enrichment.os?.cves[0];
      expect(firstCVE?.cveId).toBe('CVE-2024-6387');
      expect(firstCVE?.cvssScore).toBe(9.8);
      expect(firstCVE?.severity).toBe('CRITICAL');

      // Check applications
      expect(enrichment.applications).toBeDefined();
      expect(enrichment.applications).toHaveLength(3);

      const sshApp = enrichment.applications?.find((a) => a.name === 'openssh-server');
      expect(sshApp).toBeDefined();
      expect(sshApp?.version).toBe('9.6p1');
      expect(sshApp?.port).toBe(22);
      expect(sshApp?.cveCount).toBe(2);
      expect(sshApp?.criticalCount).toBe(1);
    });

    it('should transform Windows response correctly', () => {
      const enrichment = client.transformResponse(windowsResponse);

      expect(enrichment.summary.totalCves).toBe(12);
      expect(enrichment.summary.totalCritical).toBe(3);

      expect(enrichment.os?.product).toBe('Microsoft Windows Server 2019 10.0.17763');
      expect(enrichment.applications).toHaveLength(3);

      const iisApp = enrichment.applications?.find((a) => a.name === 'microsoft-iis');
      expect(iisApp?.version).toBe('10.0');
      expect(iisApp?.port).toBe(80);
    });

    it('should transform macOS response correctly', () => {
      const enrichment = client.transformResponse(macosResponse);

      expect(enrichment.summary.totalCves).toBe(8);
      expect(enrichment.os?.product).toBe('Apple macOS 14.2');
      expect(enrichment.applications).toHaveLength(2);
    });

    it('should handle response without OS data', () => {
      const response = {
        applications: linuxResponse.applications,
        summary: {
          total_cves: 7,
          critical_count: 1,
          high_count: 3,
          medium_count: 2,
          low_count: 1,
          affected_services: 3,
          max_cvss_score: 9.8,
        },
      };

      const enrichment = client.transformResponse(response);
      expect(enrichment.os).toBeUndefined();
      expect(enrichment.applications).toBeDefined();
    });

    it('should handle response without applications', () => {
      const response = {
        os: linuxResponse.os,
        summary: {
          total_cves: 8,
          critical_count: 2,
          high_count: 2,
          medium_count: 2,
          low_count: 2,
          affected_services: 1,
          max_cvss_score: 9.8,
        },
      };

      const enrichment = client.transformResponse(response);
      expect(enrichment.os).toBeDefined();
      expect(enrichment.applications).toBeUndefined();
    });

    it('should correctly map CVE severity levels', () => {
      const enrichment = client.transformResponse(linuxResponse);
      const allCves = [
        ...(enrichment.os?.cves || []),
        ...(enrichment.applications?.flatMap((a) => a.cves) || []),
      ];

      const criticalCves = allCves.filter((c) => c.cvssScore >= 9.0);
      const highCves = allCves.filter((c) => c.cvssScore >= 7.0 && c.cvssScore < 9.0);
      const mediumCves = allCves.filter((c) => c.cvssScore >= 4.0 && c.cvssScore < 7.0);
      const lowCves = allCves.filter((c) => c.cvssScore < 4.0);

      expect(criticalCves.every((c) => c.severity === 'CRITICAL')).toBe(true);
      expect(highCves.every((c) => c.severity === 'HIGH')).toBe(true);
      expect(mediumCves.every((c) => c.severity === 'MEDIUM')).toBe(true);
      expect(lowCves.every((c) => c.severity === 'LOW')).toBe(true);
    });
  });

  describe('fetchCVEEnrichment', () => {
    it('should fetch and transform CVE data successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => linuxResponse,
      });

      const request: NectoAPIRequest = {
        os: { name: 'Ubuntu', version: '24.04' },
      };

      const enrichment = await client.fetchCVEEnrichment(request);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5020/api/v1/vulnerabilities',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
      );

      expect(enrichment.summary.totalCves).toBe(13);
    });

    it('should throw on API error responses after retries', async () => {
      // Mock all retry attempts to fail with 503
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => errorResponse,
      });

      const request: NectoAPIRequest = { os: { name: 'Linux' } };

      await expect(client.fetchCVEEnrichment(request)).rejects.toThrow(NectoAPIClientError);

      try {
        await client.fetchCVEEnrichment(request);
      } catch (error) {
        expect(error).toBeInstanceOf(NectoAPIClientError);
        const apiError = error as NectoAPIClientError;
        // After all retries exhausted, returns 500
        expect(apiError.status).toBe(500);
        expect(apiError.message).toContain('Failed after 3 attempts');
      }
    });

    it('should retry on 5xx errors', async () => {
      // First two calls fail with 503
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable', status: 503 }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable', status: 503 }),
      });
      // Third call succeeds
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => linuxResponse,
      });

      const request: NectoAPIRequest = { os: { name: 'Ubuntu' } };
      const enrichment = await client.fetchCVEEnrichment(request);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(enrichment.summary.totalCves).toBe(13);
    });

    it('should not retry on 4xx client errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Invalid request',
          status: 400,
          details: 'Missing required field: os',
        }),
      });

      const request: NectoAPIRequest = {};

      await expect(client.fetchCVEEnrichment(request)).rejects.toThrow(NectoAPIClientError);
      expect(fetchMock).toHaveBeenCalledTimes(1); // No retries
    });

    it('should throw on timeout', async () => {
      // Create client with very short timeout
      const timeoutClient = new NectoAPIClient({
        timeout: 100,
        retries: 1,
      });

      // Mock fetch that respects AbortSignal
      fetchMock.mockImplementationOnce(
        (_url: string, options?: RequestInit) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => resolve({ ok: true, json: async () => linuxResponse }), 500);

            // Respect abort signal
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          })
      );

      await expect(timeoutClient.fetchCVEEnrichment({ os: { name: 'Linux' } })).rejects.toThrow(
        /Request timeout/
      );
    });

    it('should throw after exhausting all retries', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable', status: 503 }),
      });

      const request: NectoAPIRequest = { os: { name: 'Ubuntu' } };

      await expect(client.fetchCVEEnrichment(request)).rejects.toThrow(/Failed after 3 attempts/);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      const callTimes: number[] = [];

      fetchMock.mockImplementation(async () => {
        callTimes.push(Date.now());

        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service unavailable', status: 503 }),
        };
      });

      const request: NectoAPIRequest = { os: { name: 'Ubuntu' } };

      try {
        await client.fetchCVEEnrichment(request);
      } catch {
        // Expected to fail
      }

      // Should have 3 attempts
      expect(callTimes.length).toBe(3);

      // Calculate delays between attempts
      const delays = [
        callTimes[1] - callTimes[0], // First retry delay
        callTimes[2] - callTimes[1], // Second retry delay
      ];

      // Check that delays increase (exponential backoff)
      // First retry: ~100ms (100 * 2^0), second retry: ~200ms (100 * 2^1)
      expect(delays[0]).toBeGreaterThanOrEqual(90); // 100ms with tolerance
      expect(delays[1]).toBeGreaterThanOrEqual(180); // 200ms with tolerance
      expect(delays[1]).toBeGreaterThan(delays[0]); // Second delay should be longer
    });
  });

  describe('enrichScanResults', () => {
    it('should build request and fetch enrichment', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => linuxResponse,
      });

      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
            product: 'OpenSSH',
            version: '9.6p1',
          },
        },
      ];

      const osInfo: PortScanOSInfo = {
        name: 'Ubuntu',
        version: '24.04',
      };

      const enrichment = await client.enrichScanResults(ports, osInfo);

      expect(enrichment.summary.totalCves).toBe(13);
      expect(enrichment.os?.product).toBe('Ubuntu 24.04');
      expect(enrichment.applications).toBeDefined();
    });

    it('should work with just ports (no OS info)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          applications: linuxResponse.applications,
          summary: linuxResponse.summary,
        }),
      });

      const ports: PortScanPort[] = [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
          },
        },
      ];

      const enrichment = await client.enrichScanResults(ports);

      expect(enrichment.os).toBeUndefined();
      expect(enrichment.applications).toBeDefined();
    });
  });

  describe('NectoAPIClientError', () => {
    it('should store error details', () => {
      const error = new NectoAPIClientError('Test error', 503, 3600, 'Service unavailable');

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(503);
      expect(error.retryAfter).toBe(3600);
      expect(error.details).toBe('Service unavailable');
      expect(error.name).toBe('NectoAPIClientError');
    });

    it('should work without optional parameters', () => {
      const error = new NectoAPIClientError('Simple error');

      expect(error.message).toBe('Simple error');
      expect(error.status).toBeUndefined();
      expect(error.retryAfter).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });
});
