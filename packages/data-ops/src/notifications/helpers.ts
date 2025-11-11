/**
 * Typed Notification Helpers
 *
 * High-level functions that combine:
 * 1. Catalog functions (message templates)
 * 2. Database writes (persistence with deduplication)
 *
 * Usage:
 * ```typescript
 * await notifyNewPort({
 *   organizationId: 'org_123',
 *   deviceId: 'dev_456',
 *   scanRunId: 'run_789',
 *   port: 3389,
 *   protocol: 'tcp',
 *   service: 'ms-wbt-server',
 * });
 * ```
 *
 * Benefits:
 * - Type-safe notification creation (compile-time validation)
 * - Single entry point (catalog + database)
 * - Consistent fingerprint generation
 * - Automatic suppress window calculation
 */

import {
  createNewPortNotification,
  createClosedPortNotification,
  createNewCVENotification,
  createCVESeverityIncreaseNotification,
  createCVEFixedNotification,
  createCVERegressedNotification,
} from "./catalog";
import {
  createNotifications,
  type CreateNotificationInput,
} from "../queries/notifications";
import { createId } from "@paralleldrive/cuid2";

// ============================================================================
// Suppression Window Constants
// ============================================================================

/**
 * Suppress window durations (milliseconds)
 *
 * Port changes: 6 hours (frequent during scans)
 * CVE changes: 24 hours (more stable, less frequent)
 */
export const HOURS_6_MS = 6 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Port Notification Helpers
// ============================================================================

export interface NotifyNewPortParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  port: number;
  protocol: string;
  service?: string;
  version?: string;
  serviceProduct?: string | null;
  serviceVersion?: string | null;
  serviceName?: string | null;
  userId?: string;
}

/**
 * Create NEW_PORT notification
 *
 * Suppress window: 6 hours (ports change frequently)
 */
export async function notifyNewPort(
  params: NotifyNewPortParams
): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createNewPortNotification({
    port: params.port,
    protocol: params.protocol,
    service: params.service,
    version: params.version,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      port: params.port,
      protocol: params.protocol,
      service: params.service,
      version: params.version,
    },
    fingerprint: buildPortFingerprint({
      kind: "new_port",
      deviceId: params.deviceId,
      port: params.port,
      protocol: params.protocol,
      product:
        params.serviceProduct ?? params.service ?? params.serviceName ?? null,
      version: params.serviceVersion ?? params.version ?? null,
      name:
        params.serviceName ?? params.service ?? params.serviceProduct ?? null,
    }),
    suppressUntil: new Date(Date.now() + HOURS_6_MS), // 6 hours
  };

  // 3. Persist (with automatic deduplication via unique index)
  await createNotifications([input]);
}

export interface NotifyClosedPortParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  port: number;
  protocol: string;
  service?: string;
  serviceProduct?: string | null;
  serviceVersion?: string | null;
  serviceName?: string | null;
  previousState: string;
  currentState: string;
  userId?: string;
}

/**
 * Create CLOSED_PORT notification
 *
 * Suppress window: 6 hours (match NEW_PORT for symmetry)
 */
export async function notifyClosedPort(
  params: NotifyClosedPortParams
): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createClosedPortNotification({
    port: params.port,
    protocol: params.protocol,
    service: params.service,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      port: params.port,
      protocol: params.protocol,
      service: params.service,
      serviceProduct: params.serviceProduct ?? null,
      serviceVersion: params.serviceVersion ?? null,
      serviceName: params.serviceName ?? null,
      previousState: params.previousState,
      currentState: params.currentState,
    },
    fingerprint: buildPortFingerprint({
      kind: "closed_port",
      deviceId: params.deviceId,
      port: params.port,
      protocol: params.protocol,
      product:
        params.serviceProduct ?? params.service ?? params.serviceName ?? null,
      version: params.serviceVersion ?? null,
      name:
        params.serviceName ?? params.service ?? params.serviceProduct ?? null,
    }),
    suppressUntil: new Date(Date.now() + HOURS_6_MS), // 6 hours
  };

  // 3. Persist
  await createNotifications([input]);
}

interface BuildPortFingerprintParams {
  kind: "new_port" | "closed_port";
  deviceId: string;
  protocol: string;
  port: number;
  product?: string | null;
  version?: string | null;
  name?: string | null;
}

function buildPortFingerprint(params: BuildPortFingerprintParams): string {
  const normalize = (value?: string | null): string => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : "unknown";
  };

  const product = normalize(params.product);
  const version = normalize(params.version);
  const name = normalize(params.name);

  return `${params.kind}:${params.deviceId}:${params.protocol}:${params.port}:${product}:${version}:${name}`;
}

// ============================================================================
// CVE Notification Helpers
// ============================================================================

export interface NotifyNewCVEParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
  userId?: string;
}

/**
 * Create NEW_CVE notification
 *
 * Suppress window: 24 hours (CVEs are more stable than port changes)
 */
export async function notifyNewCVE(params: NotifyNewCVEParams): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createNewCVENotification({
    cveId: params.cveId,
    severity: params.severity,
    cvssScore: params.cvssScore,
    description: params.description,
    affectedService: params.affectedService,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      cveId: params.cveId,
      severity: params.severity,
      cvssScore: params.cvssScore,
      description: params.description,
      affectedService: params.affectedService,
      port: params.port,
    },
    fingerprint: `new_cve:${params.deviceId}:${params.cveId}`,
    suppressUntil: new Date(Date.now() + DAY_MS), // 24 hours
  };

  // 3. Persist
  await createNotifications([input]);
}

export interface NotifyCVESeverityIncreaseParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  cveId: string;
  oldSeverity: string;
  newSeverity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
  userId?: string;
}

/**
 * Create CVE_SEVERITY_INCREASE notification
 *
 * Suppress window: 24 hours (match NEW_CVE)
 * Fingerprint includes new severity to allow multiple upgrades
 */
export async function notifyCVESeverityIncrease(
  params: NotifyCVESeverityIncreaseParams
): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createCVESeverityIncreaseNotification({
    cveId: params.cveId,
    oldSeverity: params.oldSeverity,
    newSeverity: params.newSeverity,
    cvssScore: params.cvssScore,
    description: params.description,
    affectedService: params.affectedService,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      cveId: params.cveId,
      oldSeverity: params.oldSeverity,
      newSeverity: params.newSeverity,
      cvssScore: params.cvssScore,
      description: params.description,
      affectedService: params.affectedService,
      port: params.port,
    },
    fingerprint: `cve_severity_increase:${params.deviceId}:${params.cveId}:${params.newSeverity}`,
    suppressUntil: new Date(Date.now() + DAY_MS), // 24 hours
  };

  // 3. Persist
  await createNotifications([input]);
}

export interface NotifyCVEFixedParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  cveId: string;
  severity: string;
  cvssScore: number;
  affectedService?: string;
  port?: number;
  userId?: string;
}

/**
 * Create CVE_FIXED notification
 *
 * Suppress window: 24 hours (good news, but don't spam if CVE flaps)
 * Severity: INFO (positive outcome)
 */
export async function notifyCVEFixed(
  params: NotifyCVEFixedParams
): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createCVEFixedNotification({
    cveId: params.cveId,
    severity: params.severity,
    cvssScore: params.cvssScore,
    affectedService: params.affectedService,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      cveId: params.cveId,
      severity: params.severity,
      cvssScore: params.cvssScore,
      affectedService: params.affectedService,
      port: params.port,
    },
    fingerprint: `cve_fixed:${params.deviceId}:${params.cveId}`,
    suppressUntil: new Date(Date.now() + DAY_MS), // 24 hours
  };

  // 3. Persist
  await createNotifications([input]);
}

export interface NotifyCVERegressedParams {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  cveId: string;
  severity: string;
  cvssScore: number;
  affectedService?: string;
  port?: number;
  userId?: string;
}

/**
 * Create CVE_REGRESSED notification
 *
 * Suppress window: 24 hours (uniform across all severities for MVP)
 * - Treats regressions as seriously as NEW_CVE (same 24h window)
 * - Future enhancement: Could differentiate by severity if needed
 *
 * Regression indicates a previously fixed vulnerability has returned,
 * suggesting patch reversion or service downgrade.
 */
export async function notifyCVERegressed(
  params: NotifyCVERegressedParams
): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createCVERegressedNotification({
    cveId: params.cveId,
    severity: params.severity,
    cvssScore: params.cvssScore,
    affectedService: params.affectedService,
  });

  // 2. Build full notification input
  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    userId: params.userId || null,
    ...descriptor,
    data: {
      cveId: params.cveId,
      severity: params.severity,
      cvssScore: params.cvssScore,
      affectedService: params.affectedService,
      port: params.port,
    },
    fingerprint: `cve_regressed:${params.deviceId}:${params.cveId}`,
    suppressUntil: new Date(Date.now() + DAY_MS), // 24 hours (uniform for MVP)
  };

  // 3. Persist
  await createNotifications([input]);
}
