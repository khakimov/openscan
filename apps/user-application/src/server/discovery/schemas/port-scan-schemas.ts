import { z } from 'zod';

export const PortScanModeSchema = z.enum(['DISCOVERY', 'EXTEND', 'UPTIME']);
export const ScanProfileSchema = z.enum(['PS_L1', 'PS_L2', 'PS_L3', 'PS_L4', 'PS_L5', 'PS_L6']);

export const PortScanSchema = z.object({
  target: z
    .string()
    .min(1, 'Target is required')
    .refine(
      (val) => {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
        return ipRegex.test(val) || domainRegex.test(val);
      },
      { message: 'Invalid IP address or domain format' },
    ),
  ports: z.array(z.number().int().min(1).max(65535)).optional(),
  protocol: z.enum(['tcp', 'udp', 'both']).default('tcp'),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  deviceId: z.string().min(1).optional(),
  isExtendScan: z.boolean().optional(),
  mode: PortScanModeSchema.optional(),
  scanProfile: ScanProfileSchema.optional(),
  seedPorts: z.array(z.number().int().min(1).max(65535)).optional(),
  additionalPortRanges: z.array(z.string().min(1)).optional(),
  aggressive: z.boolean().optional(),
});

export const CancelPortScanSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  scanRunId: z.string().optional(),
  reason: z.string().min(1).max(200).optional(),
});

export type PortScanRequestInput = z.infer<typeof PortScanSchema>;
export type CancelPortScanInput = z.infer<typeof CancelPortScanSchema>;
