import { describe, expect, it } from 'vitest';
import {
  DiscoveryPostbackSchema,
  UniversalPostbackSchema,
  buildDiscoveryPostbackPayload,
  buildPortScanPostbackPayload,
} from '@repo/contracts/postbacks';

describe('postback contracts (shared)', () => {
  it('filters devices without hostnames when building discovery payload', () => {
    const payload = buildDiscoveryPostbackPayload({
      type: 'DISCOVERY',
      scanId: 'scan-1',
      organizationId: 'org-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      status: 'SUCCESS',
      data: {
        target: 'example.com',
        devices: [
          { hostname: 'api.example.com', ipAddress: '1.2.3.4' },
          { hostname: '', ipAddress: '5.6.7.8' },
          { hostname: '   ', ipAddress: '9.9.9.9' },
        ],
        totalSubdomains: 3,
        executionTime: 42,
        tools: ['subfinder'],
      },
    });

    expect(payload.data.devices).toHaveLength(1);
    expect(payload.data.devices[0]).toMatchObject({
      hostname: 'api.example.com',
      ipAddress: '1.2.3.4',
    });
  });

  it('parses universal postback union via shared schema', () => {
    const discovery = DiscoveryPostbackSchema.parse({
      type: 'DISCOVERY',
      scanId: 'scan-123',
      organizationId: 'org-123',
      timestamp: '2025-01-01T00:00:00.000Z',
      status: 'SUCCESS',
      data: {
        target: 'example.com',
        devices: [{ hostname: 'api.example.com' }],
        totalSubdomains: 1,
        executionTime: 1000,
        tools: ['subfinder'],
      },
    });

    const universal = UniversalPostbackSchema.parse(discovery);
    expect(universal.type).toBe('DISCOVERY');
  });

  it('validates port scan payloads using builder helper', () => {
    expect(() =>
      buildPortScanPostbackPayload({
        type: 'PORT_SCAN',
        scanId: 'scan-abc',
        organizationId: 'org-abc',
        timestamp: '2025-01-01T00:00:00.000Z',
        status: 'SUCCESS',
        deviceId: 'device-1',
        data: {
          target: '1.2.3.4',
          ports: [
            {
              port: 22,
              protocol: 'tcp',
              state: 'open',
              service: { name: 'ssh' },
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});

