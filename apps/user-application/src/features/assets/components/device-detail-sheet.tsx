'use client';

import { type TransformedDevice } from "@/server/devices";
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
import { deviceQueries } from "@/queries/device-queries";
import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";

interface DeviceDetailSheetProps {
  devices: TransformedDevice[];
  newlyAddedIds?: Set<string>; // Track newly added devices for animation
}

export function DeviceDetailSheet({ devices, newlyAddedIds }: DeviceDetailSheetProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((device) => (
        <DeviceDetailSheetItem
          key={device.id}
          device={device}
          isNewlyAdded={newlyAddedIds?.has(device.id)}
        />
      ))}
    </div>
  );
}

function DeviceDetailSheetItem({
  device,
  isNewlyAdded = false
}: {
  device: TransformedDevice;
  isNewlyAdded?: boolean;
}) {
  // Get organizationId and projectId from route params
  const params = useParams({ strict: false });
  const organizationId = 'organizationId' in params ? params.organizationId as string : null;
  const projectId = 'projectId' in params ? params.projectId as string : null;
  // Each device has its own Sheet with its own data loading using queryOptions
  const { data: deviceDetail, isLoading: isLoadingDetail } = useQuery({
    ...deviceQueries.detail(device.id),
  });

  // Fetch scan history to get CVE enrichment data
  const { data: scanHistoryData } = useQuery({
    ...deviceQueries.scanHistory(device.id, 1), // Get latest scan only
  });

  // Extract CVE enrichment data from the latest scan
  const cveEnrichment = useMemo(() => {
    if (!scanHistoryData?.success || !scanHistoryData.history?.length) {
      return null;
    }

    const latestScan = scanHistoryData.history[0];
    const resultSummary = latestScan.resultSummary as any;

    return resultSummary?.cveEnrichment || null;
  }, [scanHistoryData]);

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
            cveEnrichment={cveEnrichment}
          />

          {/* CVE Enrichment Data - Raw Display */}
          {cveEnrichment && (
            <div className="mt-6 border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">CVE Enrichment Data (Raw)</h3>
              <div className="space-y-2 text-xs">
                <div>
                  <strong>Enriched At:</strong> {cveEnrichment.enrichedAt}
                </div>
                <div>
                  <strong>Necto Version:</strong> {cveEnrichment.nectoVersion}
                </div>

                {/* Summary Stats */}
                {cveEnrichment.summary && (
                  <div className="mt-3">
                    <strong>Summary:</strong>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(cveEnrichment.summary, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Applications with CVEs */}
                {cveEnrichment.applications && cveEnrichment.applications.length > 0 && (
                  <div className="mt-3">
                    <strong>Applications with CVEs:</strong>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-96">
                      {JSON.stringify(cveEnrichment.applications, null, 2)}
                    </pre>
                  </div>
                )}

                {/* OS CVEs */}
                {cveEnrichment.os && (
                  <div className="mt-3">
                    <strong>OS Vulnerabilities:</strong>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(cveEnrichment.os, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer with link to full device page */}
        {organizationId && projectId && (
          <SheetFooter className="border-t pt-4 px-4">
            <Link
              to="/$organizationId/$projectId/$deviceId"
              params={{
                organizationId,
                projectId,
                deviceId: device.id,
              }}
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
