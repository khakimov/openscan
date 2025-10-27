/**
 * Integration Tests for Necto API
 *
 * These tests hit the REAL Necto API to verify request/response format.
 * Run with: NECTO_API_URL=https://necto.sec.rocks pnpm test necto-api-integration
 */

import { describe, it, expect } from 'vitest';
import { NectoAPIClient, createNectoAPIClient } from '../necto-api-client';
import type { PortScanPort } from '@repo/data-ops';

// Only run these tests if NECTO_API_URL is set
const NECTO_API_URL = process.env.NECTO_API_URL || 'https://necto.sec.rocks';
const shouldRunIntegrationTests = !!process.env.NECTO_API_URL || process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegrationTests)('Necto API Integration', () => {
  const client = createNectoAPIClient({
    baseUrl: NECTO_API_URL,
    timeout: 30000,
  });

  it('should successfully enrich nginx 1.28.0 scan results', async () => {
    const ports: PortScanPort[] = [
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'https',
          product: 'nginx',
          version: '1.28.0',
          extraInfo: null,
          method: 'probed',
          confidence: 10,
        },
      },
    ];

    const result = await client.enrichScanResults(ports);

    expect(result).toBeDefined();
    expect(result.enrichedAt).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalCves).toBeGreaterThanOrEqual(0);

    console.log('✅ Enrichment result:', {
      totalCves: result.summary.totalCves,
      criticalCount: result.summary.totalCritical,
      highCount: result.summary.totalHigh,
    });
  }, 60000);

  it('should successfully enrich OpenSSH 9.6p1 scan results', async () => {
    const ports: PortScanPort[] = [
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'ssh',
          product: 'OpenSSH',
          version: '9.6p1',
          extraInfo: 'Ubuntu Linux; protocol 2.0',
          method: 'probed',
          confidence: 10,
        },
      },
    ];

    const result = await client.enrichScanResults(ports);

    expect(result).toBeDefined();
    expect(result.enrichedAt).toBeDefined();
    expect(result.summary.totalCves).toBeGreaterThanOrEqual(0);

    console.log('✅ OpenSSH enrichment:', {
      totalCves: result.summary.totalCves,
      applications: result.applications?.length || 0,
    });
  }, 60000);

  it('should handle real grpc.necto.sec.rocks scan data', async () => {
    // Real data from production scan
    const ports: PortScanPort[] = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'http',
          product: 'nginx',
          version: '1.28.0',
          extraInfo: null,
          method: 'probed',
          confidence: 10,
        },
      },
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'https',
          product: 'nginx',
          version: '1.28.0',
          extraInfo: null,
          method: 'probed',
          confidence: 10,
        },
      },
      {
        port: 22,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'ssh',
          product: 'OpenSSH',
          version: '9.6p1 Ubuntu 3ubuntu13.11',
          extraInfo: 'Ubuntu Linux; protocol 2.0',
          method: 'probed',
          confidence: 10,
        },
      },
      {
        port: 17233,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'http',
          product: 'nginx',
          version: '1.28.0',
          extraInfo: null,
          method: 'probed',
          confidence: 10,
        },
      },
    ];

    const result = await client.enrichScanResults(ports);

    expect(result).toBeDefined();
    expect(result.summary.totalCves).toBeGreaterThanOrEqual(0);

    console.log('✅ Full scan enrichment:', {
      totalCves: result.summary.totalCves,
      totalCritical: result.summary.totalCritical,
      totalHigh: result.summary.totalHigh,
      affectedServices: result.summary.affectedServices,
      applications: result.applications?.map((app) => ({
        name: app.name,
        version: app.version,
        port: app.port,
        cveCount: app.cveCount,
      })),
    });
  }, 60000);

  it('should reveal actual API error when request is malformed', async () => {
    const ports: PortScanPort[] = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'http',
          product: 'nginx',
          version: '', // Empty version - should be filtered out
          extraInfo: null,
          method: 'table',
          confidence: 3,
        },
      },
    ];

    // This should not throw because we filter out services without versions
    const result = await client.enrichScanResults(ports);

    // Should return empty enrichment
    expect(result.summary.totalCves).toBe(0);
    expect(result.applications).toBeUndefined();
  }, 60000);

  it('should handle services without versions gracefully', async () => {
    const ports: PortScanPort[] = [
      {
        port: 4321,
        protocol: 'tcp',
        state: 'open',
        service: {
          name: 'rwhois',
          product: null,
          version: null,
          extraInfo: null,
          method: 'table',
          confidence: 3,
        },
      },
    ];

    const result = await client.enrichScanResults(ports);

    // Should return empty enrichment (no valid services to enrich)
    expect(result.summary.totalCves).toBe(0);
  }, 60000);
});
