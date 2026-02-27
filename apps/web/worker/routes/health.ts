import { Hono } from "hono";

export const healthHandler = new Hono<{ Bindings: Env }>();

healthHandler.get("/", (c) => {
  return c.json({ ok: true, time: Date.now() });
});
