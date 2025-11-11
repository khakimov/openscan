import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { getDiscoveryDevices } from "@/server/devices";
import { validateDomain } from "@/features/onboarding/utils/validators";
import { DiscoveryStatusCard } from "@/features/onboarding/components/DiscoveryStatusCard";
import { toast } from "sonner";
import {
  discoveryQueries,
  useStartDiscoveryMutation,
} from "@/queries/discovery-queries";
import { useCreateDevicesFromDiscoveryMutation } from "@/queries/device-queries";
import type { DiscoveryStatus } from "@/features/onboarding/types/discovery-status";

const discoverySearchSchema = z.object({
  domain: z.string().optional(),
});

export const Route = createFileRoute("/onboarding/$projectId/discovery")({
  validateSearch: discoverySearchSchema,
  beforeLoad: async () => {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      throw redirect({ to: "/onboarding" });
    }
  },
  loader: async ({ context }) => {
    const savedDevicesResult = await getDiscoveryDevices({ data: {} });
    return {
      savedDevices: savedDevicesResult.devices || [],
    };
  },
  component: OnboardingDiscovery,
});

function OnboardingDiscovery() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const { domain: searchDomain } = Route.useSearch();
  const { savedDevices } = Route.useLoaderData();

  const [domain, setDomain] = useState(searchDomain || "");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [selectedSubdomains, setSelectedSubdomains] = useState<Set<string>>(new Set());

  // Smart polling for workflow status
  const { data: workflowStatus } = useQuery(discoveryQueries.workflowStatus(scanId!));
  const { data: workflowResults } = useQuery(
    discoveryQueries.workflowResults(scanId!, workflowStatus?.isCompleted === true)
  );

  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  const discoveryStatus: DiscoveryStatus | null = scanId
    ? {
        scanId,
        status: isCompleted ? "COMPLETED" : isFailed ? "FAILED" : isRunning ? "RUNNING" : "UNKNOWN",
        message: isCompleted
          ? "Discovery completed successfully"
          : isRunning
            ? "Discovery is running..."
            : isFailed
              ? "Discovery workflow failed"
              : undefined,
        error: isFailed ? workflowStatus?.error || "Discovery workflow failed" : undefined,
        result: results || undefined,
      }
    : null;

  const startDiscoveryMutation = useStartDiscoveryMutation();

  const handleStartDiscovery = () => {
    const trimmedDomain = domain.trim();
    const validationError = validateDomain(trimmedDomain);

    if (validationError) {
      setDomainError(validationError);
      return;
    }

    setDomainError(null);
    setSelectedSubdomains(new Set());

    startDiscoveryMutation.mutate(
      { target: trimmedDomain },
      {
        onSuccess: (discoveryResult) => {
          if (discoveryResult.success && discoveryResult.scanId) {
            setScanId(discoveryResult.scanId);
          } else {
            setDomainError(discoveryResult.error || "Failed to start discovery");
          }
        },
        onError: (err) => {
          const errorMessage = err instanceof Error ? err.message : "Something went wrong";
          setDomainError(errorMessage);
        },
      }
    );
  };

  const saveDevicesMutation = useCreateDevicesFromDiscoveryMutation();

  const handleSkip = () => {
    navigate({
      to: "/onboarding/$projectId/notifications",
      params: { projectId },
    });
  };

  const handleContinue = () => {
    const selectedTargets = Array.from(selectedSubdomains);

    if (selectedTargets.length === 0) {
      toast.error("Please select at least one subdomain");
      return;
    }

    const targetsData = selectedTargets.map((host) => {
      const subdomain = results?.uniqueSubdomains?.find(
        (s: { subdomain: string; ip: string }) => s.subdomain === host
      );
      return {
        host,
        ip: subdomain?.ip === "Not resolved" ? undefined : subdomain?.ip,
      };
    });

    saveDevicesMutation.mutate(
      {
        targets: targetsData,
        projectId,
        options: {
          source: "DISCOVERY",
          scope: "EXTERNAL",
          verificationStatus: "VERIFIED",
        },
      },
      {
        onSuccess: async (response) => {
          toast.success("Assets added to inventory", {
            description: `${response.count} subdomain${response.count !== 1 ? "s" : ""} added successfully`,
          });

          navigate({
            to: "/onboarding/$projectId/notifications",
            params: { projectId },
          });
        },
        onError: (error: any) => {
          toast.error("Failed to add assets", {
            description: error instanceof Error ? error.message : "Please try again",
          });
        },
      }
    );
  };

  return (
    <div className="p-8 space-y-8">
      {/* Already Saved Devices */}
      {savedDevices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Already Saved Assets</h3>
            <span className="text-xs text-muted-foreground">
              {savedDevices.length} asset{savedDevices.length !== 1 ? "s" : ""}
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
                  {device.ip && <span className="text-xs text-muted-foreground">{device.ip}</span>}
                </div>
                <span className="text-xs text-green-600 font-medium">Saved</span>
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
        />
        {domainError && <p className="text-sm text-red-600">{domainError}</p>}
      </div>

      {/* Action Buttons */}
      {!scanId && (
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={startDiscoveryMutation.isPending}
          >
            Skip Discovery
          </Button>
          <Button
            type="button"
            onClick={handleStartDiscovery}
            disabled={startDiscoveryMutation.isPending || !domain.trim()}
            size="lg"
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
          isContinuePending={saveDevicesMutation.isPending}
          isSkipPending={false}
        />
      )}
    </div>
  );
}
