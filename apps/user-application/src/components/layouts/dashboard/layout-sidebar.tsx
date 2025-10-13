import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { MenuIcon, XIcon } from "lucide-react";
import { LogoSquare } from "@/components/branding/logo";
import { Link } from "@tanstack/react-router";
import LayoutProjectSelector from "./layout-project-selector";
import LayoutMenu from "./layout-menu";

interface LayoutSidebarProps {
  organizationId: string;
  projectId: string;
  organizations: any[];
  projects: any[];
  dashboards: any[];
  user?: any;
  tenant?: any;
}

export function LayoutSidebar({
  organizationId,
  projectId,
  organizations,
  projects,
  dashboards,
  user,
  tenant,
}: LayoutSidebarProps) {
  const [active, setActive] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setActive(false)}
        className={cn(
          "fixed bottom-0 left-0 right-0 top-0 z-40 backdrop-blur-sm transition-opacity",
          active
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />
      <div
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-border bg-card transition-transform",
          "-translate-x-72 lg:-translate-x-0", // responsive
          active && "translate-x-0", // force active on mobile
        )}
      >
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Button
            size="icon"
            onClick={() => setActive((p) => !p)}
            variant={"outline"}
          >
            {active ? <XIcon size={16} /> : <MenuIcon size={16} />}
          </Button>
        </div>
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-4">
          <Link to="/">
            <LogoSquare className="max-h-8" />
          </Link>
          <LayoutProjectSelector
            align="start"
            projects={projects}
            organizations={organizations}
            tenant={tenant}
          />

          {/*<SettingsToggle />*/}
        </div>
        <div className="flex flex-grow flex-col gap-2 overflow-auto p-4">
          <LayoutMenu dashboards={dashboards} organization={tenant} user={user} />
        </div>
        <div className="fixed bottom-0 left-0 right-0">
          <div className="h-8 w-full bg-gradient-to-t from-card to-card/0" />
        </div>
      </div>
    </>
  );
}
