import { createFileRoute } from "@tanstack/react-router";
import { DeviceOpenPorts } from "@/features/assets/components/device-open-ports";
import { deviceQueries } from "@/queries/device-queries";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { TransformedDevice } from "@/server/devices";

export const Route = createFileRoute("/_app/$organizationId/$projectId/$deviceId/")({
  component: DeviceOverview,
});

function DeviceOverview() {
  const { deviceId } = Route.useParams();

  // Load device detail with suspense (already prefetched by parent)
  const { data: device } = useSuspenseQuery(deviceQueries.detail(deviceId));

  // Fetch scan history to get CVE enrichment data
  const { data: scanHistoryData } = useQuery({
    ...deviceQueries.scanHistory(deviceId, 1), // Get latest scan only
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

  return (
    <div className="space-y-6">
      <DeviceOpenPorts
        deviceDetail={device as TransformedDevice}
        isLoading={false}
        cveEnrichment={cveEnrichment}
      />

      {/* CVE Enrichment Data - Raw Display */}
      {cveEnrichment && (
        <div className="border rounded-lg p-4">
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
  );
}
