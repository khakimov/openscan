import { createRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type {
  OrganizationEntity,
  ProjectEntity,
} from "@repo/contracts/organization";

import type { OnboardingStatus } from "./server/types/onboarding";
import type { AppRouter } from "./trpc/router";
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

export function createAppRouter() {
  return createRouter({
    routeTree,
    context: {
      queryClient: undefined!,
      trpc: undefined!,
    } as RouterContext,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
