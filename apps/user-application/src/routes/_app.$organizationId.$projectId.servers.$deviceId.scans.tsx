import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { derivePortStats, type ScanRun, type EnrichedScanResultSummary } from "@repo/data-ops";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Globe,
  Terminal,
  Database,
  HelpCircle,
} from "lucide-react";
import {
  getServiceDisplay,
  groupPortsByCategory,
  getServicesSummary,
  type ServiceCategory,
} from "@/lib/port-service-names";

/**
 * Pending component for device scans tab
 */
const DeviceScansPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/$deviceId/scans")({
  pendingComponent: DeviceScansPending,
  component: DeviceScansPage,
});

/**
 * Category icons mapping
 */
const CATEGORY_ICONS: Record<ServiceCategory, React.ReactNode> = {
  web: <Globe className="h-4 w-4" />,
  remote: <Terminal className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  email: <Globe className="h-4 w-4" />,
  file: <Globe className="h-4 w-4" />,
  cache: <Database className="h-4 w-4" />,
  message: <Globe className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  web: 'Web Services',
  remote: 'Remote Access',
  database: 'Databases',
  email: 'Email',
  file: 'File Sharing',
  cache: 'Cache',
  message: 'Messaging',
  other: 'Other Services',
};

function DeviceScansPage() {
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

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
        {scanHistory.map((scan: ScanRun) => (
          <ScanCard key={scan.id} scan={scan} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual scan card with improved UX
 */
function ScanCard({ scan }: { scan: ScanRun }) {
  const [showLowRisk, setShowLowRisk] = useState(false);
  const [showOtherServices, setShowOtherServices] = useState(false);

  const resultSummary = scan.resultSummary as EnrichedScanResultSummary | undefined;
  const portStats = derivePortStats(
    resultSummary?.portSnapshots,
    resultSummary?.portScanStats
  );
  const openPorts = portStats.ports;
  const cveEnrichment = resultSummary?.cveEnrichment;
  const summary = cveEnrichment?.summary;

  // Calculate actionable issues (Critical + High)
  const actionableCount = (summary?.totalCritical || 0) + (summary?.totalHigh || 0);
  const lowRiskCount = (summary?.totalMedium || 0) + (summary?.totalLow || 0);

  // Group ports by category
  const portGroups = groupPortsByCategory(openPorts);

  // Get primary categories (web, remote, database) and others
  const primaryCategories: ServiceCategory[] = ['web', 'remote', 'database'];
  const otherCategories: ServiceCategory[] = ['email', 'file', 'cache', 'message', 'other'];
  const otherPorts = otherCategories.flatMap(cat => portGroups[cat]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            {/* Relative time as main header */}
            <h3 className="text-base font-semibold">
              {formatDistanceToNow(new Date(scan.requestedAt), { addSuffix: true })}
            </h3>
            {/* Absolute time as secondary */}
            <p className="text-sm text-muted-foreground">
              {format(new Date(scan.requestedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>

          {/* Risk-first badge */}
          <div className="flex gap-2">
            {actionableCount > 0 ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {actionableCount} {actionableCount === 1 ? 'issue' : 'issues'} to review
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle className="h-3 w-3" />
                No action needed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Services Summary */}
        {openPorts.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Services: {getServicesSummary(openPorts)}
            </p>

            {/* Primary service groups */}
            <div className="space-y-2">
              {primaryCategories.map(category => {
                const ports = portGroups[category];
                if (ports.length === 0) return null;

                return (
                  <div key={category} className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {CATEGORY_ICONS[category]}
                    </span>
                    <span className="text-sm font-medium">
                      {CATEGORY_LABELS[category]}:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {ports.map(port => (
                        <Badge key={port.port} variant="outline" className="text-xs">
                          {getServiceDisplay(port.port, port.service?.name)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Collapsible other services */}
            {otherPorts.length > 0 && (
              <Collapsible open={showOtherServices} onOpenChange={setShowOtherServices}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground">
                    {showOtherServices ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    {otherPorts.length} other service{otherPorts.length > 1 ? 's' : ''}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      <HelpCircle className="h-4 w-4" />
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {otherPorts.map(port => (
                        <Badge key={port.port} variant="outline" className="text-xs font-mono">
                          {port.port}/{port.protocol}
                          {port.service?.name && ` (${port.service.name})`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No open ports detected</p>
        )}

        {/* Vulnerability Summary */}
        {cveEnrichment && (
          <div className="pt-3 border-t space-y-2">
            {/* Critical and High - Always visible */}
            {actionableCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {(summary?.totalCritical ?? 0) > 0 && (
                  <Badge variant="destructive">
                    {summary?.totalCritical} Critical
                  </Badge>
                )}
                {(summary?.totalHigh ?? 0) > 0 && (
                  <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">
                    {summary?.totalHigh} High
                  </Badge>
                )}
              </div>
            )}

            {/* Medium and Low - Collapsible */}
            {lowRiskCount > 0 && (
              <Collapsible open={showLowRisk} onOpenChange={setShowLowRisk}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground">
                    {showLowRisk ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    {lowRiskCount} low-risk finding{lowRiskCount > 1 ? 's' : ''}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    {(summary?.totalMedium ?? 0) > 0 && (
                      <Badge variant="secondary">
                        {summary?.totalMedium} Medium
                      </Badge>
                    )}
                    {(summary?.totalLow ?? 0) > 0 && (
                      <Badge variant="outline">
                        {summary?.totalLow} Low
                      </Badge>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
