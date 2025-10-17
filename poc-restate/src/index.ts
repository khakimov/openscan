import * as restate from '@restatedev/restate-sdk-cloudflare-workers/fetch';
import { portScanner } from './port-scanner';

/**
 * Restate PoC - Port Scanner Service
 *
 * This PoC tests if Restate can replace Temporal for:
 * 1. Durable port scanning workflows
 * 2. State queries during execution
 * 3. Workflow cancellation
 * 4. Scheduled/recurring scans (to be tested)
 *
 * Deploy with: pnpm deploy
 * Or test locally: pnpm dev
 */
export default {
  fetch: restate.createEndpointHandler({ services: [portScanner] }),
};
