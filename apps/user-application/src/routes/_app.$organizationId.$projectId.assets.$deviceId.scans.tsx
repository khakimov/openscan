import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { derivePortStats } from "@repo/data-ops";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

/**
 * Pending component for device scans tab
 * Parent layout already shows tabs, so just show inline spinner
 */
const DeviceScansPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/$deviceId/scans")({
  pendingComponent: DeviceScansPending,
  loader: async ({ context, params }) => {
    // Prefetch scan history for SSR using tRPC
    await context.queryClient.ensureQueryData(
      context.trpc.device.scanHistory.queryOptions({ deviceId: params.deviceId, limit: 50 })
    );
  },
  component: DeviceScansPage,
});

function DeviceScansPage() {
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Load scan history with tRPC
  const { data: scanHistoryData } = useQuery({
    ...trpc.device.scanHistory.queryOptions({ deviceId, limit: 50 }),
    queryFn: () => trpcClient.device.scanHistory.query({ deviceId, limit: 50 }),
  });

  const scanHistory = scanHistoryData?.history || [];

  if (scanHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No scan history available for this device.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-6">
      <h2 className="text-xl font-semibold">Scan History</h2>

      <div className="grid gap-4">
        {scanHistory.map((scan: any) => {
          // ✅ Derive port stats from canonical portSnapshots (sec-zg2)
          const portStats = derivePortStats(
            (scan.resultSummary as any)?.portSnapshots,
            (scan.resultSummary as any)?.portScanStats
          );
          const openPorts = portStats.ports;
          const cveEnrichment = (scan.resultSummary as any)?.cveEnrichment;

          return (
            <Card key={scan.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Scan #{scan.id.slice(0, 8)}
                    </CardTitle>
                    <CardDescription>
                      {format(new Date(scan.requestedAt), "MMM dd, yyyy 'at' h:mm a")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {openPorts.length > 0 && (
                      <Badge variant="secondary">
                        {openPorts.length} {openPorts.length === 1 ? 'port' : 'ports'}
                      </Badge>
                    )}
                    {cveEnrichment?.summary?.totalCves > 0 && (
                      <Badge variant="destructive">
                        {cveEnrichment.summary.totalCves} CVEs
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {openPorts.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Open Ports:</p>
                    <div className="flex flex-wrap gap-2">
                      {openPorts.slice(0, 10).map((port: any) => (
                        <Badge key={port.port} variant="outline" className="font-mono">
                          {port.port}/{port.protocol}
                          {port.service?.name && ` (${port.service.name})`}
                        </Badge>
                      ))}
                      {openPorts.length > 10 && (
                        <Badge variant="outline">
                          +{openPorts.length - 10} more
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No open ports detected</p>
                )}

                {cveEnrichment && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Vulnerability Summary:</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cveEnrichment.summary.totalCritical > 0 && (
                        <Badge variant="destructive">
                          {cveEnrichment.summary.totalCritical} Critical
                        </Badge>
                      )}
                      {cveEnrichment.summary.totalHigh > 0 && (
                        <Badge variant="destructive" className="bg-orange-500">
                          {cveEnrichment.summary.totalHigh} High
                        </Badge>
                      )}
                      {cveEnrichment.summary.totalMedium > 0 && (
                        <Badge variant="secondary">
                          {cveEnrichment.summary.totalMedium} Medium
                        </Badge>
                      )}
                      {cveEnrichment.summary.totalLow > 0 && (
                        <Badge variant="outline">
                          {cveEnrichment.summary.totalLow} Low
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
