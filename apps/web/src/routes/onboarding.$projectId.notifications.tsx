import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { useCompleteOnboardingMutation, onboardingQueries } from "@/queries";
import { toast } from "sonner";
import { getProjectDefaultRouteParams } from "@/lib/navigation";

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical", color: "text-red-500" },
  { value: "HIGH", label: "High", color: "text-orange-500" },
  { value: "MEDIUM", label: "Medium", color: "text-yellow-500" },
  { value: "LOW", label: "Low", color: "text-blue-500" },
] as const;

export const Route = createFileRoute("/onboarding/$projectId/notifications")({
  beforeLoad: async ({ context }) => {
    if (!context.session?.session) {
      throw redirect({ to: "/onboarding" });
    }

    // Parallel: onboarding status + notification preferences
    const [onboarding, preferences] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.onboarding.status.queryOptions()
      ),
      context.queryClient.ensureQueryData(
        context.trpc.notification.preferences.queryOptions()
      ),
    ]);

    const orgIdentifier = onboarding.organization?.slug || onboarding.organizationId;

    return {
      onboarding,
      preferences,
      organizationId: onboarding.organizationId,
      orgIdentifier,
    };
  },
  component: Onboarding2Notifications,
});

function Onboarding2Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId } = Route.useParams();
  const {
    onboarding: initialOnboarding,
    preferences: initialPreferences,
    organizationId,
    orgIdentifier,
  } = Route.useRouteContext();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Subscribe for reactive updates after mutations
  const { data: _onboardingStatus } = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    initialData: initialOnboarding,
  });

  const { data: preferences } = useQuery({
    ...trpc.notification.preferences.queryOptions(),
    initialData: initialPreferences,
  });

  // Mutation using tRPC
  const savePreferencesMutation = useMutation({
    mutationFn: (data: {
      vulnerabilityAlertsEnabled: boolean;
      alertSeverities: string[];
      weeklySummaryEnabled: boolean;
    }) => trpcClient.notification.savePreferences.mutate(data),
    onSuccess: () => {
      toast.success("Notification preferences saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save preferences");
    },
  });

  const completeOnboardingMutation = useCompleteOnboardingMutation();

  // Handle navigation after successful onboarding completion
  const handleOnboardingComplete = async () => {
    // Invalidate onboarding status to refresh cache
    await queryClient.invalidateQueries({ queryKey: onboardingQueries.status.key() });

    // Navigate to Servers Discovery using centralized navigation utility
    navigate({
      ...getProjectDefaultRouteParams(orgIdentifier || organizationId!, projectId),
    });
  };

  const form = useForm({
    defaultValues: {
      vulnerabilityAlertsEnabled:
        preferences?.vulnerabilityAlertsEnabled ?? true,
      alertSeverities: preferences?.alertSeverities ?? ["CRITICAL", "HIGH"],
      weeklySummaryEnabled: preferences?.weeklySummaryEnabled ?? true,
    },
    onSubmit: async ({ value }) => {
      try {
        // Save notification preferences using mutation helper
        await savePreferencesMutation.mutateAsync(value);

        // Mark onboarding as complete before navigating to dashboard
        if (!organizationId) {
          throw new Error("Organization ID is required");
        }

        // Use mutation helper to complete onboarding
        await completeOnboardingMutation.mutateAsync({ organizationId });

        // Handle post-completion navigation
        await handleOnboardingComplete();
      } catch (err) {
        // Error handling is managed by useMutationWithToast
        console.error("[Onboarding2Notifications] Error:", err);
      }
    },
  });

  const isSubmitting = savePreferencesMutation.isPending || completeOnboardingMutation.isPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="p-8 space-y-8"
    >

      <div className="space-y-6">
        {/* Vulnerability Alerts Section */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex-1 space-y-1">
            <div className="font-semibold">Vulnerability Alerts</div>
          </div>

          <form.Field name="vulnerabilityAlertsEnabled">
            {(field) => (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <Label
                  htmlFor="vulnerability-alerts"
                  className="mb-0 cursor-pointer text-sm font-medium"
                >
                  Enable email alerts
                </Label>
                <Switch
                  id="vulnerability-alerts"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </div>
            )}
          </form.Field>

          {/* Severity Filter */}
          <form.Subscribe
            selector={(state) => state.values.vulnerabilityAlertsEnabled}
          >
            {(vulnerabilityAlertsEnabled) =>
              vulnerabilityAlertsEnabled && (
                <form.Field name="alertSeverities">
                  {(field) => (
                    <div className="ml-4 space-y-3 border-l-2 border-muted pl-4">
                      <Label className=" text-sm font-medium">
                        Alert me for these severity levels:
                      </Label>
                      <div className="space-y-2">
                        {SEVERITY_OPTIONS.map((severity) => {
                          const isChecked = field.state.value.includes(
                            severity.value
                          );
                          return (
                            <div
                              key={severity.value}
                              className="flex items-center gap-3"
                            >
                              <Checkbox
                                id={`severity-${severity.value}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.handleChange([
                                      ...field.state.value,
                                      severity.value,
                                    ]);
                                  } else {
                                    field.handleChange(
                                      field.state.value.filter(
                                        (v) => v !== severity.value
                                      )
                                    );
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`severity-${severity.value}`}
                                className={`mb-0 cursor-pointer text-sm ${severity.color}`}
                              >
                                {severity.label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                      {field.state.value.length === 0 && (
                        <p className="text-xs text-amber-600">
                          No alerts will be sent if no severities are selected
                        </p>
                      )}
                    </div>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>
        </div>

        {/* Weekly Summary Section */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex-1 space-y-1">
            <div className="font-semibold">Weekly Security Summary</div>
          </div>

          <form.Field name="weeklySummaryEnabled">
            {(field) => (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <Label
                  htmlFor="weekly-summary"
                  className="mb-0 cursor-pointer text-sm font-medium"
                >
                  Enable weekly summary emails
                </Label>
                <Switch
                  id="weekly-summary"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked as true)}
                />
              </div>
            )}
          </form.Field>

          <form.Subscribe
            selector={(state) => state.values.weeklySummaryEnabled}
          >
            {(weeklySummaryEnabled) =>
              weeklySummaryEnabled && (
                <div className="ml-4 border-l-2 border-muted pl-4">
                  <p className="text-xs text-muted-foreground">
                    Sent every Monday at 9:00 AM in your organization's timezone
                  </p>
                </div>
              )
            }
          </form.Subscribe>
        </div>
      </div>

      <div className="flex justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            if (!organizationId) {
              console.error("Organization ID is required");
              return;
            }

            try {
              // Use mutation helper to complete onboarding (with built-in toast)
              await completeOnboardingMutation.mutateAsync({ organizationId });

              // Handle post-completion navigation
              await handleOnboardingComplete();
            } catch (err) {
              // Error handling managed by useMutationWithToast
              console.error("[Skip onboarding] Error:", err);
            }
          }}
          disabled={isSubmitting || completeOnboardingMutation.isPending}
        >
          Skip for now
        </Button>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Saving..." : "Complete Setup"}
        </Button>
      </div>
    </form>
  );
}
