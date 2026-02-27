import { Hono } from "hono";
import { initDatabase } from "@repo/data-ops/database/setup";
import { handleUniversalPostback } from "@/server/postback";
import { createLogger } from "@repo/logger";
import { z } from "zod";
import {
  acquireScanSlot,
  ConcurrencyLimitError,
  releaseScanSlot,
  type SchedulePreset,
} from "@repo/data-ops";

const logger = createLogger({ name: "api-internal" });

export const internalHandler = new Hono<{ Bindings: Env }>();

/**
 * Authenticate request using WORKER_API_KEY
 */
function authenticateWorkerRequest(request: Request): boolean {
  const apiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    logger.error("WORKER_API_KEY not configured");
    return false;
  }

  const authHeader =
    request.headers.get("x-worker-key") ||
    request.headers.get("Authorization");
  if (!authHeader) return false;

  const providedKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return providedKey === apiKey;
}

// --- Postback: scan results ---
internalHandler.post("/scan-results", async (c) => {
  initDatabase(c.env.DB);
  return handleUniversalPostback(c.req.raw, c.env);
});

// --- Schedules: can-execute ---
const CanExecuteRequestSchema = z.object({
  organizationId: z.string().min(1),
  scheduleId: z.string().min(1),
  deviceId: z.string().min(1),
  preset: z.enum(["QUICK", "STANDARD", "THOROUGH"]),
});

internalHandler.post("/schedules/can-execute", async (c) => {
  const startTime = Date.now();
  initDatabase(c.env.DB);

  if (!authenticateWorkerRequest(c.req.raw)) {
    logger.warn("Unauthorized can-execute request");
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const parseResult = CanExecuteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      logger.warn("Invalid can-execute request", {
        error: firstError.message,
        path: firstError.path.join("."),
      });
      return c.json(
        { error: `Invalid request: ${firstError.message}` },
        400
      );
    }

    const { organizationId, scheduleId, deviceId, preset } = parseResult.data;

    logger.info("Checking schedule concurrency", {
      organizationId,
      scheduleId,
      deviceId,
      preset,
    });

    try {
      const lease = await acquireScanSlot({
        organizationId,
        scheduleId,
        deviceId,
        preset: preset as SchedulePreset,
      });

      const duration = Date.now() - startTime;
      logger.info("Concurrency slot acquired", {
        organizationId,
        scheduleId,
        leaseId: lease.leaseId,
        duration,
      });

      return c.json({ allowed: true, leaseId: lease.leaseId });
    } catch (error) {
      if (error instanceof ConcurrencyLimitError) {
        logger.warn("Concurrency limit reached", {
          organizationId,
          scheduleId,
          current: error.details.current,
          limit: error.details.limit,
        });

        return c.json(
          {
            allowed: false,
            reason: "CONCURRENCY_LIMIT",
            current: error.details.current,
            limit: error.details.limit,
          },
          429
        );
      }
      throw error;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("Failed to check concurrency", {
      error: errorMessage,
      duration: Date.now() - startTime,
    });

    return c.json({ error: "Internal server error" }, 500);
  }
});

// --- Schedules: release-slot ---
const ReleaseSlotRequestSchema = z.object({
  leaseId: z.string().min(1),
  organizationId: z.string().min(1),
});

internalHandler.post("/schedules/release-slot", async (c) => {
  const startTime = Date.now();
  initDatabase(c.env.DB);

  if (!authenticateWorkerRequest(c.req.raw)) {
    logger.warn("Unauthorized release-slot request");
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const parseResult = ReleaseSlotRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      logger.warn("Invalid release-slot request", {
        error: firstError.message,
        path: firstError.path.join("."),
      });
      return c.json(
        { error: `Invalid request: ${firstError.message}` },
        400
      );
    }

    const { leaseId, organizationId } = parseResult.data;

    logger.info("Releasing concurrency slot", { leaseId, organizationId });

    await releaseScanSlot({ leaseId, organizationId });

    const duration = Date.now() - startTime;
    logger.info("Concurrency slot released", {
      leaseId,
      organizationId,
      duration,
    });

    return c.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("Failed to release slot", {
      error: errorMessage,
      duration: Date.now() - startTime,
    });

    return c.json({ error: "Internal server error" }, 500);
  }
});
