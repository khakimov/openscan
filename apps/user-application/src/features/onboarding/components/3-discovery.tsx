import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  startDiscoveryWorkflow,
  getWorkflowStatus,
  getWorkflowResult,
} from "@/server/discovery";
import { createDevicesFromDiscovery } from "@/server/devices";
import { completeOnboarding } from "@/server/organization";
import {
  OnboardingContentLayout,
  OnboardingDescription,
} from "@/components/onboarding/onboarding-layout";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { DiscoveryStatus } from "../types/discovery-status";
import { validateDomain } from "../utils/validators";
import { DiscoveryStatusCard } from "./DiscoveryStatusCard";
import { toast } from "sonner";
import { QUERY_CONFIG } from "@repo/constants";

interface OnboardingDiscoveryProps {
  projectId: string;
  organizationId: string | null;
  domain?: string;
  savedDevices?: Array<{ id: string; name: string; ip: string | null }>;
}

export function OnboardingDiscovery({
  projectId,
  organizationId,
  domain: initialDomain,
  savedDevices = [],
}: OnboardingDiscoveryProps) {
  const navigate = useNavigate();
  const [domain, setDomain] = useState(initialDomain || "");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [selectedSubdomains, setSelectedSubdomains] = useState<Set<string>>(
    new Set(),
  );

  // Smart polling for workflow status (reduced frequency with postback architecture)
  const { data: workflowStatus } = useQuery({
    queryKey: ["workflow-status", scanId],
    queryFn: () =>
      getWorkflowStatus({
        data: { scanId: scanId! },
      }),
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
    queryFn: () =>
      getWorkflowResult({
        data: { scanId: scanId! },
      }),
    enabled: workflowStatus?.isCompleted === true,
  });

  // Derive UI state from React Query data
  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  // Build discoveryStatus for DiscoveryStatusCard
  const discoveryStatus: DiscoveryStatus | null = scanId
    ? {
        scanId,
        status: isCompleted
          ? "COMPLETED"
          : isFailed
            ? "FAILED"
            : isRunning
              ? "RUNNING"
              : "UNKNOWN",
        message: isCompleted
          ? "Discovery completed successfully"
          : isRunning
            ? "Discovery is running..."
            : isFailed
              ? "Discovery workflow failed"
              : undefined,
        error: isFailed
          ? workflowStatus?.error || "Discovery workflow failed"
          : undefined,
        result: results || undefined,
      }
    : null;

  // Optimistic mutation for starting discovery
  const startDiscoveryMutation = useMutation({
    mutationFn: async (target: string) => {
      console.log(
        "[OnboardingDiscovery] Starting discovery workflow for domain:",
        target,
      );
      return startDiscoveryWorkflow({ data: { target } });
    },
    onSuccess: (discoveryResult) => {
      if (discoveryResult.success && discoveryResult.scanId) {
        // Set scanId - useQuery hooks will handle polling automatically
        setScanId(discoveryResult.scanId);
        console.log("[OnboardingDiscovery] Discovery started:", {
          scanId: discoveryResult.scanId,
        });
      } else {
        // Discovery failed to start
        setDomainError(discoveryResult.error || "Failed to start discovery");
        console.error(
          "[OnboardingDiscovery] Discovery failed to start:",
          discoveryResult.error,
        );
      }
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      console.error("[OnboardingDiscovery] Error:", err);
      setDomainError(errorMessage);
    },
  });

  const handleStartDiscovery = () => {
    // Validate domain
    const trimmedDomain = domain.trim();
    const validationError = validateDomain(trimmedDomain);

    if (validationError) {
      setDomainError(validationError);
      return;
    }

    setDomainError(null);
    // Clear previous selections when starting a new discovery
    setSelectedSubdomains(new Set());

    // Optimistic update: mutation.isPending becomes true immediately
    startDiscoveryMutation.mutate(trimmedDomain);
  };

  // Mutation for saving selected devices
  const saveDevicesMutation = useMutation({
    mutationFn: async () => {
      const selectedTargets = Array.from(selectedSubdomains);

      if (selectedTargets.length === 0) {
        throw new Error("Please select at least one subdomain");
      }

      // Extract hostname and IP data from typed discovery results
      const targetsData = selectedTargets.map((host) => {
        const subdomain = results?.uniqueSubdomains?.find(
          (s: { subdomain: string; ip: string }) => s.subdomain === host,
        );
        return {
          host,
          ip: subdomain?.ip, // Include IP if resolved during discovery
        };
      });

      return createDevicesFromDiscovery({
        data: {
          targets: targetsData,
          organizationId: organizationId || undefined,
          projectId,
          options: {
            source: "DISCOVERY",
            scope: "EXTERNAL",
            verificationStatus: "VERIFIED", // Simple approach - treat onboarding devices as verified
          },
        },
      });
    },
    onSuccess: async (response) => {
      toast.success("Assets added to inventory", {
        description: `${response.count} subdomain${response.count !== 1 ? "s" : ""} added successfully`,
      });

      // Mark onboarding as complete
      if (organizationId) {
        await completeOnboarding({ data: { organizationId } });
      }

      // Navigate to dashboard (onboarding complete)
      navigate({
        to: "/dashboard",
      });
    },
    onError: (error: any) => {
      toast.error("Failed to add assets", {
        description: error.message || "Please try again",
      });
    },
  });

  // Optimistic mutation for skipping discovery
  const skipDiscoveryMutation = useMutation({
    mutationFn: async () => {
      // Mark onboarding as complete before navigating
      if (organizationId) {
        return completeOnboarding({ data: { organizationId } });
      }
    },
    onSuccess: () => {
      // Skip discovery and go directly to dashboard (onboarding complete)
      navigate({
        to: "/dashboard",
      });
    },
  });

  const handleSkip = () => {
    // Optimistic update: mutation.isPending becomes true immediately
    skipDiscoveryMutation.mutate();
  };

  const handleContinue = () => {
    // Save selected devices before continuing
    saveDevicesMutation.mutate();
  };

  return (
    <OnboardingContentLayout
      title="Discover Your Infrastructure"
      description={
        <OnboardingDescription>
          Run subdomain discovery to find all assets related to your domain
        </OnboardingDescription>
      }
    >
      <div className="space-y-8 w-full max-w-2xl">
        {/* Already Saved Devices */}
        {savedDevices.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Already Saved Assets</h3>
              <span className="text-xs text-muted-foreground">
                {savedDevices.length} asset
                {savedDevices.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
              {savedDevices.map((device) => (
                <div
                  key={device.id}
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{device.name}</span>
                    {device.ip && (
                      <span className="text-xs text-muted-foreground">
                        {device.ip}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-green-600 font-medium">
                    Saved
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Domain Input */}
        <div className="space-y-2">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            placeholder="e.g., example.com"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setDomainError(null);
            }}
            disabled={startDiscoveryMutation.isPending || isRunning}
            aria-invalid={!!domainError}
          />
          {domainError && <p className="text-sm text-red-600">{domainError}</p>}
          <p className="text-xs text-muted-foreground">
            Auto-discovery will find subdomains and assets. You can also add a
            server manually later.
          </p>
        </div>

        {/* Action Buttons */}
        {!scanId && (
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              disabled={startDiscoveryMutation.isPending || skipDiscoveryMutation.isPending}
            >
              {skipDiscoveryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {skipDiscoveryMutation.isPending ? "Skipping..." : "Skip Discovery"}
            </Button>
            <Button
              type="button"
              onClick={handleStartDiscovery}
              disabled={startDiscoveryMutation.isPending || !domain.trim()}
            >
              {startDiscoveryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {startDiscoveryMutation.isPending ? "Starting..." : "Start Discovery"}
            </Button>
          </div>
        )}

        {/* Discovery Status Display */}
        {discoveryStatus && (
          <DiscoveryStatusCard
            discoveryStatus={discoveryStatus}
            selectedSubdomains={selectedSubdomains}
            onSubdomainSelectionChange={setSelectedSubdomains}
            onContinue={handleContinue}
            onSkip={handleSkip}
            showSkipButton={true}
          />
        )}
      </div>
    </OnboardingContentLayout>
  );
}
