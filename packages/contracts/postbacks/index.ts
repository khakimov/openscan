import { z } from 'zod';

/**
 * Base schema shared by all universal postbacks.
 * All timestamps are ISO 8601 strings generated in Restate workflows.
 */
export const BasePostbackSchema = z.object({
  scanId: z.string().min(1, 'scanId is required'),
  organizationId: z.string().min(1, 'organizationId is required'),
  timestamp: z.string().min(1, 'timestamp is required'),
  status: z.enum(['SUCCESS', 'FAILURE', 'FAILED']),
  error: z.string().optional(),
});

/**
 * Discovery postback payload
 */
const DiscoveryDeviceSchema = z.object({
  hostname: z.string().min(1, 'hostname is required'),
  ipAddress: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const DiscoveryPostbackDataSchema = z.object({
  target: z.string().min(1, 'target is required'),
  devices: z.array(DiscoveryDeviceSchema),
  totalSubdomains: z.number().nonnegative(),
  executionTime: z.number().nonnegative(),
  tools: z.array(z.string()),
  errors: z.array(z.string()).optional(),
});

export const DiscoveryPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('DISCOVERY'),
  data: DiscoveryPostbackDataSchema,
});

/**
 * Port scan postback payload
 */
const PortServiceSchema = z
  .object({
    name: z.string().optional(),
    product: z.string().optional().nullable(),
    version: z.string().optional().nullable(),
    extraInfo: z.string().optional().nullable(),
    method: z.string().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const PortScanPortSchema = z
  .object({
    port: z.number(),
    protocol: z.enum(['tcp', 'udp']),
    state: z.enum(['open', 'closed', 'filtered']),
    service: PortServiceSchema.optional(),
    version: z.string().optional(),
  })
  .passthrough();

const PortScanPostbackDataSchema = z.object({
  target: z.string(),
  ports: z.array(PortScanPortSchema),
  osInfo: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
      accuracy: z.number().optional(),
      cpe: z.array(z.string()).optional(),
    })
    .optional(),
  timing: z
    .object({
      start: z.number().optional(),
      end: z.number().optional(),
      elapsed: z.number().optional(),
    })
    .optional(),
  scanMetadata: z
    .object({
      scanner: z.string().optional(),
      version: z.string().optional(),
      arguments: z.string().optional(),
      duration: z.number().optional(),
      resolvedTarget: z.string().optional(),
    })
    .optional(),
});

export const PortScanPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('PORT_SCAN'),
  deviceId: z.string().min(1, 'deviceId is required'),
  data: PortScanPostbackDataSchema,
});

/**
 * HTTPx postback payload
 */
const HttpxProbeSchema = z.object({
  port: z.number(),
  url: z.string(),
  status: z.enum(['SUCCESS', 'FAILED', 'TIMEOUT']),
  scheme: z.enum(['http', 'https']).optional(),
  statusCode: z.number().optional(),
  title: z.string().optional(),
  headers: z.record(z.string()).optional(),
  responseTime: z.number().optional(),
  contentLength: z.number().optional(),
  finalUrl: z.string().optional(),
  tlsVersion: z.string().optional(),
  webServer: z.string().optional(),
  screenshot: z.string().optional(),
  screenshotBase64: z.string().optional(),
  technologies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        confidence: z.enum(['high', 'medium', 'low']),
      })
    )
    .optional(),
  error: z.string().optional(),
  errorType: z.enum(['CONNECTION_REFUSED', 'TIMEOUT', 'DNS_ERROR', 'SSL_ERROR', 'UNKNOWN']).optional(),
});

const HttpxPostbackDataSchema = z.object({
  target: z.string(),
  probes: z.array(HttpxProbeSchema),
});

export const HttpxPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('HTTPX'),
  deviceId: z.string().min(1, 'deviceId is required'),
  data: HttpxPostbackDataSchema,
});

/**
 * Scheduled scan execution postback payloads
 */
const ScheduledScanExecutedDataSchema = z.object({
  scheduleId: z.string(),
  status: z.enum(['SUCCESS', 'FAILED']),
  error: z.string().optional(),
  errorType: z.enum(['TRANSIENT', 'PERMANENT', 'CONCURRENCY_LIMIT']).optional(),
  consecutiveFailures: z.number().nonnegative(),
  lastRunAt: z.string(),
  nextRunAt: z.string(),
  backoffApplied: z.boolean().optional(),
  backoffMs: z.number().optional(),
});

export const ScheduledScanExecutedPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('SCHEDULED_SCAN_EXECUTED'),
  deviceId: z.string().min(1, 'deviceId is required'),
  data: ScheduledScanExecutedDataSchema,
});

const ScheduleAutoPausedDataSchema = z.object({
  scheduleId: z.string(),
  reason: z.string(),
  consecutiveFailures: z.number().nonnegative(),
});

export const ScheduleAutoPausedPostbackSchema = BasePostbackSchema.extend({
  type: z.literal('SCHEDULE_AUTO_PAUSED'),
  deviceId: z.string().min(1, 'deviceId is required'),
  data: ScheduleAutoPausedDataSchema,
});

/**
 * Union of all supported postback payloads
 */
export const UniversalPostbackSchema = z.discriminatedUnion('type', [
  DiscoveryPostbackSchema,
  PortScanPostbackSchema,
  HttpxPostbackSchema,
  ScheduledScanExecutedPostbackSchema,
  ScheduleAutoPausedPostbackSchema,
]);

// Type aliases
export type BasePostback = z.infer<typeof BasePostbackSchema>;
export type DiscoveryPostback = z.infer<typeof DiscoveryPostbackSchema>;
export type PortScanPostback = z.infer<typeof PortScanPostbackSchema>;
export type HttpxPostback = z.infer<typeof HttpxPostbackSchema>;
export type ScheduledScanExecutedPostback = z.infer<typeof ScheduledScanExecutedPostbackSchema>;
export type ScheduleAutoPausedPostback = z.infer<typeof ScheduleAutoPausedPostbackSchema>;
export type UniversalPostback = z.infer<typeof UniversalPostbackSchema>;

/**
 * Builder helpers ensure payloads remain valid and make it harder to forget normalization.
 */
export type DiscoveryPostbackInput = z.input<typeof DiscoveryPostbackSchema>;
export function buildDiscoveryPostbackPayload(input: DiscoveryPostbackInput): DiscoveryPostback {
  const normalizedDevices = input.data.devices
    .filter((device) => typeof device.hostname === 'string' && device.hostname.trim().length > 0)
    .map((device) => ({
      ...device,
      hostname: device.hostname.trim(),
    }));

  return DiscoveryPostbackSchema.parse({
    ...input,
    data: {
      ...input.data,
      devices: normalizedDevices,
    },
  });
}

export type PortScanPostbackInput = z.input<typeof PortScanPostbackSchema>;
export function buildPortScanPostbackPayload(input: PortScanPostbackInput): PortScanPostback {
  return PortScanPostbackSchema.parse(input);
}

export type HttpxPostbackInput = z.input<typeof HttpxPostbackSchema>;
export function buildHttpxPostbackPayload(input: HttpxPostbackInput): HttpxPostback {
  return HttpxPostbackSchema.parse(input);
}

export type ScheduledScanExecutedPostbackInput = z.input<typeof ScheduledScanExecutedPostbackSchema>;
export function buildScheduledScanExecutedPostbackPayload(
  input: ScheduledScanExecutedPostbackInput,
): ScheduledScanExecutedPostback {
  return ScheduledScanExecutedPostbackSchema.parse(input);
}

export type ScheduleAutoPausedPostbackInput = z.input<typeof ScheduleAutoPausedPostbackSchema>;
export function buildScheduleAutoPausedPostbackPayload(
  input: ScheduleAutoPausedPostbackInput,
): ScheduleAutoPausedPostback {
  return ScheduleAutoPausedPostbackSchema.parse(input);
}

