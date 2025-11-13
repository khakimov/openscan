import { createFileRoute } from "@tanstack/react-router";
import { GoogleOAuthButton } from "@/features/auth/components/google-oauth-button";
import { GitHubOAuthButton } from "@/features/auth/components/github-oauth-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { z } from "zod";

const loginSearchSchema = z.object({
  error: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_login/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { error } = Route.useSearch();

  return (
    <div className="space-y-8 w-full">
      {/* Mobile Logo */}
      <div className="md:hidden text-center mb-8">
        <div className="text-2xl font-bold">sec.rocks</div>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Sign in</h1>
        <p className="text-muted-foreground">
          Don't have an account?{" "}
          <a href="/onboarding" className="font-medium underline hover:text-foreground">
            Create one today
          </a>
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* OAuth Buttons */}
      <div className="space-y-3">
        <GoogleOAuthButton />
        <GitHubOAuthButton />
      </div>
    </div>
  );
}
