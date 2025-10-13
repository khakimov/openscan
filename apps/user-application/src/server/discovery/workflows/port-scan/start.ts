import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { getCurrentTenant, getCurrentUser } from '../../../utils/auth';
import { determineScanScope } from '../../utils/scan-scope';
import { generateWorkflowId, extractErrorMessage } from '../../utils/workflow-helpers';
import { PortScanSchema } from '../../schemas/port-scan-schemas';
import { workflowOrchestrator } from '../../services/workflow-orchestrator';
import { scanRecorder } from '../../services/scan-recorder';
import { deviceManager } from '../../services/device-manager';
import { buildScannerInput } from '../../utils/port-scan';

import type { PortScanInput } from '@repo/contracts';

const logger = createLogger({ name: 'discovery-port-scan-start' });

export const startPortScanWorkflow = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => {
    logger.info('Port scan input validation', { data });
    const result = PortScanSchema.safeParse(data);
    if (!result.success) {
      const message = result.error?.errors?.map((err) => err.message).join(', ') || 'Validation failed';
      logger.error('Port scan input validation failed', { data, error: result.error });
      throw new Error(`Invalid input: ${message}`);
    }
    return result.data;
  })
  .handler(async ({ data }) => {
    const input = data as PortScanInput;

    try {
      const tenantId = await getCurrentTenant();
      const user = await getCurrentUser();

      logger.info('Starting port scan workflow with orchestration', {
        tenantId,
        userId: user.id,
        input,
      });

      const temporalWorkflowId = generateWorkflowId('portscan', input.target);
      const scanWorkflow = await scanRecorder.createWorkflow({
        tenantId,
        temporalWorkflowId,
        kind: 'DISCOVERY',
      });

      const scope = determineScanScope(input.target);
      const scanRun = await scanRecorder.createRun({
        workflowId: scanWorkflow.id,
        tenantId,
        scanType: 'PORT',
        scope,
        requestedById: user.id,
        target: input.target,
        targets: [input.target],
      });

      const scannerInput = buildScannerInput({
        tenantId,
        userId: user.id,
        input,
        scope,
        scanWorkflowId: scanWorkflow.id,
        scanRunId: scanRun.id,
      });

      const handle = await workflowOrchestrator.startPortScan(scannerInput, temporalWorkflowId);

      if (input.deviceId) {
        await deviceManager.attachDeviceToScan({
          tenantId,
          scanRunId: scanRun.id,
          deviceId: input.deviceId,
          target: input.target,
        });
      }

      await scanRecorder.markRunRunning(scanRun.id);
      await scanRecorder.updateWorkflowStatus(scanWorkflow.id, 'RUNNING', handle.firstExecutionRunId);

      return {
        success: true,
        workflowId: handle.workflowId,
        scanWorkflowId: scanWorkflow.id,
        scanRunId: scanRun.id,
        target: input.target,
        message: `Port scan started for ${input.target}`,
      };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);

      logger.error('Failed to start port scan workflow', {
        input,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        target: input.target,
      };
    }
  });
