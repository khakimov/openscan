/**
 * OS parsing functions for nmap XML
 * Handles OS detection, CPE extraction, and osclass parsing
 */

import { createLogger } from '@repo/logger';
import { extractCpeList } from './utils';
import type { ParsedOsMatch, OsInfo } from './types';

const logger = createLogger({ name: 'portscan-xml-parser' });

/**
 * Enhanced OS parsing with CPE extraction (legacy requirement)
 */
export function parseOsInfoEnhanced(osData: any): OsInfo | undefined {
  if (!osData) {
    return undefined;
  }

  const matches: ParsedOsMatch[] = [];

  try {
    // Handle different XML parsing structures - osData might be an array
    let osMatches = [];
    if (osData.osmatch) {
      osMatches = Array.isArray(osData.osmatch) ? osData.osmatch : [osData.osmatch];
    } else if (Array.isArray(osData)) {
      // Look for osmatch in array elements
      for (const entry of osData) {
        if (entry.osmatch) {
          const entryMatches = Array.isArray(entry.osmatch) ? entry.osmatch : [entry.osmatch];
          osMatches.push(...entryMatches);
        }
      }
    }

    if (osMatches.length === 0) {
      return { matches: [], fingerprints: [] };
    }

    for (const match of osMatches) {
      // Extract CPE from the match itself
      const matchCpes = extractCpeList(match);

      const parsedMatch: ParsedOsMatch = {
        name: match?.$?.name || match?.name || '',
        accuracy: parseInt(match?.$?.accuracy || match?.accuracy || '0'),
        line: match?.$?.line ? parseInt(match.$.line) : match?.line ? parseInt(match.line) : undefined,
        cpe: matchCpes,
      };

      // Parse OS classes and extract their CPEs
      if (match.osclass) {
        const osClasses = Array.isArray(match.osclass) ? match.osclass : [match.osclass];
        parsedMatch.osclass = osClasses.map((osclass: any) => {
          const osclassCpes = extractCpeList(osclass);

          // Add osclass CPEs to the main match CPE list
          parsedMatch.cpe.push(...osclassCpes);

          return {
            type: osclass?.$?.type || osclass?.type,
            vendor: osclass?.$?.vendor || osclass?.vendor,
            osfamily: osclass?.$?.osfamily || osclass?.osfamily,
            osgen: osclass?.$?.osgen || osclass?.osgen,
            accuracy: osclass?.$?.accuracy ? parseInt(osclass.$.accuracy) : osclass?.accuracy ? parseInt(osclass.accuracy) : undefined,
            cpe: osclassCpes,
          };
        });
      }

      matches.push(parsedMatch);
    }

    return {
      matches,
      fingerprints: osData.osfingerprint || [],
    };
  } catch (error) {
    // Graceful degradation for OS parsing errors (legacy requirement)
    logger.warn(`Failed to parse OS info: ${error instanceof Error ? error.message : String(error)}`);
    return {
      matches: [],
      fingerprints: [],
    };
  }
}

/**
 * Legacy OS parsing for backward compatibility
 */
export function parseOsInfo(osData: any): OsInfo | undefined {
  if (!osData) {
    return undefined;
  }

  const matches: ParsedOsMatch[] = [];

  if (osData.osmatch) {
    const osMatches = Array.isArray(osData.osmatch) ? osData.osmatch : [osData.osmatch];

    for (const match of osMatches) {
      const parsedMatch: ParsedOsMatch = {
        name: match.name || '',
        accuracy: parseInt(match.accuracy || '0'),
        line: match.line ? parseInt(match.line) : undefined,
        cpe: [], // Initialize empty CPE array
      };

      // Parse OS classes
      if (match.osclass) {
        const osClasses = Array.isArray(match.osclass) ? match.osclass : [match.osclass];
        parsedMatch.osclass = osClasses.map((osclass: any) => ({
          type: osclass.type,
          vendor: osclass.vendor,
          osfamily: osclass.osfamily,
          osgen: osclass.osgen,
          accuracy: osclass.accuracy ? parseInt(osclass.accuracy) : undefined,
        }));
      }

      matches.push(parsedMatch);
    }
  }

  return {
    matches,
    fingerprints: osData.osfingerprint || [],
  };
}

/**
 * Extract CPE strings from OS matches
 */
export function extractOsMatchesCpe(osInfo?: OsInfo): string[] {
  const cpes: string[] = [];

  if (osInfo?.matches) {
    for (const match of osInfo.matches) {
      cpes.push(...match.cpe);
    }
  }

  return cpes;
}
