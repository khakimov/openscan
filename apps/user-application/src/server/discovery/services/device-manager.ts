import { addDeviceToScanRun, getActiveScansForDevice } from '@repo/data-ops';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'discovery-device-manager' });

export class DeviceManager {
  async attachDeviceToScan(params: {
    tenantId: string;
    scanRunId: string;
    deviceId: string;
    target: string;
  }) {
    await addDeviceToScanRun({
      scanRunId: params.scanRunId,
      deviceId: params.deviceId,
      tenantId: params.tenantId,
      role: 'TARGET',
      metadata: { target: params.target },
    });

    logger.info('Attached device to scan run', {
      scanRunId: params.scanRunId,
      deviceId: params.deviceId,
    });
  }

  async fetchActiveScans(tenantId: string, deviceId: string) {
    return getActiveScansForDevice(tenantId, deviceId);
  }
}

export const deviceManager = new DeviceManager();
