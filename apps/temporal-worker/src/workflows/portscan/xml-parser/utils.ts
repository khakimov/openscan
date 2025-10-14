/**
 * Utility functions for XML parsing
 * Pure helpers with no external dependencies
 */

export interface ServiceFingerprintMatch {
  probe: string;
  length?: number;
  response: string;
}

/**
 * Normalize CPE strings to v2.3 format (simplified)
 */
export function normalizeCpe(cpeString: string): string {
  if (!cpeString) return cpeString;

  // Ensure CPE 2.3 format starts with cpe:
  if (!cpeString.startsWith('cpe:')) {
    return `cpe:${cpeString}`;
  }

  return cpeString;
}

/**
 * Extract CPE strings from various XML nodes
 */
export function extractCpeList(node: any): string[] {
  const cpes: string[] = [];

  if (node.cpe) {
    const cpeNodes = Array.isArray(node.cpe) ? node.cpe : [node.cpe];
    for (const cpe of cpeNodes) {
      const cpeText = typeof cpe === 'string' ? cpe : cpe.text || cpe._;
      if (cpeText) {
        cpes.push(normalizeCpe(cpeText));
      }
    }
  }

  return cpes;
}

/**
 * Decode XML entities to their string equivalents
 */
export function decodeXmlEntities(value: string): string {
  if (!value) {
    return value;
  }

  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Unescape nmap-specific escape sequences
 */
export function unescapeNmapString(value: string): string {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\\./g, '.')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']');
}

/**
 * Extract service fingerprint details from nmap XML
 */
export function extractServiceFingerprintDetails(serviceData: any): {
  fingerprint: string;
  matches?: ServiceFingerprintMatch[];
} | undefined {
  if (!serviceData) {
    return undefined;
  }

  const rawFingerprint =
    typeof serviceData?.$?.servicefp === 'string'
      ? serviceData.$.servicefp
      : typeof serviceData?.servicefp === 'string'
        ? serviceData.servicefp
        : Array.isArray(serviceData?.servicefp)
          ? serviceData.servicefp.filter(Boolean)[0]
          : undefined;

  if (!rawFingerprint) {
    return undefined;
  }

  const decoded = decodeXmlEntities(rawFingerprint);
  const matches: ServiceFingerprintMatch[] = [];
  const regex = /%r\(([^,]+),([^,]+),"([\s\S]*?)"\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(decoded)) !== null) {
    const probe = match[1];
    const length = parseInt(match[2], 10);
    const response = unescapeNmapString(match[3]);

    matches.push({
      probe,
      length: Number.isNaN(length) ? undefined : length,
      response,
    });
  }

  return {
    fingerprint: decoded,
    matches: matches.length ? matches : undefined,
  };
}

/**
 * Parse port range string like "135,137-139,445" into array of port numbers
 */
export function parsePortRange(portString: string): number[] {
  const ports: number[] = [];
  const parts = portString.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      // Range like "137-139"
      const [start, end] = trimmed.split('-').map(s => parseInt(s.trim()));
      for (let p = start; p <= end; p++) {
        ports.push(p);
      }
    } else {
      // Single port
      ports.push(parseInt(trimmed));
    }
  }

  return ports;
}

/**
 * Check if host exists in the scan results
 */
export function hostExists(hosts: any, hostAddress: string): boolean {
  return hosts && hosts[hostAddress] !== undefined;
}
