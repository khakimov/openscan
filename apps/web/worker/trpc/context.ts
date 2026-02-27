import { getAuth } from "@repo/data-ops/auth/server";
import { getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { initDatabase } from "@repo/data-ops/database/setup";
import type { TrpcContext } from "@/trpc/trpc";

export async function createContext({
  req,
  env,
}: {
  req: Request;
  env: Env;
}): Promise<TrpcContext> {
  // Initialize database with Worker binding
  initDatabase(env.DB);

  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: req.headers });
  const pendingCookies: string[] = [];

  return {
    env,
    request: req,
    session,
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          name: session.user.name ?? null,
          emailVerified: Boolean(session.user.emailVerified),
          organizationId: getActiveOrganizationId(session) ?? null,
        }
      : null,
    pendingCookies,
    setPendingCookies: (cookies: string[]) => {
      pendingCookies.push(...cookies);
    },
  };
}
