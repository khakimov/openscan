/**
 * Centralized configuration for server-side environment variables.
 *
 * Handles both Cloudflare Workers (env bindings) and Node.js (process.env).
 *
 * Usage:
 * ```ts
 * // In Cloudflare Workers with env binding
 * const url = getBaseUrl(ctx.env);
 *
 * // In Node.js (uses process.env)
 * const url = getBaseUrl();
 * ```
 */

export interface EnvBindings {
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  RESTATE_INGRESS_URL?: string;
  RESTATE_API_KEY?: string;
  // Allow any additional properties for compatibility with Cloudflare Env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_RESTATE_URL = 'http://localhost:8080';

/**
 * Get the application base URL.
 * Priority: env param > process.env.APP_URL > process.env.BETTER_AUTH_URL > default
 */
export function getBaseUrl(env?: EnvBindings): string {
  return (
    env?.APP_URL ??
    env?.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    DEFAULT_APP_URL
  );
}

/**
 * Get the Restate ingress URL.
 * Priority: env param > process.env.RESTATE_INGRESS_URL > default
 */
export function getRestateUrl(env?: EnvBindings): string {
  return (
    env?.RESTATE_INGRESS_URL ?? process.env.RESTATE_INGRESS_URL ?? DEFAULT_RESTATE_URL
  );
}

/**
 * Get the Restate API key.
 * Priority: env param > process.env.RESTATE_API_KEY > undefined
 */
export function getRestateApiKey(env?: EnvBindings): string | undefined {
  return env?.RESTATE_API_KEY ?? process.env.RESTATE_API_KEY;
}

/**
 * Build a callback URL for scan results postback.
 */
export function getScanResultsCallbackUrl(env?: EnvBindings): string {
  return `${getBaseUrl(env)}/api/internal/scan-results`;
}


