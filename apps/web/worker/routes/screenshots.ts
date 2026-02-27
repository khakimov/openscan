import { Hono } from "hono";
import { initDatabase } from "@repo/data-ops/database/setup";
import { getAuth } from "@repo/data-ops/auth/server";
import { getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { getDeviceById } from "@repo/data-ops";
import { createLogger } from "@repo/logger";

const logger = createLogger({ name: "screenshots-api" });

export const screenshotsHandler = new Hono<{ Bindings: Env }>();

screenshotsHandler.get("/", async (c) => {
  initDatabase(c.env.DB);

  try {
    const r2Key = c.req.query("r2Key");
    const deviceId = c.req.query("deviceId");

    if (!r2Key || !deviceId) {
      return c.text("Missing r2Key or deviceId", 400);
    }

    // Get organization from session
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) {
      return c.text("Not found", 404);
    }
    const organizationId = getActiveOrganizationId(session);
    if (!organizationId) {
      return c.text("Not found", 404);
    }

    // Validate device ownership
    const device = await getDeviceById(deviceId, organizationId);
    if (!device) {
      logger.warn("Device not found or unauthorized", {
        deviceId,
        organizationId,
      });
      return c.text("Not found", 404);
    }

    // Validate R2 key matches organization
    if (!r2Key.startsWith(`screenshots/${organizationId}/`)) {
      logger.warn("R2 key does not match organization", {
        r2Key,
        organizationId,
      });
      return c.text("Not found", 404);
    }

    if (!c.env.SCREENSHOTS) {
      throw new Error("R2 bucket not configured");
    }

    const object = await c.env.SCREENSHOTS.get(r2Key);
    if (!object) {
      logger.warn("Screenshot not found in R2", { r2Key });
      return c.text("Not found", 404);
    }

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
        "Cache-Control": "private, max-age=3600",
        "Content-Length": arrayBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    logger.error("Failed to serve screenshot", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.text("Not found", 404);
  }
});
