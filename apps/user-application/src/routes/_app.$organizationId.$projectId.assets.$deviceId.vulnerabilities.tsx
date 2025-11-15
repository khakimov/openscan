import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import type { CVEEnrichment, CVEDetail } from "@repo/data-ops";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

/**
 * Pending component for device vulnerabilities tab
 * Parent layout already shows tabs, so just show inline spinner
 */
const DeviceVulnerabilitiesPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/$deviceId/vulnerabilities")({
  pendingComponent: DeviceVulnerabilitiesPending,
  loader: async ({ context, params }) => {
    // Prefetch scan history to get CVE data using tRPC
    await context.queryClient.ensureQueryData(
      context.trpc.device.scanHistory.queryOptions({ deviceId: params.deviceId, limit: 1 })
    );
  },
  component: DeviceVulnerabilitiesPage,
});

function DeviceVulnerabilitiesPage() {
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Load latest scan with CVE enrichment data using tRPC
  const { data: scanHistoryData } = useQuery({
    ...trpc.device.scanHistory.queryOptions({ deviceId, limit: 1 }),
    queryFn: () => trpcClient.device.scanHistory.query({ deviceId, limit: 1 }),
  });

  // Extract CVE enrichment data from the latest scan
  const cveEnrichment = useMemo<CVEEnrichment | null>(() => {
    if (!scanHistoryData?.success || !scanHistoryData.history?.length) {
      return null;
    }

    const latestScan = scanHistoryData.history[0];
    const resultSummary = latestScan.resultSummary as { cveEnrichment?: CVEEnrichment };

    return resultSummary?.cveEnrichment || null;
  }, [scanHistoryData]);

  if (!cveEnrichment) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Vulnerability Data</h3>
        <p className="text-muted-foreground">
          Run a scan to detect vulnerabilities on this device.
        </p>
      </div>
    );
  }

  const { summary, applications = [], os } = cveEnrichment;

  return (
    <div className="space-y-6 mt-6">
      {/* Summary Alert */}
      {summary && summary.totalCves > 0 && (
        <Alert variant={summary.totalCritical > 0 ? "destructive" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{summary.totalCves} total vulnerabilities</strong> found across{" "}
            {summary.affectedServices} {summary.affectedServices === 1 ? 'service' : 'services'}.
            {summary.totalCritical > 0 && (
              <span className="block mt-1">
                {summary.totalCritical} critical vulnerabilities require immediate attention.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Vulnerability Summary</CardTitle>
          <CardDescription>
            Based on scan from {new Date(cveEnrichment.enrichedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {summary.totalCritical > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-base px-3 py-1">
                  {summary.totalCritical}
                </Badge>
                <span className="text-sm">Critical</span>
              </div>
            )}
            {summary.totalHigh > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="bg-orange-500 text-base px-3 py-1">
                  {summary.totalHigh}
                </Badge>
                <span className="text-sm">High</span>
              </div>
            )}
            {summary.totalMedium > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {summary.totalMedium}
                </Badge>
                <span className="text-sm">Medium</span>
              </div>
            )}
            {summary.totalLow > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-base px-3 py-1">
                  {summary.totalLow}
                </Badge>
                <span className="text-sm">Low</span>
              </div>
            )}
          </div>

          {summary.maxCvssScore && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Maximum CVSS Score: <strong>{summary.maxCvssScore.toFixed(1)}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OS Vulnerabilities */}
      {os && os.cveCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Operating System Vulnerabilities</CardTitle>
            <CardDescription>
              {os.product} - {os.cveCount} {os.cveCount === 1 ? 'vulnerability' : 'vulnerabilities'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {os.cves.slice(0, 10).map((cve: CVEDetail) => (
                <div key={cve.cveId} className="border-l-2 border-l-red-500 pl-3 py-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold">{cve.cveId}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cve.description || 'No description available'}
                      </p>
                    </div>
                    {cve.cvssScore && (
                      <Badge
                        variant={cve.cvssScore >= 9.0 ? "destructive" : "secondary"}
                        className="ml-2 shrink-0"
                      >
                        {cve.cvssScore.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {os.cves.length > 10 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{os.cves.length - 10} more vulnerabilities
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Application Vulnerabilities */}
      {applications.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Application Vulnerabilities</h2>
          {applications.map((app) => (
            <Card key={`${app.name}-${app.port}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {app.name} {app.version && `(${app.version})`}
                </CardTitle>
                <CardDescription>
                  Port {app.port} - {app.cveCount} {app.cveCount === 1 ? 'vulnerability' : 'vulnerabilities'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {app.cves.slice(0, 5).map((cve: CVEDetail) => (
                    <div key={cve.cveId} className="border-l-2 border-l-orange-500 pl-3 py-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm font-semibold">{cve.cveId}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {cve.description || 'No description available'}
                          </p>
                        </div>
                        {cve.cvssScore && (
                          <Badge
                            variant={cve.cvssScore >= 9.0 ? "destructive" : "secondary"}
                            className="ml-2 shrink-0"
                          >
                            {cve.cvssScore.toFixed(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {app.cves.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center pt-2">
                      +{app.cves.length - 5} more vulnerabilities
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
