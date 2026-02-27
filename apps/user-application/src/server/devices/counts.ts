/**
 * Device counts server function
 * Used by routes to prefetch device counts for tab counters
 */

import { createServerFn } from "@tanstack/react-start";
import { getDeviceCounts } from "@repo/data-ops";
import { getCurrentOrganizationId } from "@/server/utils/auth";

export interface DeviceCounts {
  CANDIDATE: number;
  VERIFIED: number;
  EXCLUDED: number;
  total: number;
}

/**
 * Get device counts by verification status
 * Lightweight query for tab counters
 */
export const getDeviceCountsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator((data: { projectId?: string }) => data)
  .handler(async ({ data }): Promise<DeviceCounts> => {
    const organizationId = await getCurrentOrganizationId();
    
    const counts = await getDeviceCounts(
      organizationId,
      data.projectId
    );
    
    return counts;
  });
