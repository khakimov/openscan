import { useQuery } from '@tanstack/react-query';
import { getScans } from '@/server/scans';
import { QUERY_CONFIG } from '@repo/constants';

export const SCANS_TABLE_QUERY_KEY = ['scans-table'];

type Scan = {
  status: string;
  [key: string]: any;
};

export function useScansTableQuery() {
  return useQuery({
    queryKey: SCANS_TABLE_QUERY_KEY,
    queryFn: () => getScans(),
    refetchInterval: (query) => {
      const data = query.state.data;
      // Only poll if there are active scans (PENDING or RUNNING)
      if (!data?.success || !Array.isArray(data.data)) {
        return false;
      }

      const hasActiveScans = data.data.some(
        (scan: Scan) => scan.status === "PENDING" || scan.status === "RUNNING"
      );

      return hasActiveScans ? QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_3 : false; // Poll every 3 seconds only if needed
    },
    refetchIntervalInBackground: false, // Only poll when tab is active
    keepPreviousData: true, // Prevent jank by keeping old data during refetch
    ...QUERY_CONFIG.DEFAULTS.DYNAMIC_DATA,
  });
}