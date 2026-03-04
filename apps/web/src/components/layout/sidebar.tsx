import { useState, useEffect } from "react";
import { Menu, XIcon, Loader2 } from "lucide-react";
import {
  useNavigate,
  useRouterState,
  useRouter,
  getRouteApi,
  useMatch,
} from "@tanstack/react-router";


import { AccountDialog } from "@/components/auth/account-dialog";
import { LayoutProjectSelector, type LayoutProjectSelectorProps } from "@/components/layout/layout-project-selector";
import { NotificationIndicator } from "@/components/notifications/NotificationIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { OrganizationRouteContext, RouterContext } from "@/router";
import { buildNavigationItems } from "@/lib/navigation";
import { useTRPC } from "@/integrations/trpc/react";
import { useQuery } from "@tanstack/react-query";

// Get typed route context
const rootRouteApi = getRouteApi("/_app");
const orgRouteApi = getRouteApi("/_app/$organizationId");

interface SidebarUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps = {}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const router = useRouter();
  const routerState = useRouterState();

  // Get initial data from route context (SSR/hydration)
  const { session: sessionContext, organizations: initialOrganizations } = 
    rootRouteApi.useRouteContext() as RouterContext;
  const { organization: initialOrganization, projects: initialProjects } = 
    orgRouteApi.useRouteContext() as OrganizationRouteContext;

  // Subscribe to tRPC queries for reactive updates after mutations
  const { data: orgListData } = useQuery(trpc.organization.list.queryOptions());
  const organizations = orgListData?.organizations ?? initialOrganizations ?? [];

  const orgMatch = useMatch({ from: "/_app/$organizationId", shouldThrow: false });
  const orgContext = orgMatch?.context as OrganizationRouteContext | undefined;
  const organizationId = orgContext?.organization?.id ?? initialOrganization?.id;

  // Subscribe to organization detail query for reactive updates
  const { data: organizationData } = useQuery({
    ...trpc.organization.get.queryOptions({ organizationId: organizationId ?? '' }),
    enabled: !!organizationId,
  });
  const organization = organizationData ?? initialOrganization;

  // Subscribe to projects query for reactive updates
  const { data: projectsData } = useQuery({
    ...trpc.project.listByOrg.queryOptions({ organizationId: organizationId ?? '' }),
    enabled: !!organizationId,
  });
  const projects = projectsData ?? initialProjects ?? [];

  const session = sessionContext?.session;
  const orgList = organizations ?? [];
  // Type assertion to fix type mismatch between ProjectEntity and SelectorProject
  const projectList = (projects ?? []) as LayoutProjectSelectorProps['projects'];
  const activeOrganization = organization ?? null;

  const user: SidebarUser | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: null,
      }
    : null;

  const currentPath = routerState.location.pathname;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get projectId from URL if on project-scoped route
  const matchWithProject = routerState.matches.find(
    (match) => "projectId" in match.params
  );
  const projectId = matchWithProject && 'projectId' in matchWithProject.params 
    ? String(matchWithProject.params.projectId) 
    : undefined;

  // Build navigation items based on current organization and project
  const navigationItems = buildNavigationItems(activeOrganization, projectId);

  // Auto-close mobile menu on navigation
  useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", () => {
      setIsMobileMenuOpen(false);
    });
    return unsubscribe;
  }, [router]);

  const fallbackText = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "U";

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden lg:flex lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar",
          isCollapsed ? "lg:w-16" : "lg:w-64",
          "transition-all duration-300 ease-in-out",
          className
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          {!isCollapsed && (
            <div className="flex flex-1 items-center gap-3 overflow-hidden">
              <div className="min-w-0 flex-1">
                <LayoutProjectSelector
                  align="start"
                  projects={projectList}
                  organizations={orgList}
                  tenant={activeOrganization}
                  activeProjectId={projectId}
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
              const isActive = currentPath.startsWith(item.href);

              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    isCollapsed && "px-2 justify-center",
                    isActive && "bg-primary text-primary-foreground shadow-sm",
                    !isActive &&
                      "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => navigate({ to: item.href })}
                  data-tour={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{item.name}</span>
                      {item.name === "Servers" && (
                        <NotificationIndicator
                          activeOrganizationId={session?.activeOrganizationId}
                        />
                      )}
                    </>
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-border p-4 space-y-2">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50",
              isCollapsed && "justify-center"
            )}
            data-tour="user-menu"
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
              <AccountDialog user={user}>
                <Button variant="ghost" size="icon" className="p-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user?.image || undefined}
                      alt={user?.name || "User"}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {fallbackText}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </AccountDialog>
            )}
          </div>
          {/* Build Version */}
          {!isCollapsed && (
            <div className="px-3 text-center">
              <span className="text-[10px] text-muted-foreground/70 font-mono">
                {import.meta.env.VITE_BUILD_VERSION || "dev"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Backdrop Overlay */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          "lg:hidden fixed bottom-0 left-0 right-0 top-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity",
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      />

      {/* Mobile Sliding Sidebar */}
      <div
        className={cn(
          "lg:hidden fixed left-0 top-0 z-40 flex h-dvh w-56 flex-col border-r border-border bg-background transition-transform",
          "-translate-x-56",
          isMobileMenuOpen && "translate-x-0"
        )}
      >
        {/* Toggle Button */}
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="h-10 w-10 bg-background"
          >
            {routerState.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isMobileMenuOpen ? (
              <XIcon className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Header */}
        <div className="flex h-16 items-center px-6 border-b border-border">
          <div className="flex flex-1 items-center gap-3 overflow-hidden">
            <div className="min-w-0 flex-1">
              <LayoutProjectSelector
                align="start"
                projects={projectList}
                organizations={orgList}
                tenant={activeOrganization}
                activeProjectId={projectId}
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="px-3 py-4">
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = currentPath.startsWith(item.href);

              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    isActive && "bg-primary text-primary-foreground shadow-sm",
                    !isActive &&
                      "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => navigate({ to: item.href })}
                  data-tour={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.name}</span>
                  {item.name === "Servers" && (
                    <NotificationIndicator
                      activeOrganizationId={session?.activeOrganizationId}
                    />
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User Profile */}
        <div className="mt-auto border-t border-border p-4 space-y-2">
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50"
            data-tour="user-menu"
          >
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
              {import.meta.env.VITE_BUILD_VERSION || "dev"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
