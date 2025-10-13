import { useQuery, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import { getScanSurfaceEntriesData } from '@/server/scan-surface';

export const SCANS_QUERY_KEY = ['scans'];

export function useScansQuery() {
  return useQuery({
    queryKey: SCANS_QUERY_KEY,
    queryFn: async () => {
      const response = await getScanSurfaceEntriesData({
        data: { page: 1 }
      });
      return response;
    },
    refetchOnWindowFocus: false,
    ...QUERY_CONFIG.DEFAULTS.DYNAMIC_DATA,
  });
}

export function useScansSuspenseQuery() {
  return useSuspenseQuery({
    queryKey: SCANS_QUERY_KEY,
    queryFn: async () => {
      const response = await getScanSurfaceEntriesData({
        data: { page: 1 }
      });
      return response;
    },
    refetchOnWindowFocus: false,
    ...QUERY_CONFIG.DEFAULTS.DYNAMIC_DATA,
  });
}

export function useInvalidateScans() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: SCANS_QUERY_KEY });
  };
}