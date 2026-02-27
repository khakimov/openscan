/**
 * Change Detector Types
 *
 * Shared type definitions for the change detection system.
 */

import type {
  NotificationModule,
  NotificationSeverity,
  NotificationType,
} from '@repo/data-ops';

export interface ScanChange {
  type: NotificationType;
  severity: NotificationSeverity;
  module: NotificationModule;
  title: string;
  message?: string | null;
  data: Record<string, unknown>;
  fingerprint: string;
}

export interface CVEInfo {
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
}
