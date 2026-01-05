import { createFileRoute, redirect } from "@tanstack/react-router";
import { GoogleOAuthButton } from "@/features/auth/components/google-oauth-button";
import { GitHubOAuthButton } from "@/features/auth/components/github-oauth-button";

export const Route = createFileRoute("/onboarding/")({
  beforeLoad: async ({ context }) => {
    // Session already fetched by __root.tsx (fetchSession server function - no HTTP during SSR)
    // Redirect authenticated users to project setup
    if (context.session?.session) {
      throw redirect({ to: "/onboarding/project" });
    }
  },
  component: Onboarding2Signup,
});

function Onboarding2Signup() {
  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Create an account
        </h1>
        <p className="text-muted-foreground">
          Let's start with creating your account. By creating an account you
          accept the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <div className="space-y-4">
        <GoogleOAuthButton />
        <GitHubOAuthButton />
      </div>
    </div>
  );
}
