import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutProjectSelector } from "@/components/layout/layout-project-selector";
import { cn } from "@/lib/utils";
import { useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { Home, Menu, Shield, ScanLine, XIcon } from "lucide-react";
import { useState, useEffect } from "react";
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
  projects: SidebarProject[];
}

export function Sidebar({
  className,
  user,
  activeOrganization,
  organizations,
  projects,
}: SidebarProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fallbackText = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "U";

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
                  tenant={activeOrganization}
                  isLoading={false}
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
            {!isCollapsed && (
              <AccountDialog>
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
          "lg:hidden fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border bg-background transition-transform",
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
                isLoading={false}
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
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
                    isActive && "bg-primary text-primary-foreground shadow-sm",
                    !isActive &&
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                  onClick={() => navigate({ to: item.href })}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.name}</span>
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

        {/* User Profile */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50">
            <AccountDialog>
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
        </div>
      </div>
    </>
  );
}
