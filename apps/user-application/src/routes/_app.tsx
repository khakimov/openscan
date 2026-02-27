import {
  createFileRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Suspense } from "react";

import { AppLayout } from "@/components/layout/app-layout";
import { Sidebar } from "@/components/layout/sidebar";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    if (!context.session?.session) {
      throw redirect({ to: "/", search: { redirect: location.href } });
    }

    // OpenPanel pattern: Use tRPC queryOptions for organization list
    // This ensures data is cached in React Query and can be invalidated by mutations
    const { organizations } = await context.queryClient.ensureQueryData(
      context.trpc.organization.list.queryOptions()
    );

    if (organizations.length === 0) {
      // User signed in but hasn't completed onboarding - redirect to onboarding
      throw redirect({ to: "/onboarding" });
    }

    // If user lands on /_app root without an org in URL, redirect to first org
    if (location.pathname === '/_app' || location.pathname === '/_app/') {
      const firstOrg = organizations[0];
      const orgIdentifier = firstOrg.slug || firstOrg.id;

      throw redirect({
        to: `/${orgIdentifier}` as any,
        replace: true,
      });
    }

    // Pass organizations to all child routes
    return { 
      session: context.session,
      organizations,
    };
  },
  component: AppLayoutComponent,
});

function AppLayoutComponent() {
  return (
    <AppLayout sidebar={<Sidebar />}>
      <Suspense fallback={<PageLoadingFallback />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}
