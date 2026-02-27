import { Button } from "@/components/ui/button";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useParams } from "@tanstack/react-router";
import { useDeleteDeviceMutation } from "@/queries/device-queries";
import { useQueryClient } from "@tanstack/react-query";
import { deviceQueries } from "@/queries/device-queries";

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
  const router = useRouter();
  const params = useParams({ strict: false });
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteDeviceMutation();

  const handleDelete = async () => {
    deleteMutation.mutate(
      { deviceId },
      {
        onSuccess: async () => {
          toast.success("Device deleted", {
            description: `${deviceName} has been removed from your inventory.`,
          });

          // Ensure queries are invalidated before navigation
          await queryClient.invalidateQueries({
            queryKey: deviceQueries.list.base,
          });

          popModal("DeleteDeviceConfirm");

          // Redirect to discovery page if we have org and project params
          if (params.organizationId && params.projectId) {
            await router.navigate({
              to: '/$organizationId/$projectId/servers/discovery',
              params: {
                organizationId: params.organizationId,
                projectId: params.projectId,
              },
            });
          } else {
            // Fallback: just invalidate router if params missing
            await router.invalidate();
          }

          onSuccess?.();
        },
        onError: (error: any) => {
          toast.error("Failed to delete device", {
            description: error instanceof Error ? error.message : "Please try again",
          });
        },
      }
    );
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
          disabled={deleteMutation.isPending}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="flex-1"
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete Device"}
        </Button>
      </div>
    </ModalContent>
  );
}