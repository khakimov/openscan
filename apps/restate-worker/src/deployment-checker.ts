/**
 * Deployment Checker
 *
 * Detects when the worker needs to be re-registered with Restate.
 * Runs on startup to validate deployment status.
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'deployment-checker' });

interface ServiceInfo {
  name: string;
  handlers: string[];
}

interface DeploymentStatus {
  registered: boolean;
  needsUpdate: boolean;
  reason?: string;
}

/**
 * Check if deployment needs registration or update
 *
 * @param workerPort - Port the worker is listening on
 * @param currentServices - Services currently defined in the worker
 * @param restateAdminUrl - Restate admin API URL (optional, defaults to localhost:8080)
 */
export async function checkDeploymentStatus(
  workerPort: number,
  currentServices: ServiceInfo[],
  restateAdminUrl?: string
): Promise<DeploymentStatus> {
  const adminUrl = restateAdminUrl || 'http://localhost:8080';
  const workerUrl = `http://localhost:${workerPort}`;

  try {
    // Try to fetch deployment information from Restate admin API
    // Note: This requires Restate to be running
    logger.debug('Checking deployment status', { adminUrl, endpoint: `${adminUrl}/deployments` });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Add auth header if RESTATE_API_KEY is set (for Restate Cloud)
    const apiKey = process.env.RESTATE_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${adminUrl}/deployments`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000), // 5 second timeout (cloud might be slower)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      return {
        registered: false,
        needsUpdate: false,
        reason: `Restate API error (${response.status}): ${errorText.substring(0, 100)}`,
      };
    }

    const deployments = (await response.json()) as any;

    // Check if our worker is registered
    // For cloud deployments, the URI contains the tunnel URL, so check if it ends with the port
    logger.debug('Searching for worker deployment', {
      workerUrl,
      workerPort,
      totalDeployments: deployments.deployments?.length,
      deploymentUris: deployments.deployments?.map((d: any) => d.uri),
    });

    const ourDeployment = deployments.deployments?.find(
      (d: any) => d.uri === workerUrl || d.uri?.includes(`/localhost/${workerPort}`)
    );

    if (!ourDeployment) {
      return {
        registered: false,
        needsUpdate: true,
        reason: 'Worker not registered with Restate',
      };
    }

    // Check if registered services match current services
    // Note: Restate admin API only exposes service names and revisions, not handlers
    const registeredServices = ourDeployment.services || [];
    const currentServiceNames = currentServices.map((s) => s.name).sort();
    const registeredServiceNames = registeredServices.map((s: any) => s.name).sort();

    // Simple check: do service names match?
    if (JSON.stringify(currentServiceNames) !== JSON.stringify(registeredServiceNames)) {
      return {
        registered: true,
        needsUpdate: true,
        reason: `Service mismatch: registered [${registeredServiceNames.join(', ')}], current [${currentServiceNames.join(', ')}]`,
      };
    }

    // All services are registered - we can't check handlers since the API doesn't expose them
    // The deployment is considered up-to-date if service names match

    // All good!
    return {
      registered: true,
      needsUpdate: false,
    };
  } catch (error) {
    // Network error or timeout
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug('Deployment check failed', { error: errorMessage, adminUrl });

    return {
      registered: false,
      needsUpdate: false,
      reason: `Cannot connect to ${adminUrl}: ${errorMessage}`,
    };
  }
}

/**
 * Print deployment status and guidance
 */
export function logDeploymentGuidance(
  status: DeploymentStatus,
  workerPort: number,
  restateAdminUrl?: string
) {
  const adminUrl = restateAdminUrl || 'http://localhost:8080';

  logger.info('');
  logger.info(`🔍 Checking deployment at: ${adminUrl}`);
  logger.info('');

  if (!status.registered) {
    logger.warn('⚠️  Worker not registered with Restate');
    if (status.reason) {
      logger.warn(`   Reason: ${status.reason}`);
    }
    logger.info('');
    logger.info('📋 Next steps:');
    logger.info('   1. Make sure Restate is running');
    logger.info('   2. Register this worker:');
    logger.info(`      npx @restatedev/restate deployments register http://localhost:${workerPort}`);
    logger.info('');
  } else if (status.needsUpdate) {
    logger.warn('⚠️  Worker needs re-registration');
    logger.warn(`   Reason: ${status.reason}`);
    logger.info('');
    logger.info('📋 Service interface changed - re-register with --force:');
    logger.info(`   npx @restatedev/restate deployments register http://localhost:${workerPort} --force`);
    logger.info('');
  } else {
    logger.info('✅ Worker is registered and up-to-date');
    logger.info(`   Restate admin: ${adminUrl}`);
    logger.info('');
  }
}
