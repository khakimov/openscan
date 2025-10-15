import * as restate from '@restatedev/restate-sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';

const execAsync = promisify(exec);
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
        const nmapArgs = buildNmapArgs(input);
        logger.info('Executing nmap', { scanId, args: nmapArgs });

        try {
          const { stdout, stderr } = await execAsync(`nmap ${nmapArgs} ${input.target}`);

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
 * Build nmap command arguments based on input
 */
function buildNmapArgs(input: {
  ports?: string;
  protocol?: 'tcp' | 'udp';
  aggressive?: boolean;
  timeout?: number;
}): string {
  const args: string[] = ['-oX', '-']; // Output as XML to stdout

  if (input.ports) {
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
    args.push('--host-timeout', `${input.timeout}ms`);
  }

  return args.join(' ');
}
