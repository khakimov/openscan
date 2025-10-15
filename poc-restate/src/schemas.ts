import { z } from 'zod';

// Input schema - matches your existing PortScanSchema structure
export const PortScanInput = z.object({
  target: z.string().min(1, 'Target is required'),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  ports: z.array(z.number()).optional(),
  timeout: z.number().default(5000),
  aggressive: z.boolean().default(false),
});

export type PortScanInput = z.infer<typeof PortScanInput>;

// State schema - for tracking progress during scan
export const ScanState = z.object({
  scanId: z.string(),
  status: z.enum(['scanning', 'parsing', 'detecting', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  currentStep: z.string(),
  portsFound: z.number().default(0),
});

export type ScanState = z.infer<typeof ScanState>;

// Output schema
export const PortScanResult = z.object({
  scanId: z.string(),
  target: z.string(),
  ports: z.array(
    z.object({
      port: z.number(),
      protocol: z.string(),
      state: z.string(),
      service: z.string().optional(),
      version: z.string().optional(),
    })
  ),
  totalPorts: z.number(),
  scanDuration: z.number(),
  completedAt: z.string(),
});

export type PortScanResult = z.infer<typeof PortScanResult>;
