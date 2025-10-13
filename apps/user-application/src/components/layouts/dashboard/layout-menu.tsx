import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { UserSettingsDialog } from "@/features/settings";

import {
  BanknoteIcon,
  ChartLineIcon,
  DollarSignIcon,
  GanttChartIcon,
  Globe2Icon,
  HeartHandshakeIcon,
  LayersIcon,
  LayoutPanelTopIcon,
  LogOutIcon,
  HelpCircleIcon,
  PlusIcon,
  ScanEyeIcon,
  ServerIcon,
  SettingsIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UsersIcon,
  WallpaperIcon,
} from "lucide-react";
import { ProjectLink } from "@/components/navigation/links";

type BadgeConfig = {
  count: number | string;
  variant?: "orange" | "red" | "blue" | "green";
  showZero?: boolean;
};

function LinkWithIcon({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
  badge?: BadgeConfig | number;
}) {
  const location = useLocation();
  const active =
    overrideActive !== undefined ? overrideActive : href === location.pathname;
  return (
    <ProjectLink
      className={cn(
        "text-foreground flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-slate-100 dark:hover:bg-neutral-800",
        active && "bg-slate-100 dark:bg-neutral-800",
        className,
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
      {(() => {
        if (!badge) return null;

        // Handle simple number format (backwards compatible)
        if (typeof badge === "number") {
          return badge > 0 ? (
            <Badge variant="orange" className="ml-auto">
              {badge}
            </Badge>
          ) : null;
        }

        // Handle object format
        const { count, variant = "orange", showZero = false } = badge;
        const shouldShow =
          showZero || (typeof count === "number" ? count > 0 : true);

        return shouldShow ? (
          <Badge variant={variant} className="ml-auto">
            {count}
          </Badge>
        ) : null;
      })()}
    </ProjectLink>
  );
}

interface LayoutMenuProps {
  dashboards?: any[];
  organization?: any;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    tenantId?: string;
  } | null;
}

export default function LayoutMenu({ user: userProp }: LayoutMenuProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Extract user data for settings dialog
  const user = userProp ? {
    firstName: userProp.firstName || userProp.email.split('@')[0],
    lastName: userProp.lastName || "",
    email: userProp.email,
    role: userProp.role || "viewer",
    photo: "",
  } : {
    firstName: "Admin",
    lastName: "Test",
    email: "admin@acme.local",
    role: "admin",
    photo: "",
  };

  return (
    <>
      <LinkWithIcon icon={WallpaperIcon} label="Overview" href={"/"} />
      <LinkWithIcon
        icon={ShieldAlertIcon}
        label="Vulnerabilities"
        href={"/results"}
      />

      <LinkWithIcon
        icon={LayersIcon}
        label="Scans"
        href={"/scans"}
        badge={{ count: "1", variant: "gray" }}
      />
      <LinkWithIcon icon={Globe2Icon} label="Assets" href={"/assets"} />
      <div className="mt-auto w-full ">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className={cn(
            "text-foreground flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-slate-100 dark:hover:bg-neutral-800 w-full text-left",
            "text-sm text-gray-400",
          )}
        >
          <SettingsIcon size={20} />
          <div className="flex-1">Settings</div>
        </button>

        <UserSettingsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          user={user}
        />

        <LinkWithIcon
          className="text-sm text-gray-400"
          icon={HelpCircleIcon}
          label="Help"
          href={"/help"}
        />
        <LinkWithIcon
          className="text-sm text-gray-400"
          icon={LogOutIcon}
          label="Logout"
          href={"/logout"}
        />
      </div>
    </>
  );
}
