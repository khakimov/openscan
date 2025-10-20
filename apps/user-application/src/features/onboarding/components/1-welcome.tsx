import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrDivider } from "@/components/ui/or-divider";
import { GoogleOAuthButton } from "@/features/auth/components/google-oauth-button";
import { OnboardingContentLayout, OnboardingDescription } from "@/components/onboarding/onboarding-layout";
import { useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import type { OnboardingStatus } from "@/server/types/onboarding";
import { authClient } from "@/lib/auth-client";

type OnboardingWelcomeProps = {
  onboarding: OnboardingStatus;
};

export function OnboardingWelcome({ onboarding }: OnboardingWelcomeProps) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle account creation
    navigate({ to: "/onboarding/project" });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authClient.signOut();
      // Reload to clear session and show registration form
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  const isAuthenticated = Boolean(onboarding.user);
  const showFullSummary = onboarding.success && onboarding.step > 1;
  const showSimpleAuth = isAuthenticated && !showFullSummary;

  // Simple authenticated view (user is logged in but hasn't progressed past step 1)
  if (showSimpleAuth) {
    const account = onboarding.user;
    const emailVerified = account?.emailVerified;

    return (
      <OnboardingContentLayout
        title="Welcome back!"
        description={
          <OnboardingDescription>
            You're signed in and ready to continue setting up your security monitoring.
          </OnboardingDescription>
        }
        className="max-w-md"
      >
        <div className="space-y-6">
          {/* User Account Card */}
          <div className="rounded-xl border border-border/60 bg-background/80 p-6 shadow-sm shadow-black/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                {/* Avatar Placeholder */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-semibold">
                  {account?.name?.charAt(0)?.toUpperCase() ?? account?.email?.charAt(0)?.toUpperCase() ?? "U"}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">
                    {account?.name ?? "User"}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {account?.email}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {emailVerified ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-600">Email verified</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-amber-600">Email pending verification</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info box for wrong account */}
          <div className="rounded-lg border border-border/40 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Signed in with the wrong account? You can{" "}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="font-medium text-foreground hover:underline disabled:opacity-50"
              >
                {isLoggingOut ? "Logging out..." : "log out"}
              </button>{" "}
              and sign in with a different account.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              onClick={() => navigate({ to: "/onboarding/project" })}
              className="w-full"
            >
              Continue to workspace setup
            </Button>
          </div>
        </div>
      </OnboardingContentLayout>
    );
  }

  // Full summary view (user has progressed past step 1)
  if (showFullSummary) {
    const account = onboarding.user;
    const organizations = onboarding.organizations ?? [];
    const primaryOrganization =
      onboarding.organization ?? organizations[0] ?? null;
    const organizationMetadata = (primaryOrganization?.metadata ??
      null) as Record<string, unknown> | null;
    const organizationTimezone =
      organizationMetadata && typeof organizationMetadata["timezone"] === "string"
        ? (organizationMetadata["timezone"] as string)
        : null;
    const emailStatusLabel = account?.emailVerified ? "Verified" : "Pending verification";
    const emailStatusClass = account?.emailVerified ? "text-emerald-600" : "text-amber-600";
    const hasProject = onboarding.step >= 3 && Boolean(onboarding.projectId);
    const continueTarget = hasProject
      ? {
          to: "/onboarding/$projectId/connect",
          params: { projectId: onboarding.projectId! },
        }
      : { to: "/onboarding/project" };
    const continueLabel = hasProject ? "Continue to monitoring setup" : "Continue to workspace setup";

    return (
      <OnboardingContentLayout
        title="Review your account"
        description={
          <OnboardingDescription>
            You're already signed in. Double-check your account details below or jump straight to
            the next step.
          </OnboardingDescription>
        }
      >
        <div className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-border/60 bg-background/80 p-6 shadow-sm shadow-black/5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </h2>
              <dl className="mt-4 space-y-3 text-sm text-foreground">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="text-right font-medium">{account?.name ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-right font-medium break-all">{account?.email ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className={`text-right text-sm font-medium ${emailStatusClass}`}>
                    {emailStatusLabel}
                  </dd>
                </div>
              </dl>
            </section>

            {(primaryOrganization || onboarding.project) && (
              <section className="rounded-xl border border-border/60 bg-background/80 p-6 shadow-sm shadow-black/5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Workspace
                </h2>
                <dl className="mt-4 space-y-3 text-sm text-foreground">
                  {primaryOrganization ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="text-right font-medium">
                          {primaryOrganization.name ?? "—"}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground">Timezone</dt>
                        <dd className="text-right font-medium">
                          {organizationTimezone ?? "Not set"}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Workspace</dt>
                      <dd className="text-right font-medium">Not created yet</dd>
                    </div>
                  )}

                  {onboarding.project ? (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Project</dt>
                      <dd className="text-right font-medium">
                        {onboarding.project.name ?? "—"}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            )}
          </div>

          {/* Info box for wrong account */}
          <div className="rounded-lg border border-border/40 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Need to make changes? You can revisit any step using the flow on the left.
              {" "}Signed in with the wrong account?{" "}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="font-medium text-foreground hover:underline disabled:opacity-50"
              >
                {isLoggingOut ? "Logging out..." : "Log out"}
              </button>
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => navigate(continueTarget as never)}
              size="lg"
            >
              {continueLabel}
            </Button>
          </div>
        </div>
      </OnboardingContentLayout>
    );
  }

  return (
    <OnboardingContentLayout
      title="Create an account"
      description={
        <OnboardingDescription>
          Let's start with creating your account. By creating an account you accept the{" "}
          <Link to="/terms" target="_blank" className="font-semibold underline hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" target="_blank" className="font-semibold underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </OnboardingDescription>
      }
      className="max-w-md"
    >
      <div className="space-y-4">
        <GoogleOAuthButton />

        <OrDivider className="my-6" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-xl font-semibold">Sign up with email</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
            />
          </div>

          <Button type="submit" className="w-full" size="lg">
            Create account
          </Button>
        </form>
      </div>
    </OnboardingContentLayout>
  );
}
