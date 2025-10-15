import * as restate from '@restatedev/restate-sdk';
import { portScanner } from './port-scanner';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-worker' });

/**
 * Restate Worker - Replaces Temporal Worker
 *
 * This service handles:
 * - Port scanning (nmap/masscan/rustscan)
 * - Discovery workflows
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

restate
  .endpoint()
  .bind(portScanner)
  // TODO: Add discovery service
  // .bind(discoveryService)
  .listen(PORT)
  .then(() => {
    logger.info('Restate worker started', {
      port: PORT,
      services: ['PortScanner'],
      identityKeysConfigured: !!IDENTITY_KEYS,
    });

    logger.info('Next steps:');
    logger.info('1. Sign up for Restate Cloud: https://cloud.restate.dev');
    logger.info('2. Register this worker:');
    logger.info(`   npx @restatedev/restate deployments register http://localhost:${PORT}`);
    logger.info('3. Test scan:');
    logger.info('   curl -X POST <RESTATE_INGRESS_URL>/PortScanner/scan \\');
    logger.info('     -H "Content-Type: application/json" \\');
    logger.info('     -d \'{"target": "scanme.nmap.org"}\'');
  })
  .catch((err) => {
    logger.error('Failed to start Restate worker', { error: err });
    process.exit(1);
  });
