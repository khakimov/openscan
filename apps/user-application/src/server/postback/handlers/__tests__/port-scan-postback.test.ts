/**
 * Port Scan Postback Handler Tests
 *
 * Tests for CVE enrichment integration in port scan postback flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PortScanPostback } from '../../types';
import type { HandlerContext } from '../base';
import type { CVEEnrichment } from '@repo/data-ops';
import * as dataOps from '@repo/data-ops';
import * as nectoClientModule from '@/server/discovery/services/necto-api-client';

// Mock dependencies BEFORE importing the handler
vi.mock('@repo/data-ops', () => ({
  getScanRunByRestateWorkflowId: vi.fn(),
  updateScanRunStatus: vi.fn(),
  updateScanWorkflowStatus: vi.fn(),
  updateDevice: vi.fn(),
}));

// Mock Necto client to return our mock implementation
const mockNectoClient = {
  enrichScanResults: vi.fn(),
} as any; // Cast to any since we only need enrichScanResults for testing

vi.mock('@/server/discovery/services/necto-api-client', () => ({
  createNectoAPIClient: vi.fn(() => mockNectoClient),
}));

// Import handler AFTER mocks are set up
import {
  PortScanPostbackHandler,
  resetNectoClientForTesting,
} from '../port-scan';

// Mock data - workflow data is now embedded in scan run
const mockScanRun = {
  id: 'scan-run-123',
  organizationId: 'org-123',
  restateWorkflowId: 'portscan-org-123-device-456',
  workflowKind: 'DISCOVERY' as const,
  workflowStatus: 'RUNNING' as const,
  scanType: 'PORT' as const,
  scope: 'EXTERNAL' as const,
  status: 'RUNNING' as const,
};

const mockCVEEnrichment: CVEEnrichment = {
  enrichedAt: '2025-10-21T00:00:00.000Z',
  nectoVersion: '1.51.2',
  summary: {
    totalCves: 5,
    totalCritical: 1,
    totalHigh: 2,
    totalMedium: 2,
    totalLow: 0,
    affectedServices: 2,
    maxCvssScore: 9.8,
  },
  applications: [
    {
      name: 'nginx',
      version: '1.28.0',
      port: 80,
      cveCount: 3,
      criticalCount: 1,
      highCount: 1,
      cves: [
        {
          cveId: 'CVE-2025-1695',
          cvssScore: 9.8,
          severity: 'CRITICAL',
          publishedDate: '2025-01-15T00:00:00Z',
        },
      ],
    },
  ],
};

const mockContext: HandlerContext = {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  env: {
    ANALYTICS: {
      writeDataPoint: vi.fn(),
    },
  },
} as any;

describe('PortScanPostbackHandler - CVE Enrichment', () => {
  let handler: PortScanPostbackHandler;

  beforeEach(() => {
    handler = new PortScanPostbackHandler();

    // Reset Necto client singleton
    resetNectoClientForTesting();

    // Reset createNectoAPIClient mock to return mockNectoClient
    vi.mocked(nectoClientModule.createNectoAPIClient).mockReturnValue(
      mockNectoClient
    );

    // Reset mock implementations
    mockNectoClient.enrichScanResults.mockReset();
    mockNectoClient.enrichScanResults.mockResolvedValue(mockCVEEnrichment);

    // Mock data-ops functions
    vi.mocked(dataOps.getScanRunByRestateWorkflowId).mockResolvedValue(
      mockScanRun as any
    );
    vi.mocked(dataOps.updateScanRunStatus).mockResolvedValue(undefined);
    vi.mocked(dataOps.updateScanWorkflowStatus).mockResolvedValue(undefined);
    vi.mocked(dataOps.updateDevice).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Enrichment Success Cases', () => {
    it('should enrich scan results when open ports are detected', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: {
                name: 'http',
                product: 'nginx',
                version: '1.28.0',
              },
            },
          ],
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockNectoClient.enrichScanResults).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            port: 80,
            service: expect.any(Object),
          }),
        ]),
        undefined
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: mockCVEEnrichment,
          portsStoredCount: 1,
          ports: expect.arrayContaining([
            expect.objectContaining({ port: 80 }),
          ]),
        })
      );
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'CVE enrichment completed',
        expect.objectContaining({
          totalCves: 5,
          criticalCount: 1,
        })
      );
    });

    it('should enrich when OS is detected (even without open ports)', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'closed',
            },
          ],
          osInfo: {
            name: 'Ubuntu',
            version: '24.04',
            accuracy: 95,
          },
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      // Closed port gets filtered out, so empty array passed to enrichment
      expect(mockNectoClient.enrichScanResults).toHaveBeenCalledWith(
        [],
        payload.data.osInfo
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: mockCVEEnrichment,
          openPortCount: 0, // Closed port not counted as open
          portsStoredCount: 0,
          ports: [],
        })
      );
    });

    it('should enrich when both open ports AND OS are detected', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
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
          ],
          osInfo: {
            name: 'Ubuntu',
            version: '24.04',
          },
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockNectoClient.enrichScanResults).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            port: 22,
            service: expect.any(Object),
          }),
        ]),
        payload.data.osInfo
      );
    });
  });

  describe('Skip Enrichment Cases', () => {
    it('should skip enrichment when no open ports and no OS detected', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'closed',
            },
          ],
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockNectoClient.enrichScanResults).not.toHaveBeenCalled();
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Skipped CVE enrichment - no services detected',
        expect.objectContaining({
          openPortsTotal: 0,
        })
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: undefined,
          openPortCount: 0,
          portsStoredCount: 0,
        })
      );
    });

    it('should skip enrichment when ports array is empty', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [],
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockNectoClient.enrichScanResults).not.toHaveBeenCalled();
    });
  });

  describe('Enrichment Failure Handling', () => {
    it('should save scan results even if enrichment fails', async () => {
      mockNectoClient.enrichScanResults.mockRejectedValue(
        new Error('Necto API timeout')
      );

      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: {
                name: 'http',
                product: 'nginx',
                version: '1.28.0',
              },
            },
          ],
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.error).toHaveBeenCalledWith(
        'CVE enrichment failed, continuing without enrichment',
        expect.objectContaining({
          error: 'Necto API timeout',
        })
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: undefined, // Enrichment failed, so undefined
          portsStoredCount: 1,
          ports: expect.arrayContaining([
            expect.objectContaining({ port: 80 }),
          ]),
        })
      );
    });

    it('should handle Necto client creation errors gracefully', async () => {
      vi.mocked(nectoClientModule.createNectoAPIClient).mockImplementation(
        () => {
          throw new Error('Client initialization failed');
        }
      );

      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: {
                name: 'http',
                product: 'nginx',
              },
            },
          ],
        },
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.error).toHaveBeenCalledWith(
        'CVE enrichment failed, continuing without enrichment',
        expect.any(Object)
      );
    });
  });

  describe('Result Summary Validation', () => {
    it('should include all expected fields in result summary with enrichment', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: {
                name: 'http',
                product: 'nginx',
                version: '1.28.0',
              },
            },
          ],
          osInfo: {
            name: 'Ubuntu',
            version: '24.04',
          },
          timing: {
            start: 1000,
            end: 2000,
            elapsed: 1000,
          },
          scanMetadata: {
            scanner: 'nmap',
            version: '7.94',
          },
        },
      };

      await handler.handle(payload, mockContext);

      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          target: '192.168.1.1',
          openPortCount: 1,
          portsStoredCount: 1,
          portsFilteredCount: 0,
          ports: expect.arrayContaining([
            expect.objectContaining({
              port: 80,
              service: expect.objectContaining({
                name: 'http',
                product: 'nginx',
              }),
            }),
          ]),
          serviceDetectionRate: 100,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
          timing: payload.data.timing,
          scanMetadata: payload.data.scanMetadata,
          osInfo: payload.data.osInfo,
          completedAt: expect.any(String),
          cveEnrichment: mockCVEEnrichment,
        })
      );
    });
  });

  describe('Port Filtering Logic', () => {
    it('should filter out ports without service information', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-org-123-device-456',
        organizationId: 'org-123',
        deviceId: 'device-456',
        timestamp: '2025-10-21T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            // Ports with services (should be stored)
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: { name: 'http', product: 'nginx' },
            },
            {
              port: 443,
              protocol: 'tcp',
              state: 'open',
              service: { name: 'https' },
            },
            {
              port: 22,
              protocol: 'tcp',
              state: 'open',
              service: { product: 'OpenSSH' },
            },
            // Ports without services (should be filtered) - need >10 to trigger log
            {
              port: 8080,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3000,
              protocol: 'tcp',
              state: 'open',
              service: {}, // Empty service object
            },
            {
              port: 3001,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3002,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3003,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3004,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3005,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3006,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3007,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3008,
              protocol: 'tcp',
              state: 'open',
            },
            {
              port: 3009,
              protocol: 'tcp',
              state: 'open',
            },
          ],
        },
      };

      await handler.handle(payload, mockContext);

      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 14,
          portsStoredCount: 3,
          portsFilteredCount: 11,
          ports: expect.arrayContaining([
            expect.objectContaining({ port: 80 }),
            expect.objectContaining({ port: 443 }),
            expect.objectContaining({ port: 22 }),
          ]),
          serviceDetectionRate: expect.closeTo(21.43, 0.01), // 3/14 ≈ 21.43%
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        })
      );

      // Should log filtering
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Filtered ports without service info',
        expect.objectContaining({
          filtered: 11,
          stored: 3,
        })
      );
    });

    it('should detect WAF/proxy pattern (65k ports, no services)', async () => {
      // Generate 65k ports with no service information (WAF/proxy pattern)
      const wafPorts = Array.from({ length: 65477 }, (_, i) => ({
        port: i + 1,
        protocol: 'tcp' as const,
        state: 'open' as const,
      }));

      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-waf-test',
        organizationId: 'org-123',
        deviceId: 'device-waf',
        timestamp: '2025-10-24T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: 'ssh.openstatus.dev',
          ports: wafPorts,
        },
      };

      await handler.handle(payload, mockContext);

      // Should detect suspicious pattern
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Suspicious scan pattern detected',
        expect.objectContaining({
          openPorts: 65477,
          servicesDetected: 0,
          pattern: 'Possible WAF/Proxy',
        })
      );

      // Should store 0 ports
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 65477,
          portsStoredCount: 0,
          portsFilteredCount: 65477,
          ports: [],
          serviceDetectionRate: 0,
          suspiciousAllPortsOpen: true,
          scanPattern: 'WAF/Proxy',
        })
      );

      // Should skip CVE enrichment
      expect(mockNectoClient.enrichScanResults).not.toHaveBeenCalled();
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Skipped CVE enrichment - no services detected',
        expect.objectContaining({
          openPortsTotal: 65477,
        })
      );
    });

    it('should apply storage limit when too many services detected', async () => {
      // Generate 1500 ports, all with services
      const manyServicePorts = Array.from({ length: 1500 }, (_, i) => ({
        port: i + 1,
        protocol: 'tcp' as const,
        state: 'open' as const,
        service: {
          name: 'http',
          product: 'test-service',
        },
      }));

      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-many-services',
        organizationId: 'org-123',
        deviceId: 'device-many',
        timestamp: '2025-10-24T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.100',
          ports: manyServicePorts,
        },
      };

      await handler.handle(payload, mockContext);

      // Should warn about storage limit
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Storage limit applied',
        expect.objectContaining({
          servicesFound: 1500,
          storingFirst: 1000,
        })
      );

      // Should cap at 1000 ports
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 1500,
          portsStoredCount: 1000,
          portsFilteredCount: 0,
          ports: expect.arrayContaining([
            expect.objectContaining({ service: expect.any(Object) }),
          ]),
        })
      );

      // Should call CVE enrichment with capped ports
      expect(mockNectoClient.enrichScanResults).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ service: expect.any(Object) }),
        ]),
        undefined
      );
    });

    it('should handle mixed scenario with some services and some without', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-mixed',
        organizationId: 'org-123',
        deviceId: 'device-mixed',
        timestamp: '2025-10-24T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.50',
          ports: [
            // 20 ports with services
            ...Array.from({ length: 20 }, (_, i) => ({
              port: i + 1,
              protocol: 'tcp' as const,
              state: 'open' as const,
              service: { name: 'http' },
            })),
            // 100 ports without services
            ...Array.from({ length: 100 }, (_, i) => ({
              port: i + 1000,
              protocol: 'tcp' as const,
              state: 'open' as const,
            })),
          ],
        },
      };

      await handler.handle(payload, mockContext);

      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 120,
          portsStoredCount: 20,
          portsFilteredCount: 100,
          serviceDetectionRate: expect.closeTo(16.67, 1), // 20/120 ≈ 16.67%
          suspiciousAllPortsOpen: false, // Not >1000 ports
          scanPattern: 'Normal',
        })
      );
    });

    it('should handle edge case with closed ports (should be excluded from open count)', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-closed',
        organizationId: 'org-123',
        deviceId: 'device-closed',
        timestamp: '2025-10-24T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [
            {
              port: 80,
              protocol: 'tcp',
              state: 'open',
              service: { name: 'http' },
            },
            {
              port: 443,
              protocol: 'tcp',
              state: 'closed', // Closed port
            },
            {
              port: 8080,
              protocol: 'tcp',
              state: 'filtered', // Filtered port
            },
          ],
        },
      };

      await handler.handle(payload, mockContext);

      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 1, // Only 1 open port
          portsStoredCount: 1,
          portsFilteredCount: 0, // No open ports without services
          ports: [expect.objectContaining({ port: 80 })],
        })
      );
    });

    it('should handle empty ports array', async () => {
      const payload: PortScanPostback = {
        type: 'PORT_SCAN',
        scanId: 'portscan-empty',
        organizationId: 'org-123',
        deviceId: 'device-empty',
        timestamp: '2025-10-24T00:00:00.000Z',
        status: 'SUCCESS',
        data: {
          target: '192.168.1.1',
          ports: [],
        },
      };

      await handler.handle(payload, mockContext);

      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          openPortCount: 0,
          portsStoredCount: 0,
          portsFilteredCount: 0,
          ports: [],
          serviceDetectionRate: 0,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        })
      );
    });
  });
});
