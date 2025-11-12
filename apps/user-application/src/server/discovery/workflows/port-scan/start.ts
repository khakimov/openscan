import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { extractErrorMessage } from '../../utils/workflow-helpers';
import { PortScanSchema } from '../../schemas/port-scan-schemas';
import { getCurrentOrganizationId, getCurrentUser } from '../../../utils/auth';
import { portScanService } from '../../services/port-scan-service';

import type { PortScanInput } from '@repo/contracts';
import type { PortScanStartResult } from '../types';

const logger = createLogger({ name: 'discovery-port-scan-start' });

export const startPortScanWorkflow = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => {
    logger.info('Port scan input validation', { data });
    const result = PortScanSchema.safeParse(data);
    if (!result.success) {
      const message = result.error?.issues?.map((err) => err.message).join(', ') || 'Validation failed';
      logger.error('Port scan input validation failed', { data, error: result.error });
      throw new Error(`Invalid input: ${message}`);
    }
    return result.data;
  })
  .handler(async ({ data }): Promise<PortScanStartResult> => {
    const input = data as PortScanInput;

    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Starting port scan via Restate', {
        target: input.target,
        ports: input.ports,
        organizationId,
        userId: user.id,
      });

      // Use service for full orchestration (Restate + database tracking)
      const result = await portScanService.startScan({
        input,
        tenantId: organizationId,
        userId: user.id,
      });

      logger.info('Port scan started', {
        scanId: result.scanId,
        target: result.target,
        portsFound: result.totalPorts,
      });

      return {
        success: true,
        scanId: result.scanId, // Restate workflow key
        scanRunId: result.scanRunId,
        target: result.target,
        ports: result.ports,
        totalPorts: result.totalPorts,
        message: `Port scan started for ${input.target}`,
      };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);

      logger.error('Failed to start port scan', {
        target: input.target,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        target: input.target,
      };
    }
  });
