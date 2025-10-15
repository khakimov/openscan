/**
 * Metadata parsing functions for nmap XML
 * Handles scanner metadata, timing, runstats, and scan info
 */

import { createLogger } from '@repo/logger';
import type { TimingData, RunStatsData, ScanInfoData } from './types';

const logger = createLogger({ name: 'portscan-xml-parser' });

/**
 * Parse timing information from nmaprun attributes
 */
export function parseTiming(nmaprun: any): TimingData {
  const start = parseInt(nmaprun.$.start || '0');
  let end = start;
  let elapsed = 0;

  if (nmaprun.runstats?.finished) {
    end = parseInt(nmaprun.runstats.finished.time || nmaprun.runstats.finished.timestr || '0');
    elapsed = parseFloat(nmaprun.runstats.finished.elapsed || '0');
  }

  return {
    start,
    end,
    elapsed,
  };
}

/**
 * Parse runstats section for enhanced timing and host statistics
 */
export function parseRunStats(runstatsData: any): RunStatsData | undefined {
  if (!runstatsData) {
    return undefined;
  }

  let finished;
  let hosts;

  try {
    // Handle array structure - runstatsData might be an array
    const statsArray = Array.isArray(runstatsData) ? runstatsData : [runstatsData];

    for (const stats of statsArray) {
      // Parse finished section
      if (stats.finished && !finished) {
        const finishedData = Array.isArray(stats.finished) ? stats.finished[0] : stats.finished;
        finished = {
          time: parseInt(finishedData?.$?.time || finishedData?.time || '0'),
          timeStr: finishedData?.$?.timestr || finishedData?.timestr || '',
          summary: finishedData?.$?.summary || finishedData?.summary || '',
          elapsed: parseFloat(finishedData?.$?.elapsed || finishedData?.elapsed || '0'),
          exit: finishedData?.$?.exit || finishedData?.exit || 'unknown',
        };
      }

      // Parse hosts section
      if (stats.hosts && !hosts) {
        const hostsData = Array.isArray(stats.hosts) ? stats.hosts[0] : stats.hosts;
        hosts = {
          up: parseInt(hostsData?.$?.up || hostsData?.up || '0'),
          down: parseInt(hostsData?.$?.down || hostsData?.down || '0'),
          total: parseInt(hostsData?.$?.total || hostsData?.total || '0'),
        };
      }
    }

    if (!finished && !hosts) {
      return undefined;
    }

    return {
      finished: finished || {
        time: 0,
        timeStr: '',
        summary: '',
        elapsed: 0,
        exit: ''
      },
      hosts: hosts || {
        up: 0,
        down: 0,
        total: 0
      }
    };
  } catch (error) {
    logger.warn(`Failed to parse runstats: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * Parse scan info section
 */
export function parseScanInfo(scanInfoData: any): ScanInfoData | undefined {
  if (!scanInfoData) {
    return undefined;
  }

  // Handle array structure
  const scanInfo = Array.isArray(scanInfoData) ? scanInfoData[0] : scanInfoData;

  return {
    type: scanInfo.$.type || 'syn',
    protocol: scanInfo.$.protocol || 'tcp',
    numServices: parseInt(scanInfo.$.numservices || '0'),
    services: scanInfo.$.services || '',
  };
}
