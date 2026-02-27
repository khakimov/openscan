import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, initDatabase } from "../database/setup";
import {
  auth_account,
  auth_session,
  auth_verification,
  auth_user,
  organization,
  member,
  invitation,
} from "../drizzle/auth-schema";
import { organization as organizationPlugin } from "better-auth/plugins";
import { getOrganizationAPI } from "./organization-api";
import { createLogger } from "@repo/logger";

const logger = createLogger({ name: "auth-server" });

// Singleton instance (per Worker isolate or test process)
let auth: ReturnType<typeof betterAuth> | null = null;

/**
 * Clear auth singleton - FOR TESTING ONLY
 * Allows tests to reinitialize with different config
 */
export function clearAuth() {
  auth = null;
}

/**
 * Minimal auth environment config
 */
export interface AuthEnv {
  DB: any; // D1Database binding (required for database initialization)
  BETTER_AUTH_SECRET: string;
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

/**
 * Create Better Auth instance (internal factory)
 */
function createBetterAuth(
  database: NonNullable<Parameters<typeof betterAuth>[0]>["database"],
  secret: string,
  baseURL: string,
  google?: { clientId: string; clientSecret: string },
  github?: { clientId: string; clientSecret: string },
): ReturnType<typeof betterAuth> {
  const socialProviders: any = {};

  if (google?.clientId && google?.clientSecret) {
    socialProviders.google = google;
  }

  if (github?.clientId && github?.clientSecret) {
    socialProviders.github = github;
  }

  const authInstance = betterAuth({
    database,
    secret,
    baseURL,
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:13000',
      'http://localhost:13001',
      'https://sec.rocks',
    ],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: Object.keys(socialProviders).length ? socialProviders : undefined,
    plugins: [
      organizationPlugin({
        // Organization plugin for multi-tenancy support
        // Will add activeOrganizationId to session
      }),
    ],
    onAPIResponse: {
      // Hook runs after successful auth operations
      onSuccess: async (ctx: any) => {
        // Auto-set first organization after successful sign-in
        // This ensures users always have an active org context after login
        if (
          (ctx.path === '/sign-in/email' ||
           ctx.path === '/sign-in/google' ||
           ctx.path === '/sign-in/github') &&
          ctx.context?.newSession
        ) {
          try {
            const session = ctx.context.newSession;

            // Skip if already has active org
            if (session.activeOrganizationId) {
              return;
            }

            const orgAPI = getOrganizationAPI(authInstance);
            const organizations = await orgAPI.listOrganizations({
              headers: ctx.headers || new Headers(),
            });

            // Auto-set first org as active (if user has any orgs)
            if (organizations.length > 0) {
              await orgAPI.setActiveOrganization({
                body: { organizationId: organizations[0].id },
                headers: ctx.headers || new Headers(),
              });

              logger.info('Auto-set first organization after login', {
                userId: session.userId,
                organizationId: organizations[0].id,
                organizationName: organizations[0].name,
              });
            } else {
              logger.warn('User logged in but has no organizations', {
                userId: session.userId,
              });
            }
          } catch (error) {
            // Don't fail login if org setting fails
            logger.error('Failed to auto-set organization after login', {
              error: error instanceof Error ? error.message : String(error),
              path: ctx.path,
            });
          }
        }
      },
    },
  });

  return authInstance;
}

/**
 * Get or initialize Better Auth singleton
 *
 * @param env - Environment variables (required on first call)
 * @returns Better Auth instance
 *
 * @example
 * // In route handlers
 * const auth = getAuth(env);
 * return auth.handler(request);
 */
export function getAuth(env?: AuthEnv): ReturnType<typeof betterAuth> {
  if (auth) return auth;

  if (!env) {
    throw new Error("Environment required to initialize auth");
  }

  // ✅ Initialize database with env.DB BEFORE calling getDb()
  // This ensures auth uses the same D1 binding that was passed in
  initDatabase(env.DB);

  // Initialize database connection
  const database = drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema: {
      user: auth_user,
      account: auth_account,
      session: auth_session,
      verification: auth_verification,
      organization,
      member,
      invitation,
    },
  });

  // Build social provider config
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined;

  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
      : undefined;

  auth = createBetterAuth(
    database,
    env.BETTER_AUTH_SECRET,
    env.APP_URL ?? env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    google,
    github,
  );

  return auth;
}
