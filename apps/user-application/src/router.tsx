import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import type { QueryClient } from "@tanstack/react-query";
import type { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { OrganizationEntity, ProjectEntity } from "@repo/contracts/organization";

import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { getServerEnvs } from "./server/get-envs";
import type { OnboardingStatus } from "./server/types/onboarding";
import type { AppRouter } from "./trpc/router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

/**
 * Organization summary (minimal info from listOrganizations)
 */
export interface OrganizationSummary {
  id: string;
  name: string | null;
  slug: string | null;
  metadata: Record<string, {}> | null;
}

/**
 * Typed router context available to all routes
 * Cloudflare Workers pattern: Only includes options proxy (not raw client)
 * 
 * Route context inheritance:
 * - __root.tsx: provides session
 * - _app.tsx: provides organizations (OrganizationSummary[])
 * - _app.$organizationId.tsx: provides organization (OrganizationEntity) + projects (ProjectEntity[])
 * - _app.$organizationId.$projectId.tsx: provides project (ProjectEntity)
 */
export interface RouterContext {
  queryClient: QueryClient;
  trpc: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>;
  appUrl: string;
  isSelfHosted: boolean;
  onboarding?: OnboardingStatus;
  session?: inferRouterOutputs<AppRouter>["auth"]["session"];
  // Route-level data (inherited by child routes)
  organizations?: OrganizationSummary[];
  organization?: OrganizationEntity;
  projects?: ProjectEntity[];
  project?: ProjectEntity;
}

/**
 * Onboarding route context - guarantees onboarding is present
 */
export interface OnboardingRouteContext extends RouterContext {
  onboarding: OnboardingStatus;
}

/**
 * Organization route context - guarantees organization and projects are present
 * Available in: _app.$organizationId/* routes
 */
export interface OrganizationRouteContext extends RouterContext {
  organization: OrganizationEntity;
  projects: ProjectEntity[];
}

/**
 * Project route context - guarantees project is present
 * Available in: _app.$organizationId.$projectId/* routes
 */
export interface ProjectRouteContext extends OrganizationRouteContext {
  project: ProjectEntity;
}

// Create a new router instance
export const getRouter = async () => {
  const envs = await getServerEnvs();
  const rqContext = TanstackQuery.getContext(envs.appUrl);

  const router = createRouter({
    routeTree,
    context: {
      queryClient: rqContext.queryClient,
      trpc: rqContext.trpc,
      appUrl: envs.appUrl,
      isSelfHosted: envs.isSelfHosted,
    } satisfies RouterContext,
    defaultPreload: "intent",
    Wrap: ({ children }) => {
      return (
        <TanstackQuery.Provider
          queryClient={rqContext.queryClient}
          appUrl={envs.appUrl}
        >
          {children}
        </TanstackQuery.Provider>
      );
    },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: rqContext.queryClient,
  });

  return router;
};
