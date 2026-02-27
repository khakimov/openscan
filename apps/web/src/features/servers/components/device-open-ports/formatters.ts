import type { PortDetail } from "./types";
import { formatServiceForDisplay } from "@/features/servers/utils/service-display";

/**
 * Format service information for display with confidence filtering
 * @deprecated Use formatServiceForDisplay from service-display.ts for confidence-aware formatting
 */
export function formatServiceInfo(service?: PortDetail["service"]) {
  const { label } = formatServiceForDisplay(service);

  // Add tunnel info if present
  if (service?.tunnel) {
    return `${label} (${service.tunnel})`;
  }

  return label;
}

export function formatRawPortOutput(port: PortDetail) {
  const state = port.state ?? "open";

  let output = `Port ${port.port}/${port.service?.name || "unknown"}: ${state}`;

  if (port.service) {
    const serviceParts: string[] = [];
    if (port.service.name) serviceParts.push(`service: ${port.service.name}`);
    if (port.service.product) serviceParts.push(port.service.product);
    if (port.service.version) serviceParts.push(port.service.version);
    if (port.service.extraInfo) serviceParts.push(port.service.extraInfo);
    if (port.service.tunnel) serviceParts.push(port.service.tunnel);
    if (port.service.method) serviceParts.push(`method:${port.service.method}`);
    if (
      port.service.confidence !== null &&
      port.service.confidence !== undefined
    ) {
      serviceParts.push(`confidence:${port.service.confidence}`);
    }

    if (serviceParts.length > 0) {
      output += ` | ${serviceParts.join(" • ")}`;
    }
  }

  if (port.service?.cpe) {
    output += `\n        CPE: ${port.service.cpe}`;
  }

  if (port.service?.fingerprintMatches && port.service.fingerprintMatches.length > 0) {
    output += `\n        Fingerprint probes (${port.service.fingerprintMatches.length}):`;
    port.service.fingerprintMatches.forEach((fp) => {
      if (fp.probe && fp.response) {
        const responseLength = fp.length || fp.response.length;
        const truncatedResponse =
          fp.response.length > 100 ? `${fp.response.substring(0, 100)}...` : fp.response;
        output += `\n          - ${fp.probe}${responseLength > 0 ? ` [${responseLength}]` : ""}: ${truncatedResponse}`;
      } else if (fp.probe) {
        output += `\n          - ${fp.probe}`;
      }
    });
  }

  return output;
}

export function parseLastSeenTimestamp(value?: number | null) {
  if (typeof value !== "number") return null;
  const milliseconds = value < 2_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}
