/**
 * Transformed device type with UI-friendly properties.
 * Returned by transformDeviceForUI and used throughout the UI.
 */
export type TransformedDevice = {
  id: string;
  name: string;
  ip: string;
  riskLevel: string;
  status: 'active' | 'offline';
  discoveredOn: string;
  lastScanned?: string;
  source: 'agentless' | 'agentbased';
  isScanned: boolean;
  scanType: 'scanned' | 'discovered';
  scope: 'internal' | 'external' | 'hybrid';
  tags: string[];
  respondsToICMPPing: boolean;
  notes: string;
  scanCount: number;
  totalOpenPorts: number;
  ports?: {
    tcp: number[];
    details: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: {
        name?: string | null;
        product?: string | null;
        version?: string | null;
        extraInfo?: string | null;
        tunnel?: string | null;
        method?: string | null;
        confidence?: number | null;
        cpe?: string | null;
        fingerprint?: string | null;
        fingerprintMatches?: Array<{
          probe: string;
          length?: number;
          response: string;
        }>;
      };
      discoveredBy?: string[];
      firstSeen?: number | null;
      lastSeen?: number | null;
      httpxProbe?: {
        scheme?: string;
        statusCode?: number;
        title?: string;
        screenshot?: string;
        responseTime?: number;
        webServer?: string;
        metadata?: any;
        technologies?: Array<{
          name: string;
          confidence?: string;
          version?: string;
        }>;
      };
    }>;
  };
  scanStats?: {
    scanCount: number;
    totalScans?: number;
    lastScanAt: string | null;
    totalOpenPorts?: number;
    portsWithService?: number;
    portsStored?: number;
    openPortCount?: number;
    totalPortCount?: number;
    portsStoredCount?: number;
    scanPattern?: 'WAF/Proxy' | 'Possible WAF/Proxy' | 'Normal';
    suspiciousAllPortsOpen?: boolean;
    serviceDetectionRate?: number;
    ports?: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: {
        name?: string | null;
        product?: string | null;
        version?: string | null;
        extraInfo?: string | null;
        tunnel?: string | null;
        method?: string | null;
        confidence?: number | null;
        cpe?: string | null;
        fingerprint?: string | null;
        fingerprintMatches?: Array<{
          probe: string;
          length?: number;
          response: string;
        }>;
      };
      discoveredBy?: string[];
      firstSeen?: number | null;
      lastSeen?: number | null;
      httpxProbe?: {
        scheme?: string;
        statusCode?: number;
        title?: string;
        screenshot?: string;
        responseTime?: number;
        webServer?: string;
        metadata?: any;
        technologies?: Array<{
          name: string;
          confidence?: string;
          version?: string;
        }>;
      };
    }>;
  };
  verificationStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  isVerified: boolean;
};

/**
 * Transform database device to match UI expectations.
 * Converts timestamps to ISO strings and normalizes enum casing.
 */
export function transformDeviceForUI(dbDevice: any): TransformedDevice {
  const scanStats = dbDevice.scanStats as
    | {
        scanCount: number;
        totalScans?: number;
        lastScanAt: number | null;
        totalOpenPorts?: number;
        portsWithService?: number;
        portsStored?: number;
        openPortCount?: number;
        totalPortCount?: number;
        ports?: Array<{
          port: number;
          protocol: string;
          state: string;
          service?: {
            name?: string | null;
            product?: string | null;
            version?: string | null;
            extraInfo?: string | null;
            tunnel?: string | null;
            method?: string | null;
            confidence?: number | null;
            cpe?: string | null;
            fingerprint?: string | null;
            fingerprintMatches?: Array<{
              probe: string;
              length?: number;
              response: string;
            }>;
          };
          discoveredBy?: string[];
          firstSeen?: number | null;
          lastSeen?: number | null;
          httpxProbe?: {
            scheme?: string;
            statusCode?: number;
            title?: string;
            screenshot?: string;
            responseTime?: number;
            webServer?: string;
            metadata?: any;
            technologies?: Array<{
              name: string;
              confidence?: string;
              version?: string;
            }>;
          };
        }>;
      }
    | undefined;

  const lastScanTimestamp = scanStats?.lastScanAt ?? dbDevice.lastSeenAt ?? null;
  const lastScanIso = lastScanTimestamp
    ? (lastScanTimestamp instanceof Date
        ? lastScanTimestamp.toISOString()
        : new Date(lastScanTimestamp).toISOString())
    : null;

  const openPortEntries = Array.isArray(scanStats?.ports) ? scanStats.ports : [];
  const openPortCount = scanStats?.openPortCount ?? openPortEntries.length;
  const totalPortCount = scanStats?.totalPortCount ?? openPortCount;
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

  const ports =
    openPortEntries.length > 0
      ? {
          tcp: openPortEntries.map((port) => port.port),
          details: openPortEntries,
        }
      : undefined;

  const computedScanStats = hasScans
    ? {
        ...scanStats,
        totalScans,
        scanCount: scanStats?.scanCount ?? totalScans,
        lastScanAt: lastScanIso,
        totalOpenPorts: scanStats?.totalOpenPorts,
        portsWithService: scanStats?.portsWithService,
        portsStored: scanStats?.portsStored,
        openPortCount,
        totalPortCount,
        ports: openPortEntries,
      }
    : undefined;

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
    ports,
    scanStats: computedScanStats,
    verificationStatus: dbDevice.verificationStatus,
    verifiedAt: dbDevice.verifiedAt ? new Date(dbDevice.verifiedAt).toISOString() : null,
    verifiedBy: dbDevice.verifiedBy,
    verificationNote: dbDevice.verificationNote,
    isVerified: dbDevice.verificationStatus === 'VERIFIED',
  };
}
