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

  const isExtendScan = input.isExtendScan ?? !!input.deviceId;

  const scanOptions: NonNullable<ScannerInput['scanOptions']> = {};

  if (input.ports?.length) {
    scanOptions.requestedPorts = input.ports;
  }

  if (input.seedPorts?.length) {
    scanOptions.seedPorts = input.seedPorts;
  }

  if (input.additionalPortRanges?.length) {
    scanOptions.additionalPortRanges = input.additionalPortRanges;
  }

  if (input.aggressive !== undefined) {
    scanOptions.aggressive = input.aggressive;
  }

  const resolvedMode = input.mode ?? (isExtendScan ? 'EXTEND' : undefined);
  if (resolvedMode) {
    scanOptions.mode = resolvedMode;
  }

  if (input.scanProfile) {
    scanOptions.profile = input.scanProfile;
  }

  const hasScanOptions = Object.keys(scanOptions).length > 0;

  // Build metadata with callbackUrl and deviceId (always present since callbackUrl is required)
  const callbackUrl = getScanResultsCallbackUrl(env);
  const metadata: Record<string, unknown> = { callbackUrl };

  if (input.deviceId) {
    metadata.deviceId = input.deviceId;
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
    metadata,
  };
}
