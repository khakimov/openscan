import type { PortScanInput, ScannerInput } from '@repo/contracts';

import type { ScanScope } from './scan-scope';

export function buildScannerInput(params: {
  tenantId: string;
  userId: string;
  input: PortScanInput;
  scope: ScanScope;
  scanWorkflowId: string;
  scanRunId: string;
}): ScannerInput {
  const { tenantId, userId, input, scope, scanWorkflowId, scanRunId } = params;
  const targetType = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(input.target)
    ? 'IP_ADDRESS'
    : 'DOMAIN';

  const isExtendScan = input.isExtendScan ?? Boolean(input.deviceId);

  const scanOptions: NonNullable<ScannerInput['scanOptions']> = {};
  let hasScanOptions = false;

  if (input.ports?.length) {
    scanOptions.requestedPorts = input.ports;
    hasScanOptions = true;
  }

  if (input.seedPorts?.length) {
    scanOptions.seedPorts = input.seedPorts;
    hasScanOptions = true;
  }

  if (input.additionalPortRanges?.length) {
    scanOptions.additionalPortRanges = input.additionalPortRanges;
    hasScanOptions = true;
  }

  if (input.aggressive !== undefined) {
    scanOptions.aggressive = input.aggressive;
    hasScanOptions = true;
  }

  const resolvedMode = input.mode ?? (isExtendScan ? 'EXTEND' : undefined);
  if (resolvedMode) {
    scanOptions.mode = resolvedMode;
    hasScanOptions = true;
  }

  if (input.scanProfile) {
    scanOptions.profile = input.scanProfile;
    hasScanOptions = true;
  }

  return {
    tenantId,
    workflowId: scanWorkflowId,
    userId,
    scanRunId,
    scanId: scanRunId,
    scanName: `Port scan of ${input.target}`,
    isExtendScan,
    authScanType: 'ANONYMOUS',
    priority: 'MEDIUM',
    targets: [
      {
        value: input.target,
        scope,
        type: targetType,
        label: input.target,
        id: input.deviceId,
      },
    ],
    scanOptions: hasScanOptions ? scanOptions : undefined,
    metadata: input.deviceId ? { deviceId: input.deviceId } : undefined,
  };
}
