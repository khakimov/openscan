import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { pushModal } from "@/modals";

/**
 * Shared header for assets routes (discovery/verified tabs)
 * Used by both live components and pending shells to ensure consistency
 */
interface AssetsTabHeaderProps {
  organizationId: string;
  projectId: string;
  activeTab: "discovery" | "verified";
  /** If true, buttons are disabled (used in pending state) */
  disabled?: boolean;
  /** Optional callbacks for pending state (can be no-ops) */
  onAddDevice?: () => void;
  onStartDiscovery?: () => void;
}

export function AssetsTabHeader({
  organizationId,
  projectId,
  activeTab,
  disabled = false,
  onAddDevice,
  onStartDiscovery,
}: AssetsTabHeaderProps) {
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
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center">
        <PageTabs>
          <PageTabsLink
            to="/$organizationId/$projectId/assets/discovery"
            params={{ organizationId, projectId }}
            isActive={activeTab === "discovery"}
          >
            Discovery
          </PageTabsLink>
          <PageTabsLink
            to="/$organizationId/$projectId/assets/verified"
            params={{ organizationId, projectId }}
            isActive={activeTab === "verified"}
          >
            Verified
          </PageTabsLink>
        </PageTabs>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleAddDevice} disabled={disabled}>
          <PlusIcon />
          <span className="max-sm:hidden">Add Device</span>
        </Button>
        <Button onClick={handleStartDiscovery} disabled={disabled}>
          <PlusIcon />
          <span className="max-sm:hidden">Start Discovery</span>
        </Button>
      </div>
    </div>
  );
}
