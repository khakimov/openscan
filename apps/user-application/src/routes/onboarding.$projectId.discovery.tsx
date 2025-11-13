import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { DiscoveryStatusCard } from "@/features/onboarding/components/DiscoveryStatusCard";
import { toast } from "sonner";
import type { DiscoveryStatus } from "@/features/onboarding/types/discovery-status";
import {
  onboardingStatusQuery,
  discoveryDevicesQuery,
} from "@/queries/onboarding-queries";
import { useDiscoveryWorkflow } from "@/features/discovery/hooks/use-discovery-workflow";

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
    // Onboarding data is already loaded by parent route - no need to return anything
  },
  loader: async ({ context }) => {
    // Get onboarding status from parent context (includes organizationId)
    const onboarding = context.onboarding;

    if (!onboarding?.organizationId) {
      throw new Error('Organization ID is required for discovery devices query');
    }

    // Use query helper for devices (single source of truth)
    // Pass organizationId to scope cache and match server function signature
    const savedDevices = await context.queryClient.ensureQueryData(
      discoveryDevicesQuery(onboarding.organizationId)
    );
    return {
      savedDevices,
    };
  },
  component: OnboardingDiscovery,
});

function OnboardingDiscovery() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const { domain: searchDomain } = Route.useSearch();
  const { savedDevices } = Route.useLoaderData();

  // Subscribe to onboarding query for reactive updates (e.g., after mutations)
  // Don't destructure data until we need it to avoid unused variable warnings
  const initialOnboarding = Route.useRouteContext().onboarding;
  useQuery({
    ...onboardingStatusQuery,
    initialData: initialOnboarding,
  });

  // Use shared discovery workflow hook
  const {
    target,
    setTarget,
    error,
    setError,
    scanId,
    selectedResults,
    setSelectedResults,
    isRunning,
    isCompleted,
    isFailed,
    results,
    workflowStatus,
    isStarting,
    isAddingDevices,
    handleStartDiscovery: startDiscovery,
    handleAddDevices: addDevices,
  } = useDiscoveryWorkflow({
    projectId,
    initialTarget: searchDomain,
    deviceOptions: {
      source: "DISCOVERY",
      scope: "EXTERNAL",
      verificationStatus: "VERIFIED",
    },
  });

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

  const handleSkip = () => {
    navigate({
      to: "/onboarding/$projectId/notifications",
      params: { projectId },
    });
  };

  const handleContinue = async () => {
    if (selectedResults.size === 0) {
      toast.error("Please select at least one subdomain");
      return;
    }

    await addDevices();

    // Navigate to notifications on success
    navigate({
      to: "/onboarding/$projectId/notifications",
      params: { projectId },
    });
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
            {savedDevices.map((device: { id: string; name: string; ip?: string | null }) => (
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
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
          }}
          disabled={isStarting || isRunning}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Action Buttons */}
      {!scanId && (
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={isStarting}
          >
            Skip Discovery
          </Button>
          <Button
            type="button"
            onClick={startDiscovery}
            disabled={isStarting || !target.trim()}
            size="lg"
          >
            {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isStarting ? "Starting..." : "Start Discovery"}
          </Button>
        </div>
      )}

      {/* Discovery Status Display */}
      {discoveryStatus && (
        <DiscoveryStatusCard
          discoveryStatus={discoveryStatus}
          selectedSubdomains={selectedResults}
          onSubdomainSelectionChange={setSelectedResults}
          onContinue={handleContinue}
          onSkip={handleSkip}
          showSkipButton={true}
          isContinuePending={isAddingDevices}
          isSkipPending={false}
        />
      )}
    </div>
  );
}
