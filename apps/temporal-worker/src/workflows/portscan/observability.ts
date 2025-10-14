import { createLogger } from '@repo/logger';
import type { PortScanMode, AuthScanType } from '@repo/temporal/contracts';

const metricsLogger = createLogger({ name: 'portscan-observability' });
const globalProcess: any = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
const env: Record<string, string | undefined> = globalProcess?.env ?? {};
const METRICS_ENABLED = env.SCANNER_METRICS_ENABLED !== 'false';

type PrescanDecision = 'run' | 'skip' | 'disabled';

interface PrescanContext {
  target: string;
  resolvedTarget?: string | null;
  mode?: PortScanMode;
  hasExplicitPortHints?: boolean;
  reason?: string;
  tool: 'masscan' | 'rustscan';
}

export function recordPrescanDecision(decision: PrescanDecision, context: PrescanContext): void {
  emitMetric('portscan.prescan.decision', {
    decision,
    ...context,
  });
}

interface CircuitBreakerContext {
  target: string;
  resolvedTarget?: string | null;
  failureCount?: number;
  blockedUntil?: string;
  tool: 'masscan' | 'rustscan';
}

type CircuitBreakerEvent = 'tripped' | 'blocked' | 'reset' | 'failure';

export function recordCircuitBreakerEvent(event: CircuitBreakerEvent, context: CircuitBreakerContext): void {
  emitMetric('portscan.guardrail.circuit', {
    event,
    ...context,
  });
}

interface SnmpProbeContext {
  target: string;
  resolvedTarget?: string;
  attemptId: string;
  mode: PortScanMode;
  authScanType: AuthScanType;
  reason?: string;
  durationMs?: number;
}

type SnmpProbeStage = 'scheduled' | 'skipped' | 'success' | 'failure';

export function recordSnmpProbeEvent(stage: SnmpProbeStage, context: SnmpProbeContext): void {
  emitMetric('portscan.extend.snmp', {
    stage,
    ...context,
  });
}

function emitMetric(event: string, payload: Record<string, unknown>): void {
  const record = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (METRICS_ENABLED) {
    metricsLogger.info(`[metric] ${event}`, record);
  } else {
    metricsLogger.debug(`[metric-disabled] ${event}`, record);
  }
}
