import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OnboardingContentLayout,
  OnboardingDescription,
} from "@/components/onboarding/onboarding-layout";
import { useForm } from "@tanstack/react-form";
import { validateDomain } from "../utils/validators";
import { useOrganizationLifecycle } from "../hooks/use-organization-lifecycle";

interface OnboardingCreateProjectProps {
  hasOrganization: boolean;
  organizationId: string | null;
  projectId: string | null;
  initialValues: {
    organizationName?: string;
    timezone?: string;
    projectName?: string;
    domain?: string;
  };
}

export function OnboardingCreateProject({
  hasOrganization,
  organizationId: persistedOrganizationId,
  projectId,
  initialValues,
}: OnboardingCreateProjectProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Organization lifecycle hook
  const {
    setupOrganizationAndProject,
    error,
    setError,
  } = useOrganizationLifecycle({
    hasOrganization,
    persistedOrganizationId,
    projectId,
  });

  const timezoneList = useMemo(() => {
    if (typeof window !== "undefined") {
      return Intl.supportedValuesOf("timeZone");
    }
    const fallback = initialValues.timezone
      ? [initialValues.timezone, "UTC"]
      : ["UTC"];
    return Array.from(new Set(fallback));
  }, [initialValues.timezone]);

  const timezoneOptions = useMemo(
    () =>
      timezoneList.map((tz) => ({
        label: tz,
        value: tz,
      })),
    [timezoneList],
  );

  const defaultTimezone = useMemo(() => {
    if (
      initialValues.timezone &&
      timezoneList.includes(initialValues.timezone)
    ) {
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
          throw new Error(
            setupResult.error || "Failed to set up organization and project",
          );
        }

        console.log("[OnboardingCreateProject] Project created:", {
          projectId: setupResult.projectId,
          domain: value.domain,
        });

        // Navigate to step 3 (discovery) with projectId and domain
        if (value.domain) {
          navigate({
            to: "/onboarding/$projectId/discovery",
            params: { projectId: setupResult.projectId },
            search: { domain: value.domain },
          });
        } else {
          // Skip discovery and step 4 (connect is disabled), go directly to step 5 (notifications)
          navigate({
            to: "/onboarding/$projectId/notifications",
            params: { projectId: setupResult.projectId },
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Something went wrong";
        console.error("[OnboardingCreateProject] Error:", err);
        setError(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <OnboardingContentLayout
      title="Create Your Project"
      description={
        <OnboardingDescription>
          Set up your organization and project to get started
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
          <div className="grid gap-6 md:grid-cols-2">
            {/* Organization Name */}
            <form.Field
              name="organizationName"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Organization name is required" : undefined,
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
                    aria-invalid={field.state.meta.errors.length > 0}
                    required
                  />
                  {hasOrganization && (
                    <p className="text-xs text-muted-foreground">
                      Updating this will rename your existing workspace.
                    </p>
                  )}
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-red-600">
                      {field.state.meta.errors[0]}
                    </p>
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
                  {hasOrganization && (
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll store this timezone on your workspace for
                      scheduling.
                    </p>
                  )}
                </div>
              )}
            </form.Field>
          </div>

          {/* Project Name & Domain */}
          <div className="grid gap-6 md:grid-cols-2">
            <form.Field
              name="projectName"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Project name is required" : undefined,
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
                    aria-invalid={field.state.meta.errors.length > 0}
                    required
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-red-600">
                      {field.state.meta.errors[0]}
                    </p>
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
                    Domain{" "}
                    <span className="text-muted-foreground text-xs">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id={field.name}
                    placeholder="e.g., example.com"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-red-600">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll run subdomain discovery on this domain
                  </p>
                </div>
              )}
            </form.Field>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/onboarding" })}
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Continue"}
          </Button>
        </div>
      </form>
    </OnboardingContentLayout>
  );
}
