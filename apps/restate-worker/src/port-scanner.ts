import * as restate from '@restatedev/restate-sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import { postbackScanResults } from './postback';
import { parseNmapXml } from './xml-parser';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'restate-port-scanner' });

// State management for scan tracking
interface PortScanState {
  scanId: string;
  target: string;
  status: 'VALIDATING' | 'SCANNING' | 'PARSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  portsFound?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  cancelRequested?: boolean;
  cancelReason?: string;
}

const stateStore = new Map<string, PortScanState>();

/**
 * Port Scanner Service - Restate Implementation
 *
 * This replaces the Temporal worker with a simpler Restate service.
 * Each step is automatically durable and retryable.
 */
export const portScanner = restate.service({
  name: 'PortScanner',
  handlers: {
    /**
     * Main scan handler - runs nmap and returns parsed results
     * Optional: callbackUrl for postback when scan completes
     */
    scan: async (ctx, input: {
      target: string;
      ports?: string;
      protocol?: 'tcp' | 'udp';
      aggressive?: boolean;
      timeout?: number;
      callbackUrl?: string;
      deviceId?: string;
      workflowId?: string;
    }) => {
      const scanId = ctx.rand.uuidv4();
      const startTime = Date.now();

      // Initialize state
      const state: PortScanState = {
        scanId,
        target: input.target,
        status: 'VALIDATING',
        startedAt: new Date().toISOString(),
      };
      stateStore.set(scanId, state);

      logger.info('Starting port scan', { scanId, target: input.target });

      // Step 1: Run nmap scan (durable - will retry on failure)
      const nmapXml = await ctx.run('nmap-scan', async () => {
        // Check for cancellation before starting scan
        const currentState = stateStore.get(scanId);
        if (currentState?.cancelRequested) {
          state.status = 'CANCELLED';
          state.completedAt = new Date().toISOString();
          stateStore.set(scanId, state);
          throw new Error(`Scan cancelled: ${currentState.cancelReason || 'User requested'}`);
        }

        // Validate and sanitize target
        const sanitizedTarget = validateAndSanitizeTarget(input.target);
        const nmapArgs = buildNmapArgs(input);

        state.status = 'SCANNING';
        stateStore.set(scanId, state);

        logger.info('Executing nmap', { scanId, args: nmapArgs, target: sanitizedTarget });

        try {
          // Use execFile (not exec) to prevent shell injection
          // Arguments are passed as array, not interpolated into shell command
          const { stdout, stderr } = await execFileAsync('nmap', [...nmapArgs, sanitizedTarget]);

          if (stderr) {
            logger.warn('nmap stderr', { scanId, stderr });
          }

          return stdout; // Return XML string
        } catch (error: any) {
          state.status = 'FAILED';
          state.error = error.message;
          state.completedAt = new Date().toISOString();
          stateStore.set(scanId, state);

          logger.error('nmap execution failed', { scanId, error });
          throw new Error(`nmap failed: ${error.message}`);
        }
      });

      // Step 2: Parse nmap XML output (durable)
      const parsedResult = await ctx.run('parse-xml', async () => {
        state.status = 'PARSING';
        stateStore.set(scanId, state);

        logger.info('Parsing nmap XML', { scanId });

        try {
          // Use real XML parser from temporal-worker
          const parsed = await parseNmapXml(nmapXml);

          logger.info('XML parsing complete', {
            scanId,
            hostsScanned: Object.keys(parsed.hosts).length,
          });

          return parsed;
        } catch (error: any) {
          state.status = 'FAILED';
          state.error = `XML parsing failed: ${error.message}`;
          state.completedAt = new Date().toISOString();
          stateStore.set(scanId, state);

          logger.error('XML parsing failed', { scanId, error });
          throw error;
        }
      });

      // Extract ports from parsed result
      // hosts is a Record<string, ParsedHostData>, get first host
      const hostAddresses = Object.keys(parsedResult.hosts);
      const portsWithServices = hostAddresses.length > 0
        ? parsedResult.hosts[hostAddresses[0]].ports
        : [];

      const scanDuration = Date.now() - startTime;

      // Update state with completion
      state.status = 'COMPLETED';
      state.portsFound = portsWithServices.length;
      state.completedAt = new Date().toISOString();
      stateStore.set(scanId, state);

      logger.info('Port scan completed', {
        scanId,
        target: input.target,
        portsFound: portsWithServices.length,
        duration: scanDuration,
      });

      const results = {
        scanId,
        target: input.target,
        ports: portsWithServices,
        totalPorts: portsWithServices.length,
        scanDuration,
        completedAt: new Date().toISOString(),
      };

      // Step 4: Postback results if callbackUrl provided (durable)
      if (input.callbackUrl && input.deviceId && input.workflowId) {
        await ctx.run('postback-results', async () => {
          logger.info('Posting scan results back to server', {
            scanId,
            callbackUrl: input.callbackUrl,
            deviceId: input.deviceId,
          });

          await postbackScanResults({
            callbackUrl: input.callbackUrl!,
            deviceId: input.deviceId!,
            workflowId: input.workflowId!,
            results: {
              target: input.target,
              ports: portsWithServices,
              timing: {
                start: startTime,
                end: Date.now(),
                elapsed: scanDuration,
              },
              scanMetadata: {
                scanner: 'nmap',
                duration: scanDuration,
                resolvedTarget: input.target,
              },
            },
          });

          logger.info('Postback successful', { scanId, deviceId: input.deviceId });
        });
      }

      return results;
    },

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

  if (input.ports) {
    // Validate port specification
    if (!/^[0-9,\-]+$/.test(input.ports)) {
      throw new Error('Invalid port specification');
    }
    args.push('-p', input.ports);
  }

  if (input.protocol === 'udp') {
    args.push('-sU');
  }

  if (input.aggressive) {
    args.push('-A'); // Aggressive scan (OS detection, version detection, script scanning, traceroute)
  } else {
    args.push('-sV'); // Version detection
  }

  if (input.timeout) {
    // Validate timeout is reasonable number
    if (input.timeout < 0 || input.timeout > 3600000) {
      throw new Error('Invalid timeout value');
    }
    args.push('--host-timeout', `${input.timeout}ms`);
  }

  return args;
}
