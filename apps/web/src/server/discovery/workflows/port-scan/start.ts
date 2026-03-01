import { createLogger } from '@repo/logger';

import { extractErrorMessage } from '../../utils/workflow-helpers';
import { PortScanSchema } from '../../schemas/port-scan-schemas';
import { portScanService } from '../../services/port-scan-service';
import type { EnvBindings } from '@/lib/config';

import type { PortScanInput } from '@repo/contracts';
import type { PortScanStartResult } from '../types';

const logger = createLogger({ name: 'discovery-port-scan-start' });

export async function startPortScanWorkflow({
  data,
  env,
}: {
  data: PortScanInput & { organizationId?: string; userId?: string };
  /** Cloudflare Workers env bindings (optional - falls back to process.env) */
  env?: EnvBindings;
}): Promise<PortScanStartResult> {
  const input = data;

  logger.info('Port scan input validation', { data: input });
  const result = PortScanSchema.safeParse(input);
  if (!result.success) {
    const message =
      result.error?.issues?.map((err) => err.message).join(', ') ||
      'Validation failed';
    logger.error('Port scan input validation failed', {
      data: input,
      error: result.error,
    });
    throw new Error(`Invalid input: ${message}`);
  }

  try {
    const organizationId = input.organizationId!;
    const userId = input.userId!;

    logger.info('Starting port scan via Restate', {
      target: input.target,
      ports: input.ports,
      organizationId,
      userId,
    });

    // Use service for full orchestration (Restate + database tracking)
    const scanResult = await portScanService.startScan({
      input,
      tenantId: organizationId,
      userId,
      env,
    });

    logger.info('Port scan started', {
      scanId: scanResult.scanId,
      target: scanResult.target,
      portsFound: scanResult.totalPorts,
    });

    return {
      success: true,
      scanId: scanResult.scanId,
      scanRunId: scanResult.scanRunId,
      target: scanResult.target,
      ports: scanResult.ports,
      totalPorts: scanResult.totalPorts,
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
}
