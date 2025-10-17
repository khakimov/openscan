import type { PortScanInput, ScannerInput, ScanScope } from '@repo/contracts';

/**
 * Get the callback URL for scan result postbacks
 * Uses BETTER_AUTH_URL to construct the server's internal endpoint
 */
function getCallbackUrl(): string | undefined {
  const serverUrl = process.env.BETTER_AUTH_URL;
  if (!serverUrl) {
    return undefined;
  }
  return `${serverUrl}/api/internal/scan-results`;
}

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

  // Build metadata with callbackUrl and deviceId
  const callbackUrl = getCallbackUrl();
  const metadata: Record<string, unknown> = {};
  let hasMetadata = false;

  if (callbackUrl) {
    metadata.callbackUrl = callbackUrl;
    hasMetadata = true;
  }

  if (input.deviceId) {
    metadata.deviceId = input.deviceId;
    hasMetadata = true;
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
    priority: 'NORMAL',
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
    metadata: hasMetadata ? metadata : undefined,
  };
}
