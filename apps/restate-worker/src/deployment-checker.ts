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
 * @param restateIngressUrl - Restate ingress URL (optional, defaults to localhost:8080)
 */
export async function checkDeploymentStatus(
  workerPort: number,
  currentServices: ServiceInfo[],
  restateIngressUrl?: string
): Promise<DeploymentStatus> {
  const ingressUrl = restateIngressUrl || 'http://localhost:8080';
  const workerUrl = `http://localhost:${workerPort}`;

  try {
    // Try to fetch deployment information from Restate admin API
    // Note: This requires Restate to be running
    const response = await fetch(`${ingressUrl}/deployments`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });

    if (!response.ok) {
      // Restate not accessible - can't determine status
      return {
        registered: false,
        needsUpdate: false,
        reason: 'Cannot connect to Restate - is it running?',
      };
    }

    const deployments = (await response.json()) as any;

    // Check if our worker is registered
    const ourDeployment = deployments.deployments?.find(
      (d: any) => d.endpoint === workerUrl
    );

    if (!ourDeployment) {
      return {
        registered: false,
        needsUpdate: true,
        reason: 'Worker not registered with Restate',
      };
    }

    // Check if registered services match current services
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

    // Check handlers for each service
    for (const currentService of currentServices) {
      const registeredService = registeredServices.find(
        (s: any) => s.name === currentService.name
      );

      if (!registeredService) {
        return {
          registered: true,
          needsUpdate: true,
          reason: `New service detected: ${currentService.name}`,
        };
      }

      const currentHandlers = currentService.handlers.sort();
      const registeredHandlers = (registeredService.handlers || []).sort();

      if (JSON.stringify(currentHandlers) !== JSON.stringify(registeredHandlers)) {
        return {
          registered: true,
          needsUpdate: true,
          reason: `Handler mismatch in ${currentService.name}: registered [${registeredHandlers.join(', ')}], current [${currentHandlers.join(', ')}]`,
        };
      }
    }

    // All good!
    return {
      registered: true,
      needsUpdate: false,
    };
  } catch (error) {
    // Network error or timeout - likely Restate not running
    return {
      registered: false,
      needsUpdate: false,
      reason: 'Cannot connect to Restate - is it running?',
    };
  }
}

/**
 * Print deployment status and guidance
 */
export function logDeploymentGuidance(
  status: DeploymentStatus,
  workerPort: number,
  restateIngressUrl?: string
) {
  const ingressUrl = restateIngressUrl || 'http://localhost:8080';

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
    logger.info(`   Restate ingress: ${ingressUrl}`);
    logger.info('');
  }
}
