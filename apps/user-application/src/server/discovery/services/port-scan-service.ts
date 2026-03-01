/**
 * Port Scan Service
 *
 * Handles port scan orchestration with Restate + database recording
 * Keeps complexity out of the handler
 */

import { createLogger } from '@repo/logger';
import { getRestateHttpClient } from '../../utils/restate-http-client';
import { scanRecorder } from './scan-recorder';
import { deviceManager } from './device-manager';
import { generateScanId } from '../utils/workflow-helpers';
import { determineScanScope } from '../utils/scan-scope';
import { getScanResultsCallbackUrl } from '@/lib/config';

import type { ScanScope } from '@repo/data-ops/schema/enums';

import type { PortScanInput } from '@repo/contracts';
import { env } from 'cloudflare:workers';

const logger = createLogger({ name: 'port-scan-service' });

export interface StartPortScanParams {
  input: PortScanInput;
  tenantId: string;
  userId: string;
}

export class PortScanService {
  /**
   * Start a port scan with full orchestration:
   * 1. Record scan in database (for long-running scan tracking)
   * 2. Start Restate port scan
   * 3. Link device if provided
   * 4. Update scan status
   */
  async startScan(params: StartPortScanParams) {
    const { input, tenantId, userId } = params;

    // Generate scanId (Restate workflow key) for tracking
    const scanId = generateScanId('portscan', input.target);

    // Step 1: Create database record with embedded workflow tracking
    const scope = determineScanScope(input.target) as ScanScope;
    const scanRun = await scanRecorder.createRun({
      tenantId,
      restateWorkflowId: scanId,
      workflowKind: 'DISCOVERY',
      scanType: 'PORT',
      scope,
      requestedById: userId,
      target: input.target,
      targets: [input.target],
    });

    logger.info('Port scan database record created', {
      scanId,
      scanRunId: scanRun.id,
      target: input.target,
    });

    // Step 2: Link device if provided (before starting scan)
    if (input.deviceId) {
      await deviceManager.attachDeviceToScan({
        tenantId,
        scanRunId: scanRun.id,
        deviceId: input.deviceId,
        target: input.target,
      });
    }

    // Step 3: Update scan status to running (before starting scan to avoid race condition)
    await scanRecorder.markRunRunning(scanRun.id);
    await scanRecorder.updateWorkflowStatus(scanRun.id, 'RUNNING');

    // Step 4: Start Restate port scan with postback (async - returns immediately)
    const client = getRestateHttpClient();

    // Build callback URL for postback
    const callbackUrl = getScanResultsCallbackUrl(env);

    const scanResult = await client.startPortScan({
      target: input.target,
      ports: input.ports?.join(','),
      protocol: input.protocol as 'tcp' | 'udp',
      aggressive: input.aggressive,
      timeout: input.timeout,
      // Postback configuration
      callbackUrl,
      deviceId: input.deviceId,
      scanId: scanId, // Restate workflow key
      organizationId: tenantId, // Required for postback handler to find workflow
    });

    logger.info('Port scan workflow started in Restate', {
      scanId: scanResult.scanId,
      target: scanResult.target,
      restateScanId: scanId,
    });

    return {
      success: true,
      scanId: scanResult.scanId, // Restate workflow key
      scanRunId: scanRun.id,
      target: scanResult.target,
      // Ports will come via postback - don't include here
      ports: [],
      totalPorts: 0,
    };
  }

  /**
   * Cancel a running port scan
   */
  async cancelScan(params: { scanId: string; scanRunId?: string; reason?: string }) {
    const { scanId, scanRunId, reason } = params;

    // Cancel in Restate
    const client = getRestateHttpClient();
    await client.cancelPortScan(scanId, reason);

    // Update database if we have scanRunId
    if (scanRunId) {
      await scanRecorder.markRunCanceled(scanRunId, reason);
      await scanRecorder.updateWorkflowStatus(scanRunId, 'CANCELED');
    }

    logger.info('Port scan canceled', { scanId, scanRunId });

    return {
      success: true,
      scanId,
      status: 'canceled',
    };
  }

  /**
   * Get port scan state/progress
   */
  async getScanState(scanId: string) {
    const client = getRestateHttpClient();
    const state = await client.getPortScanState(scanId);

    return state;
  }
}

export const portScanService = new PortScanService();
