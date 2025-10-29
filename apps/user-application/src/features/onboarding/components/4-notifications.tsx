import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Bell, Mail, Shield } from "lucide-react";
import { useState } from "react";
import {
  OnboardingContentLayout,
  OnboardingDescription,
} from "@/components/onboarding/onboarding-layout";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { saveNotificationPreferences } from "@/server/preferences";

interface OnboardingNotificationsProps {
  projectId: string;
  organizationId: string | null;
  initialValues?: {
    vulnerabilityAlertsEnabled?: boolean;
    alertSeverities?: string[];
    weeklySummaryEnabled?: boolean;
  };
}

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical", color: "text-red-500" },
  { value: "HIGH", label: "High", color: "text-orange-500" },
  { value: "MEDIUM", label: "Medium", color: "text-yellow-500" },
  { value: "LOW", label: "Low", color: "text-blue-500" },
] as const;

export function OnboardingNotifications({
  projectId,
  organizationId,
  initialValues = {
    vulnerabilityAlertsEnabled: true,
    alertSeverities: ["CRITICAL", "HIGH"],
    weeklySummaryEnabled: true,
  },
}: OnboardingNotificationsProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      vulnerabilityAlertsEnabled: initialValues.vulnerabilityAlertsEnabled ?? true,
      alertSeverities: initialValues.alertSeverities ?? ["CRITICAL", "HIGH"],
      weeklySummaryEnabled: initialValues.weeklySummaryEnabled ?? true,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setIsSubmitting(true);

      try {
        console.log("[OnboardingNotifications] Saving preferences:", value);

        // Call server function to save notification preferences
        const result = await saveNotificationPreferences({
          data: value,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to save preferences");
        }

        toast.success("Notification preferences saved", {
          description: "You can always change these later in settings",
        });

        // Navigate to the project dashboard
        if (!organizationId) {
          throw new Error("Organization ID is required");
        }

        navigate({
          to: "/$organizationId/$projectId",
          params: {
            organizationId,
            projectId,
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to save preferences";
        console.error("[OnboardingNotifications] Error:", err);
        setError(errorMessage);
        toast.error("Failed to save preferences", {
          description: errorMessage,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const vulnerabilityAlertsEnabled = form.useStore(
    (state) => state.values.vulnerabilityAlertsEnabled
  );

  return (
    <OnboardingContentLayout
      title="Notification Preferences"
      description={
        <OnboardingDescription>
          Configure how you want to be notified about security findings
        </OnboardingDescription>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-8 w-full max-w-2xl"
      >
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Vulnerability Alerts Section */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-red-500/10 p-2">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="font-semibold">Vulnerability Alerts</div>
                <p className="text-sm text-muted-foreground">
                  Get notified immediately when we find vulnerabilities in your assets
                </p>
              </div>
            </div>

            <form.Field name="vulnerabilityAlertsEnabled">
              {(field) => (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center gap-3">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Label
                      htmlFor="vulnerability-alerts"
                      className="cursor-pointer text-sm font-medium"
                    >
                      Enable vulnerability email alerts
                    </Label>
                  </div>
                  <Switch
                    id="vulnerability-alerts"
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                </div>
              )}
            </form.Field>

            {/* Severity Filter */}
            {vulnerabilityAlertsEnabled && (
              <form.Field name="alertSeverities">
                {(field) => (
                  <div className="ml-4 space-y-3 border-l-2 border-muted pl-4">
                    <Label className="text-sm font-medium">
                      Alert me for these severity levels:
                    </Label>
                    <div className="space-y-2">
                      {SEVERITY_OPTIONS.map((severity) => {
                        const isChecked = field.state.value.includes(severity.value);
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
                              className={`cursor-pointer text-sm ${severity.color}`}
                            >
                              {severity.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                    {field.state.value.length === 0 && (
                      <p className="text-xs text-amber-600">
                        ⚠️ You won't receive any alerts if no severities are selected
                      </p>
                    )}
                  </div>
                )}
              </form.Field>
            )}
          </div>

          {/* Weekly Summary Section */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-blue-500/10 p-2">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="font-semibold">Weekly Security Summary</div>
                <p className="text-sm text-muted-foreground">
                  Receive a weekly digest of all security activity across your projects
                </p>
              </div>
            </div>

            <form.Field name="weeklySummaryEnabled">
              {(field) => (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Label
                      htmlFor="weekly-summary"
                      className="cursor-pointer text-sm font-medium"
                    >
                      Enable weekly summary emails
                    </Label>
                  </div>
                  <Switch
                    id="weekly-summary"
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                </div>
              )}
            </form.Field>

            {form.useStore((state) => state.values.weeklySummaryEnabled) && (
              <div className="ml-4 border-l-2 border-muted pl-4">
                <p className="text-xs text-muted-foreground">
                  📅 Summaries are sent every Monday at 9:00 AM in your organization's
                  timezone
                </p>
              </div>
            )}
          </div>

          {/* Skip Option */}
          <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground text-center">
              You can skip this step and configure notifications later in your{" "}
              <span className="font-medium text-foreground">account settings</span>
            </p>
          </div>
        </div>

        <div className="flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/onboarding/$projectId/discovery",
                params: { projectId },
              })
            }
            disabled={isSubmitting}
          >
            Back
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                // Skip and go to dashboard
                if (!organizationId) {
                  toast.error("Organization ID is required");
                  return;
                }

                navigate({
                  to: "/$organizationId/$projectId",
                  params: {
                    organizationId,
                    projectId,
                  },
                });
              }}
              disabled={isSubmitting}
            >
              Skip for now
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </div>
      </form>
    </OnboardingContentLayout>
  );
}
