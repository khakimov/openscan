import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutProjectSelector } from "@/components/layout/layout-project-selector";
import { cn } from "@/lib/utils";
import { useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { Home, Menu, Shield, ScanLine, XIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { AccountDialog } from "@/components/auth/account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { NotificationIndicator } from "@/components/notifications/NotificationIndicator";
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/trpc/router';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectListByOrgOutput = RouterOutputs['project']['listByOrg'];

interface NavigationItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string | number;
}

/**
 * Build navigation items with organization and project
 * If projectId is available, build project-scoped URLs
 * Otherwise, build org-level URLs
 */
function getNavigationItems(
  organization: SidebarOrganization | null,
  projectId?: string
): NavigationItem[] {
  if (!organization) {
    return [];
  }

  // Prefer slug over ID for cleaner URLs (OpenPanel pattern)
  const orgIdentifier = organization.slug || organization.id;

  // If on a project-scoped route, use project URLs
  if (projectId) {
    return [
      {
        name: "Dashboard",
        icon: Home,
        href: `/${orgIdentifier}/${projectId}`,
      },
      {
        name: "Assets",
        icon: Shield,
        href: `/${orgIdentifier}/${projectId}/assets`,
      },
      {
        name: "Scans",
        icon: ScanLine,
        href: `/${orgIdentifier}/${projectId}/scans`,
      },
    ];
  }

  // Otherwise, use org-level URLs (project list)
  return [
    {
      name: "Projects",
      icon: Home,
      href: `/${orgIdentifier}`,
    },
  ];
}

export interface SidebarOrganization {
  id: string;
  name: string | null;
  slug?: string | null;
}

export interface SidebarProject {
  id: string;
  name: string | null;
  domain?: string | null;
  description?: string | null;
}

export interface SidebarUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SidebarProps {
  className?: string;
  user: SidebarUser | null;
  activeOrganization: SidebarOrganization | null;
  organizations: SidebarOrganization[];
  projects: ProjectListByOrgOutput; // Raw tRPC shape from loader
}

export function Sidebar({
  className,
  user,
  activeOrganization,
  organizations,
  projects: initialProjects,
}: SidebarProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get organizationId and projectId from URL if on project-scoped route
  // Use routerState.matches to reliably extract params from any matched route in the tree
  const matchWithOrg = routerState.matches.find((match) =>
    'organizationId' in match.params
  );
  const organizationIdFromUrl = matchWithOrg && 'organizationId' in matchWithOrg.params
    ? matchWithOrg.params.organizationId as string
    : undefined;

  const matchWithProject = routerState.matches.find((match) =>
    'projectId' in match.params
  );
  const projectId = matchWithProject && 'projectId' in matchWithProject.params
    ? matchWithProject.params.projectId as string
    : undefined;

  // Fallback to URL-based organization if activeOrganization is null
  // This happens when user logs in via OAuth and lands on /:organizationId/:projectId
  // but the session hasn't been updated with the active organization yet
  // IMPORTANT: organizationIdFromUrl can be a slug, so we must find the real org
  // to get the actual ID for project queries
  const fallbackOrg = organizationIdFromUrl
    ? organizations.find(
        (org) => org.id === organizationIdFromUrl || org.slug === organizationIdFromUrl
      )
    : null;

  const effectiveOrganization: SidebarOrganization | null = activeOrganization ?? (
    fallbackOrg
      ? {
          id: fallbackOrg.id,
          name: fallbackOrg.name ?? null,
          slug: fallbackOrg.slug ?? null
        }
      : null
  );

  // OpenPanel pattern: Use tRPC queryOptions for SSR-safe cache reuse
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const organizationId = effectiveOrganization?.id ?? '';

  const projectQuery = useQuery({
    ...trpc.project.listByOrg.queryOptions({ organizationId }),
    queryFn: () => trpcClient.project.listByOrg.query({ organizationId }),
    enabled: Boolean(effectiveOrganization?.id), // Only fetch when we have a valid org ID
    initialData: initialProjects, // Loader already returns ProjectListByOrgOutput
    placeholderData: (prev) => prev, // Keep previous data during refetch (prevents flashing)
  });

  const data: ProjectListByOrgOutput = (projectQuery.data ?? initialProjects ?? []) as ProjectListByOrgOutput;
  // Only show loading when there's no cached data yet (initial load)
  const isInitialLoading = projectQuery.isLoading && !projectQuery.data?.length;

  // Map to sidebar shape after the hook (OpenPanel pattern)
  const projects: SidebarProject[] = data.map((project: ProjectListByOrgOutput[number]): SidebarProject => ({
    id: project.id,
    name: project.name ?? null,
    domain: project.domain ?? null,
    description: project.description ?? null,
  }));

  const fallbackText = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "U";

  // Build navigation items based on effective organization and current project
  const navigationItems = getNavigationItems(effectiveOrganization, projectId);

  // Auto-close mobile menu on navigation using router.subscribe (proper TanStack Router pattern)
  useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", () => {
      setIsMobileMenuOpen(false);
    });
    return unsubscribe;
  }, [router]);

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden lg:flex lg:flex-col lg:border-r lg:border-border lg:bg-[color-mix(in_oklab,var(--color-background),black_50%)]",
          isCollapsed ? "lg:w-16" : "lg:w-64",
          "transition-all duration-300 ease-in-out",
          className,
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          {!isCollapsed && (
            <div className="flex flex-1 items-center gap-3 overflow-hidden">
              <div className="min-w-0 flex-1">
                <LayoutProjectSelector
                  align="start"
                  projects={projects}
                  organizations={organizations}
                  tenant={effectiveOrganization}
                  isLoading={isInitialLoading}
                />
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              // Dashboard (org root) should only match exactly
              // Other routes can match by prefix (with trailing slash to avoid partial matches)
              const isDashboard = item.name === "Dashboard";
              const isActive = isDashboard
                ? currentPath === item.href
                : currentPath === item.href || currentPath.startsWith(item.href + "/");

              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    isCollapsed && "px-2 justify-center",
                    isActive && "bg-primary text-primary-foreground shadow-sm",
                    !isActive &&
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                  onClick={() => navigate({ to: item.href })}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{item.name}</span>
                      {item.name === "Assets" && <NotificationIndicator />}
                      {item.badge && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50",
              isCollapsed && "justify-center",
            )}
          >
            {!isCollapsed && (
              <AccountDialog user={user}>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 px-3 w-full justify-start"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user?.image || undefined}
                      alt={user?.name || "User"}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {fallbackText}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium truncate">
                      {user?.name || "User"}
                    </span>
                    {user?.email && (
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    )}
                  </div>
                </Button>
              </AccountDialog>
            )}
            {isCollapsed && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {fallbackText}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Backdrop Overlay - Always rendered, controlled by pointer-events */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          "lg:hidden fixed bottom-0 left-0 right-0 top-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity",
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      {/* Mobile Sliding Sidebar */}
      <div
        className={cn(
          "lg:hidden fixed left-0 top-0 z-40 flex h-dvh w-56 flex-col border-r border-border bg-background transition-transform",
          "-translate-x-56", // hidden by default on mobile
          isMobileMenuOpen && "translate-x-0", // slide in when active
        )}
      >
        {/* Toggle Button - Positioned outside sidebar (mobile only) */}
        <div className="absolute -right-16 flex h-16 items-center lg:hidden">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="h-10 w-10 bg-background"
          >
            {isMobileMenuOpen ? (
              <XIcon className="h-3 w-3" />
            ) : (
              <Menu className="h-2 w-2" />
            )}
          </Button>
        </div>

        {/* Header */}
        <div className="flex h-16 items-center px-6 border-b border-border">
          <div className="flex flex-1 items-center gap-3 overflow-hidden">
            <div className="min-w-0 flex-1">
              <LayoutProjectSelector
                align="start"
                projects={projects}
                organizations={organizations}
                tenant={activeOrganization}
                isLoading={isInitialLoading}
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="px-3 py-4">
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              // Dashboard (org root) should only match exactly
              // Other routes can match by prefix (with trailing slash to avoid partial matches)
              const isDashboard = item.name === "Dashboard";
              const isActive = isDashboard
                ? currentPath === item.href
                : currentPath === item.href || currentPath.startsWith(item.href + "/");

              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    isActive && "bg-primary text-primary-foreground shadow-sm",
                    !isActive &&
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                  onClick={() => navigate({ to: item.href })}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.name}</span>
                  {item.name === "Assets" && <NotificationIndicator />}
                  {item.badge && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User Profile - Always visible at bottom */}
        <div className="mt-auto border-t border-border p-4 space-y-2">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50">
            <AccountDialog user={user}>
              <Button
                variant="ghost"
                className="flex items-center gap-2 px-3 w-full justify-start"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={user?.image || undefined}
                    alt={user?.name || "User"}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {fallbackText}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium truncate">
                    {user?.name || "User"}
                  </span>
                  {user?.email && (
                    <span className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </span>
                  )}
                </div>
              </Button>
            </AccountDialog>
          </div>
          {/* Build Version */}
          <div className="px-3 text-center">
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {import.meta.env.VITE_BUILD_VERSION || 'dev'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
