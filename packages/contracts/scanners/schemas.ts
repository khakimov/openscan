import { z } from "zod";

/**
 * Enums shared across scanner workflows
 */
export const TargetTypeEnum = z.enum([
  "DOMAIN",
  "IP_ADDRESS",
  "SUBNET",
  "URL",
  "IP_RANGE",
  "EMAIL",
]);

export const ScanScopeEnum = z.enum(["INTERNAL", "EXTERNAL", "UNKNOWN"]);

export const AuthScanTypeEnum = z.enum(["ANONYMOUS", "AUTHENTICATED"]);

export const ScanPriorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

export const PortScanModeEnum = z.enum(["DISCOVERY", "EXTEND", "UPTIME"]);

export const ScanProfileEnum = z.enum([
  "PS_L1",
  "PS_L2",
  "PS_L3",
  "PS_L4",
  "PS_L5",
  "PS_L6",
]);

/**
 * Target metadata attached to a scan request
 */
export const ScanTargetSchema = z.object({
  value: z.string().min(1),
  type: TargetTypeEnum,
  scope: ScanScopeEnum.optional(),
  id: z.string().optional(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Discovery workflow schemas
 */
export const DiscoveryInputSchema = z.object({
  target: z
    .string()
    .min(1, "Target is required")
    .max(253, "Target too long")
    .refine(
      (val) => {
        const dangerous = /[;&|`$(){}[\]<>\\]|\.\.|^-/;
        return !dangerous.test(val);
      },
      { message: "Target contains invalid characters" },
    ),
});

export const DiscoveryStateSchema = z.object({
  status: z.enum([
    "started",
    "discovering",
    "ping_sweep",
    "completed",
    "failed",
  ]),
  target: z.string(),
  devicesFound: z.number().default(0),
  errors: z.array(z.string()).default([]),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});

/**
 * Port scan result schema (defined first since it's reused across states)
 */
export const PortScanResultSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]),
  state: z.enum(["open", "closed", "filtered"]),
  service: z
    .object({
      name: z.string().optional(),
      product: z.string().optional(),
      version: z.string().optional(),
      extraInfo: z.string().optional(),
      method: z.string().optional(),
      confidence: z.number().optional(),
    })
    .optional(),
  discoveredBy: z.array(z.string()).optional(),
  firstSeen: z.number().optional(),
  lastSeen: z.number().optional(),
});

/**
 * Port scan workflow schemas
 */
export const PortScanInputSchema = z.object({
  target: z
    .string()
    .min(1, "Target is required")
    .refine(
      (val) => {
        const ipRegex =
          /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const domainRegex =
          /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
        return ipRegex.test(val) || domainRegex.test(val);
      },
      { message: "Invalid IP address or domain format" },
    ),
  ports: z.array(z.number().int().min(1).max(65535)).optional(),
  protocol: z.enum(["tcp", "udp", "both"]).default("tcp"),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  deviceId: z.string().min(1).optional(),
  isExtendScan: z.boolean().optional(),
  mode: PortScanModeEnum.optional(),
  scanProfile: ScanProfileEnum.optional(),
  seedPorts: z.array(z.number().int().min(1).max(65535)).optional(),
  additionalPortRanges: z.array(z.string().min(1)).optional(),
  aggressive: z.boolean().optional(),
});

export const PortScanStateSchema = z.object({
  status: z.enum(["scanning", "completed", "failed", "canceled"]),
  target: z.string(),
  portsFound: z.number().default(0),
  ports: z.array(PortScanResultSchema).optional(),
  errors: z.array(z.string()).default([]),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  progress: z.number().min(0).max(100).default(0),
});

/**
 * Exported types inferred from schemas
 */
export type ScanTarget = z.infer<typeof ScanTargetSchema>;
export type DiscoveryInput = z.infer<typeof DiscoveryInputSchema>;
export type DiscoveryState = z.infer<typeof DiscoveryStateSchema>;
export type PortScanResult = z.infer<typeof PortScanResultSchema>;
export type PortScanInput = z.infer<typeof PortScanInputSchema>;
export type PortScanState = z.infer<typeof PortScanStateSchema>;
export type TargetType = z.infer<typeof TargetTypeEnum>;
export type ScanScope = z.infer<typeof ScanScopeEnum>;
export type AuthScanType = z.infer<typeof AuthScanTypeEnum>;
export type ScanPriority = z.infer<typeof ScanPriorityEnum>;
export type PortScanMode = z.infer<typeof PortScanModeEnum>;
export type ScanProfile = z.infer<typeof ScanProfileEnum>;
