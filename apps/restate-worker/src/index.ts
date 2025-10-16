import * as restate from '@restatedev/restate-sdk';
import { portScanner } from './port-scanner';
import { discoveryService } from './discovery-service';
import { createLogger } from '@repo/logger';
import { checkDeploymentStatus, logDeploymentGuidance } from './deployment-checker';

const logger = createLogger({ name: 'restate-worker' });

/**
 * Restate Worker - Replaces Temporal Worker
 *
 * This service handles:
 * - Port scanning (nmap/masscan/rustscan)
 * - Discovery workflows (subdomain/host discovery)
 * - Any long-running security scanning tasks
 *
 * Architecture:
 * 1. TanStack Start app (Cloudflare) calls Restate Cloud HTTP API
 * 2. Restate Cloud routes to this worker
 * 3. Worker executes durable workflows
 * 4. Results flow back through Restate to TanStack Start
 */

const PORT = process.env.RESTATE_PORT ? parseInt(process.env.RESTATE_PORT) : 9080;

// Identity keys for Restate Cloud (optional, for security)
// Get these from: https://cloud.restate.dev/developers/integration
const IDENTITY_KEYS = process.env.RESTATE_IDENTITY_KEYS
  ? process.env.RESTATE_IDENTITY_KEYS.split(',')
  : undefined;

const endpoint = restate
  .endpoint()
  .bind(portScanner)
  .bind(discoveryService);

endpoint
  .listen(PORT)
  .then(async () => {
    // Get actual registered service names and handlers
    const services = [
      {
        name: 'PortScanner',
        handlers: ['scan', 'cancel', 'getState'],
      },
      {
        name: 'Discovery',
        handlers: ['discover', 'getState'],
      },
    ];

    logger.info('Restate worker started', {
      port: PORT,
      services: services.map((s) => s.name),
      identityKeysConfigured: !!IDENTITY_KEYS,
    });

    // Check deployment status
    const restateAdminUrl = process.env.RESTATE_ADMIN_URL;
    logger.debug('Checking deployment with', {
      adminUrl: restateAdminUrl || 'http://localhost:8080 (default)',
      hasApiKey: !!process.env.RESTATE_API_KEY,
    });

    const status = await checkDeploymentStatus(PORT, services, restateAdminUrl);

    // Log guidance based on status
    logDeploymentGuidance(status, PORT, restateAdminUrl);
  })
  .catch((err) => {
    logger.error('Failed to start Restate worker', { error: err });
    process.exit(1);
  });
