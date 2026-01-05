import {
  betterAuth,
  type BetterAuthOptions,
} from "better-auth";

import { createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { organization } from "better-auth/plugins";

// Better Auth doesn't export HookEndpointContext in types, so we define it based on runtime behavior
// The ctx object passed to createAuthMiddleware has these properties
export interface BetterAuthHookContext {
  path?: string;
  event?: string; // Event name (e.g., 'session.created', 'session.refreshed')
  body?: any;
  headers?: Headers;
  request?: Request;
  query?: Record<string, string>;
  // The inner context holds auth-related data
  context: {
    newSession?: any; // Session object after creation/refresh
    returned?: any; // Return value from previous hooks
    responseHeaders?: Headers; // Response headers from auth endpoints
    secret?: string;
    [key: string]: any;
  };
}

export type RouteHookHandler = (
  context: BetterAuthHookContext,
) => Promise<unknown> | unknown;

export type RouteHook = {
  matcher?: (context: BetterAuthHookContext) => boolean;
  handler: RouteHookHandler;
};

export type RouteHooks = {
  before?: RouteHook[];
  after?: RouteHook[];
};

function createHookPlugin(hooks?: RouteHooks): BetterAuthPlugin | null {
  if (!hooks) {
    return null;
  }

  const wrapHooks = (hookList?: RouteHook[]) =>
    hookList
      ?.filter(Boolean)
      .map((hook) => ({
        matcher: hook.matcher ?? (() => true),
        handler: createAuthMiddleware(async (ctx): Promise<unknown> => {
          return hook.handler(ctx as BetterAuthHookContext);
        }),
      }));

  const before = wrapHooks(hooks.before);
  const after = wrapHooks(hooks.after);

  if ((!before || before.length === 0) && (!after || after.length === 0)) {
    return null;
  }

  return {
    id: "app-route-hooks",
    hooks: {
      before,
      after,
    },
  };
}

export const createBetterAuth = (config: {
  database: BetterAuthOptions["database"];
  secret?: BetterAuthOptions["secret"];
  socialProviders?: BetterAuthOptions["socialProviders"];
  baseURL?: string;
  hooks?: RouteHooks;
}): ReturnType<typeof betterAuth> => {
  const hookPlugin = createHookPlugin(config.hooks);

  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL || "http://localhost:3000",
    emailAndPassword: {
      enabled: false,
    },
    socialProviders: config.socialProviders,
    user: {
      modelName: "auth_user",
    },
    session: {
      modelName: "auth_session",
    },
    verification: {
      modelName: "auth_verification",
    },
    account: {
      modelName: "auth_account",
    },
    plugins: [
      organization(),
      ...(hookPlugin ? [hookPlugin] : []),
    ],
  });
};
