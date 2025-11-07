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
import { LogOut, Palette, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

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