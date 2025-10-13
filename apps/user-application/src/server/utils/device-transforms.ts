import type { Device } from '@repo/data-ops';

/**
 * Transform a device record for UI consumption
 * Simplifies complex database structure and adds computed fields
 */
export function transformDeviceForUI(device: Device) {
  // Extract the most recent scan date
  const lastScanned = device.lastSeenAt
    ? new Date(device.lastSeenAt).toISOString()
    : null;

  // Extract OS information
  const osInfo = extractOsInfo(device);

  // Extract service information
  const services = extractServices(device);

  // Calculate risk metrics
  const riskMetrics = calculateRiskMetrics(device);

  return {
    id: device.id,
    name: device.hostname || device.ipAddress,
    ipAddress: device.ipAddress,
    macAddress: device.macAddress || null,
    hostname: device.hostname || null,
    os: osInfo,
    services,
    status: device.isActive ? 'active' : 'inactive',
    lastScanned,
    discoveredAt: device.createdAt ? new Date(device.createdAt).toISOString() : null,
    ...riskMetrics,
  };
}

/**
 * Extract OS information from device
 */
function extractOsInfo(device: Device) {
  if (!device.osInfo) return null;

  const osData = typeof device.osInfo === 'string'
    ? JSON.parse(device.osInfo)
    : device.osInfo;

  if (osData?.matches?.length > 0) {
    const bestMatch = osData.matches[0];
    return {
      name: bestMatch.name || 'Unknown',
      vendor: bestMatch.vendor || null,
      family: bestMatch.family || null,
      accuracy: bestMatch.accuracy || 0,
    };
  }

  return null;
}

/**
 * Extract service information from device ports
 */
function extractServices(device: Device) {
  if (!device.ports) return [];

  const portsData = typeof device.ports === 'string'
    ? JSON.parse(device.ports)
    : device.ports;

  if (!Array.isArray(portsData)) return [];

  return portsData
    .filter((port: any) => port.state === 'open')
    .map((port: any) => ({
      port: port.port,
      protocol: port.protocol || 'tcp',
      service: port.service?.name || 'unknown',
      version: port.service?.version || null,
    }))
    .slice(0, 10); // Limit to first 10 services for UI
}

/**
 * Calculate risk metrics for a device
 */
function calculateRiskMetrics(device: Device) {
  // This is a simplified risk calculation
  // In production, this would involve checking CVE databases,
  // compliance status, etc.

  const openPortsCount = Array.isArray(device.ports)
    ? device.ports.filter((p: any) => p.state === 'open').length
    : 0;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  let vulnerabilityCount = 0;

  // Simple heuristic for risk level
  if (openPortsCount > 20) {
    riskLevel = 'high';
    vulnerabilityCount = Math.floor(openPortsCount / 5); // Mock calculation
  } else if (openPortsCount > 10) {
    riskLevel = 'medium';
    vulnerabilityCount = Math.floor(openPortsCount / 10);
  }

  return {
    riskLevel,
    openPortsCount,
    vulnerabilityCount,
  };
}