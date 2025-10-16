import { useState } from "react";
import { type TransformedDevice } from "@/server/devices";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "./device-card";
import { DeviceOpenPorts } from "./device-open-ports";
import { useDeviceDetailQuery } from "@/hooks/useDeviceDetailQuery";
import { pushModal } from "@/modals";
import { Pencil, Trash2, Scan, Download, Activity, Copy } from "lucide-react";
import { toast } from "sonner";

interface DeviceDetailSheetProps {
  devices: TransformedDevice[];
}

export function DeviceDetailSheet({ devices }: DeviceDetailSheetProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((device) => (
        <DeviceDetailSheetItem key={device.id} device={device} />
      ))}
    </div>
  );
}

function DeviceDetailSheetItem({ device }: { device: TransformedDevice }) {
  // Each device has its own Sheet with its own data loading
  const { data: deviceDetail, isLoading: isLoadingDetail } =
    useDeviceDetailQuery(device.id);

  // Action handlers
  const handleEdit = () => {
    pushModal("EditDevice", {
      deviceId: device.id,
      device: device,
    });
  };

  const handleDelete = () => {
    pushModal("DeleteDeviceConfirm", {
      deviceId: device.id,
      deviceName: device.name,
    });
  };

  const handleCopyIP = async () => {
    if (!device?.ip) return;
    try {
      await navigator.clipboard.writeText(device.ip);
      toast.success("IP address copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy IP address");
    }
  };

  const handleScan = () => {
    toast.info("Scan functionality coming soon!");
    // TODO: Implement scan functionality
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <div className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg transition-colors">
          <DeviceCard device={device} />
        </div>
      </SheetTrigger>
      <SheetContent className="w-[95vw] max-w-[1200px] min-w-[800px]">
        <SheetHeader className="mb-6">
          <div className="flex flex-col gap-3">
            <SheetTitle className="text-left">{device.name}</SheetTitle>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleScan}
                className="flex items-center gap-2"
              >
                <Scan className="h-4 w-4" />
                <span className="hidden sm:inline">Scan</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="flex items-center gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <DeviceOpenPorts
            deviceDetail={deviceDetail}
            isLoading={isLoadingDetail}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
