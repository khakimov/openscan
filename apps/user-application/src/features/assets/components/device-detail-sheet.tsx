'use client';

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
import { pushModal } from "@/modals";
import { Pencil, Trash2, Scan } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { deviceQueries } from "@/queries/device-queries";

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
  // Each device has its own Sheet with its own data loading using queryOptions
  const { data: deviceDetail, isLoading: isLoadingDetail } = useQuery({
    ...deviceQueries.detail(device.id),
  });

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
      <SheetContent
        className="w-full sm:w-[90vw] sm:min-w-[640px] lg:w-[80vw] lg:min-w-[800px] max-w-[1200px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-6">
          <div className="flex flex-col gap-3">
            <SheetTitle className="text-left">{device.name}</SheetTitle>
            <SheetDescription className="text-left">
              View device details, open ports, and security information
            </SheetDescription>

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

        <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-200px)] px-4">
          <DeviceOpenPorts
            deviceDetail={deviceDetail as TransformedDevice | undefined}
            isLoading={isLoadingDetail}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
