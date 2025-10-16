import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { QUERY_CONFIG } from '@repo/constants';
import {
  getDeviceDetailData,
  getDeviceVulnerabilitiesData,
  type TransformedDevice,
} from "@/server/devices";
// Types are inferred from server function return types

export const DEVICE_DETAIL_QUERY_KEY = (deviceId: string) => [
  "device-detail",
  deviceId,
];
export const DEVICE_VULNERABILITIES_QUERY_KEY = (
  deviceId: string,
  page: number,
) => ["device-vulnerabilities", deviceId, page];

export function useDeviceDetailQuery(deviceId: string | null) {
  return useQuery<TransformedDevice>({
    queryKey: deviceId ? DEVICE_DETAIL_QUERY_KEY(deviceId) : ["device-detail"],
    queryFn: async (): Promise<TransformedDevice> => {
      if (!deviceId) throw new Error("No device ID provided");
      console.log('📡 useDeviceDetailQuery: Fetching fresh device detail...', { deviceId });
      const result = await getDeviceDetailData({ data: { deviceId } });
      console.log('✅ useDeviceDetailQuery: Fresh device detail received', {
        deviceId,
        device: {
          id: result.id,
          name: result.name,
          ip: result.ip,
          tags: result.tags
        }
      });
      return result as TransformedDevice;
    },
    enabled: !!deviceId,
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA, // 5 minutes
  });
}

export function useDeviceDetailSuspenseQuery(deviceId: string) {
  return useSuspenseQuery({
    queryKey: DEVICE_DETAIL_QUERY_KEY(deviceId),
    queryFn: () => getDeviceDetailData({ data: { deviceId } }),
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
}

export function useDeviceVulnerabilitiesQuery(
  deviceId: string | null,
  page: number = 1,
  sortByCvss: boolean = true,
) {
  return useQuery({
    queryKey: deviceId
      ? DEVICE_VULNERABILITIES_QUERY_KEY(deviceId, page)
      : ["device-vulnerabilities"],
    queryFn: async () => {
      if (!deviceId) throw new Error("No device ID provided");

      const vulns = await getDeviceVulnerabilitiesData({
        data: {
          deviceId,
          page,
          sortColumn: sortByCvss ? "cvssScore" : undefined,
          sortDirection: sortByCvss ? "descending" : undefined,
        },
      });

      // Sort by CVSS if requested
      if (sortByCvss && vulns.items) {
        const sortedItems = [...vulns.items].sort((a, b) => {
          const scoreA = typeof a.cvss_score === "number" ? a.cvss_score : 0;
          const scoreB = typeof b.cvss_score === "number" ? b.cvss_score : 0;
          return scoreB - scoreA;
        });

        return {
          ...vulns,
          items: sortedItems,
        };
      }

      return vulns;
    },
    enabled: !!deviceId,
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
}

export function useAllDeviceVulnerabilitiesQuery(
  deviceId: string | null,
  sortByCvss: boolean = true,
) {
  return useQuery({
    queryKey: deviceId
      ? ["device-vulnerabilities-all", deviceId]
      : ["device-vulnerabilities-all"],
    queryFn: async () => {
      if (!deviceId) throw new Error("No device ID provided");

      // First, get page 1 to know total pages
      const firstPage = await getDeviceVulnerabilitiesData({
        data: {
          deviceId,
          page: 1,
          sortColumn: sortByCvss ? "cvssScore" : undefined,
          sortDirection: sortByCvss ? "descending" : undefined,
        },
      });

      if (!firstPage.totalPages || firstPage.totalPages <= 1) {
        // Sort by CVSS if requested
        if (sortByCvss && firstPage.items) {
          const sortedItems = [...firstPage.items].sort((a, b) => {
            const scoreA = typeof a.cvss_score === "number" ? a.cvss_score : 0;
            const scoreB = typeof b.cvss_score === "number" ? b.cvss_score : 0;
            return scoreB - scoreA;
          });

          return {
            ...firstPage,
            items: sortedItems,
          };
        }
        return firstPage;
      }

      // Fetch all remaining pages
      const remainingPages = Array.from(
        { length: firstPage.totalPages - 1 },
        (_, i) => i + 2,
      );

      const allPages = await Promise.all([
        Promise.resolve(firstPage),
        ...remainingPages.map((page) =>
          getDeviceVulnerabilitiesData({
            data: {
              deviceId,
              page,
              sortColumn: sortByCvss ? "cvssScore" : undefined,
              sortDirection: sortByCvss ? "descending" : undefined,
            },
          }),
        ),
      ]);

      // Combine all items
      const allItems = allPages.flatMap((page) => page.items || []);

      // Sort by CVSS if requested
      const finalItems = sortByCvss
        ? allItems.sort((a, b) => {
            const scoreA = typeof a.cvss_score === "number" ? a.cvss_score : 0;
            const scoreB = typeof b.cvss_score === "number" ? b.cvss_score : 0;
            return scoreB - scoreA;
          })
        : allItems;

      return {
        ...firstPage,
        items: finalItems,
        page: 1,
        totalPages: 1, // Since we're showing all items on one "page"
      };
    },
    enabled: !!deviceId,
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
}
