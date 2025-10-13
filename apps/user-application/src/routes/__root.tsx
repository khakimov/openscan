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
import type { QueryClient } from "@tanstack/react-query";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { NotFound } from "@/components/not-found";
import { ThemeProvider, ThemeScript, useTheme } from "@/components/theme";
import appCss from "@/styles.css?url";
import { seo } from "@/utils/seo";

const themeConfig = {
  attribute: "class" as const,
  defaultTheme: "system" as const,
  storageKey: "ui-theme",
  enableSystem: true,
  disableTransitionOnChange: false,
};

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
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
        title:
          "TanStack Start | Type-Safe, Client-First, Full-Stack React Framework",
        description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
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
      <RootDocument>{children}</RootDocument>
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
      <body>
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
