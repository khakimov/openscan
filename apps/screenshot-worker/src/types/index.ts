import { z } from 'zod';

/**
 * Request/Response Types and Validation Schemas
 *
 * All types use Zod for runtime validation and TypeScript type inference.
 */

// ===== Capture Request =====

export const HttpDetectionSchema = z.object({
  status: z.literal('HTTP_DETECTED'),
  url: z.string().url(),
  title: z.string().optional(),
  statusCode: z.number().optional(),
  tech: z.array(z.string()).optional(),
  webserver: z.string().optional(),
});

export const PortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https']),
  httpDetection: HttpDetectionSchema,
});

export const CaptureRequestSchema = z.object({
  jobId: z.string().min(1),
  deviceId: z.string().min(1),
  scanId: z.string().min(1),
  organizationId: z.string().min(1),
  ports: z.array(PortSchema).min(1).max(50), // Max 50 ports per request
  callbackUrl: z.string().url(),
});

export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;
export type Port = z.infer<typeof PortSchema>;
export type HttpDetection = z.infer<typeof HttpDetectionSchema>;

// ===== Capture Response =====

export interface CaptureResponse {
  jobId: string;
  status: 'processing';
  portsQueued: number;
}

// ===== Screenshot Result =====

export interface ScreenshotResult {
  port: number;
  url: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  r2Key?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  fileSize?: number; // Bytes
  duration?: number; // Milliseconds
  error?: string;
  capturedAt: string; // ISO 8601
}

// ===== Postback Payload =====

export interface ScreenshotPostback {
  type: 'SCREENSHOT';
  jobId: string;
  deviceId: string;
  scanId: string;
  organizationId: string;
  screenshots: ScreenshotResult[];
  completedAt: string; // ISO 8601
}

// ===== Health Check Response =====

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  bindings: {
    browser: boolean;
    r2: boolean;
  };
  timestamp: string;
}

// ===== Error Response =====

export interface ErrorResponse {
  error: string;
  message: string;
  jobId?: string;
  timestamp: string;
}
