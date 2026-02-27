import { Hono } from "hono";
import { trpcHandler } from "./trpc/handler";
import { authHandler } from "./routes/auth";
import { healthHandler } from "./routes/health";
import { internalHandler } from "./routes/internal";
import { screenshotsHandler } from "./routes/screenshots";

export const app = new Hono<{ Bindings: Env }>();

// Health check
app.route("/api/health", healthHandler);

// Better-auth handler
app.route("/api/auth", authHandler);

// Internal worker-to-worker APIs (postback, schedules)
app.route("/api/internal", internalHandler);

// Screenshots from R2
app.route("/api/screenshots", screenshotsHandler);

// tRPC handler
app.all("/trpc/*", trpcHandler);
