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
  const [target, setTarget] = useState(propTarget || "");
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(
    propScanId || null,
  );
  const [selectedResults, setSelectedResults] = useState<Set<string>>(
    new Set(),
  );

  // Query client for cache updates
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
  const { data: workflowResults, isFetching: isFetchingResults } = useQuery(
    discoveryQueries.workflowResults(scanId!, workflowStatus?.isCompleted === true)
  );

  // Derive UI state from React Query data
  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  // Derived state: Show as running if we have a scanId but it's not completed/failed yet
  // This bridges the gap between mutation completing and polling picking up status
  // Also show as running while fetching results (eliminates lag between completion and table render)
  const showAsRunning = isRunning || (scanId !== null && !isCompleted && !isFailed) || isFetchingResults;

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
            setScanId(result.scanId); // This triggers showAsRunning immediately
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
        onSuccess: (response) => {
          // 1. Append new devices to Discovery tab cache (instant display)
          queryClient.setQueryData(
            ['devices', ['CANDIDATE', 'EXCLUDED']], // Discovery tab query key
            (old: any) => {
              if (!old?.items) return old;

              return {
                ...old,
                items: [...response.devices, ...old.items], // Prepend new devices
                totalItems: old.totalItems + response.devices.length,
              };
            }
          );

          // 2. Notify parent of newly added device IDs (for animation)
          if (onDevicesAdded && response.devices) {
            const deviceIds = response.devices.map((d: any) => d.id);
            onDevicesAdded(deviceIds);
          }

          // 3. Close modal (devices already visible in cache)
          popModal("AddDiscovery");

          // 4. Show success toast
          toast.success("Devices created successfully", {
            description: `${response.count} device${response.count !== 1 ? 's' : ''} added to inventory`,
          });
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
            disabled={showAsRunning || startDiscoveryMutation.isPending}
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
                startDiscoveryMutation.isPending || showAsRunning
              }
              className="flex-1"
            >
              {startDiscoveryMutation.isPending ? (
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