import { activityInfo } from '@temporalio/activity';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import { mockPingSweepResults } from '../mock-data/discovery';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'ping-sweep' });

/**
 * Perform ping sweep to check host availability
 * Database-agnostic: Only returns ping results, no persistence
 */
export async function runPingSweep(
  ipAddresses: string[]
): Promise<Record<string, boolean>> {
  const activityId = activityInfo().activityId;

  // Development mode - return mock ping results quickly
  if (process.env.SCANNER_DEV_MODE === 'true') {
    const sleepSeconds = parseInt(process.env.SCANNER_DEV_SLEEP_SECONDS || '5');

    logger.info(`[${activityId}] [DEV MODE] Starting mock ping sweep`, {
      targetCount: ipAddresses.length,
      sleepSeconds,
    });

    // Simulate work with shorter sleep for ping sweep
    await new Promise((resolve) =>
      setTimeout(resolve, (sleepSeconds / 2) * 1000)
    );

    // Use mock results, fallback to random for unknown IPs
    const results: Record<string, boolean> = {};
    for (const ip of ipAddresses) {
      results[ip] = mockPingSweepResults[ip] ?? Math.random() > 0.3; // 70% success rate for unknown IPs
    }

    logger.info(`[${activityId}] [DEV MODE] Mock ping sweep completed`, {
      targetCount: ipAddresses.length,
      aliveCount: Object.values(results).filter(Boolean).length,
      results,
    });

    return results;
  }

  // Production mode - run actual ping
  logger.info(`[${activityId}] Starting ping sweep`, {
    targetCount: ipAddresses.length,
  });

  if (ipAddresses.length === 0) {
    return {};
  }

  const results: Record<string, boolean> = {};

  // Process IPs in batches to avoid overwhelming the system
  const batchSize = 50;
  const batches: string[][] = [];

  for (let i = 0; i < ipAddresses.length; i += batchSize) {
    batches.push(ipAddresses.slice(i, i + batchSize));
  }

  logger.info(
    `[${activityId}] Processing ${batches.length} batches of ping requests`
  );

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    logger.info(
      `[${activityId}] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} IPs)`
    );

    // Run ping for each IP in the batch (could be further parallelized)
    const batchPromises = batch.map(async (ip) => {
      try {
        const isAlive = await pingHost(ip);
        results[ip] = isAlive;
        return { ip, success: true, alive: isAlive };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(`[${activityId}] Ping failed for ${ip}`, {
          error: errorMessage,
        });
        results[ip] = false; // Assume dead if ping fails
        return { ip, success: false, alive: false };
      }
    });

    // Wait for batch to complete
    const batchResults = await Promise.allSettled(batchPromises);

    const successful = batchResults.filter(
      (r) => r.status === 'fulfilled'
    ).length;
    const alive = batchResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<any>).value)
      .filter((r) => r.alive).length;

    logger.info(`[${activityId}] Batch ${batchIndex + 1} completed`, {
      successful,
      alive,
      total: batch.length,
    });

    // Small delay between batches to be nice to the network
    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const totalAlive = Object.values(results).filter(Boolean).length;

  logger.info(`[${activityId}] Ping sweep completed`, {
    totalTargets: ipAddresses.length,
    aliveHosts: totalAlive,
    alivePercentage: Math.round((totalAlive / ipAddresses.length) * 100),
  });

  return results;
}

/**
 * Ping a single host
 * Platform-aware ping implementation with proper timeout handling
 */
async function pingHost(ip: string): Promise<boolean> {
  // Validate IP address format
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(ip)) {
    throw new Error(`Invalid IP address format: ${ip}`);
  }

  try {
    // Use platform-appropriate ping command
    const pingCmd = process.platform === 'win32' ? 'ping' : 'ping';
    const pingArgs =
      process.platform === 'win32'
        ? ['-n', '1', '-w', '2000', ip] // Windows: 1 ping, 2 second timeout
        : ['-c', '1', '-W', '2', ip]; // Unix: 1 ping, 2 second timeout

    const { stdout } = await execFileAsync(pingCmd, pingArgs, {
      timeout: 5000, // 5 second overall timeout
    });

    // Parse ping output to determine success
    if (process.platform === 'win32') {
      // Windows ping success indicators
      return stdout.includes('TTL=') || stdout.includes('Reply from');
    } else {
      // Unix ping success indicators
      return (
        stdout.includes('1 received') || stdout.includes('1 packets received')
      );
    }
  } catch (error) {
    // Ping command failed or timed out
    if (error instanceof Error) {
      // Don't log timeout errors as they're expected for dead hosts
      if (
        !error.message.includes('timeout') &&
        !error.message.includes('killed')
      ) {
        logger.debug('Ping execution error', { ip, error: error.message });
      }
    }
    return false;
  }
}
