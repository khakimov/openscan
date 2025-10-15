/**
 * Discovery Service - Restate Implementation (sec-20)
 *
 * Main orchestrator for subdomain and host discovery workflows.
 * Ported from Temporal worker with Restate's durable execution patterns.
 *
 * Key features:
 * - Database-agnostic: Returns results, no persistence
 * - Secure: Input validation, no shell injection
 * - Resilient: Each step is durable via ctx.run()
 * - Observable: State queries via getState handler
 */

import * as restate from '@restatedev/restate-sdk';
import { validateDiscoveryTarget } from './validation';
import {
  runDiscoveryTool,
  deduplicateByHostname,
  type DiscoveredDevice,
  type DiscoveryTool,
  type ScanScope,
} from './discovery-tools';

// Input/Output types
interface DiscoveryTarget {
  type: 'DOMAIN' | 'IP' | 'CIDR';
  value: string;
  scope: ScanScope;
}

interface DiscoveryInput {
  targets: DiscoveryTarget[];
  tools?: DiscoveryTool[];
  enablePingSweep?: boolean;
  scanId?: string;
}

interface DiscoveryOutput {
  scanId: string;
  startedAt: string;
  completedAt: string;
  devices: DiscoveredDevice[];
  totalTargetsProcessed: number;
  errors: string[];
  performance: {
    executionTimeMs: number;
    devicesPerSecond: number;
  };
}

interface DiscoveryState {
  phase: 'VALIDATING' | 'DISCOVERING' | 'COMPLETED' | 'FAILED';
  totalTargets: number;
  processedTargets: number;
  devicesFound: number;
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

// In-memory state storage (simple approach for now)
// In production, you might use Restate Virtual Objects or external DB
const stateStore = new Map<string, DiscoveryState>();

export const discoveryService = restate.service({
  name: 'Discovery',
  handlers: {
    /**
     * Main discovery handler
     *
     * Orchestrates the complete discovery workflow:
     * 1. Validate all targets
     * 2. For each DOMAIN target, run discovery tools
     * 3. For each IP/CIDR target, add directly as device
     * 4. Deduplicate results
     * 5. Return aggregated output
     */
    discover: async (ctx, input: DiscoveryInput): Promise<DiscoveryOutput> => {
      const scanId = input.scanId || ctx.rand.uuidv4();
      const startTime = Date.now();
      const tools = input.tools || ['subfinder']; // Only subfinder enabled for now

      // Initialize state
      const state: DiscoveryState = {
        phase: 'VALIDATING',
        totalTargets: input.targets.length,
        processedTargets: 0,
        devicesFound: 0,
        errors: [],
        startedAt: new Date().toISOString(),
      };
      stateStore.set(scanId, state);

      // Step 1: Validate targets
      const { validTargets, errors } = await ctx.run('validate-targets', async () => {
        // Don't throw for empty targets - return as validation error
        if (!input.targets || input.targets.length === 0) {
          return {
            validTargets: [],
            errors: ['No targets provided - targets array is empty'],
          };
        }

        const valid: DiscoveryTarget[] = [];
        const validationErrors: string[] = [];

        for (const target of input.targets) {
          try {
            validateDiscoveryTarget(target.value, target.type);
            valid.push(target);
          } catch (error) {
            const errorMsg =
              error instanceof Error
                ? `Target "${target.value}" failed validation: ${error.message}`
                : `Target "${target.value}" failed validation`;
            validationErrors.push(errorMsg);
          }
        }

        return { validTargets: valid, errors: validationErrors };
      });

      state.errors.push(...errors);
      state.phase = 'DISCOVERING';
      stateStore.set(scanId, state);

      // Step 2: Discover devices for each valid target
      const allDevices: DiscoveredDevice[] = [];

      for (const target of validTargets) {
        try {
          if (target.type === 'DOMAIN') {
            // Run discovery tools for domain targets
            const devices = await ctx.run(`discover-${target.value}`, async () => {
              const discoveredDevices: DiscoveredDevice[] = [];

              // Run each tool in sequence
              for (const tool of tools) {
                try {
                  const toolDevices = await runDiscoveryTool(tool, target.value, target.scope);
                  discoveredDevices.push(...toolDevices);
                } catch (error) {
                  // Log error but continue with other tools
                  const errorMsg =
                    error instanceof Error
                      ? `Tool ${tool} failed for ${target.value}: ${error.message}`
                      : `Tool ${tool} failed for ${target.value}`;
                  state.errors.push(errorMsg);
                }
              }

              return discoveredDevices;
            });

            allDevices.push(...devices);
          } else {
            // For IP/CIDR targets, add directly as device
            const device: DiscoveredDevice = {
              scope: target.scope,
              hostname: target.type === 'IP' ? '' : target.value,
              ipAddress: target.type === 'IP' ? target.value : undefined,
              discoveredAt: new Date(),
              discoveryMethod: 'direct',
              confidence: 1.0,
              metadata: {
                originalDomain: target.value,
              },
            };
            allDevices.push(device);
          }

          state.processedTargets++;
          stateStore.set(scanId, state);
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? `Target ${target.value} failed: ${error.message}`
              : `Target ${target.value} failed`;
          state.errors.push(errorMsg);
        }
      }

      // Step 3: Deduplicate devices
      const uniqueDevices = await ctx.run('deduplicate-devices', async () => {
        return deduplicateByHostname(allDevices);
      });

      // Step 4: Finalize and return
      const completedAt = new Date();
      const executionTimeMs = Date.now() - startTime;

      state.phase = 'COMPLETED';
      state.devicesFound = uniqueDevices.length;
      state.completedAt = completedAt.toISOString();
      stateStore.set(scanId, state);

      // Convert devices to serializable format (Dates -> ISO strings)
      const serializedDevices = uniqueDevices.map((device) => ({
        ...device,
        discoveredAt:
          device.discoveredAt instanceof Date
            ? device.discoveredAt.toISOString()
            : device.discoveredAt, // Already a string from Restate serialization
      })) as any; // Type assertion needed for Date -> string conversion

      return {
        scanId,
        startedAt: state.startedAt,
        completedAt: completedAt.toISOString(),
        devices: serializedDevices,
        totalTargetsProcessed: state.processedTargets,
        errors: state.errors,
        performance: {
          executionTimeMs,
          devicesPerSecond: uniqueDevices.length > 0 ? (uniqueDevices.length / executionTimeMs) * 1000 : 0,
        },
      };
    },

    /**
     * Get current state of a discovery scan
     *
     * Allows clients to query progress during execution
     */
    getState: async (_ctx, input: { scanId: string }): Promise<DiscoveryState | { error: string }> => {
      const state = stateStore.get(input.scanId);

      if (!state) {
        // Return error gracefully instead of throwing
        return {
          error: `No state found for scanId: ${input.scanId}`,
        } as any;
      }

      return state;
    },
  },
});
