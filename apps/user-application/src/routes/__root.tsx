/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { NotFound } from "@/components/not-found";
import { ThemeProvider, ThemeScript, useTheme } from "@/components/theme";
import { ModalProvider } from "@/modals";
import appCss from "@/styles.css?url";
import landingCss from "@/landing.css?url";
import { seo } from "@/utils/seo";
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
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: "sec.🤘 | Continuous Attack Surface Monitoring",
        description:
          "Proactive security for teams of any size. Discover vulnerabilities, monitor your attack surface, and prevent breaches.",
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: landingCss },
      // Preload landing page fonts for better performance
      {
        rel: "preload",
        href: "/fonts/TT-Firs-Neue-Var Roman.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/UncutSans-Variable.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      // SVG favicon for modern browsers (scales perfectly at any size)
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      // Fallback favicons for older browsers
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#ffffff" },
    ],
  }),
  pendingComponent: () => (
    <ThemeShell>
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" wait="delay-300" />
      </div>
    </ThemeShell>
  ),
  errorComponent: (props) => {
    return (
      <ThemeShell>
        <DefaultCatchBoundary {...props} />
      </ThemeShell>
    );
  },
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
          <RootDocument>{children}</RootDocument>
        </ModalProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const themeClass = resolvedTheme ?? "dark";

  return (
    <html className={themeClass} data-theme={themeClass} suppressHydrationWarning>
      <head>
        <ThemeScript
          attribute={themeConfig.attribute}
          defaultTheme={themeConfig.defaultTheme}
          storageKey={themeConfig.storageKey}
          enableSystem={themeConfig.enableSystem}
        />
        <HeadContent />
      </head>
      <body className="font-[family-name:var(--font-family-regular)]" suppressHydrationWarning>
        {children}
        <Toaster position="bottom-right" richColors />
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
