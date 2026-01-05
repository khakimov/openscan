import * as restate from '@restatedev/restate-sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import { postUniversalPostback } from './postback';
import { buildPortScanPostbackPayload } from '@repo/contracts/postbacks';
import type { PortScanPostback } from '@repo/contracts/postbacks';
import { parseNmapXml } from './xml-parser';
import { runMasscan } from './scanners/masscan';
import { runRustscan } from './scanners/rustscan';
import { combinePortDiscoveries, extractPortNumbers, formatPortSpec } from './port-merger';
import { shouldDiscardServiceDetection } from '@repo/contracts/device';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'restate-port-scanner' });

// State management for scan tracking
interface PortScanState {
  scanId: string;
  target: string;
  status: 'VALIDATING' | 'PRESCANNING' | 'SCANNING' | 'PARSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  portsFound?: number;
  prescanPortsFound?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  cancelRequested?: boolean;
  cancelReason?: string;
}

const stateStore = new Map<string, PortScanState>();

// Input type for scan handler
type ScanInput = {
  target: string;
  ports?: string;
  protocol?: 'tcp' | 'udp';
  aggressive?: boolean;
  timeout?: number;
  callbackUrl?: string;
  deviceId?: string;
  scanId?: string;
  organizationId?: string;
};

/**
 * Execute the actual port scan logic.
 * Extracted to allow try/catch wrapper in handler for failure postbacks.
 */
async function executeScan(
  ctx: restate.Context,
  input: ScanInput,
  scanId: string,
  startTime: number
): Promise<{
  scanId: string;
  target: string;
  ports: PortScanPostback['data']['ports'];
  totalPorts: number;
  scanDuration: number;
  completedAt: string;
}> {
  const startedAt = new Date(startTime).toISOString();
  const sanitizedTarget = validateAndSanitizeTarget(input.target);

  const state: PortScanState = {
    scanId,
    target: sanitizedTarget,
    status: 'VALIDATING',
    startedAt,
  };
  stateStore.set(scanId, state);

  logger.info('Starting port scan', { scanId, target: sanitizedTarget });

  // Step 1 (Optional): Run prescans for fast port discovery
  let prescanPorts: any[] = [];
  let targetPorts: string | undefined = input.ports;

  // Check for cancellation before starting prescans
  const currentState = stateStore.get(scanId);
  if (currentState?.cancelRequested) {
    state.status = 'CANCELLED';
    state.completedAt = new Date(await ctx.date.now()).toISOString();
    stateStore.set(scanId, state);
    throw new Error(`Scan cancelled: ${currentState.cancelReason || 'User requested'}`);
  }

  state.status = 'PRESCANNING';
  stateStore.set(scanId, state);

  logger.info('Running prescans (masscan, rustscan)', { scanId, target: sanitizedTarget });

  // Run masscan in its own ctx.run() to avoid timeout
  const masscanPorts = await ctx.run('masscan-discovery', async () => {
    return await runMasscan(sanitizedTarget, {
      protocol: input.protocol,
      aggressive: input.aggressive,
      timeout: input.timeout,
    });
  });

  await ctx.sleep(0); // Heartbeat

  // Run rustscan in its own ctx.run() to avoid timeout
  const rustscanPorts = await ctx.run('rustscan-discovery', async () => {
    return await runRustscan(sanitizedTarget, {
      protocol: input.protocol,
      aggressive: input.aggressive,
      timeout: input.timeout,
    });
  });

  await ctx.sleep(0); // Heartbeat

  const prescanResult = combinePortDiscoveries(masscanPorts, rustscanPorts);

  logger.info('Prescan complete', {
    scanId,
    masscanFound: masscanPorts.length,
    rustscanFound: rustscanPorts.length,
    combinedUnique: prescanResult.length,
  });

  prescanPorts = prescanResult;
  state.prescanPortsFound = prescanPorts.length;
  stateStore.set(scanId, state);

  if (prescanPorts.length > 0) {
    const discoveredPortNumbers = extractPortNumbers(prescanPorts);
    targetPorts = formatPortSpec(discoveredPortNumbers);

    logger.info('Targeting nmap at prescan discoveries', {
      scanId,
      portCount: discoveredPortNumbers.length,
      portSpec: targetPorts.length > 100 ? `${targetPorts.substring(0, 100)}...` : targetPorts,
    });
  }

  // Step 2: Run nmap scan (durable)
  const nmapXml = await ctx.run('nmap-scan', async () => {
    const cancelState = stateStore.get(scanId);
    if (cancelState?.cancelRequested) {
      state.status = 'CANCELLED';
      state.completedAt = new Date(await ctx.date.now()).toISOString();
      stateStore.set(scanId, state);
      throw new Error(`Scan cancelled: ${cancelState.cancelReason || 'User requested'}`);
    }

    const nmapArgs = buildNmapArgs({
      ...input,
      ports: targetPorts,
    });

    state.status = 'SCANNING';
    stateStore.set(scanId, state);

    logger.info('Executing nmap', { scanId, args: nmapArgs, target: sanitizedTarget });

    try {
      const { stdout, stderr } = await execFileAsync('nmap', [...nmapArgs, sanitizedTarget]);
      if (stderr) {
        logger.warn('nmap stderr', { scanId, stderr });
      }
      return stdout;
    } catch (error: any) {
      state.status = 'FAILED';
      state.error = error.message;
      state.completedAt = new Date(await ctx.date.now()).toISOString();
      stateStore.set(scanId, state);
      logger.error('nmap execution failed', { scanId, error });
      throw new Error(`nmap failed: ${error.message}`);
    }
  });

  // Step 3: Parse nmap XML output (durable)
  const parsedResult = await ctx.run('parse-xml', async () => {
    state.status = 'PARSING';
    stateStore.set(scanId, state);

    logger.info('Parsing nmap XML', { scanId });

    try {
      const parsed = await parseNmapXml(nmapXml);
      logger.info('XML parsing complete', {
        scanId,
        hostsScanned: Object.keys(parsed.hosts).length,
      });
      return parsed;
    } catch (error: any) {
      state.status = 'FAILED';
      state.error = `XML parsing failed: ${error.message}`;
      state.completedAt = new Date(await ctx.date.now()).toISOString();
      stateStore.set(scanId, state);
      logger.error('XML parsing failed', { scanId, error });
      throw error;
    }
  });

  // Extract ports from parsed result
  const hostAddresses = Object.keys(parsedResult.hosts);
  let portsWithServices = hostAddresses.length > 0
    ? parsedResult.hosts[hostAddresses[0]].ports
    : [];

  // Step 4: Merge prescan discoveries with nmap results
  if (prescanPorts.length > 0) {
    const timestamp = Math.floor(startTime / 1000);

    const nmapDiscoveredPorts = portsWithServices.map((port: any) => ({
      port: port.port,
      protocol: port.transportProtocol || 'tcp',
      state: port.state || 'open',
      service: port.service,
      discoveredBy: ['nmap'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    }));

    const mergedPorts = combinePortDiscoveries(prescanPorts, nmapDiscoveredPorts);

    logger.info('Merged prescan and nmap discoveries', {
      scanId,
      prescanPorts: prescanPorts.length,
      nmapPorts: nmapDiscoveredPorts.length,
      mergedTotal: mergedPorts.length,
    });

    portsWithServices = mergedPorts.map((port: any) => ({
      port: port.port,
      protocol: port.protocol,
      transportProtocol: port.protocol,
      state: port.state,
      service: port.service,
      discoveredBy: port.discoveredBy,
      firstSeen: port.firstSeen,
      lastSeen: port.lastSeen,
    }));
  } else {
    portsWithServices = portsWithServices.map((port: any) => ({
      ...port,
      discoveredBy: ['nmap'],
    }));
  }

  const endTime = await ctx.date.now();
  const scanDuration = endTime - startTime;

  const normalizedPorts = normalizePortsForPostback(portsWithServices);

  // Update state with completion
  state.status = 'COMPLETED';
  state.portsFound = normalizedPorts.length;
  state.completedAt = new Date(endTime).toISOString();
  stateStore.set(scanId, state);

  logger.info('Port scan completed', {
    scanId,
    target: sanitizedTarget,
    portsFound: normalizedPorts.length,
    duration: scanDuration,
  });

  const results = {
    scanId,
    target: sanitizedTarget,
    ports: normalizedPorts,
    totalPorts: normalizedPorts.length,
    scanDuration,
    completedAt: new Date(endTime).toISOString(),
  };

  // Step 5: Postback results if callbackUrl provided (durable)
  if (input.callbackUrl && input.deviceId) {
    const deviceId = input.deviceId;
    const callbackUrl = input.callbackUrl;

    await ctx.run('postback-results', async () => {
      logger.info('Posting scan results back to server', {
        scanId,
        callbackUrl,
        deviceId,
      });

      const portScanPostback = buildPortScanPostbackPayload({
        type: 'PORT_SCAN',
        scanId,
        organizationId: input.organizationId!,
        timestamp: new Date(endTime).toISOString(),
        status: 'SUCCESS',
        deviceId,
        data: {
          target: sanitizedTarget,
          ports: normalizedPorts,
          timing: {
            start: startTime,
            end: endTime,
            elapsed: scanDuration,
          },
          scanMetadata: {
            scanner: 'nmap',
            duration: scanDuration,
            resolvedTarget: sanitizedTarget,
          },
        },
      });

      await postUniversalPostback({
        callbackUrl,
        ...portScanPostback,
      });

      logger.info('Postback successful', { scanId, deviceId });
    });
  }

  return results;
}

/**
 * Port Scanner Service - Restate Implementation
 *
 * This replaces the Temporal worker with a simpler Restate service.
 * Each step is automatically durable and retryable.
 *
 * IMPORTANT: Scan operations can take up to 5+ minutes
 * Timeouts are configured to prevent premature termination
 */
export const portScanner = restate.service({
  name: 'PortScanner',
  handlers: {
    /**
     * Main scan handler - runs nmap and returns parsed results
     * Optional: callbackUrl for postback when scan completes
     *
     * Timeout Configuration:
     * - Inactivity timeout: 10 minutes (600,000ms - allows long-running tools like nmap)
     * - Abort timeout: 2 minutes (120,000ms - time to gracefully suspend after inactivity)
     * - This allows THOROUGH scans (up to 5 minutes) to complete
     */
    scan: restate.handlers.handler({
      inactivityTimeout: 600000, // 10 minutes in milliseconds
      abortTimeout: 120000, // 2 minutes in milliseconds
    }, async (ctx, input: {
      target: string;
      ports?: string;
      protocol?: 'tcp' | 'udp';
      aggressive?: boolean;
      timeout?: number;
      callbackUrl?: string;
      deviceId?: string;
      scanId?: string; // Restate workflow key (optional)
      organizationId?: string; // Required for postback handler to find workflow
    }) => {
      // Use scanId from input if provided (set via idempotency-key),
      // otherwise generate a new UUID (services don't have ctx.key like workflows do)
      const scanId = input.scanId || ctx.rand.uuidv4();
      const startTime = await ctx.date.now();

      // Wrap entire handler in try/catch to send FAILURE postback on any error
      // This ensures timeouts, crashes, and tool failures are reported back
      try {
        return await executeScan(ctx, input, scanId, startTime);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.includes('inactivity') || errorMessage.includes('timeout') || errorMessage.includes('aborted');

        logger.error('Port scan failed', {
          scanId,
          target: input.target,
          error: errorMessage,
          isTimeout,
        });

        // Update local state
        const state = stateStore.get(scanId);
        if (state) {
          state.status = 'FAILED';
          state.error = errorMessage;
          state.completedAt = new Date(await ctx.date.now()).toISOString();
          stateStore.set(scanId, state);
        }

        // Send FAILURE postback if callbackUrl provided
        if (input.callbackUrl && input.deviceId && input.organizationId) {
          const endTime = await ctx.date.now();

          await ctx.run('postback-failure', async () => {
            logger.info('Posting scan failure back to server', {
              scanId,
              callbackUrl: input.callbackUrl,
              deviceId: input.deviceId,
              isTimeout,
            });

            const failurePostback = buildPortScanPostbackPayload({
              type: 'PORT_SCAN',
              scanId,
              organizationId: input.organizationId!,
              timestamp: new Date(endTime).toISOString(),
              status: 'FAILURE',
              deviceId: input.deviceId!,
              error: isTimeout ? `Scan timed out: ${errorMessage}` : errorMessage,
              data: {
                target: input.target,
                ports: [],
                timing: {
                  start: startTime,
                  end: endTime,
                  elapsed: endTime - startTime,
                },
                scanMetadata: {
                  scanner: 'nmap',
                  duration: endTime - startTime,
                  resolvedTarget: input.target,
                },
              },
            });

            await postUniversalPostback({
              callbackUrl: input.callbackUrl!,
              ...failurePostback,
            });

            logger.info('Failure postback sent', { scanId, deviceId: input.deviceId });
          });
        }

        // Re-throw so Restate marks invocation as failed
        throw error;
      }
    }),

    /**
     * Cancel a running scan
     *
     * Sets cancellation flag in state, which will be checked at next checkpoint
     * (before nmap execution). Restate's durability ensures cancellation is persisted.
     */
    cancel: async (_ctx, input: { scanId: string; reason?: string }) => {
      logger.info('Cancel requested', input);

      const state = stateStore.get(input.scanId);

      if (!state) {
        return {
          success: false,
          scanId: input.scanId,
          message: 'Scan not found - may have already completed',
        };
      }

      if (state.status === 'COMPLETED' || state.status === 'FAILED' || state.status === 'CANCELLED') {
        return {
          success: false,
          scanId: input.scanId,
          message: `Scan already ${state.status.toLowerCase()}, cannot cancel`,
        };
      }

      // Set cancellation flag
      state.cancelRequested = true;
      state.cancelReason = input.reason || 'User requested cancellation';
      stateStore.set(input.scanId, state);

      logger.info('Cancellation flag set', {
        scanId: input.scanId,
        reason: state.cancelReason,
      });

      return {
        success: true,
        scanId: input.scanId,
        message: 'Cancellation recorded - scan will stop at next checkpoint',
      };
    },

    /**
     * Get scan progress/state
     *
     * Returns current state from in-memory store
     */
    getState: async (_ctx, input: { scanId: string }) => {
      logger.info('State query', input);

      const state = stateStore.get(input.scanId);

      if (!state) {
        return {
          scanId: input.scanId,
          status: 'NOT_FOUND',
          message: 'Scan not found - may have been cleaned up or never started',
        };
      }

      return {
        scanId: state.scanId,
        target: state.target,
        status: state.status,
        portsFound: state.portsFound,
        error: state.error,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        cancelRequested: state.cancelRequested,
        cancelReason: state.cancelReason,
      };
    },
  },
});

/**
 * Validate and sanitize target input to prevent command injection
 *
 * Allows:
 * - IP addresses (IPv4 and IPv6)
 * - Domain names
 * - CIDR ranges
 *
 * Blocks:
 * - Shell metacharacters (; & | $ ` etc.)
 * - Path traversal attempts
 * - Any suspicious characters
 */
function validateAndSanitizeTarget(target: string): string {
  // Reject empty or suspiciously long targets
  if (!target || target.length > 253) {
    throw new Error('Invalid target: empty or too long');
  }

  // Reject shell metacharacters and dangerous patterns
  const dangerousChars = /[;&|$`<>(){}[\]\\!#*?'"]/;
  if (dangerousChars.test(target)) {
    throw new Error(`Invalid target: contains shell metacharacters: ${target}`);
  }

  // Allow only:
  // - IP addresses: 192.168.1.1, 2001:db8::1
  // - Domain names: example.com, sub.example.com
  // - CIDR ranges: 192.168.1.0/24
  // - Hostnames: localhost, my-server
  const validTargetPattern = /^[a-zA-Z0-9.:/_-]+$/;
  if (!validTargetPattern.test(target)) {
    throw new Error(`Invalid target format: ${target}`);
  }

  // Additional validation for specific patterns
  const parts = target.split(/[./]/);
  for (const part of parts) {
    // Each part should be reasonable length
    if (part.length > 63) {
      throw new Error('Invalid target: label too long');
    }
  }

  return target;
}

/**
 * Build nmap command arguments based on input
 * Returns array of arguments (for execFile, not shell string)
 */
function buildNmapArgs(input: {
  ports?: string;
  protocol?: 'tcp' | 'udp';
  aggressive?: boolean;
  timeout?: number;
}): string[] {
  const args: string[] = ['-oX', '-']; // Output as XML to stdout

  // Skip host discovery & DNS resolution; match legacy aggressiveness
  args.push('-Pn', '-n', '-T5');

  if (input.ports) {
    // Validate port specification
    if (!/^[0-9,\-]+$/.test(input.ports)) {
      throw new Error('Invalid port specification');
    }
    args.push('-p', input.ports);
  }

  if (input.protocol === 'udp') {
    args.push('-sU', '-sV'); // UDP scan with version detection
  } else {
    // Use SYN scan so OS detection (-O) works under cap_net_raw without sudo
    args.push('-sS', '-sV', '-O');
  }

  if (input.aggressive) {
    args.push('-A'); // Aggressive scan (OS detection, version detection, script scanning, traceroute)
  }

  if (input.timeout) {
    // Validate timeout is reasonable number
    if (input.timeout < 0 || input.timeout > 3600000) {
      throw new Error('Invalid timeout value');
    }
    args.push('--host-timeout', `${input.timeout}ms`);
  } else {
    // Match legacy default of 900 seconds
    args.push('--host-timeout', '900000ms');
  }

  return args;
}

/**
 * Normalizes port scan results to match PortScanPostback contract.
 *
 * This is the single normalization point for all port data before it reaches
 * state storage or postback payloads. Ensures contract compliance by:
 *
 * - Protocol field variants: handles both 'protocol' and 'transportProtocol'
 * - State type narrowing: ensures only 'open' | 'closed' | 'filtered'
 * - Service confidence variants: normalizes 'confidence' vs 'conf' fields
 * - Undefined stripping: removes undefined fields for clean Zod validation
 * - Low-confidence filtering: removes tcpwrapped/unknown/jetdirect on non-standard ports
 *
 * @param ports Raw port data from nmap/masscan/rustscan merger
 * @returns Contract-compliant port data for postback and state storage (filtered)
 */
function normalizePortsForPostback(
  ports: Array<any>,
): PortScanPostback['data']['ports'] {
  return ports.map((port) => {
    const protocol =
      port.protocol === 'udp' || port.protocol === 'tcp'
        ? port.protocol
        : port.transportProtocol === 'udp'
        ? 'udp'
        : 'tcp';

    const state: 'open' | 'closed' | 'filtered' =
      port.state === 'closed' || port.state === 'filtered'
        ? port.state
        : 'open';

    const service = port.service
      ? {
          name: port.service.name ?? undefined,
          product: port.service.product ?? undefined,
          version: port.service.version ?? undefined,
          extraInfo: port.service.extraInfo ?? undefined,
          method: port.service.method ?? undefined,
          confidence:
            typeof port.service.confidence === 'number'
              ? port.service.confidence
              : typeof port.service.conf === 'number'
              ? port.service.conf
              : undefined,
        }
      : undefined;

    return {
      port: Number(port.port),
      protocol,
      state,
      service,
      version:
        typeof port.version === 'string'
          ? port.version
          : typeof port.service?.version === 'string'
          ? port.service.version
          : undefined,
    };
  }).filter((port) => {
    // Filter out low-confidence service detections before postback
    const shouldDiscard = shouldDiscardServiceDetection(port);
    if (shouldDiscard) {
      logger.info('Filtering low-confidence service detection', {
        port: port.port,
        protocol: port.protocol,
        service: port.service?.name,
        product: port.service?.product,
      });
    }
    return !shouldDiscard;
  });
}
