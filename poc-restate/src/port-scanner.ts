import * as restate from '@restatedev/restate-sdk-cloudflare-workers/fetch';
import { serde } from '@restatedev/restate-sdk-zod';
import { z } from 'zod';
import { PortScanInput, PortScanResult, ScanState } from './schemas';

/**
 * Port Scanner Service - Restate PoC
 *
 * Tests key features needed to replace Temporal:
 * 1. Durable execution (ctx.run for each step)
 * 2. State management (ctx.set/get for progress tracking)
 * 3. Long-running workflows (ctx.sleep for delays)
 * 4. Deterministic UUIDs (ctx.rand.uuidv4)
 */
export const portScanner = restate.service({
  name: 'PortScanner',
  handlers: {
    /**
     * Main scan workflow - mirrors your portscanWorkflow
     */
    scan: restate.createServiceHandler(
      {
        input: serde.zod(PortScanInput),
        output: serde.zod(PortScanResult),
      },
      async (ctx: restate.Context, input: PortScanInput) => {
        const startTime = Date.now();
        const scanId = ctx.rand.uuidv4();

        console.log(`[${scanId}] Starting port scan for ${input.target}`);

        // Step 1: Run nmap scan (simulated)
        const nmapOutput = await ctx.run('nmap-scan', async () => {
          console.log(`[${scanId}] Running nmap on ${input.target}...`);
          // Simulate nmap execution
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return {
            xmlOutput: `<nmaprun>...</nmaprun>`, // Simulated XML
            duration: 2.5,
          };
        });

        // Update state after nmap
        await ctx.set('state', {
          scanId,
          status: 'parsing' as const,
          progress: 33,
          currentStep: 'Parsing nmap output',
          portsFound: 0,
        } satisfies ScanState);

        // Small delay to simulate processing
        await ctx.sleep({ milliseconds: 500 });

        // Step 2: Parse nmap XML (simulated)
        const parsedPorts = await ctx.run('parse-nmap', async () => {
          console.log(`[${scanId}] Parsing nmap XML...`);
          // Simulate XML parsing
          return [
            { port: 22, protocol: 'tcp', state: 'open' },
            { port: 80, protocol: 'tcp', state: 'open' },
            { port: 443, protocol: 'tcp', state: 'open' },
          ];
        });

        // Update state after parsing
        await ctx.set('state', {
          scanId,
          status: 'detecting' as const,
          progress: 66,
          currentStep: 'Detecting services',
          portsFound: parsedPorts.length,
        } satisfies ScanState);

        await ctx.sleep({ milliseconds: 500 });

        // Step 3: Service detection (simulated)
        const portsWithServices = await ctx.run('detect-services', async () => {
          console.log(`[${scanId}] Detecting services...`);
          // Simulate service detection
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return parsedPorts.map((p) => ({
            ...p,
            service: p.port === 22 ? 'ssh' : p.port === 80 ? 'http' : 'https',
            version: p.port === 22 ? 'OpenSSH 8.2' : undefined,
          }));
        });

        // Final state update
        await ctx.set('state', {
          scanId,
          status: 'completed' as const,
          progress: 100,
          currentStep: 'Completed',
          portsFound: portsWithServices.length,
        } satisfies ScanState);

        const scanDuration = Date.now() - startTime;

        console.log(`[${scanId}] Scan completed in ${scanDuration}ms`);

        // Return final result
        return {
          scanId,
          target: input.target,
          ports: portsWithServices,
          totalPorts: portsWithServices.length,
          scanDuration,
          completedAt: new Date().toISOString(),
        } satisfies PortScanResult;
      }
    ),

    /**
     * Get scan state - equivalent to your queryPortScanState
     *
     * This allows checking progress while scan is running
     */
    getState: restate.createServiceHandler(
      {
        input: serde.zod(z.object({ scanId: z.string() })),
        output: serde.zod(ScanState.nullable()),
      },
      async (ctx: restate.Context, { scanId }) => {
        const state = await ctx.get<ScanState>('state');
        return state ?? null;
      }
    ),

    /**
     * Cancel scan - equivalent to your cancelPortScan signal
     *
     * TODO: Research how to implement cancellation in Restate
     * Options to explore:
     * 1. ctx.cancel() API (if exists)
     * 2. Shared state flag that scan checks between steps
     * 3. Workflow interruption mechanism
     */
    cancel: restate.createServiceHandler(
      {
        input: serde.zod(z.object({
          scanId: z.string(),
          reason: z.string().optional()
        })),
        output: serde.zod(z.object({ success: z.boolean() })),
      },
      async (ctx: restate.Context, { scanId, reason }) => {
        console.log(`[${scanId}] Cancel requested: ${reason || 'No reason provided'}`);

        // Set cancellation flag in state
        await ctx.set('cancelled', true);
        await ctx.set('cancelReason', reason || 'User requested');

        return { success: true };
      }
    ),
  },
});
