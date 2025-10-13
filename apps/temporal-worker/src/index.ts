import 'dotenv/config';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createLogger } from '@repo/logger';
import { getTemporalConnectionConfig } from '@repo/config';
import * as activities from './activities';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = createLogger({ name: 'temporal-worker' });

async function run() {
  const config = getTemporalConnectionConfig();

  logger.info('Starting Temporal Worker', {
    serverAddress: config.serverAddress,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
  });

  // Create connection to Temporal server
  logger.info('Connecting to Temporal server...', {
    serverAddress: config.serverAddress,
  });

  const connection = await NativeConnection.connect({
    address: config.serverAddress,
    // Enable TLS (use empty object for default TLS with system certs)
    tls: {},
    // For mTLS with client certificates:
    // tls: {
    //   clientCertPair: {
    //     crt: fs.readFileSync(clientCertPath),
    //     key: fs.readFileSync(clientKeyPath),
    //   },
    // },
  });

  logger.info('Successfully connected to Temporal server');

  try {
    const workflowsPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      './workflows'
    );

    logger.info('Worker configuration', {
      workflowsPath,
      activitiesCount: Object.keys(activities).length,
      availableActivities: Object.keys(activities),
    });

    // Create worker
    const worker = await Worker.create({
      connection,
      namespace: config.namespace,
      workflowsPath,
      activities,
      taskQueue: config.taskQueue,
    });

    logger.info('Worker created successfully, polling for tasks...');

    // Start the worker
    await worker.run();
  } catch (error) {
    logger.error('Worker failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    // Clean up connection
    await connection.close();
    logger.info('Worker connection closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the worker
run().catch((error) => {
  logger.error('Failed to start worker:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
