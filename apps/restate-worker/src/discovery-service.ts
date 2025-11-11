/**
 * Discovery Workflow - Restate Implementation (sec-36)
 *
 * Main orchestrator for subdomain and host discovery workflows.
 * Converted from service to workflow for proper state management.
 *
 * Key features:
 * - Stateful: Uses workflow context (ctx.set/get) instead of in-memory Map
 * - Database-agnostic: Returns results, no persistence
 * - Secure: Input validation, no shell injection
 * - Resilient: Each step is durable via ctx.run()
 * - Observable: State queries via getState handler
 *
 * Reference: docs/best-practices/restate.md - Section 'Workflows (Long-running, Stateful)'
 */

import * as restate from '@restatedev/restate-sdk';
import type { WorkflowContext, WorkflowSharedContext } from '@restatedev/restate-sdk';
import { createLogger } from '@repo/logger';
import { validateDiscoveryTarget } from './validation';
import {
  runDiscoveryTool,
  deduplicateByHostname,
  type DiscoveredDevice,
  type DiscoveryTool,
  type ScanScope,
} from './discovery-tools';
import { postUniversalPostback } from './postback';

const logger = createLogger({ name: 'discovery-service' });

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
  callbackUrl?: string; // Optional: postback URL for results
  organizationId?: string; // Optional: organization ID for postback
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
  devices?: any[]; // Store full devices after completion
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

/**
 * Discovery Workflow
 *
 * Uses workflow pattern for durable state management.
 * State is stored in workflow context (ctx.set/get), not in-memory Map.
 *
 * Keyed by scanId - use deterministic key generation:
 * `discovery-${normalizedTarget}-${timestamp}`
 */
export const discoveryService = restate.workflow({
  name: 'Discovery',
  handlers: {
    /**
     * Main discovery handler (workflow run method)
     *
     * Orchestrates the complete discovery workflow:
     * 1. Validate all targets
     * 2. For each DOMAIN target, run discovery tools
     * 3. For each IP/CIDR target, add directly as device
     * 4. Deduplicate results
     * 5. Return aggregated output
     */
    run: async (ctx: WorkflowContext, input: DiscoveryInput): Promise<DiscoveryOutput> => {
      // Use scanId from input (set via workflow key and idempotency-key)
      // Fall back to workflow key, then random UUID
      const scanId = input.scanId || ctx.key || ctx.rand.uuidv4();

      // IMPORTANT: Use ctx.date() for deterministic timestamps (Restate requirement)
      // Using new Date() causes non-deterministic replays on retries
      const startTime = ctx.date().getTime();
      const startedAt = ctx.date().toISOString();
      const tools = input.tools || ['subfinder']; // Only subfinder enabled for now

      // Initialize state in workflow context (durable!)
      ctx.set('phase', 'VALIDATING');
      ctx.set('totalTargets', input.targets.length);
      ctx.set('processedTargets', 0);
      ctx.set('devicesFound', 0);
      ctx.set('errors', []);
      ctx.set('startedAt', startedAt);

      // Step 1: Validate targets
      const { validTargets, errors: validationErrors } = await ctx.run('validate-targets', async () => {
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

      // Update state in workflow context
      const currentErrors = (await ctx.get<string[]>('errors')) || [];
      ctx.set('errors', [...currentErrors, ...validationErrors]);
      ctx.set('phase', 'DISCOVERING');

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
                  // Note: We'll add this to errors array after ctx.run completes
                  discoveredDevices.push({ error: errorMsg } as any);
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
              discoveredAt: ctx.date(), // Use deterministic time
              discoveryMethod: 'direct',
              confidence: 1.0,
              metadata: {
                originalDomain: target.value,
              },
            };
            allDevices.push(device);
          }

          // Update processed count in workflow state
          const processed = (await ctx.get<number>('processedTargets')) || 0;
          ctx.set('processedTargets', processed + 1);
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? `Target ${target.value} failed: ${error.message}`
              : `Target ${target.value} failed`;
          const currentErrors = (await ctx.get<string[]>('errors')) || [];
          ctx.set('errors', [...currentErrors, errorMsg]);
        }
      }

      // Step 3: Deduplicate devices
      const uniqueDevices = await ctx.run('deduplicate-devices', async () => {
        return deduplicateByHostname(allDevices);
      });

      // Step 4: Finalize and return
      const completedAt = ctx.date();
      const executionTimeMs = completedAt.getTime() - startTime;

      // Convert devices to serializable format (Dates -> ISO strings)
      const serializedDevices = uniqueDevices.map((device) => ({
        ...device,
        discoveredAt:
          device.discoveredAt instanceof Date
            ? device.discoveredAt.toISOString()
            : device.discoveredAt, // Already a string from Restate serialization
      })) as any; // Type assertion needed for Date -> string conversion

      // Update final state in workflow context
      ctx.set('phase', 'COMPLETED');
      ctx.set('devicesFound', uniqueDevices.length);
      ctx.set('devices', serializedDevices); // IMPORTANT: Store full devices, not just count!
      ctx.set('completedAt', completedAt.toISOString());

      const startedAt = await ctx.get<string>('startedAt');
      const processedTargets = await ctx.get<number>('processedTargets');
      const errors = await ctx.get<string[]>('errors');

      // Step 5: Postback results if callbackUrl provided (durable)
      if (input.callbackUrl && input.organizationId) {
        await ctx.run('postback-results', async () => {
          logger.info('Posting discovery results to server', {
            callbackUrl: input.callbackUrl,
            scanId,
            organizationId: input.organizationId,
            deviceCount: uniqueDevices.length,
          });

          await postUniversalPostback({
            type: 'DISCOVERY',
            scanId,
            organizationId: input.organizationId!,
            timestamp: completedAt.toISOString(),
            status: 'SUCCESS',
            callbackUrl: input.callbackUrl!,
            data: {
              target: input.targets[0]?.value || 'unknown', // Primary target
              devices: serializedDevices.map((d: any) => ({
                hostname: d.hostname,
                ipAddress: d.ipAddress,
                metadata: d.metadata,
              })),
              totalSubdomains: uniqueDevices.length,
              executionTime: executionTimeMs,
              tools,
              errors: errors || [],
            },
          });

          logger.info('Postback successful', { scanId, organizationId: input.organizationId });
        });
      }

      return {
        scanId,
        startedAt: startedAt || new Date().toISOString(),
        completedAt: completedAt.toISOString(),
        devices: serializedDevices,
        totalTargetsProcessed: processedTargets || 0,
        errors: errors || [],
        performance: {
          executionTimeMs,
          devicesPerSecond: uniqueDevices.length > 0 ? (uniqueDevices.length / executionTimeMs) * 1000 : 0,
        },
      };
    },

    /**
     * Get current state of a discovery workflow
     *
     * Allows clients to query progress during execution.
     * Uses WorkflowSharedContext to access state without blocking workflow.
     */
    getState: async (ctx: WorkflowSharedContext): Promise<DiscoveryState> => {
      // Read state from workflow context
      const phase = (await ctx.get<DiscoveryState['phase']>('phase')) || 'VALIDATING';
      const totalTargets = (await ctx.get<number>('totalTargets')) || 0;
      const processedTargets = (await ctx.get<number>('processedTargets')) || 0;
      const devicesFound = (await ctx.get<number>('devicesFound')) || 0;
      const devices = (await ctx.get<any[]>('devices')) || undefined; // Full devices array
      const errors = (await ctx.get<string[]>('errors')) || [];
      const startedAt = (await ctx.get<string>('startedAt')) || ctx.date().toISOString();
      const completedAt = (await ctx.get<string>('completedAt')) || undefined;

      return {
        phase,
        totalTargets,
        processedTargets,
        devicesFound,
        devices, // Include full devices for client
        errors,
        startedAt,
        completedAt,
      };
    },
  },
});
