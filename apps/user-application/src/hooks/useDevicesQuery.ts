import { useQuery } from '@tanstack/react-query';
import { getDevicesData } from '@/server/devices';
import { QUERY_CONFIG } from '@repo/constants';
import type { TransformedDevice } from '@/server/devices';

interface UseDevicesQueryParams {
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[];
  initialData?: DevicesResponse;
}

// Response type matching what getDevicesData returns
type DevicesResponse = {
  items: TransformedDevice[];
  totalCount: number;
  page: number;
  totalPages: number;
}

export const useDevicesQuery = (params?: UseDevicesQueryParams) => {
  return useQuery<DevicesResponse>({
    queryKey: ['devices', params?.verificationStatus],
    initialData: params?.initialData,
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
        firstFewDevices: result.items?.slice(0, 3).map((d: TransformedDevice) => ({
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