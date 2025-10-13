import { Client, Connection } from '@temporalio/client';
import { createLogger } from '@repo/logger';
import { getTemporalConnectionConfig } from '@repo/config';

const logger = createLogger({ name: 'temporal-client' });

let temporalClient: Client | null = null;

/**
 * Get or create a singleton Temporal client instance
 * Uses lazy connection for better performance
 */
export function getTemporalClient(): Client {
  if (!temporalClient) {
    const config = getTemporalConnectionConfig();

    // Log at call site, not in config package
    logger.info('Creating Temporal client connection', {
      address: config.serverAddress,
      namespace: config.namespace
    });

    const connection = Connection.lazy({
      address: config.serverAddress,
    });

    temporalClient = new Client({
      connection,
      namespace: config.namespace,
    });
  }

  return temporalClient;
}

/**
 * Reset the Temporal client (useful for testing or reconnection)
 */
export function resetTemporalClient(): void {
  temporalClient = null;
}