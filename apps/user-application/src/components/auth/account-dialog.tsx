import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { LogOut, Palette, Loader2, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useRouter } from "@tanstack/react-router";
import { useState, Suspense } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { toast } from "sonner";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useSaveNotificationPreferencesMutation } from "@/queries/notification-queries";

export interface AccountDialogUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface AccountDialogProps {
  children: React.ReactNode;
  user: AccountDialogUser | null;
}

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

/**
 * NotificationPreferencesSection - OpenPanel pattern component
 * Uses Suspense for data-dependent rendering and shared cache
 */
function NotificationPreferencesSection() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // OpenPanel pattern: Use shared queryOptions for cache reuse
  const { data: preferences } = useSuspenseQuery({
    ...trpc.notification.preferences.queryOptions(),
    queryFn: () => trpcClient.notification.preferences.query(),
  });

  const mutation = useSaveNotificationPreferencesMutation();

  // Local state for optimistic updates (initialized from server data)
  const [alertSeverities, setAlertSeverities] = useState<string[]>(
    preferences.alertSeverities
  );

  const handleSeverityChange = async (severity: string, checked: boolean) => {
    const newSeverities = checked
      ? [...alertSeverities, severity]
      : alertSeverities.filter((s) => s !== severity);

    // Validate BEFORE updating state to prevent invalid UI state
    if (newSeverities.length === 0) {
      toast.error("At least one severity level is required");
      return;
    }

    // Store previous state for rollback
    const previousSeverities = alertSeverities;

    // Optimistically update UI (instant feedback, no blinking)
    setAlertSeverities(newSeverities);

    // Save in background without disabling checkboxes
    mutation.mutate(
      {
        vulnerabilityAlertsEnabled: true,
        alertSeverities: newSeverities,
        weeklySummaryEnabled: true,
      },
      {
        onError: (error) => {
          console.error("Failed to save preferences:", error);
          toast.error("Failed to save preferences");
          // Rollback to previous state on error
          setAlertSeverities(previousSeverities);
        },
      }
    );
  };

  return (
    <div className="flex flex-col w-full py-3 px-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4" />
        <span className="text-sm font-medium">Email Alerts</span>
      </div>
      <div className="flex flex-col gap-2">
        {SEVERITY_OPTIONS.map((severity) => (
          <div key={severity.value} className="flex items-center gap-2">
            <Checkbox
              id={`account-severity-${severity.value}`}
              checked={alertSeverities.includes(severity.value)}
              onCheckedChange={(checked) =>
                handleSeverityChange(severity.value, !!checked)
              }
            />
            <Label
              htmlFor={`account-severity-${severity.value}`}
              className="mb-0 text-sm cursor-pointer leading-none"
            >
              {severity.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountDialog({ children, user }: AccountDialogProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      // Use TanStack Router to navigate to home page
      // This preserves SPA benefits while clearing the session
      await router.navigate({ to: "/" });
    } catch (error) {
      console.error("Sign out failed:", error);
      setIsSigningOut(false);
    }
  };

  if (!user) {
    return null;
  }

  const fallbackText = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || "U";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center pb-4">
          <DialogTitle>Account</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-6 py-6">
          <Avatar className="h-20 w-20">
            <AvatarImage
              src={user.image || undefined}
              alt={user.name || "User"}
            />
            <AvatarFallback className="text-2xl font-semibold">
              {fallbackText}
            </AvatarFallback>
          </Avatar>
          <div className="text-center space-y-1">
            {user.name && (
              <div className="text-lg font-semibold">{user.name}</div>
            )}
            {user.email && (
              <div className="text-sm text-muted-foreground">{user.email}</div>
            )}
          </div>
          <div className="flex flex-col gap-4 w-full mt-6">
            <div className="flex items-center justify-between w-full py-3 px-4 rounded-lg border bg-card">
              <span className="text-sm font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Theme
              </span>
              <ThemeToggle />
            </div>

            <Suspense
              fallback={
                <div className="flex flex-col w-full py-3 px-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="h-4 w-4" />
                    <span className="text-sm font-medium">Email Alerts</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </div>
                </div>
              }
            >
              <NotificationPreferencesSection />
            </Suspense>

            <Button
              onClick={signOut}
              variant="outline"
              size="lg"
              className="w-full gap-2"
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing Out...
                </>
              ) : (
                <>
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}