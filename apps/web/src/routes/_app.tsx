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
  beforeLoad: ({ context, location }) => {
    // Auth gate - session already fetched in __root
    if (!context.session?.session) {
      throw redirect({ to: "/", search: { redirect: location.href } });
    }

    // Org list already fetched in __root
    const organizations = context.organizations ?? [];

    if (organizations.length === 0) {
      throw redirect({ to: "/onboarding" });
    }

    return { session: context.session, organizations };
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
