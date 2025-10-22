/**
 * R2 Storage Service
 *
 * Handles screenshot uploads to Cloudflare R2.
 *
 * R2 Reference: https://developers.cloudflare.com/r2/
 */

import { StorageError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface ScreenshotMetadata {
  organizationId: string;
  deviceId: string;
  scanId: string;
  port: number;
  url: string;
  capturedAt: string; // ISO 8601
  viewport: string; // e.g., "1920x1080"
  fileSize: number; // Bytes
}

/**
 * Generate R2 object key for screenshot
 *
 * Pattern: screenshots/{orgId}/{deviceId}/{scanId}/{port}-{timestamp}.png
 *
 * Example: screenshots/org_abc123/dev_xyz789/scan_20251022_143022/443-20251022T143052Z.png
 */
export function generateR2Key(
  organizationId: string,
  deviceId: string,
  scanId: string,
  port: number
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `screenshots/${organizationId}/${deviceId}/${scanId}/${port}-${timestamp}.png`;
}

/**
 * Upload screenshot to R2
 *
 * @param r2 - R2 bucket binding (env.SCREENSHOTS)
 * @param key - R2 object key (use generateR2Key)
 * @param buffer - Screenshot image buffer
 * @param metadata - Screenshot metadata
 * @throws StorageError if upload fails
 */
export async function uploadScreenshot(
  r2: R2Bucket,
  key: string,
  buffer: ArrayBuffer,
  metadata: ScreenshotMetadata
): Promise<void> {
  try {
    logger.info('Uploading screenshot to R2', {
      key,
      fileSize: buffer.byteLength,
      organizationId: metadata.organizationId,
      deviceId: metadata.deviceId,
      port: metadata.port,
    });

    // Convert metadata to HTTP headers
    const httpMetadata: Record<string, string> = {
      'content-type': 'image/png',
    };

    // Custom metadata
    const customMetadata: Record<string, string> = {
      organizationId: metadata.organizationId,
      deviceId: metadata.deviceId,
      scanId: metadata.scanId,
      port: metadata.port.toString(),
      url: metadata.url,
      capturedAt: metadata.capturedAt,
      viewport: metadata.viewport,
      fileSize: metadata.fileSize.toString(),
    };

    // Upload to R2
    await r2.put(key, buffer, {
      httpMetadata,
      customMetadata,
    });

    logger.info('Screenshot uploaded successfully', {
      key,
      fileSize: buffer.byteLength,
    });
  } catch (error) {
    logger.error('R2 upload failed', {
      key,
      error,
    });
    throw new StorageError('Failed to upload screenshot to R2', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check if R2 bucket is accessible
 *
 * Used for health checks
 */
export async function checkR2Health(r2: R2Bucket): Promise<boolean> {
  try {
    // Try to list objects (limit 1) to verify access
    await r2.list({ limit: 1 });
    return true;
  } catch (error) {
    logger.error('R2 health check failed', { error });
    return false;
  }
}

/**
 * Delete screenshot from R2
 *
 * Note: Typically not used by this worker (lifecycle policies handle cleanup)
 * Included for completeness
 */
export async function deleteScreenshot(r2: R2Bucket, key: string): Promise<void> {
  try {
    await r2.delete(key);
    logger.info('Screenshot deleted from R2', { key });
  } catch (error) {
    logger.error('R2 delete failed', { key, error });
    throw new StorageError('Failed to delete screenshot from R2', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
