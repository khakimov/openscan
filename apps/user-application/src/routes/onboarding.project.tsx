import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "@/server/auth";
import { validateDomain } from "@/features/onboarding/utils/validators";
import { useOrganizationLifecycle } from "@/features/onboarding/hooks/use-organization-lifecycle";
import { onboardingStatusQuery } from "@/queries/onboarding-status";

export const Route = createFileRoute("/onboarding/project")({
  beforeLoad: async () => {
    // Redirect if not authenticated
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      throw redirect({ to: "/onboarding" });
    }
    // Onboarding data is already loaded by parent route - no need to return anything
  },
  loader: async ({ context }) => {
    // Read onboarding from parent context (no server call!)
    const onboarding = context.onboarding!;
    const organizations = onboarding.organizations ?? [];
    const organizationRecord = onboarding.organization;
    const projectRecord = onboarding.project;

    const metadata = (organizationRecord?.metadata ?? null) as Record<string, unknown> | null;
    const timezone =
      metadata && typeof metadata["timezone"] === "string"
        ? (metadata["timezone"] as string)
        : undefined;

    return {
      hasOrganization: organizations.length > 0,
      organizationId: onboarding.organizationId,
      projectId: onboarding.projectId,
      initialValues: {
        organizationName: organizationRecord?.name ?? "",
        timezone,
        projectName: projectRecord?.name ?? "",
        domain: projectRecord?.domain ?? "",
      },
    };
  },
  component: Onboarding2Project,
});

function Onboarding2Project() {
  const navigate = useNavigate();
  const { hasOrganization, organizationId, projectId, initialValues } = Route.useLoaderData();

  // Subscribe to onboarding query for reactive updates (e.g., after mutations)
  // Don't destructure data until we need it to avoid unused variable warnings
  const initialOnboarding = Route.useRouteContext().onboarding;
  useQuery({
    ...onboardingStatusQuery,
    initialData: initialOnboarding,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Organization lifecycle hook
  const { setupOrganizationAndProject, error, setError } = useOrganizationLifecycle({
    hasOrganization,
    persistedOrganizationId: organizationId,
    projectId,
  });

  const timezoneList = useMemo(() => {
    if (typeof window !== "undefined") {
      return Intl.supportedValuesOf("timeZone");
    }
    const fallback = initialValues.timezone ? [initialValues.timezone, "UTC"] : ["UTC"];
    return Array.from(new Set(fallback));
  }, [initialValues.timezone]);

  const timezoneOptions = useMemo(
    () => timezoneList.map((tz) => ({ label: tz, value: tz })),
    [timezoneList]
  );

  const defaultTimezone = useMemo(() => {
    if (initialValues.timezone && timezoneList.includes(initialValues.timezone)) {
      return initialValues.timezone;
    }
    if (typeof window !== "undefined") {
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezoneList.includes(browserTimezone)) {
        return browserTimezone;
      }
    }
    return timezoneList[0] ?? "UTC";
  }, [initialValues.timezone, timezoneList]);

  const form = useForm({
    defaultValues: {
      organizationName: initialValues.organizationName ?? "",
      timezone: defaultTimezone,
      projectName: initialValues.projectName ?? "",
      domain: initialValues.domain ?? "",
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setIsSubmitting(true);

      try {
        const setupResult = await setupOrganizationAndProject(value);

        if (!setupResult.success || !setupResult.projectId) {
          throw new Error(setupResult.error || "Failed to set up organization and project");
        }

        // Navigate to discovery with domain
        if (value.domain) {
          navigate({
            to: "/onboarding/$projectId/discovery",
            params: { projectId: setupResult.projectId },
            search: { domain: value.domain },
          });
        } else {
          // Skip to notifications
          navigate({
            to: "/onboarding/$projectId/notifications",
            params: { projectId: setupResult.projectId },
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Something went wrong";
        console.error("[Onboarding2Project] Error:", err);
        setError(errorMessage);
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
        <div className="grid gap-6 md:grid-cols-2">
          {/* Organization Name */}
          <form.Field
            name="organizationName"
            validators={{
              onChange: ({ value }) => (!value ? "Organization name is required" : undefined),
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Organization Name</Label>
                <Input
                  id={field.name}
                  placeholder="e.g., Acme Corp"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-red-600">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          {/* Timezone */}
          <form.Field name="timezone">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Timezone</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value)}
                >
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>

        {/* Project Name & Domain */}
        <div className="grid gap-6 md:grid-cols-2">
          <form.Field
            name="projectName"
            validators={{
              onChange: ({ value }) => (!value ? "Project name is required" : undefined),
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Project Name</Label>
                <Input
                  id={field.name}
                  placeholder="e.g., Production Infrastructure"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-red-600">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="domain"
            validators={{
              onChange: ({ value }) => {
                if (!value) return undefined;
                return validateDomain(value);
              },
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  Domain <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id={field.name}
                  placeholder="e.g., example.com"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-red-600">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Creating..." : "Next"}
        </Button>
      </div>
    </form>
  );
}
