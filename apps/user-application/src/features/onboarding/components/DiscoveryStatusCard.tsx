import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import type { DiscoveryStatus } from "../types/discovery-status";

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
  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true && discoveryStatus.result) {
      const allSubdomains = discoveryStatus.result.uniqueSubdomains.map(
        (s) => s.subdomain,
      );
      onSubdomainSelectionChange(new Set(allSubdomains));
    } else {
      onSubdomainSelectionChange(new Set());
    }
  };

  const handleToggleSubdomain = (subdomain: string, checked: boolean) => {
    const newSelected = new Set(selectedSubdomains);
    if (checked) {
      newSelected.add(subdomain);
    } else {
      newSelected.delete(subdomain);
    }
    onSubdomainSelectionChange(newSelected);
  };

  const isAllSelected =
    discoveryStatus.result &&
    selectedSubdomains.size ===
      discoveryStatus.result.uniqueSubdomains.length &&
    selectedSubdomains.size > 0;

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

            {/* Workflow ID */}
            {discoveryStatus.workflowId && (
              <p className="text-xs text-muted-foreground font-mono">
                Workflow ID: {discoveryStatus.workflowId}
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
                          {discoveryStatus.result.errors.map((error, idx) => (
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
                {discoveryStatus.result.uniqueSubdomains.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Discovered Subdomains:
                    </p>
                    <div className="max-h-64 overflow-y-auto border rounded">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-background border-b">
                          <tr>
                            <th className="h-10 px-4 text-left w-12">
                              <Checkbox
                                id="select-all"
                                checked={isAllSelected}
                                onCheckedChange={handleSelectAll}
                                className="ring-offset-0 focus-visible:ring-0"
                              />
                            </th>
                            <th className="h-10 px-4 text-left font-semibold">
                              Subdomain
                            </th>
                            <th className="h-10 px-4 text-left font-semibold">
                              IP Address
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {discoveryStatus.result.uniqueSubdomains.map(
                            (item, idx) => {
                              const isSelected = selectedSubdomains.has(
                                item.subdomain,
                              );
                              return (
                                <tr
                                  key={idx}
                                  className="border-t hover:bg-muted/50 h-12"
                                >
                                  <td className="px-4 py-3">
                                    <Checkbox
                                      id={`subdomain-${idx}`}
                                      checked={isSelected}
                                      onCheckedChange={(checked) =>
                                        handleToggleSubdomain(
                                          item.subdomain,
                                          checked === true,
                                        )
                                      }
                                      className="ring-offset-0 focus-visible:ring-0"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-mono text-sm">
                                      {item.subdomain}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-mono text-sm text-muted-foreground">
                                      {item.ip || "-"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-muted-foreground h-5">
                      {selectedSubdomains.size > 0 ? (
                        <>
                          {selectedSubdomains.size} subdomain
                          {selectedSubdomains.size !== 1 ? "s" : ""} selected
                        </>
                      ) : (
                        <span className="opacity-0">0 subdomains selected</span>
                      )}
                    </div>
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
