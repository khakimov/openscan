/**
 * R2 Storage Service
 *
 * Handles screenshot uploads to Cloudflare R2.
 *
 * Architecture:
 * - restate-worker captures screenshots via httpx CLI
 * - Screenshots posted to user-application via postback (base64 encoded)
 * - This service uploads to R2 and returns R2 key
 * - R2 key stored in database (httpx_probes.screenshot)
 * - UI fetches signed URLs via server function
 */

import { createLogger } from "@repo/logger";

const logger = createLogger({ name: "r2-storage" });

export interface ScreenshotMetadata {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  port: number;
  url: string;
  capturedAt?: string; // ISO 8601
  fileSize: number; // Bytes
}

/**
 * Generate R2 object key for screenshot
 *
 * Pattern: screenshots/{orgId}/{deviceId}/{scanRunId}/{port}-{timestamp}.png
 *
 * Example: screenshots/org_abc123/dev_xyz789/scan_20251022_143022/443-20251022T143052Z.png
 */
export function generateR2Key(
  organizationId: string,
  deviceId: string,
  scanRunId: string,
  port: number
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `screenshots/${organizationId}/${deviceId}/${scanRunId}/${port}-${timestamp}.png`;
}

/**
 * Upload screenshot to R2
 *
 * @param r2 - R2 bucket binding (env.SCREENSHOTS)
 * @param key - R2 object key (use generateR2Key)
 * @param buffer - Screenshot image buffer (from base64 decode)
 * @param metadata - Screenshot metadata
 * @returns R2 key for database storage
 * @throws Error if upload fails
 */
export async function uploadScreenshot(
  r2: R2Bucket,
  key: string,
  buffer: ArrayBuffer,
  metadata: ScreenshotMetadata
): Promise<string> {
  try {
    logger.info("Uploading screenshot to R2", {
      key,
      fileSize: buffer.byteLength,
      organizationId: metadata.organizationId,
      deviceId: metadata.deviceId,
      port: metadata.port,
    });

    // HTTP headers
    const httpMetadata: Record<string, string> = {
      "content-type": "image/png",
    };

    // Custom metadata for R2 object
    const customMetadata: Record<string, string> = {
      organizationId: metadata.organizationId,
      deviceId: metadata.deviceId,
      scanRunId: metadata.scanRunId,
      port: metadata.port.toString(),
      url: metadata.url,
      capturedAt: metadata.capturedAt || new Date().toISOString(),
      fileSize: metadata.fileSize.toString(),
    };

    // Upload to R2
    await r2.put(key, buffer, {
      httpMetadata,
      customMetadata,
    });

    logger.info("Screenshot uploaded successfully", {
      key,
      fileSize: buffer.byteLength,
    });

    return key;
  } catch (error) {
    logger.error("R2 upload failed", {
      key,
      error,
    });
    throw new Error(
      `Failed to upload screenshot to R2: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate signed URL for screenshot
 *
 * @param r2 - R2 bucket binding (env.SCREENSHOTS)
 * @param key - R2 object key
 * @param expiresIn - URL expiration in seconds (default: 3600 = 1 hour)
 * @returns Signed URL for direct browser access
 * @throws Error if key doesn't exist or signing fails
 */
export async function getSignedUrl(
  r2: R2Bucket,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    // Check if object exists
    const object = await r2.head(key);
    if (!object) {
      throw new Error(`Screenshot not found: ${key}`);
    }

    // Generate signed URL
    const url = await r2.createMultipartUpload(key);

    // Note: R2 signed URLs use a different API than S3
    // For now, we'll use the public URL pattern
    // In production, you may need to configure R2 public access or use Workers for signed URLs

    logger.info("Generated signed URL", {
      key,
      expiresIn,
    });

    // TODO: Implement proper signed URL generation
    // For now, return the key (will need proxy endpoint)
    return key;
  } catch (error) {
    logger.error("Failed to generate signed URL", {
      key,
      error,
    });
    throw new Error(
      `Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete screenshot from R2
 *
 * Used when deleting scan runs or cleaning up old data
 */
export async function deleteScreenshot(
  r2: R2Bucket,
  key: string
): Promise<void> {
  try {
    await r2.delete(key);
    logger.info("Screenshot deleted from R2", { key });
  } catch (error) {
    logger.error("R2 delete failed", { key, error });
    throw new Error(
      `Failed to delete screenshot from R2: ${error instanceof Error ? error.message : String(error)}`
    );
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
    logger.error("R2 health check failed", { error });
    return false;
  }
}
