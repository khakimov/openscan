import { Hono } from "hono";
import { getAuth } from "@repo/data-ops/auth/server";
import { initDatabase } from "@repo/data-ops/database/setup";

export const authHandler = new Hono<{ Bindings: Env }>();

authHandler.all("/*", async (c) => {
  initDatabase(c.env.DB);
  return getAuth(c.env).handler(c.req.raw);
});
