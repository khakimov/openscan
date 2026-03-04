import { type TransformedDevice } from "@repo/contracts/device";
import { Button } from "@/components/ui/button";
import { Radar, Pencil, Trash2, Loader2 } from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { useStartDeviceScanMutation } from "@/queries/device-queries";

/**
 * Get scan target from device (hostname or IP)
 */
export function getScanTarget(device: TransformedDevice): string | null {
  let target = device.name;

  // Clean up name with parentheses
  if (target?.includes("(")) {
    target = target.split("(")[0].trim();
  }

  // Use IP if name doesn't look like a hostname
  if (!target || !target.includes(".")) {
    target = device.ip;
  }

  return target || null;
}

/**
 * Hook that returns scan/edit/delete handlers for a device.
 * Centralizes action logic used across card dropdown, detail sheet, and detail page.
 */
export function useDeviceActions(device: TransformedDevice | null | undefined) {
  const scanMutation = useStartDeviceScanMutation(device?.id ?? "");

  const handleScan = () => {
    if (!device) return;
    const target = getScanTarget(device);
    if (!target) {
      toast.error("No valid target found for scanning");
      return;
    }

    const toastId = `scan-${device.id}`;
    toast.loading(`Starting scan for ${target}...`, { id: toastId });

    scanMutation.mutate(
      { deviceId: device.id, target, preset: "THOROUGH" },
      {
        onSuccess: (result) => {
          if (result.success && result.scanId) {
            toast.success(`Scan started for ${result.target}`, {
              id: toastId,
              description: result.presetDescription || `Scan ID: ${result.scanId}`,
            });
          } else {
            toast.error(`Failed to start scan: ${result.error}`, { id: toastId });
          }
        },
        onError: (error) => {
          toast.error("Failed to start port scan", {
            id: toastId,
            description: error instanceof Error ? error.message : "Unknown error",
          });
        },
      }
    );
  };

  const handleEdit = () => {
    if (!device) return;
    pushModal("EditDevice", { deviceId: device.id, device });
  };

  const handleDelete = () => {
    if (!device) return;
    pushModal("DeleteDeviceConfirm", { deviceId: device.id, deviceName: device.name });
  };

  return { handleScan, handleEdit, handleDelete, scanMutation };
}

/**
 * Scan / Edit / Delete button group for device headers.
 * Used in device detail page and device detail sheet.
 */
export function DeviceActionButtons({
  device,
  isScanning,
}: {
  device: TransformedDevice | null | undefined;
  isScanning?: boolean;
}) {
  const { handleScan, handleEdit, handleDelete, scanMutation } = useDeviceActions(device);
  const isBusy = isScanning || scanMutation.isPending;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScan}
        disabled={isBusy || !device}
        className="flex items-center gap-2"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        ) : (
          <Radar className="h-4 w-4 text-blue-400" />
        )}
        <span className="hidden sm:inline">
          {isBusy ? "Scanning..." : "Scan"}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleEdit}
        disabled={!device}
        className="flex items-center gap-2"
      >
        <Pencil className="h-4 w-4" />
        <span className="hidden sm:inline">Edit</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={!device}
        className="flex items-center gap-2 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </div>
  );
}
