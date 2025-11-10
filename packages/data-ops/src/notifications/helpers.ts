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
} from './catalog';
import { createNotifications, type CreateNotificationInput } from '../queries/notifications';
import { createId } from '@paralleldrive/cuid2';

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
  userId?: string;
}

/**
 * Create NEW_PORT notification
 *
 * Suppress window: 6 hours (ports change frequently)
 */
export async function notifyNewPort(params: NotifyNewPortParams): Promise<void> {
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
    fingerprint: `new_port:${params.deviceId}:${params.port}:${params.protocol}`,
    suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
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
  previousState: string;
  currentState: string;
  userId?: string;
}

/**
 * Create CLOSED_PORT notification
 *
 * Suppress window: 6 hours (match NEW_PORT for symmetry)
 */
export async function notifyClosedPort(params: NotifyClosedPortParams): Promise<void> {
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
      previousState: params.previousState,
      currentState: params.currentState,
    },
    fingerprint: `closed_port:${params.deviceId}:${params.port}:${params.protocol}`,
    suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
  };

  // 3. Persist
  await createNotifications([input]);
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
    suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
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
export async function notifyCVESeverityIncrease(params: NotifyCVESeverityIncreaseParams): Promise<void> {
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
    suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  };

  // 3. Persist
  await createNotifications([input]);
}
