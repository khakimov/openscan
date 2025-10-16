import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutProjectSelector } from "@/components/layout/layout-project-selector";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getOnboardingStatus } from "@/server/organization";
import { QUERY_CONFIG } from "@repo/constants";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Menu, Shield, ScanLine } from "lucide-react";
import { useMemo, useState } from "react";
import { AccountDialog } from "@/components/auth/account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavigationItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string | number;
}

const navigationItems: NavigationItem[] = [
  {
    name: "Dashboard",
    icon: Home,
    href: "/dashboard",
  },
  {
    name: "Assets",
    icon: Shield,
    href: "/assets",
  },
  {
    name: "Scans",
    icon: ScanLine,
    href: "/scans",
  },
];

interface SidebarProps {
  className?: string;
}

interface OrganizationOption {
  id: string;
  name?: string | null;
  slug?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ProjectOption {
  id: string;
  name?: string | null;
  description?: string | null;
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: sessionData } = authClient.useSession();
  const { data: activeOrganization, isPending: isActiveOrganizationPending } =
    authClient.useActiveOrganization();
  const { data: organizationList, isPending: isOrganizationsPending } =
    authClient.useListOrganizations();
  const { data: onboardingStatus, isPending: isOnboardingPending } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => getOnboardingStatus(),
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });

  const { data: session } = authClient.useSession();

  const user = session?.user;
  const fallbackText = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "U";

  const organizations = useMemo<OrganizationOption[]>(() => {
    const normalized: OrganizationOption[] = (organizationList ?? []).map((organization) => ({
      id: organization.id,
      name: organization.name ?? "Unnamed organization",
      slug: organization.slug ?? null,
      metadata:
        typeof organization.metadata === "object" &&
        organization.metadata !== null
          ? (organization.metadata as Record<string, unknown>)
          : null,
    }));

    const onboardingOrg = onboardingStatus?.organization;
    if (onboardingOrg) {
      const onboardingOrgId =
        typeof onboardingOrg.id === "string" && onboardingOrg.id.length > 0
          ? onboardingOrg.id
          : null;

      if (!onboardingOrgId) {
        return normalized;
      }

      const exists = normalized.some((org) => org.id === onboardingOrgId);
      if (!exists) {
        normalized.push({
          id: onboardingOrgId,
          name: onboardingOrg.name ?? "Unnamed organization",
          slug:
            "slug" in onboardingOrg && typeof onboardingOrg.slug === "string"
              ? onboardingOrg.slug
              : null,
          metadata:
            typeof onboardingOrg.metadata === "object" &&
            onboardingOrg.metadata !== null
              ? (onboardingOrg.metadata as Record<string, unknown>)
              : null,
        });
      }
    }

    return normalized;
  }, [organizationList, onboardingStatus?.organization]);

  const normalizedActiveOrganization = useMemo(() => {
    if (activeOrganization) {
      return {
        id: activeOrganization.id,
        name: activeOrganization.name ?? "Unnamed organization",
        slug: activeOrganization.slug ?? null,
        metadata:
          typeof activeOrganization.metadata === "object" &&
          activeOrganization.metadata !== null
            ? (activeOrganization.metadata as Record<string, unknown>)
            : null,
      } as OrganizationOption;
    }

    const onboardingOrg = onboardingStatus?.organization;
    if (onboardingOrg) {
      return {
        id: onboardingOrg.id,
        name: onboardingOrg.name ?? "Unnamed organization",
        slug:
          "slug" in onboardingOrg && typeof onboardingOrg.slug === "string"
            ? onboardingOrg.slug
            : null,
        metadata:
          typeof onboardingOrg.metadata === "object" &&
          onboardingOrg.metadata !== null
            ? (onboardingOrg.metadata as Record<string, unknown>)
            : null,
      } as OrganizationOption;
    }

    return null;
  }, [activeOrganization, onboardingStatus?.organization]);

  const sessionOrganizationId =
    sessionData?.session?.activeOrganizationId ?? null;

  const fallbackOrganization = useMemo(() => {
    if (!sessionOrganizationId) {
      return organizations[0] ?? null;
    }

    return (
      organizations.find((org) => org.id === sessionOrganizationId) ??
      organizations[0] ??
      null
    );
  }, [organizations, sessionOrganizationId]);

  const tenant = normalizedActiveOrganization ?? fallbackOrganization ?? null;

  const tenantProjects = useMemo<ProjectOption[]>(() => {
    const onboardingProject = onboardingStatus?.project;
    if (onboardingProject) {
      return [
        {
          id: onboardingProject.id,
          name: onboardingProject.name ?? "Untitled project",
          description:
            typeof onboardingProject.domain === "string"
              ? onboardingProject.domain
              : null,
        },
      ];
    }

    if (!tenant) {
      return [];
    }

    const metadataProjects = Array.isArray(
      (tenant.metadata as { projects?: unknown[] } | undefined)?.projects,
    )
      ? ((
          tenant.metadata as
            | {
                projects?: Array<{
                  id: string;
                  name?: string | null;
                  description?: string | null;
                }>;
              }
            | undefined
        )?.projects ?? [])
      : [];

    if (metadataProjects.length > 0) {
      return metadataProjects
        .filter(
          (
            project,
          ): project is {
            id: string;
            name?: string | null;
            description?: string | null;
          } => {
            return Boolean(
              project && typeof project === "object" && "id" in project,
            );
          },
        )
        .map((project) => ({
          id: project.id,
          name: project.name ?? "Untitled project",
          description: project.description ?? null,
        }));
    }

    return [
      {
        id: tenant.id,
        name: tenant.name ?? "Untitled project",
        description: null,
      },
    ];
  }, [onboardingStatus?.project, tenant]);

  const isSelectorLoading =
    isActiveOrganizationPending ||
    isOrganizationsPending ||
    isOnboardingPending;

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
                  projects={tenantProjects}
                  organizations={organizations}
                  tenant={tenant}
                  isLoading={isSelectorLoading}
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
              const isActive =
                currentPath === item.href ||
                (item.href !== "/dashboard" &&
                  currentPath.startsWith(item.href));

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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              U
            </div>
            {!isCollapsed && (
              <AccountDialog>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 px-3"
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
                  <div className="hidden sm:flex flex-col items-start">
                    <span className="text-sm font-medium">
                      {user?.name || "User"}
                    </span>
                  </div>
                </Button>
              </AccountDialog>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div className="lg:hidden">
        {/* Mobile implementation can be added here with a sheet/drawer */}
      </div>
    </>
  );
}
