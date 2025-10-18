import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  startDiscoveryWorkflow,
  getWorkflowStatus,
  getWorkflowResult,
} from "@/server/discovery";
import { createDevicesFromDiscovery } from "@/server/devices";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { DiscoveryLoading } from "@/components/shared/discovery-loading";
import { QUERY_CONFIG } from "@repo/constants";

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

  const router = useRouter();
  const queryClient = useQueryClient();

  // Mutation for adding discovered targets as devices
  const addDevicesMutation = useMutation({
    mutationFn: async () => {
      const selectedTargets = Array.from(selectedResults);
      console.log('addDevicesMutation called with selected targets:', selectedTargets);

      if (selectedTargets.length === 0) {
        console.error('No targets selected for device creation');
        throw new Error("Please select at least one target");
      }

      // Extract hostname and IP data from discovery results
      const targetsData = selectedTargets.map(host => {
        const result = results?.results?.[0]?.results?.find((r: any) => r.host === host);
        const targetData = {
          host,
          ip: result?.ip // Include IP if resolved during discovery
        };
        console.log('Processing target:', { host, foundResult: !!result, ip: result?.ip });
        return targetData;
      });

      console.log('Final targets data for creation:', targetsData);
      console.log('Calling createDevicesFromDiscovery with data:', { targets: targetsData });

      return createDevicesFromDiscovery({ data: { targets: targetsData } });
    },
    onSuccess: async (response) => {
      toast.success("Devices created successfully", {
        description: `${response.count} device${response.count !== 1 ? 's' : ''} added to inventory`,
      });

      // Refresh device list using TanStack Start RC patterns
      queryClient.removeQueries({ queryKey: ['devices'] });
      await router.invalidate();

      popModal("AddDiscovery");
    },
    onError: (error: any) => {
      toast.error("Failed to create devices", {
        description: error.message || "Please try again",
      });
    },
  });

  // Mutation for starting discovery workflow
  const startDiscoveryMutation = useMutation({
    mutationFn: async (target: string) => {
      return startDiscoveryWorkflow({ data: { target } });
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate scans query in case discovery triggers scans
        queryClient.invalidateQueries({ queryKey: ['scans'] });

        setError(null);
        setScanId(result.scanId);
        toast.success(`Discovery started for ${target}`, {
          description: "You will be notified when results are ready",
        });
        onConfirm?.(target);
      } else {
        setError(result.error || "Failed to start discovery");
      }
    },
    onError: (error: any) => {
      setError(error.message || "Failed to start discovery");
    },
  });

  // Smart polling for workflow status (reduced frequency with postback architecture)
  const { data: workflowStatus } = useQuery({
    queryKey: ["workflow-status", scanId],
    queryFn: () => getWorkflowStatus({ data: { scanId: scanId! } }),
    enabled: !!scanId,
    refetchInterval: (query) => {
      // Stop polling when workflow is complete or failed
      const data = query.state.data;
      if (data?.isCompleted || data?.isFailed) {
        return false;
      }
      // Poll every 15 seconds (postback notifies server immediately, this is just UI sync)
      return QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_15;
    },
  });

  // Automatically fetch results when workflow completes
  const { data: workflowResults } = useQuery({
    queryKey: ["workflow-results", scanId],
    queryFn: () => getWorkflowResult({ data: { scanId: scanId! } }),
    enabled: workflowStatus?.isCompleted === true,
  });

  // Derive UI state from React Query data
  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

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
    startDiscoveryMutation.mutate(trimmedTarget);
  };

  const handleCancel = () => {
    popModal("AddDiscovery");
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

        {results && (
          <div className="space-y-4">
            {(results.results?.[0]?.results?.length > 0 ||
              results.uniqueSubdomains.length > 0) && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  {results.request.target} ({results.results?.[0]?.results?.length || results.uniqueSubdomains.length} subdomains discovered)
                </div>
                <div className="max-h-96 overflow-y-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-black text-white">
                      <tr>
                        <th className="h-8 px-4 text-left">
                          <Checkbox
                            id="select-all"
                            checked={
                              selectedResults.size ===
                              (results.results?.[0]?.results?.length ||
                                results.uniqueSubdomains.length)
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const allHosts =
                                  results.results?.[0]?.results?.map((r: { host: string; ip: string }) => r.host) ||
                                  results.uniqueSubdomains.map((s: { subdomain: string; ip: string }) => s.subdomain);
                                setSelectedResults(new Set(allHosts));
                              } else {
                                setSelectedResults(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="h-8 px-4 text-left font-semibold">Subdomain</th>
                        <th className="h-8 px-4 text-left font-semibold">IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        results.results?.[0]?.results ||
                        results.uniqueSubdomains.map((s: { subdomain: string; ip: string }) => ({ host: s.subdomain, ip: s.ip || '' }))
                      ).map((item: any, index: number) => {
                        const host = typeof item === "string" ? item : (item.host || item.subdomain);
                        const ip = typeof item === "object" ? (item.ip || '') : '';
                        const isSelected = selectedResults.has(host);

                        return (
                          <tr key={index} className="border-t border-slate-700 hover:bg-slate-700/50">
                            <td className="px-4 py-3">
                              <Checkbox
                                id={`result-${index}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedResults);
                                  if (checked) {
                                    newSelected.add(host);
                                  } else {
                                    newSelected.delete(host);
                                  }
                                  setSelectedResults(newSelected);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-slate-100">{host}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-slate-400">
                                {ip || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {selectedResults.size > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedResults.size} subdomain{selectedResults.size !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

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
              onClick={() => addDevicesMutation.mutate()}
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