import {
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { NotFound } from "@/components/not-found";
import { ThemeProvider } from "@/components/theme";
import { ModalProvider } from "@/modals";
import { Toaster } from "sonner";
import type { RouterContext } from "@/router";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";

const themeConfig = {
  attribute: "class" as const,
  defaultTheme: "system" as const,
  storageKey: "ui-theme",
  enableSystem: true,
  disableTransitionOnChange: false,
};

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    // Single blocking request: session + org list in parallel
    const [session, orgData] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.auth.session.queryOptions()
      ),
      context.queryClient
        .ensureQueryData(context.trpc.organization.list.queryOptions())
        .catch(() => ({ organizations: [], activeOrganizationId: null })),
    ]);
    return { session, organizations: orgData.organizations };
  },
  pendingComponent: () => (
    <ThemeShell>
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" wait="delay-300" />
      </div>
    </ThemeShell>
  ),
  errorComponent: (props) => (
    <ThemeShell>
      <DefaultCatchBoundary {...props} />
    </ThemeShell>
  ),
  notFoundComponent: () => (
    <ThemeShell>
      <NotFound />
    </ThemeShell>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeShell>
      <Outlet />
    </ThemeShell>
  );
}

function ThemeShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider {...themeConfig}>
      <TooltipProvider>
        <ModalProvider>
          {children}
          <Toaster position="bottom-right" richColors />
          <ReactQueryDevtools buttonPosition="bottom-left" />
          <TanStackRouterDevtools position="bottom-right" />
        </ModalProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
