import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { Loader2 } from "lucide-react";
import { DiscoveryLoading } from "@/components/shared/discovery-loading";
import { DiscoveryResultsTable } from "@/components/discovery/discovery-results-table";
import { useAppParams } from "@/hooks/use-app-params";
import { useDiscoveryWorkflow } from "@/features/discovery/hooks/use-discovery-workflow";

interface AddDiscoveryProps {
  onConfirm?: (target: string) => void;
  onDevicesAdded?: (deviceIds: string[]) => void; // Callback with newly created device IDs
  scanId?: string;
  target?: string;
}

export default function AddDiscovery({
  onConfirm,
  onDevicesAdded,
  scanId: propScanId,
  target: propTarget,
}: AddDiscoveryProps) {
  // Get projectId from URL params
  const params = useAppParams();
  const projectId = params.projectId;

  // Use shared discovery workflow hook
  const {
    target,
    setTarget,
    error,
    selectedResults,
    setSelectedResults,
    showAsRunning,
    isCompleted,
    isFailed,
    discoveryItems,
    results,
    isStarting,
    isAddingDevices,
    handleStartDiscovery: startDiscovery,
    handleAddDevices: addDevices,
  } = useDiscoveryWorkflow({
    projectId,
    initialScanId: propScanId,
    initialTarget: propTarget,
    onDiscoveryStarted: onConfirm,
    onDevicesAdded: (deviceIds) => {
      // Notify parent of newly added device IDs (for animation)
      // Cache invalidation is handled by the mutation helper automatically
      onDevicesAdded?.(deviceIds);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startDiscovery();
  };

  const handleCancel = () => {
    popModal("AddDiscovery");
  };

  const handleAddDevicesClick = () => {
    // Start adding devices - this shows a loading toast immediately
    // and returns a promise we don't need to await
    addDevices();
    
    // Close modal immediately for better UX
    // The toast will show progress and update when complete
    popModal("AddDiscovery");
  };

  return (
    <ModalContent
      className={results ? "max-w-2xl" : "max-w-md"}
      hideCloseButton
    >
      <ModalHeader
        title={
          showAsRunning
            ? "Discovery Running..."
            : isCompleted && results
              ? "Select Discovery Results"
              : "Start Discovery"
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="target">Where do you want to start?</Label>
          <Input
            id="target"
            type="text"
            placeholder="example.com or subdomain.example.com"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={showAsRunning || isStarting}
            autoFocus
          />
        </div>

        {/* Show loading component when workflow is running */}
        {showAsRunning && (
          <div className="py-8">
            <DiscoveryLoading size="md" />
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400">
            {error}
          </div>
        )}

        {isFailed && (
          <div className="p-3 text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-md">
            Discovery workflow failed. Please check the logs.
          </div>
        )}

        {results && discoveryItems.length > 0 && (
          <div className="space-y-4">
            <DiscoveryResultsTable
              items={discoveryItems}
              selectedHosts={selectedResults}
              onSelectionChange={setSelectedResults}
              targetDomain={results.request.target}
            />

            <div className="p-3 text-sm text-blue-400 bg-blue-950/20 border border-blue-900/20 rounded-md">
              Selected targets will be created as devices in your inventory with "discovery" and "subdomain" tags.
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isStarting}
            className="flex-1"
          >
            Cancel
          </Button>
          {isCompleted && results ? (
            <Button
              type="button"
              onClick={handleAddDevicesClick}
              disabled={
                isAddingDevices ||
                selectedResults.size === 0
              }
              className="flex-1"
            >
              {isAddingDevices ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding to Inventory...
                </>
              ) : (
                `Add ${selectedResults.size} Target${selectedResults.size !== 1 ? 's' : ''} to Inventory`
              )}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={
                isStarting || showAsRunning
              }
              className="flex-1"
            >
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : showAsRunning ? (
                "Running Discovery..."
              ) : (
                "Start Discovery"
              )}
            </Button>
          )}
        </div>
      </form>
    </ModalContent>
  );
}