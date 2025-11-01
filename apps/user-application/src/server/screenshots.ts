/**
 * Screenshot Server Functions
 *
 * Handles screenshot retrieval and serving from R2.
 *
 * Security:
 * - Validates device ownership before serving screenshots
 * - Returns proxy URL for client-side image loading
 */

import { createServerFn } from "@tanstack/react-start";
import { getCurrentOrganizationId } from "./utils/auth";
import { getDeviceById } from "@repo/data-ops";
import { createLogger } from "@repo/logger";
import { env } from "cloudflare:workers";

const logger = createLogger({ name: "screenshots-server" });

/**
 * Get screenshot from R2 (proxy endpoint)
 *
 * This server function validates device ownership and returns the screenshot binary data.
 * Use this as an image src in the UI: <img src={`/api/screenshots/${r2Key}?deviceId=${deviceId}`} />
 *
 * @param r2Key - R2 object key (e.g., "screenshots/org_123/dev_456/scan_789/443-2024-11-01.png")
 * @param deviceId - Device ID for ownership validation
 * @returns Screenshot binary data with proper content-type header
 */
export const getScreenshot = createServerFn({
  method: "GET",
})
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid request data");
    }

    const { r2Key, deviceId } = data as { r2Key?: string; deviceId?: string };

    if (!r2Key || typeof r2Key !== "string") {
      throw new Error("r2Key is required");
    }

    if (!deviceId || typeof deviceId !== "string") {
      throw new Error("deviceId is required");
    }

    return { r2Key, deviceId };
  })
  .handler(async ({ data }) => {
    const { r2Key, deviceId } = data;

    try {
      // Step 1: Get current organization
      const organizationId = await getCurrentOrganizationId();

      // Step 2: Validate device ownership
      const device = await getDeviceById(deviceId, organizationId);

      if (!device) {
        logger.warn("Device not found or unauthorized", {
          deviceId,
          organizationId,
        });
        throw new Error("Device not found or unauthorized");
      }

      // Step 3: Validate R2 key matches organization (prevent cross-org access)
      if (!r2Key.startsWith(`screenshots/${organizationId}/`)) {
        logger.warn("R2 key does not match organization", {
          r2Key,
          organizationId,
        });
        throw new Error("Unauthorized access to screenshot");
      }

      // Step 4: Fetch screenshot from R2
      if (!env.SCREENSHOTS) {
        throw new Error("R2 bucket not configured");
      }

      const object = await env.SCREENSHOTS.get(r2Key);

      if (!object) {
        logger.warn("Screenshot not found in R2", { r2Key });
        throw new Error("Screenshot not found");
      }

      // Step 5: Return binary data with proper headers
      const arrayBuffer = await object.arrayBuffer();

      logger.info("Screenshot served", {
        r2Key,
        deviceId,
        organizationId,
        sizeBytes: arrayBuffer.byteLength,
      });

      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=3600", // Cache for 1 hour
          "Content-Length": arrayBuffer.byteLength.toString(),
        },
      });
    } catch (error) {
      logger.error("Failed to serve screenshot", {
        r2Key,
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return 404 for security (don't leak if file exists)
      return new Response("Screenshot not found", { status: 404 });
    }
  });

/**
 * Generate screenshot URL for use in UI
 *
 * This is a helper function to generate the proxy URL.
 * The actual image serving happens through getScreenshot() above.
 *
 * Usage in UI:
 * ```tsx
 * const screenshotUrl = getScreenshotUrl(r2Key, deviceId);
 * <img src={screenshotUrl} alt="Screenshot" />
 * ```
 */
export function getScreenshotUrl(r2Key: string, deviceId: string): string {
  const params = new URLSearchParams({
    r2Key,
    deviceId,
  });

  return `/api/screenshots?${params.toString()}`;
}
