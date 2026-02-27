import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    photo?: string;
  };
}

export function UserSettingsDialog({ open, onOpenChange, user }: UserSettingsDialogProps) {
  const [hasChanges, setHasChanges] = useState(false);

  // Default user data if not provided
  const userData = user || {
    firstName: "Admin",
    lastName: "Test",
    email: "admin@acme.local",
    role: "admin",
    photo: ""
  };

  // Original values from session
  const originalValues = {
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email
  };

  const handleInputChange = (field: string, value: string) => {
    const changed = value !== originalValues[field as keyof typeof originalValues];
    setHasChanges(changed ||
      (document.getElementById('firstName') as HTMLInputElement)?.value !== originalValues.firstName ||
      (document.getElementById('lastName') as HTMLInputElement)?.value !== originalValues.lastName ||
      (document.getElementById('email') as HTMLInputElement)?.value !== originalValues.email
    );
  };

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setHasChanges(false);
      // Remove focus from trigger button when dialog closes
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  const handleUpdate = () => {
    // TODO: Handle actual form submission to backend

    // Show success message
    toast.success("Profile updated successfully!");

    // Reset form state
    setHasChanges(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] data-[state=open]:animate-slideInFromRight data-[state=closed]:animate-slideOutToRight overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
          <DialogDescription>
            Update your profile information and preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Avatar Upload */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <Button variant="outline" size="sm">
              Change Avatar
            </Button>
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-sm font-medium">
                First name
              </label>
              <Input
                id="firstName"
                defaultValue={userData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name
              </label>
              <Input
                id="lastName"
                defaultValue={userData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              defaultValue={userData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
            />
          </div>

          {/* Role Selection - Read Only */}
          <div className="space-y-1">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <Select defaultValue={userData.role} disabled>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!hasChanges}
            onClick={handleUpdate}
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}