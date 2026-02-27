import type { Context } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/router";
import { createContext } from "./context";
import { createLogger } from "@repo/logger";

const logger = createLogger({ name: "trpc-handler" });

export async function trpcHandler(c: Context<{ Bindings: Env }>) {
  const ctx = await createContext({
    req: c.req.raw,
    env: c.env,
  });

  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ctx,
    onError({ path, error, type }) {
      logger.error("tRPC handler error", {
        path,
        type,
        message: error.message,
      });
    },
  });

  // Append any pending cookies (e.g., from auth mutations)
  if (ctx.pendingCookies.length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const cookie of ctx.pendingCookies) {
    headers.append("set-cookie", cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
