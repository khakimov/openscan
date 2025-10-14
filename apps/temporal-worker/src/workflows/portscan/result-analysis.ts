import { activityInfo } from "@temporalio/activity";
import { createLogger } from "@repo/logger";
import type { DiscoveredPort } from '@repo/temporal/contracts';

const logger = createLogger({ name: "portscan-analysis" });

/**
 * Analyze port scan results for insights and filtering
 *
 * Returns all ports (open, closed, filtered) to preserve retry logic data.
 * Use filterOpenPorts() if you need only open ports for final results.
 */
export async function analyzePortScanResults(
  results: DiscoveredPort[],
): Promise<DiscoveredPort[]> {
  const activityId = activityInfo().activityId;

  logger.info(`[${activityId}] Analyzing ${results.length} port scan results`);

  // Return all results unchanged - no filtering
  // Downstream logic may need closed/filtered states for retry logic
  logger.info(`[${activityId}] Analysis complete`, {
    resultsAnalyzed: results.length,
    openPorts: results.filter((r) => r.state === "open").length,
    closedPorts: results.filter((r) => r.state === "closed").length,
    filteredPorts: results.filter((r) => r.state === "filtered").length,
  });

  return results;
}

/**
 * Filter port scan results to include only open ports
 *
 * Use this helper when you explicitly want to exclude closed/filtered ports
 * from final results, but preserve them in intermediate steps for retry logic.
 *
 * @param results - Port scan results to filter
 * @returns Only open ports, with tcpwrapped false positives removed
 */
export function filterOpenPorts(results: DiscoveredPort[]): DiscoveredPort[] {
  return results.filter((result) => {
    // Only include open ports
    if (result.state !== "open") {
      return false;
    }

    // Filter out tcpwrapped false positives on uncommon ports
    if (result.service?.name === "tcpwrapped" && !isCommonPort(result.port)) {
      return false;
    }

    return true;
  });
}

/**
 * Check if a port is commonly used
 */
function isCommonPort(port: number): boolean {
  const commonPorts = [
    21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 993, 995, 1723, 3306,
    3389, 5432, 5900, 8080, 8443, 8888,
  ];

  return commonPorts.includes(port);
}
