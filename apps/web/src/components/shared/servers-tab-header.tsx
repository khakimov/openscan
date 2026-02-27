import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { PlusIcon, Radar } from "lucide-react";
import { pushModal } from "@/modals";

/**
 * Shared header for servers routes (discovery/verified tabs)
 * Used by both live components and pending shells to ensure consistency
 */
interface ServersTabHeaderProps {
  organizationId: string;
  projectId: string;
  /** Count of found servers (discovery tab) */
  foundCount?: number;
  /** Count of monitored servers (verified tab) */
  monitoredCount?: number;
  /** If true, buttons are disabled (used in pending state) */
  disabled?: boolean;
  /** Optional callbacks for pending state (can be no-ops) */
  onAddDevice?: () => void;
  onStartDiscovery?: () => void;
  /** Show action buttons (only on discovery tab) */
  showActions?: boolean;
}

export function ServersTabHeader({
  organizationId,
  projectId,
  foundCount,
  monitoredCount,
  disabled = false,
  onAddDevice,
  onStartDiscovery,
  showActions = false,
}: ServersTabHeaderProps) {
  const handleAddDevice = () => {
    if (onAddDevice) {
      onAddDevice();
    } else {
      pushModal("AddDevice", {});
    }
  };

  const handleStartDiscovery = () => {
    if (onStartDiscovery) {
      onStartDiscovery();
    } else {
      pushModal("AddDiscovery", {});
    }
  };

  return (
    <>
      {/* Mobile: Action buttons positioned at top right (same level as menu button) */}
      {showActions && (
        <div className="lg:hidden fixed top-2 right-2 z-30 flex gap-2">
          <Button onClick={handleAddDevice} disabled={disabled} size="icon" variant="outline" className="bg-background">
            <PlusIcon className="h-4 w-4" />
          </Button>
          <Button onClick={handleStartDiscovery} disabled={disabled} size="icon" variant="outline" className="bg-background">
            <Radar className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs with desktop action buttons */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/discovery"
              params={{ organizationId, projectId }}
            >
              Discovery
              {foundCount !== undefined && (
                <span className="ml-2 text-sm text-muted-foreground/70">({foundCount})</span>
              )}
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/verified"
              params={{ organizationId, projectId }}
            >
              Monitored Servers
              {monitoredCount !== undefined && (
                <span className="ml-2 text-sm text-muted-foreground/70">({monitoredCount})</span>
              )}
            </PageTabsLink>
          </PageTabs>
        </div>
        {showActions && (
          <div className="hidden lg:flex gap-2">
            <Button onClick={handleAddDevice} disabled={disabled} data-tour="add-server-btn">
              <PlusIcon className="h-4 w-4" />
              Add Servers
            </Button>
            <Button onClick={handleStartDiscovery} disabled={disabled} data-tour="start-discovery-btn">
              <Radar className="h-4 w-4" />
              Start Discovery
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
