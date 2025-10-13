import { useQuery } from '@tanstack/react-query';
import { getDevicesData } from '@/server/devices';
import { QUERY_CONFIG } from '@repo/constants';
import type { DevicesResponse } from '@repo/data-ops';

interface UseDevicesQueryParams {
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[];
}

export const useDevicesQuery = (params?: UseDevicesQueryParams) => {
  return useQuery<DevicesResponse>({
    queryKey: ['devices', params?.verificationStatus],
    queryFn: async () => {
      console.log('📡 useDevicesQuery: Fetching fresh device data...', {
        verificationStatus: params?.verificationStatus
      });
      const result = await getDevicesData({
        data: {
          verificationStatus: params?.verificationStatus
        }
      });
      console.log('✅ useDevicesQuery: Fresh data received', {
        deviceCount: result.items?.length || 0,
        totalCount: result.totalCount,
        verificationStatus: params?.verificationStatus,
        firstFewDevices: result.items?.slice(0, 3).map(d => ({
          id: d.id,
          name: d.name,
          tags: d.tags,
          verificationStatus: d.verificationStatus
        })) || []
      });
      return result;
    },
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });
};