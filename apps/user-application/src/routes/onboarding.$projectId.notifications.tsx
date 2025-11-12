import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCurrentUser } from "@/server/auth";
import { completeOnboarding } from "@/server/organization";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/server/preferences";
import { onboardingStatusQuery } from "@/queries/onboarding-status";

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical", color: "text-red-500" },
  { value: "HIGH", label: "High", color: "text-orange-500" },
  { value: "MEDIUM", label: "Medium", color: "text-yellow-500" },
  { value: "LOW", label: "Low", color: "text-blue-500" },
] as const;

export const Route = createFileRoute("/onboarding/$projectId/notifications")({
  beforeLoad: async () => {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      throw redirect({ to: "/onboarding" });
    }
    // Onboarding data is already loaded by parent route - no need to return anything
  },
  loader: async ({ context }) => {
    // Read onboarding from parent context (no server call!)
    const onboarding = context.onboarding!;

    const preferencesResult = await getNotificationPreferences();

    return {
      preferences: preferencesResult.success
        ? preferencesResult.data
        : undefined,
      organizationId: onboarding.organizationId,
    };
  },
  component: Onboarding2Notifications,
});

function Onboarding2Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId } = Route.useParams();
  const { preferences, organizationId } = Route.useLoaderData();

  // Subscribe to onboarding query for reactive updates (e.g., after mutations)
  // Don't destructure data until we need it to avoid unused variable warnings
  const initialOnboarding = Route.useRouteContext().onboarding;
  useQuery({
    ...onboardingStatusQuery,
    initialData: initialOnboarding,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutation to complete onboarding with cache seeding
  const completeOnboardingMutation = useMutation({
    mutationFn: (data: { organizationId: string }) => completeOnboarding({ data }),
    onSuccess: async () => {
      // Seed React Query cache with fresh onboarding status
      // This marks onboardingCompleted=true across all components
      const nextStatus = await queryClient.fetchQuery(onboardingStatusQuery);
      queryClient.setQueryData(onboardingStatusQuery.queryKey, nextStatus);

      // Navigate to dashboard
      navigate({
        to: "/$organizationId/$projectId",
        params: { organizationId: organizationId!, projectId },
      });
    },
  });

  const form = useForm({
    defaultValues: {
      vulnerabilityAlertsEnabled:
        preferences?.vulnerabilityAlertsEnabled ?? true,
      alertSeverities: preferences?.alertSeverities ?? ["CRITICAL", "HIGH"],
      weeklySummaryEnabled: preferences?.weeklySummaryEnabled ?? true,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setIsSubmitting(true);

      try {
        const result = await saveNotificationPreferences({ data: value });

        if (!result.success) {
          throw new Error(result.error || "Failed to save preferences");
        }

        toast.success("Notification preferences saved");

        // Mark onboarding as complete before navigating to dashboard
        if (!organizationId) {
          throw new Error("Organization ID is required");
        }

        // Use mutation to complete onboarding and seed cache
        await completeOnboardingMutation.mutateAsync({ organizationId });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to save preferences";
        console.error("[Onboarding2Notifications] Error:", err);
        setError(errorMessage);
        toast.error("Failed to save preferences", {
          description: errorMessage,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="p-8 space-y-8"
    >
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

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
              toast.error("Organization ID is required");
              return;
            }

            setIsSubmitting(true);
            try {
              // Use mutation to complete onboarding and seed cache
              await completeOnboardingMutation.mutateAsync({ organizationId });
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : "Failed to complete onboarding";
              toast.error(errorMessage);
              setIsSubmitting(false);
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
