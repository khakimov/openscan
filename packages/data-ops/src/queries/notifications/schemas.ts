import { z } from 'zod';

export const CreateNotificationSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1).optional().nullable(),
  deviceId: z.string().min(1).optional().nullable(),
  scanRunId: z.string().min(1).optional().nullable(),
  type: z.enum([
    'NEW_PORT',
    'CLOSED_PORT',
    'NEW_CVE',
    'CVE_SEVERITY_INCREASE',
    'CVE_FIXED',
    'CVE_REGRESSED',
    'SERVICE_DRIFT',
    'SERVER_PROMOTED',
    'SERVICE_DOWN',
    'SERVICE_UP',
    'SERVER_IP_CHANGED',
    'APP_PRODUCT_CHANGED',
    'APP_VERSION_CHANGED',
    'WEB_TITLE_CHANGED',
    'MANUAL_EDIT',
  ]),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  module: z.enum(['NETWORK_SECURITY', 'VULNERABILITY_MANAGEMENT', 'DEVICE_LIFECYCLE', 'CONFIGURATION']),
  title: z.string().min(1),
  message: z.string().optional().nullable(),
  data: z.record(z.string(), z.any()).optional().nullable(),
  fingerprint: z.string().min(1),
  suppressUntil: z.date(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

export const GetNotificationsSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1).optional().nullable(),
  deviceId: z.string().min(1).optional().nullable(),
  module: z.enum(['NETWORK_SECURITY', 'VULNERABILITY_MANAGEMENT', 'DEVICE_LIFECYCLE', 'CONFIGURATION']).optional().nullable(),
  unreadOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export type GetNotificationsInput = z.infer<typeof GetNotificationsSchema>;

export const MarkAsReadSchema = z.object({
  notificationId: z.string().min(1),
  organizationId: z.string().min(1),
});

export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;

export const GetUnreadCountSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1).optional().nullable(),
});

export type GetUnreadCountInput = z.infer<typeof GetUnreadCountSchema>;
