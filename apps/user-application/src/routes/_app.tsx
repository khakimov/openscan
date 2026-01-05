import {
  createFileRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Suspense } from "react";

import { AppLayout } from "@/components/layout";
import { Sidebar } from "@/components/layout/sidebar";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { listOrganizations } from "@/server/organization";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    if (!context.session?.session) {
      throw redirect({ to: "/", search: { redirect: location.href } });
    }

    // Check if user has completed onboarding (has at least one organization)
    const organizations = await listOrganizations();

    if (organizations.length === 0) {
      // User signed in but hasn't completed onboarding - redirect to onboarding
      throw redirect({ to: "/onboarding" });
    }

    // If user lands on /_app root without an org in URL, redirect to first org
    // This handles direct navigation to /app or bookmark to old URLs
    if (location.pathname === '/_app' || location.pathname === '/_app/') {
      const firstOrg = organizations[0];
      const orgIdentifier = firstOrg.slug || firstOrg.id;

      throw redirect({
        to: `/${orgIdentifier}` as any,
        replace: true,
      });
    }

    return { session: context.session };
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
