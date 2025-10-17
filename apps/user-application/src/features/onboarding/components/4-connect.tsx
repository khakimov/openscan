interface OnboardingConnectProps {
  projectId: string;
}

export function OnboardingConnect(_props: OnboardingConnectProps) {
  // COMMENTED OUT - Step 4 (Connect) temporarily disabled
  // This step will be implemented later when we're ready to set up scanner agents
  return null;

  /* DISABLED - Scanner agent setup
  import { Link } from "@tanstack/react-router";
  import { OnboardingContentLayout, OnboardingDescription } from "@/components/onboarding/onboarding-layout";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { LockIcon, CopyIcon } from "lucide-react";
  import { useState } from "react";
  import { toast } from "sonner";

  const [clientId] = useState("client_" + Math.random().toString(36).slice(2, 11));
  const [clientSecret] = useState("secret_" + Math.random().toString(36).slice(2, 20));

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <OnboardingContentLayout
      title="Setup your data sources"
      description={
        <OnboardingDescription>
          Let's connect your data sources to the platform
        </OnboardingDescription>
      }
    >
      <div className="flex flex-col gap-4 rounded-xl border p-4 md:p-6">
        <div className="flex items-center gap-2 text-2xl">
          <LockIcon className="h-6 w-6" />
          Credentials
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientId">Client ID</Label>
            <div className="flex gap-2">
              <Input
                id="clientId"
                value={clientId}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(clientId, "Client ID")}
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="clientSecret">Secret</Label>
            <div className="flex gap-2">
              <Input
                id="clientSecret"
                value={clientSecret}
                readOnly
                className="font-mono text-sm"
                type="password"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(clientSecret, "Secret")}
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4 md:p-6">
        <h3 className="text-xl font-medium mb-4">Installation Instructions</h3>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Use the credentials above to configure your scanner agents. Follow the
            documentation for your specific scanner type.
          </p>
          <div className="bg-muted p-4 rounded-lg font-mono text-xs">
            <code>
              npm install @secops/scanner
              <br />
              <br />
              # Configure with your credentials
              <br />
              SCANNER_CLIENT_ID={clientId}
              <br />
              SCANNER_SECRET={clientSecret}
            </code>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Link to="/onboarding/$projectId/verify" params={{ projectId }}>
          <Button size="lg" className="min-w-28">
            Next
          </Button>
        </Link>
      </div>
    </OnboardingContentLayout>
  );
  */
}
