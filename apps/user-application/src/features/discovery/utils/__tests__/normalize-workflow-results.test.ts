import { describe, it, expect } from 'vitest';
import { normalizeDiscoveryResult } from '../normalize-workflow-results';

describe('normalizeDiscoveryResult', () => {
  it('maps devices to subdomain summaries', () => {
    const result = normalizeDiscoveryResult(
      {
        target: 'acme.com',
        devices: [{ hostname: 'www.acme.com', ipAddress: '1.1.1.1' }],
        errors: [],
        executionTime: 42,
      },
      'fallback.acme.com',
    );

    expect(result.request.target).toBe('acme.com');
    expect(result.results[0].results[0]).toMatchObject({ host: 'www.acme.com', ip: '1.1.1.1' });
    expect(result.totalSubdomains).toBe(1);
    expect(result.errors).toEqual([]); // Empty array when no errors
  });

  it('falls back to provided target and handles missing arrays', () => {
    const result = normalizeDiscoveryResult({}, 'fallback.acme.com');
    expect(result.request.target).toBe('fallback.acme.com');
    expect(result.results[0].results).toEqual([]);
  });

  it('handles alternative device field names (host/ip)', () => {
    const result = normalizeDiscoveryResult({
      target: 'example.com',
      devices: [
        { host: 'api.example.com', ip: '2.2.2.2' },
        { hostname: 'www.example.com', ipAddress: '3.3.3.3' },
      ],
    });

    expect(result.results[0].results).toEqual([
      { host: 'api.example.com', ip: '2.2.2.2' },
      { host: 'www.example.com', ip: '3.3.3.3' },
    ]);
    expect(result.totalSubdomains).toBe(2);
  });

  it('filters out empty hostnames from subdomains', () => {
    const result = normalizeDiscoveryResult({
      target: 'test.com',
      devices: [
        { hostname: 'valid.test.com', ipAddress: '4.4.4.4' },
        { hostname: '', ipAddress: '5.5.5.5' },
        { ipAddress: '6.6.6.6' }, // No hostname
      ],
    });

    expect(result.results[0].subdomains).toEqual(['valid.test.com']);
    expect(result.totalSubdomains).toBe(3); // All devices counted
  });

  it('determines success based on errors array', () => {
    const withErrors = normalizeDiscoveryResult({
      devices: [],
      errors: ['Connection timeout'],
    });
    expect(withErrors.results[0].success).toBe(false);

    const noErrors = normalizeDiscoveryResult({
      devices: [],
      errors: [],
    });
    expect(noErrors.results[0].success).toBe(true);

    const noErrorsField = normalizeDiscoveryResult({
      devices: [],
    });
    expect(noErrorsField.results[0].success).toBe(true);
  });

  it('uses default scanType and tools when missing', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
    });

    expect(result.request.scanType).toBe('basic');
    expect(result.request.tools).toEqual(['subfinder']);
  });

  it('preserves custom scanType and tools', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
      scanType: 'advanced',
      tools: ['amass', 'subfinder', 'assetfinder'],
    });

    expect(result.request.scanType).toBe('advanced');
    expect(result.request.tools).toEqual(['amass', 'subfinder', 'assetfinder']);
  });

  it('uses current timestamp when completedAt missing', () => {
    const before = new Date().toISOString();
    const result = normalizeDiscoveryResult({
      devices: [],
    });
    const after = new Date().toISOString();

    expect(result.results[0].timestamp).toBeDefined();
    expect(result.results[0].timestamp >= before).toBe(true);
    expect(result.results[0].timestamp <= after).toBe(true);
  });

  it('preserves completedAt timestamp when present', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
      completedAt: '2025-01-15T12:00:00.000Z',
    });

    expect(result.results[0].timestamp).toBe('2025-01-15T12:00:00.000Z');
  });

  it('defaults executionTime to 0 when missing', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
    });

    expect(result.executionTime).toBe(0);
  });

  it('preserves executionTime when present', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
      executionTime: 5432,
    });

    expect(result.executionTime).toBe(5432);
  });

  it('creates unique subdomains list from devices', () => {
    const result = normalizeDiscoveryResult({
      target: 'corp.com',
      devices: [
        { hostname: 'app1.corp.com', ipAddress: '10.0.0.1' },
        { hostname: 'app2.corp.com', ipAddress: '10.0.0.2' },
      ],
    });

    expect(result.uniqueSubdomains).toEqual([
      { subdomain: 'app1.corp.com', ip: '10.0.0.1' },
      { subdomain: 'app2.corp.com', ip: '10.0.0.2' },
    ]);
  });

  it('uses fallback target when summary target is null', () => {
    const result = normalizeDiscoveryResult(
      { target: null, devices: [] },
      'fallback.example.com'
    );

    expect(result.request.target).toBe('fallback.example.com');
    expect(result.results[0].target).toBe('fallback.example.com');
  });

  it('defaults to "unknown" when no fallback provided', () => {
    const result = normalizeDiscoveryResult({ devices: [] });

    expect(result.request.target).toBe('unknown');
  });

  it('handles non-array devices gracefully', () => {
    const result = normalizeDiscoveryResult({
      devices: null,
    });

    expect(result.results[0].results).toEqual([]);
    expect(result.totalSubdomains).toBe(0);
  });

  it('uses default tool name when not specified', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
    });

    expect(result.results[0].tool).toBe('restate-scanner');
  });

  it('preserves custom tool name', () => {
    const result = normalizeDiscoveryResult({
      devices: [],
      tool: 'custom-scanner-v2',
    });

    expect(result.results[0].tool).toBe('custom-scanner-v2');
  });
});
