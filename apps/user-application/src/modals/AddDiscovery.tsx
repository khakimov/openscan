import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DiscoveryLoading } from "@/components/shared/discovery-loading";
import {
  discoveryQueries,
  useStartDiscoveryMutation,
} from "@/queries/discovery-queries";
import { useCreateDevicesFromDiscoveryMutation } from "@/queries/device-queries";
import { DiscoveryResultsTable } from "@/components/discovery/discovery-results-table";
import type { DiscoveryResultItem } from "@/components/discovery/discovery-results-table";

interface AddDiscoveryProps {
  onConfirm?: (target: string) => void;
  scanId?: string;
  target?: string;
}

export default function AddDiscovery({
  onConfirm,
  scanId: propScanId,
  target: propTarget,
}: AddDiscoveryProps) {
  const [target, setTarget] = useState(propTarget || "");
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(
    propScanId || null,
  );
  const [selectedResults, setSelectedResults] = useState<Set<string>>(
    new Set(),
  );

  const queryClient = useQueryClient();

  // Mutation for adding discovered targets as devices (using centralized hook)
  const addDevicesMutation = useCreateDevicesFromDiscoveryMutation();

  // Mutation for starting discovery workflow (using centralized hook)
  const startDiscoveryMutation = useStartDiscoveryMutation();

  // Database polling for workflow status (postback updates database)
  const { data: workflowStatus } = useQuery(
    discoveryQueries.workflowStatus(scanId!)
  );

  // Automatically fetch results from database when workflow completes
  const { data: workflowResults } = useQuery(
    discoveryQueries.workflowResults(scanId!, workflowStatus?.isCompleted === true)
  );

  // Derive UI state from React Query data
  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  // Get discovery items (either from results array or uniqueSubdomains), filter out items without IP
  const discoveryItems: DiscoveryResultItem[] = results
    ? (results.results?.[0]?.results?.filter((r: any) => r.ip).map((r: any) => ({
          host: r.host,
          ip: r.ip,
        })) ||
        results.uniqueSubdomains.filter((s: any) => s.ip).map((s: any) => ({
          host: s.subdomain,
          ip: s.ip,
        })))
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTarget = target.trim().toLowerCase();

    // Basic validation
    if (!trimmedTarget) {
      setError("Please enter a domain name");
      return;
    }

    // Domain validation regex - only allows valid domain characters
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

    if (!domainRegex.test(trimmedTarget)) {
      setError("Please enter a valid domain name (e.g., example.com)");
      return;
    }

    // Check for localhost and internal domains
    const blockedDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'local',
      'internal',
      '.local',
      '.internal',
      '.localdomain',
      '.localhost'
    ];

    if (blockedDomains.some(blocked =>
      trimmedTarget === blocked ||
      trimmedTarget.endsWith(blocked) ||
      trimmedTarget.includes('localhost') ||
      trimmedTarget.includes('127.0.0.1')
    )) {
      setError("Cannot scan internal or localhost domains");
      return;
    }

    // Check for common command injection patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]<>\\]/,  // Shell metacharacters
      /\.\./,                 // Directory traversal
      /^-/,                   // Command flags
    ];

    if (dangerousPatterns.some(pattern => pattern.test(trimmedTarget))) {
      setError("Invalid characters detected in domain name");
      return;
    }

    // Additional length check
    if (trimmedTarget.length > 253) {  // Max domain length per RFC
      setError("Domain name is too long");
      return;
    }

    setError(null);
    startDiscoveryMutation.mutate(
      { target: trimmedTarget },
      {
        onSuccess: (result) => {
          if (result.success) {
            setError(null);
            setScanId(result.scanId);
            toast.success(`Discovery started for ${trimmedTarget}`, {
              description: "You will be notified when results are ready",
            });
            onConfirm?.(trimmedTarget);
          } else {
            setError(result.error || "Failed to start discovery");
          }
        },
        onError: (error: any) => {
          setError(error instanceof Error ? error.message : "Failed to start discovery");
        },
      }
    );
  };

  const handleCancel = () => {
    popModal("AddDiscovery");
  };

  const handleAddDevices = () => {
    const selectedTargets = Array.from(selectedResults);

    if (selectedTargets.length === 0) {
      toast.error("Please select at least one target");
      return;
    }

    // Extract hostname and IP data from normalized discovery items
    const targetsData = selectedTargets.map(host => {
      const item = discoveryItems.find((item) => item.host === host);
      return {
        host,
        ip: item?.ip // Include IP if resolved during discovery
      };
    });

    addDevicesMutation.mutate(
      { targets: targetsData },
      {
        onSuccess: async (response) => {
          // Wait for device list to refetch before closing modal
          // This ensures user sees devices immediately when modal closes
          await queryClient.refetchQueries({ queryKey: ['devices'] });

          toast.success("Devices created successfully", {
            description: `${response.count} device${response.count !== 1 ? 's' : ''} added to inventory`,
          });
          popModal("AddDiscovery");
        },
        onError: (error: any) => {
          toast.error("Failed to create devices", {
            description: error instanceof Error ? error.message : "Please try again",
          });
        },
      }
    );
  };

  return (
    <ModalContent
      className={results ? "max-w-2xl" : "max-w-md"}
      hideCloseButton
    >
      <ModalHeader
        title={
          isRunning
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
            disabled={isRunning || startDiscoveryMutation.isPending}
            autoFocus
          />
        </div>

        {/* Show loading component when workflow is running */}
        {isRunning && (
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
            disabled={startDiscoveryMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          {isCompleted && results ? (
            <Button
              type="button"
              onClick={handleAddDevices}
              disabled={
                addDevicesMutation.isPending ||
                selectedResults.size === 0
              }
              className="flex-1"
            >
              {addDevicesMutation.isPending ? (
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
                startDiscoveryMutation.isPending || isRunning
              }
              className="flex-1"
            >
              {startDiscoveryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : isRunning ? (
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