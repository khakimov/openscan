import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  workflowInfo,
  log,
} from '@temporalio/workflow';
import type {
  DiscoveryInput,
  DiscoveryOutput,
  ScanTarget,
  DiscoveredDevice,
  DiscoveryRequest,
  DiscoveryWorkflowState,
} from '@repo/temporal/contracts';
import { discoveryToolPolicies } from '../../config/activity-policies';

// Split activity proxies by policy type to avoid timeout mismatches
const { validateScanTargets } = proxyActivities({
  ...discoveryToolPolicies.subfinder, // 2 minutes - fast validation
});

// Subdomain discovery aggregator - uses Amass timeout since it may run Amass internally
const { runSubdomainDiscovery } = proxyActivities({
  ...discoveryToolPolicies.amass, // 10 minutes - longest tool (amass) in aggregator
});

const { runPingSweep } = proxyActivities({
  ...discoveryToolPolicies.subfinder, // 2 minutes - ping sweep is fast
});

// Define workflow state query
const stateQuery = defineQuery<DiscoveryWorkflowState>('state');

/**
 * Normalize input to handle both old and new formats
 * Provides backward compatibility with HTTP API
 */
function normalizeDiscoveryInput(input: any): DiscoveryInput {
  // If it already has targets array, it's the new format
  if (input.targets && Array.isArray(input.targets)) {
    return input as DiscoveryInput;
  }

  // Convert old format (DiscoveryRequest) to new format (DiscoveryInput)
  if (input.target && typeof input.target === 'string') {
    const workflowId = workflowInfo().workflowId;

    return {
      tenantId: 'discovery-only', // Placeholder - not used for persistence
      scanId: workflowId,
      scanName: `Discovery: ${input.target}`,
      targets: [
        {
          type: 'DOMAIN',
          value: input.target,
          scope: 'EXTERNAL',
          description: `Discovery scan for ${input.target}`,
        },
      ],
      enablePingSweep: true,
      discoverSubdomains: true,
      maxDepth: 1,
      tools: input.tools || ['subfinder'],
      createdAt: new Date(),
    };
  }

  throw new Error('Invalid discovery input format');
}

/**
 * Discovery Workflow
 *
 * Database-agnostic: Returns complete results through Temporal.
 * The web app fetches results and decides what to persist.
 */
export async function discoveryWorkflow(
  input: DiscoveryInput | DiscoveryRequest
): Promise<DiscoveryOutput> {
  const { workflowId } = workflowInfo();

  // Convert old format to new format if needed (backward compatibility)
  const normalizedInput = normalizeDiscoveryInput(input);

  // Initialize workflow state
  const state: DiscoveryWorkflowState = {
    phase: 'VALIDATING',
    totalTargets: normalizedInput.targets.length,
    processedTargets: 0,
    devicesFound: 0,
    errors: [],
    startedAt: new Date(),
  };

  // Set up state query handler
  setHandler(stateQuery, () => state);

  // Context available for future use if activities need it
  // const context: DiscoveryContext = {
  //   workflowId,
  //   scanId: normalizedInput.scanId,
  //   tenantId: normalizedInput.tenantId,
  // };

  log.info('Discovery workflow started', {
    workflowId,
    tenantId: normalizedInput.tenantId,
    targetCount: normalizedInput.targets.length,
  });

  try {
    // Phase 1: Validate targets
    state.phase = 'VALIDATING';
    log.info('Discovery phase: validating targets', {
      workflowId,
      phase: 'VALIDATING',
    });

    const { valid: validTargets, invalid: invalidTargets } =
      await validateScanTargets(
        normalizedInput.targets,
        normalizedInput.tenantId
      );

    if (invalidTargets.length > 0) {
      log.warn('Some targets failed validation', {
        invalidCount: invalidTargets.length,
        invalidTargets: invalidTargets.map((i: any) => ({
          target: i.target.value,
          reason: i.reason,
        })),
      });
      state.errors.push(
        ...invalidTargets.map((i: any) => `Invalid target ${i.target.value}: ${i.reason}`)
      );
    }

    if (validTargets.length === 0) {
      throw new Error('No valid targets to scan');
    }

    // Phase 2: Discovery
    state.phase = 'DISCOVERING';
    state.totalTargets = validTargets.length;
    log.info('Discovery phase: discovering hosts', {
      workflowId,
      phase: 'DISCOVERING',
    });

    const discoveredDevices = await performDiscovery(
      validTargets,
      normalizedInput,
      state
    );

    // Phase 3: Ping sweep (optional)
    let pingSweepResults: Record<string, boolean> = {};
    if (normalizedInput.enablePingSweep && discoveredDevices.length > 0) {
      state.phase = 'PING_SWEEP';
      log.info('Discovery phase: ping sweep', {
        workflowId,
        phase: 'PING_SWEEP',
      });

      pingSweepResults = await runPingSweep(
        discoveredDevices
          .filter((d) => d.ipAddress)
          .map((d) => d.ipAddress!)
      );

      // Update device confidence based on ping results
      discoveredDevices.forEach((device) => {
        if (
          device.ipAddress &&
          pingSweepResults[device.ipAddress] !== undefined
        ) {
          device.confidence = pingSweepResults[device.ipAddress] ? 1.0 : 0.5;
        }
      });

      log.info('Ping sweep completed', {
        totalIps: Object.keys(pingSweepResults).length,
        aliveHosts: Object.values(pingSweepResults).filter(Boolean).length,
      });
    }

    // Phase 4: Completed - return results (NO persistence)
    state.phase = 'COMPLETED';
    state.completedAt = new Date();
    state.devicesFound = discoveredDevices.length;

    log.info('Discovery workflow completed successfully', {
      workflowId,
      devicesFound: discoveredDevices.length,
      uniqueHosts: discoveredDevices.map((d) => d.hostname).length,
    });

    const output: DiscoveryOutput = {
      scanId: normalizedInput.scanId,
      startedAt: state.startedAt!,
      completedAt: state.completedAt,
      devices: discoveredDevices,
      pingSweepResults:
        Object.keys(pingSweepResults).length > 0
          ? pingSweepResults
          : undefined,
      subdomains: discoveredDevices.map((d) => d.hostname), // Backward compatibility
      totalTargetsProcessed: validTargets.length,
      errors: state.errors,
      performance: {
        executionTimeMs:
          state.completedAt.getTime() - state.startedAt!.getTime(),
        devicesPerSecond:
          discoveredDevices.length /
          ((state.completedAt.getTime() - state.startedAt!.getTime()) / 1000),
      },
    };

    log.info('Discovery workflow completed successfully', {
      workflowId,
      devicesFound: discoveredDevices.length,
      executionTime: output.performance?.executionTimeMs,
      errors: state.errors.length,
    });

    return output;
  } catch (error) {
    state.phase = 'FAILED';
    state.completedAt = new Date();

    const errorMessage = error instanceof Error ? error.message : String(error);
    state.errors.push(`Workflow failed: ${errorMessage}`);

    log.error('Discovery workflow failed', {
      workflowId,
      error: errorMessage,
      phase: state.phase,
    });

    throw error;
  }
}

/**
 * Perform the actual discovery using various tools
 */
async function performDiscovery(
  targets: ScanTarget[],
  normalizedInput: DiscoveryInput,
  state: DiscoveryWorkflowState
): Promise<DiscoveredDevice[]> {
  const allDevices: DiscoveredDevice[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    try {
      log.info('Processing discovery target', {
        target: target.value,
        type: target.type,
        progress: `${i + 1}/${targets.length}`,
      });

      let targetDevices: DiscoveredDevice[] = [];

      // Handle different target types
      if (target.type === 'DOMAIN' && normalizedInput.discoverSubdomains) {
        // Run subdomain discovery
        targetDevices = await runSubdomainDiscovery(target);
      } else {
        // For other target types, create device directly
        targetDevices = [
          {
            scope: target.scope,
            hostname: target.value,
            ipAddress: target.type === 'IP_ADDRESS' ? target.value : undefined,
            discoveredAt: new Date(),
            discoveryMethod: 'direct',
            confidence: 1.0,
            metadata: {
              originalTarget: target,
            },
          },
        ];
      }

      allDevices.push(...targetDevices);
      state.processedTargets = i + 1;
      state.devicesFound = allDevices.length;

      log.info('Target processed', {
        target: target.value,
        devicesFound: targetDevices.length,
        totalDevices: allDevices.length,
      });

      // Small delay between targets to avoid overwhelming discovery tools
      if (i < targets.length - 1) {
        await sleep('100ms');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      state.errors.push(
        `Failed to process target ${target.value}: ${errorMessage}`
      );

      log.warn('Target processing failed', {
        target: target.value,
        error: errorMessage,
      });

      // Continue with next target instead of failing entire workflow
      continue;
    }
  }

  // Deduplicate devices by hostname+IP combination
  const uniqueDevices = deduplicateDevices(allDevices);

  log.info('Discovery phase completed', {
    totalDevices: allDevices.length,
    uniqueDevices: uniqueDevices.length,
    duplicatesRemoved: allDevices.length - uniqueDevices.length,
  });

  return uniqueDevices;
}

/**
 * Remove duplicate devices based on hostname+IP combination
 */
function deduplicateDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  const seen = new Set<string>();
  const unique: DiscoveredDevice[] = [];

  for (const device of devices) {
    // Create unique key from hostname and IP
    const key = `${device.hostname}:${device.ipAddress || 'no-ip'}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(device);
    }
  }

  return unique;
}
