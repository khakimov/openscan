import type { PortSnapshot, EnrichedDevice } from '@repo/data-ops';
import type { TransformedDevice, HostingProvider } from '@repo/contracts/device';

/**
 * Transform database device to match UI expectations.
 * Parses portSnapshots through Zod schema for single source of truth.
 */
export function transformDeviceForUI(dbDevice: EnrichedDevice): TransformedDevice {
  // Extract scan stats (portSnapshots now populated by data-ops queries)
  const scanStats = dbDevice.scanStats;

  // Get portSnapshots from scanStats (populated by data-ops with lastSeen/httpxProbe)
  // Fallback to empty array if not present (unscanned devices)
  // Note: Skip schema validation to preserve UI-specific fields (lastSeen, httpxProbe)
  // that are added by getDeviceById transformation
  const portSnapshots = scanStats?.portSnapshots ?? [];

  const lastScanTimestamp = scanStats?.lastScanAt ?? dbDevice.lastSeenAt ?? null;
  const lastScanIso = lastScanTimestamp
    ? (lastScanTimestamp instanceof Date
        ? lastScanTimestamp.toISOString()
        : new Date(lastScanTimestamp).toISOString())
    : null;

  const totalScans =
    scanStats?.scanCount && scanStats.scanCount > 0
      ? scanStats.scanCount
      : dbDevice.isScanned
        ? 1
        : 0;
  const hasScans = totalScans > 0;
  const discoveredAt: Date =
    dbDevice.discoveredAt instanceof Date
      ? dbDevice.discoveredAt
      : new Date(dbDevice.discoveredAt ?? Date.now());

  // Compute totalOpenPorts from portSnapshots (single source of truth)
  const openPortCount = portSnapshots.filter((p: PortSnapshot) => p.state === 'open').length;

  const computedScanStats = hasScans
    ? {
        scanCount: scanStats?.scanCount ?? totalScans,
        totalScans,
        lastScanAt: lastScanIso,
        portScanStats: scanStats?.portScanStats ?? null,
      }
    : undefined;

  // Transform hosting provider data if available
  let hostingProvider: HostingProvider | undefined;
  if (dbDevice.hostingProvider) {
    const hp = dbDevice.hostingProvider;
    hostingProvider = {
      id: hp.id,
      name: hp.name,
      category: hp.category as HostingProvider['category'],
      asn: hp.asn ?? undefined,
      asOrganization: hp.asOrganization ?? undefined,
      iconKey: hp.iconKey ?? undefined,
      region: hp.region ?? undefined,
      detectedAt: hp.detectedAt instanceof Date 
        ? hp.detectedAt.toISOString() 
        : hp.detectedAt 
          ? new Date(hp.detectedAt).toISOString() 
          : undefined,
    };
  }

  return {
    id: dbDevice.id,
    name: dbDevice.name,
    ip: dbDevice.ip || '0.0.0.0',
    riskLevel: dbDevice.riskLevel.toLowerCase(),
    status: (dbDevice.state === 'AVAILABLE' ? 'active' : 'offline') as 'active' | 'offline',
    discoveredOn: discoveredAt.toISOString(),
    lastScanned: lastScanIso ?? undefined,
    source: dbDevice.source.toLowerCase() as 'agentless' | 'agentbased',
    isScanned: hasScans,
    scanType: hasScans ? 'scanned' : 'discovered',
    scope: dbDevice.scope.toLowerCase() as 'internal' | 'external' | 'hybrid',
    tags: dbDevice.tags || [],
    respondsToICMPPing: dbDevice.respondsToPing,
    notes: dbDevice.notes || '',
    scanCount: totalScans,
    totalOpenPorts: openPortCount,
    portSnapshots,
    scanStats: computedScanStats,
    verificationStatus: dbDevice.verificationStatus as 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED',
    verifiedAt: dbDevice.verifiedAt ? new Date(dbDevice.verifiedAt).toISOString() : null,
    verifiedBy: dbDevice.verifiedBy,
    verificationNote: dbDevice.verificationNote,
    isVerified: dbDevice.verificationStatus === 'VERIFIED',
    hostingProvider,
  };
}
