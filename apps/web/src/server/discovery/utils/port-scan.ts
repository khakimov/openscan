import type { PortScanInput, ScannerInput, ScanScope } from '@repo/contracts';

import { getScanResultsCallbackUrl, type EnvBindings } from '@/lib/config';

export function buildScannerInput(params: {
  tenantId: string;
  userId: string;
  input: PortScanInput;
  scope: ScanScope;
  scanRunId: string;
  env?: EnvBindings;
}): ScannerInput {
  const { tenantId, userId, input, scope, scanRunId, env } = params;
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

  // Build metadata with callbackUrl and deviceId
  const callbackUrl = getScanResultsCallbackUrl(env);
  const metadata: Record<string, unknown> = { callbackUrl };
  let hasMetadata = true;

  if (input.deviceId) {
    metadata.deviceId = input.deviceId;
    hasMetadata = true;
  }

  return {
    tenantId,
    userId,
    scanRunId,
    scanId: scanRunId, // FIXME: scanId should be Restate workflow key, not scanRunId
    scanName: `Port scan of ${input.target}`,
    isExtendScan,
    authScanType: 'ANONYMOUS',
    priority: 'NORMAL',
    targets: [
      {
        value: input.target,
        scope,
        type: targetType,
        label: input.target,
        id: input.deviceId,
      } as ScannerInput['targets'][number],
    ],
    scanOptions: hasScanOptions ? scanOptions : undefined,
    metadata: hasMetadata ? metadata : undefined,
  };
}
