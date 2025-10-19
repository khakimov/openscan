import { Button } from "@/components/ui/button";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import type { DiscoveryStatus } from "../types/discovery-status";
import { DiscoveryResultsTable } from "@/components/discovery/discovery-results-table";
import type { DiscoveryResultItem } from "@/components/discovery/discovery-results-table";

interface DiscoveryStatusCardProps {
  /**
   * Current discovery workflow status
   */
  discoveryStatus: DiscoveryStatus;

  /**
   * Set of selected subdomain strings
   */
  selectedSubdomains: Set<string>;

  /**
   * Callback when subdomain selection changes
   */
  onSubdomainSelectionChange: (selectedSubdomains: Set<string>) => void;

  /**
   * Callback when user wants to continue to next step
   */
  onContinue?: () => void;

  /**
   * Callback when user wants to skip discovery
   */
  onSkip?: () => void;

  /**
   * Whether skip button should be shown
   */
  showSkipButton?: boolean;
}

export function DiscoveryStatusCard({
  discoveryStatus,
  selectedSubdomains,
  onSubdomainSelectionChange,
  onContinue,
  onSkip,
  showSkipButton = false,
}: DiscoveryStatusCardProps) {
  // Get discovery items from result, filter out items without IP
  const discoveryItems: DiscoveryResultItem[] = discoveryStatus.result
    ? discoveryStatus.result.uniqueSubdomains.filter((s: any) => s.ip).map((s: any) => ({
        host: s.subdomain,
        ip: s.ip,
      }))
    : [];

  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-6 shadow-sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          {discoveryStatus.status === "RUNNING" && (
            <Search className="h-5 w-5 text-blue-500 animate-pulse mt-0.5" />
          )}
          {discoveryStatus.status === "COMPLETED" && (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
          )}
          {discoveryStatus.status === "FAILED" && (
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
          )}

          <div className="flex-1 space-y-2 min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Discovery Status</h3>
              <span className="text-sm text-muted-foreground">
                {discoveryStatus.status}
              </span>
            </div>

            {/* Message */}
            {discoveryStatus.message && (
              <p className="text-sm text-muted-foreground">
                {discoveryStatus.message}
              </p>
            )}

            {/* Error Display */}
            {discoveryStatus.error && (
              <div className="space-y-3">
                <p className="text-sm text-red-600">{discoveryStatus.error}</p>

                {showSkipButton && onSkip && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Discovery is currently being integrated with Cloudflare
                      Workers. You can skip this step for now.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onSkip}
                      className="w-full"
                    >
                      Skip Discovery and Continue
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Scan ID */}
            {discoveryStatus.scanId && (
              <p className="text-xs text-muted-foreground font-mono">
                Scan ID: {discoveryStatus.scanId}
              </p>
            )}

            {/* Results Display */}
            {discoveryStatus.result && (
              <div className="mt-4 space-y-3">
                {/* Errors from discovery result */}
                {discoveryStatus.result.errors && discoveryStatus.result.errors.length > 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-yellow-900">
                          Discovery completed with {discoveryStatus.result.errors.length} warning{discoveryStatus.result.errors.length !== 1 ? 's' : ''}
                        </p>
                        <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
                          {discoveryStatus.result.errors.map((error: string, idx: number) => (
                            <li key={idx} className="break-words">{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total Count */}
                <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Total Subdomains</span>
                  <span className="text-sm font-semibold">
                    {discoveryStatus.result.totalSubdomains}
                  </span>
                </div>

                {/* Subdomains Table */}
                {discoveryItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Discovered Subdomains:
                    </p>
                    <DiscoveryResultsTable
                      items={discoveryItems}
                      selectedHosts={selectedSubdomains}
                      onSelectionChange={onSubdomainSelectionChange}
                      maxHeight="max-h-64"
                    />
                  </div>
                )}

                {/* Continue Button */}
                {onContinue && (
                  <Button
                    type="button"
                    onClick={onContinue}
                    className="w-full mt-4"
                  >
                    Continue to Monitoring Setup
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
