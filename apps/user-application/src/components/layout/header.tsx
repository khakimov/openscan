import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface HeaderProps {
  className?: string;
  onMobileMenuToggle?: () => void;
  activeOrganizationId?: string | null;
}

export function Header({ className, onMobileMenuToggle, activeOrganizationId }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b border-border bg-background px-6",
        className,
      )}
    >
      {/* Left side - Mobile menu button and search */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMobileMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Right side - Notification bell */}
      <div className="flex items-center gap-2">
        <NotificationBell activeOrganizationId={activeOrganizationId} />
      </div>
    </header>
  );
}
