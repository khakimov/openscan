import { useState } from "react";
import { Button } from "@/components/ui/button";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { deleteDevice } from "@/server/devices";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

interface DeleteDeviceConfirmProps {
  deviceId: string;
  deviceName: string;
  onSuccess?: () => void;
}

export default function DeleteDeviceConfirm({
  deviceId,
  deviceName,
  onSuccess,
}: DeleteDeviceConfirmProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await deleteDevice({
        data: { deviceId }
      });

      toast.success("Device deleted", {
        description: `${deviceName} has been removed from your inventory.`,
      });

      // TanStack Start RC pattern: remove stale data and invalidate route
      queryClient.removeQueries({ queryKey: ['devices'] });

      // Force route refresh
      await router.invalidate();

      onSuccess?.();
      popModal("DeleteDeviceConfirm");
    } catch (error) {
      toast.error("Failed to delete device", {
        description: error instanceof Error ? error.message : "Please try again",
      });
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    popModal("DeleteDeviceConfirm");
  };

  return (
    <ModalContent className="max-w-md" hideCloseButton>
      <ModalHeader
        title={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Delete Device</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone
              </p>
            </div>
          </div>
        }
      />

      <div className="py-4">
        <p className="text-sm">
          Are you sure you want to delete <strong>{deviceName}</strong>?
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          All associated data including scan history and vulnerabilities will be permanently removed.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={isDeleting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex-1"
        >
          {isDeleting ? "Deleting..." : "Delete Device"}
        </Button>
      </div>
    </ModalContent>
  );
}