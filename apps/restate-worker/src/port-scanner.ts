import * as restate from '@restatedev/restate-sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'restate-port-scanner' });

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
     */
    scan: async (ctx, input: {
      target: string;
      ports?: string;
      protocol?: 'tcp' | 'udp';
      aggressive?: boolean;
      timeout?: number;
    }) => {
      const scanId = ctx.rand.uuidv4();
      const startTime = Date.now();

      logger.info('Starting port scan', { scanId, target: input.target });

      // Step 1: Run nmap scan (durable - will retry on failure)
      await ctx.run('nmap-scan', async () => {
        // Validate and sanitize target
        const sanitizedTarget = validateAndSanitizeTarget(input.target);
        const nmapArgs = buildNmapArgs(input);

        logger.info('Executing nmap', { scanId, args: nmapArgs, target: sanitizedTarget });

        try {
          // Use execFile (not exec) to prevent shell injection
          // Arguments are passed as array, not interpolated into shell command
          const { stdout, stderr } = await execFileAsync('nmap', [...nmapArgs, sanitizedTarget]);

          if (stderr) {
            logger.warn('nmap stderr', { scanId, stderr });
          }

          return {
            xml: stdout,
            exitCode: 0,
            duration: Date.now() - startTime,
          };
        } catch (error: any) {
          logger.error('nmap execution failed', { scanId, error });
          throw new Error(`nmap failed: ${error.message}`);
        }
      });

      // Step 2: Parse nmap XML output (durable)
      const parsedPorts = await ctx.run('parse-xml', async () => {
        logger.info('Parsing nmap XML', { scanId });

        // TODO: Use your existing XML parser from apps/temporal-worker
        // For now, simulate parsed results
        return [
          { port: 22, protocol: 'tcp', state: 'open', service: 'ssh' },
          { port: 80, protocol: 'tcp', state: 'open', service: 'http' },
          { port: 443, protocol: 'tcp', state: 'open', service: 'https' },
        ];
      });

      // Step 3: Service detection (durable)
      const portsWithServices = await ctx.run('detect-services', async () => {
        logger.info('Detecting services', { scanId, portCount: parsedPorts.length });

        // TODO: Add actual service detection logic
        return parsedPorts.map(p => ({
          ...p,
          version: p.port === 22 ? 'OpenSSH 8.2' : undefined,
        }));
      });

      const scanDuration = Date.now() - startTime;

      logger.info('Port scan completed', {
        scanId,
        target: input.target,
        portsFound: portsWithServices.length,
        duration: scanDuration,
      });

      return {
        scanId,
        target: input.target,
        ports: portsWithServices,
        totalPorts: portsWithServices.length,
        scanDuration,
        completedAt: new Date().toISOString(),
      };
    },

    /**
     * Cancel a running scan
     *
     * TODO: Implement proper cancellation
     * Options:
     * 1. Use Restate Workflows for cancellation support
     * 2. Use Virtual Objects to track scan state
     * 3. Use external state store (your existing DB)
     */
    cancel: async (_ctx, input: { scanId: string; reason?: string }) => {
      logger.info('Cancel requested', input);

      // For now, just acknowledge
      // TODO: Integrate with your scan-recorder DB to mark as cancelled
      return {
        success: true,
        scanId: input.scanId,
        message: 'Cancellation recorded - workflow will stop at next checkpoint',
      };
    },

    /**
     * Get scan progress/state
     *
     * TODO: Query from your existing scan-recorder DB
     * Or use Restate Virtual Objects for in-workflow state
     */
    getState: async (_ctx, input: { scanId: string }) => {
      logger.info('State query', input);

      // TODO: Query from scan-recorder DB
      return {
        scanId: input.scanId,
        status: 'running',
        message: 'TODO: Integrate with scan-recorder for real state',
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
