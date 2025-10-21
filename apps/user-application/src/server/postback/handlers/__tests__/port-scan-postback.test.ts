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
  getScanWorkflowByScanId: vi.fn(),
  updateScanRunStatus: vi.fn(),
  updateScanWorkflowStatus: vi.fn(),
  updateDevice: vi.fn(),
  getDb: vi.fn(),
  scanRuns: {},
  eq: vi.fn(),
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

// Mock data
const mockScanRun = {
  id: 'scan-run-123',
  scanWorkflowId: 'workflow-123',
  organizationId: 'org-123',
};

const mockWorkflow = {
  id: 'workflow-123',
  scanId: 'portscan-org-123-device-456',
  organizationId: 'org-123',
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
    vi.mocked(dataOps.getScanWorkflowByScanId).mockResolvedValue(
      mockWorkflow as any
    );
    vi.mocked(dataOps.updateScanRunStatus).mockResolvedValue(undefined);
    vi.mocked(dataOps.updateScanWorkflowStatus).mockResolvedValue(undefined);
    vi.mocked(dataOps.updateDevice).mockResolvedValue(undefined);

    // Mock getDb to return scan run
    vi.mocked(dataOps.getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([mockScanRun])),
          })),
        })),
      })),
    } as any);
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
        payload.data.ports,
        undefined
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: mockCVEEnrichment,
        })
      );
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Starting CVE enrichment',
        expect.any(Object)
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
      expect(mockNectoClient.enrichScanResults).toHaveBeenCalledWith(
        payload.data.ports,
        payload.data.osInfo
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: mockCVEEnrichment,
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
        payload.data.ports,
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
        'Skipping CVE enrichment - no open ports or OS detected',
        expect.objectContaining({
          hasOpenPorts: false,
          hasOSInfo: false,
        })
      );
      expect(dataOps.updateScanRunStatus).toHaveBeenCalledWith(
        'scan-run-123',
        'SUCCEEDED',
        expect.objectContaining({
          cveEnrichment: undefined,
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
          ports: payload.data.ports, // But scan data is still saved
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
          ports: payload.data.ports,
          timing: payload.data.timing,
          scanMetadata: payload.data.scanMetadata,
          osInfo: payload.data.osInfo,
          completedAt: expect.any(String),
          cveEnrichment: mockCVEEnrichment,
        })
      );
    });
  });
});
