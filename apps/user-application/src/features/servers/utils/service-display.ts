/**
 * Confidence threshold for service detection
 *
 * Nmap confidence scores range from 0-10:
 * - 10: Perfect match
 * - 5-9: Good match with reasonable certainty
 * - 0-4: Low confidence, likely incorrect
 *
 * We only show product/version when confidence >= 5 to avoid displaying
 * incorrect service identifications that could mislead analysts.
 */
const CONFIDENCE_THRESHOLD = 5;

/**
 * Service object type (compatible with both PortSnapshot and PortDetail)
 */
type ServiceInfo = {
  name?: string;
  product?: string | null;
  version?: string | null;
  extraInfo?: string | null;
  tunnel?: string | null;
  confidence?: number | null;
};

export type FormattedService = {
  label: string;
  badge?: 'unverified';
  confidence?: number | null;
  rawName?: string;  // For tooltip display
};

/**
 * Format service information for display with confidence filtering
 *
 * Rules:
 * - If no service data: "Unknown service"
 * - If confidence >= 5 OR null (unknown): Show detection without badge
 * - If confidence < 5: Show detection + "Unverified" badge
 * - Always prefer showing the actual detection (product/version/name) over "Unknown"
 *
 * @param service - Port service detection data from Nmap
 * @returns Formatted service with display label and metadata
 */
export function formatServiceForDisplay(
  service?: ServiceInfo | null
): FormattedService {
  if (!service) {
    return { label: 'Unknown service' };
  }

  const confidence = service.confidence ?? null;

  // Consider it confident if:
  // 1. Confidence is null (scanner didn't provide a score)
  // 2. Confidence is >= threshold
  const isConfident = confidence === null || confidence >= CONFIDENCE_THRESHOLD;

  // Build display string from product/version/extraInfo, fallback to name
  const rawParts = [
    service.product,
    service.version,
    service.extraInfo,
  ].filter(Boolean);

  const rawFallback =
    rawParts.length > 0
      ? rawParts.join(' ')
      : service.name ?? 'Unknown service';

  if (isConfident) {
    return {
      label: rawFallback,
      confidence,
    };
  }

  // Low confidence → keep the detection, but flag it with "Unverified" badge
  // This gives analysts context about what the scanner guessed
  return {
    label: rawFallback,
    badge: 'unverified',
    confidence,
    rawName: rawFallback !== 'Unknown service' ? rawFallback : undefined,
  };
}

/**
 * Format service info for table display with additional metadata
 * Extends formatServiceForDisplay to include tunnel and other context
 *
 * @param service - Port service detection data
 * @returns Full service display string with metadata
 */
export function formatServiceWithContext(
  service?: ServiceInfo | null
): string {
  const { label } = formatServiceForDisplay(service);

  const parts: string[] = [label];

  // Add tunnel info if present (always show, even for low confidence)
  if (service?.tunnel) {
    parts.push(`(${service.tunnel})`);
  }

  return parts.join(' ');
}
