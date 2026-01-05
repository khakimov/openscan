'use client';

import { type TransformedDevice } from "@repo/contracts/device";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "./device-card";
import { DeviceOpenPorts } from "./device-open-ports";
import { pushModal } from "@/modals";
import { Pencil, Trash2, Scan, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { Link } from "@tanstack/react-router";

interface DeviceDetailSheetProps {
  devices: TransformedDevice[];
  newlyAddedIds?: Set<string>; // Track newly added devices for animation
  projectId?: string;
  organizationId?: string;
}

export function DeviceDetailSheet({ devices, newlyAddedIds, projectId, organizationId }: DeviceDetailSheetProps) {
  // Debug: Log device IDs to catch corruption
  const suspiciousDevices = devices.filter(d =>
    d.id.includes('/') || d.id.includes('?') || d.id.includes('&')
  );
  if (suspiciousDevices.length > 0) {
    console.error('[DeviceDetailSheet] Found devices with suspicious IDs:', suspiciousDevices.map(d => ({
      id: d.id,
      name: d.name,
      ip: d.ip
    })));
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((device) => (
        <DeviceDetailSheetItem
          key={device.id}
          device={device}
          isNewlyAdded={newlyAddedIds?.has(device.id)}
          projectId={projectId}
          organizationId={organizationId}
        />
      ))}
    </div>
  );
}

function DeviceDetailSheetItem({
  device,
  isNewlyAdded = false,
  projectId,
  organizationId
}: {
  device: TransformedDevice;
  isNewlyAdded?: boolean;
  projectId?: string;
  organizationId?: string;
}) {
  // Validate device.id is actually a valid ID (not a URL path)
  const isValidDeviceId = Boolean(device.id && !device.id.includes('/') && !device.id.includes('?'));

  // Each device has its own Sheet with its own data loading using tRPC
  // Note: organizationId comes from session on server, not passed as parameter
  const shouldFetch = isValidDeviceId;
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const { data: deviceDetail, isLoading: isLoadingDetail } = useQuery({
    ...trpc.device.detail.queryOptions({
      deviceId: device.id,
      projectId: projectId ?? undefined,
    }),
    queryFn: () => trpcClient.device.detail.query({
      deviceId: device.id,
      projectId: projectId ?? undefined,
    }),
    enabled: shouldFetch,
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
          <DeviceCard device={device} isNewlyAdded={isNewlyAdded} />
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

        {/* Footer with link to full device page */}
        {organizationId && projectId && (
          <SheetFooter className="border-t pt-4 px-4">
            <Link
              to="/$organizationId/$projectId/servers/$deviceId"
              params={{
                organizationId,
                projectId,
                deviceId: device.id,
              }}
              data-tour="view-details-btn"
            >
              <Button variant="outline" className="w-full gap-2">
                <ExternalLink className="h-4 w-4" />
                View Full Device Details
              </Button>
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
