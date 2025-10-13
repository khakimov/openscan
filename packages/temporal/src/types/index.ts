import { z } from 'zod';

// Discovery request schema
export const DiscoveryRequestSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  scanType: z.enum(['basic', 'advanced']).default('basic'),
  tools: z.array(z.enum(['subfinder', 'amass', 'assetfinder'])).default(['subfinder']),
});

export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

// Discovery result item schema (individual subdomain with IP)
export const DiscoveryResultItemSchema = z.object({
  host: z.string(),
  ip: z.string().optional(),
});

export type DiscoveryResultItem = z.infer<typeof DiscoveryResultItemSchema>;

// Discovery result schema
export const DiscoveryResultSchema = z.object({
  target: z.string(),
  subdomains: z.array(z.string()), // Keep for backward compatibility
  results: z.array(DiscoveryResultItemSchema).optional(), // New detailed results
  tool: z.string(),
  timestamp: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

// Workflow result schema
export const WorkflowResultSchema = z.object({
  request: DiscoveryRequestSchema,
  results: z.array(DiscoveryResultSchema),
  totalSubdomains: z.number(),
  uniqueSubdomains: z.array(z.string()),
  executionTime: z.number(), // milliseconds
});

export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

// Task queue constants
export const TASK_QUEUES = {
  DISCOVERY: 'discovery',
  SCANNING: 'scanning',
  REPORTING: 'reporting',
} as const;

export type TaskQueue = typeof TASK_QUEUES[keyof typeof TASK_QUEUES];