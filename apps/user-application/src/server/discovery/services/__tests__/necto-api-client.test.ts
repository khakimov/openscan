/**
 * Tests for Necto API Client
 *
 * Verifies CVE enrichment request building and API integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NectoAPIClient } from '../necto-api-client';
import type { PortScanPort, PortScanOSInfo } from '@repo/data-ops';

describe('NectoAPIClient', () => {
  let client: NectoAPIClient;

  beforeEach(() => {
    client = new NectoAPIClient({
      baseUrl: 'https://necto.sec.rocks',
      timeout: 30000,
    });
  });

  describe('buildRequest', () => {
    it('should build request with applications that have versions', () => {
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
      ];

      const request = client.buildRequest(ports);

      expect(request.applications).toBeDefined();
      expect(request.applications).toHaveLength(2);
      expect(request.applications![0]).toEqual({
        id: 1,
        product_type: 'application',
        product_name: 'nginx',
        product_version: '1.28.0',
        extra: { port: 80 },
      });
      expect(request.applications![1]).toEqual({
        id: 2,
        product_type: 'application',
        product_name: 'OpenSSH',
        product_version: '9.6p1 Ubuntu 3ubuntu13.11',
        extra: { port: 22 },
      });
    });

    it('should exclude services without version info', () => {
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

      const request = client.buildRequest(ports);

      expect(request.applications).toBeDefined();
      expect(request.applications).toHaveLength(1);
      expect(request.applications![0].product_name).toBe('nginx');
    });

    it('should exclude services with empty version strings', () => {
      const ports: PortScanPort[] = [
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'http',
            product: 'nginx',
            version: '',
            extraInfo: null,
            method: 'probed',
            confidence: 10,
          },
        },
      ];

      const request = client.buildRequest(ports);

      expect(request.applications).toBeUndefined();
    });

    it('should exclude services with "unknown" names', () => {
      const ports: PortScanPort[] = [
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'unknown',
            product: null,
            version: '1.0',
            extraInfo: null,
            method: 'table',
            confidence: 1,
          },
        },
      ];

      const request = client.buildRequest(ports);

      expect(request.applications).toBeUndefined();
    });

    it('should include OS info when available', () => {
      const ports: PortScanPort[] = [];
      const osInfo: PortScanOSInfo = {
        name: 'Ubuntu Linux',
        version: '22.04',
        accuracy: 95,
        cpe: ['cpe:/o:canonical:ubuntu_linux:22.04'],
      };

      const request = client.buildRequest(ports, osInfo);

      expect(request.os).toBeDefined();
      expect(request.os).toEqual({
        id: 0,
        product_type: 'os',
        product_name: 'Ubuntu Linux',
        product_version: '22.04',
        extra: {},
      });
    });

    it('should use generic Linux OS when OS name is "unknown"', () => {
      const ports: PortScanPort[] = [];
      const osInfo: PortScanOSInfo = {
        name: 'unknown',
        version: '',
        accuracy: 0,
      };

      const request = client.buildRequest(ports, osInfo);

      // Should fallback to generic Linux instead of 'unknown'
      expect(request.os).toBeDefined();
      expect(request.os!.product_name).toBe('Linux');
    });

    it('should handle real scan data from grpc.necto.sec.rocks', () => {
      // Real data from logs
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

      const request = client.buildRequest(ports);

      // Should only include services with versions (4 out of 5)
      expect(request.applications).toBeDefined();
      expect(request.applications).toHaveLength(4);

      // All should have non-empty product_version
      request.applications!.forEach((app) => {
        expect(app.product_version).toBeTruthy();
        expect(app.product_version.trim()).not.toBe('');
        expect(app.product_name).toBeTruthy();
        expect(app.product_type).toBe('application');
        expect(app.id).toBeGreaterThan(0);
        expect(app.extra.port).toBeGreaterThan(0);
      });
    });

    it('should use generic Linux OS when no valid data', () => {
      const ports: PortScanPort[] = [
        {
          port: 80,
          protocol: 'tcp',
          state: 'closed',
          service: null,
        },
      ];

      const request = client.buildRequest(ports);

      // Necto API requires 'os' field, so we send generic Linux
      expect(request.os).toBeDefined();
      expect(request.os!.product_name).toBe('Linux');
      expect(request.os!.product_version).toBe('');
      expect(request.applications).toBeUndefined();
    });

    it('should use service name as fallback when product is null', () => {
      const ports: PortScanPort[] = [
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'http',
            product: null,
            version: '1.0',
            extraInfo: null,
            method: 'table',
            confidence: 5,
          },
        },
      ];

      const request = client.buildRequest(ports);

      expect(request.applications).toBeDefined();
      expect(request.applications![0].product_name).toBe('http');
    });
  });

  describe('Request validation', () => {
    it('should produce valid request structure for Necto API', () => {
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

      const osInfo: PortScanOSInfo = {
        name: 'Ubuntu Linux',
        version: '22.04',
        accuracy: 95,
      };

      const request = client.buildRequest(ports, osInfo);

      // Validate structure matches Necto API expectations
      expect(request).toHaveProperty('os');
      expect(request).toHaveProperty('applications');

      // OS structure
      expect(request.os).toHaveProperty('id');
      expect(request.os).toHaveProperty('product_type');
      expect(request.os).toHaveProperty('product_name');
      expect(request.os).toHaveProperty('product_version');
      expect(request.os).toHaveProperty('extra');

      // Applications structure
      request.applications!.forEach((app) => {
        expect(app).toHaveProperty('id');
        expect(app).toHaveProperty('product_type');
        expect(app).toHaveProperty('product_name');
        expect(app).toHaveProperty('product_version');
        expect(app).toHaveProperty('extra');

        // All required fields should be non-empty
        expect(typeof app.id).toBe('number');
        expect(app.product_type).toBe('application');
        expect(app.product_name).toBeTruthy();
        expect(app.product_version).toBeTruthy();
        expect(typeof app.extra).toBe('object');
      });
    });
  });
});
