interface OnboardingVerifyProps {
  projectId: string;
}

export function OnboardingVerify(_props: OnboardingVerifyProps) {
  // COMMENTED OUT - Step 5 (Verify) temporarily disabled
  // This step will be implemented later when we're ready to verify scanner connections
  return null;

  /* DISABLED - Scanner connection verification
  import { Link } from "@tanstack/react-router";
  import { OnboardingContentLayout, OnboardingDescription } from "@/components/onboarding/onboarding-layout";
  import { Button } from "@/components/ui/button";
  import { CheckCircle2, Loader2, XCircle } from "lucide-react";
  import { useState, useEffect } from "react";

  const [status, setStatus] = useState<"waiting" | "success" | "error">("waiting");

  useEffect(() => {
    // Simulate verification check
    const timer = setTimeout(() => {
      // In real implementation, check if first event received
      setStatus("success");
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <OnboardingContentLayout
      title="Verify connection"
      description={
        <OnboardingDescription>
          We're waiting for your first event to confirm everything is set up correctly
        </OnboardingDescription>
      }
    >
      <div className="flex flex-col items-center justify-center p-12 rounded-xl border">
        {status === "waiting" && (
          <>
            <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
            <h3 className="text-xl font-medium mb-2">Listening for events...</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Send a test event from your scanner to verify the connection
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">Connection verified!</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Your scanner is successfully connected and sending events
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-xl font-medium mb-2">Connection failed</h3>
            <p className="text-muted-foreground text-center max-w-md">
              We couldn't verify your connection. Please check your configuration
            </p>
          </>
        )}
      </div>

      {status === "success" && (
        <div className="flex justify-end gap-4">
          <Link to="/dashboard">
            <Button variant="outline" size="lg">
              Skip for now
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button size="lg" className="min-w-28">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      )}

      {status === "waiting" && (
        <div className="flex justify-end">
          <Link to="/dashboard">
            <Button variant="outline" size="lg">
              Skip verification
            </Button>
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="flex justify-end gap-4">
          <Link to="/onboarding/$projectId/connect" params={{ projectId }}>
            <Button variant="outline" size="lg">
              Back to setup
            </Button>
          </Link>
          <Button size="lg" onClick={() => setStatus("waiting")}>
            Try again
          </Button>
        </div>
      )}
    </OnboardingContentLayout>
  );
  */
}
