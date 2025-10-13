import { differenceInDays, isSameDay, isSameMonth } from 'date-fns';

export const DEFAULT_ASPECT_RATIO = 0.5625;
export const NOT_SET_VALUE = '(not set)';

export const timeWindows = {
  '30min': {
    key: '30min',
    label: 'Last 30 min',
    shortcut: 'R',
  },
  lastHour: {
    key: 'lastHour',
    label: 'Last hour',
    shortcut: 'H',
  },
  today: {
    key: 'today',
    label: 'Today',
    shortcut: 'D',
  },
  yesterday: {
    key: 'yesterday',
    label: 'Yesterday',
    shortcut: 'E',
  },
  '7d': {
    key: '7d',
    label: 'Last 7 days',
    shortcut: 'W',
  },
  '30d': {
    key: '30d',
    label: 'Last 30 days',
    shortcut: 'T',
  },
  '6m': {
    key: '6m',
    label: 'Last 6 months',
    shortcut: '6',
  },
  '12m': {
    key: '12m',
    label: 'Last 12 months',
    shortcut: '0',
  },
  monthToDate: {
    key: 'monthToDate',
    label: 'Month to Date',
    shortcut: 'M',
  },
  lastMonth: {
    key: 'lastMonth',
    label: 'Last Month',
    shortcut: 'P',
  },
  yearToDate: {
    key: 'yearToDate',
    label: 'Year to Date',
    shortcut: 'Y',
  },
  lastYear: {
    key: 'lastYear',
    label: 'Last year',
    shortcut: 'U',
  },
  custom: {
    key: 'custom',
    label: 'Custom range',
    shortcut: 'C',
  },
} as const;

export const ProjectTypeNames = {
  website: 'Website',
  app: 'App',
  backend: 'Backend',
} as const;

export const operators = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  doesNotContain: 'Not contains',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  regex: 'Regex',
  isNull: 'Is null',
  isNotNull: 'Is not null',
} as const;

export const chartTypes = {
  linear: 'Linear',
  bar: 'Bar',
  histogram: 'Histogram',
  pie: 'Pie',
  metric: 'Metric',
  area: 'Area',
  map: 'Map',
  funnel: 'Funnel',
  retention: 'Retention',
  conversion: 'Conversion',
} as const;

export const chartSegments = {
  event: 'All events',
  user: 'Unique users',
  session: 'Unique sessions',
  user_average: 'Average users',
  one_event_per_user: 'One event per user',
  property_sum: 'Sum of property',
  property_average: 'Average of property',
  property_max: 'Max of property',
  property_min: 'Min of property',
};

export const lineTypes = {
  monotone: 'Monotone',
  monotoneX: 'Monotone X',
  monotoneY: 'Monotone Y',
  linear: 'Linear',
  natural: 'Natural',
  basis: 'Basis',
  step: 'Step',
  stepBefore: 'Step before',
  stepAfter: 'Step after',
  basisClosed: 'Basis closed',
  basisOpen: 'Basis open',
  bumpX: 'Bump X',
  bumpY: 'Bump Y',
  bump: 'Bump',
  linearClosed: 'Linear closed',
} as const;

export const intervals = {
  minute: 'minute',
  day: 'day',
  hour: 'hour',
  week: 'week',
  month: 'month',
} as const;

export const alphabetIds = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

export const deprecated_timeRanges = {
  '1h': '1h',
  '24h': '24h',
  '14d': '14d',
  '1m': '1m',
  '3m': '3m',
  '6m': '6m',
  '1y': '1y',
};

export const metrics = {
  sum: 'sum',
  average: 'average',
  min: 'min',
  max: 'max',
} as const;

export function isMinuteIntervalEnabledByRange(
  range: keyof typeof timeWindows,
) {
  return range === '30min' || range === 'lastHour';
}

export function isHourIntervalEnabledByRange(range: keyof typeof timeWindows) {
  return (
    isMinuteIntervalEnabledByRange(range) ||
    range === 'today' ||
    range === 'yesterday' ||
    range === '7d'
  );
}

export function getDefaultIntervalByRange(
  range: keyof typeof timeWindows,
): keyof typeof intervals {
  if (range === '30min' || range === 'lastHour') {
    return 'minute';
  }
  if (range === 'today' || range === 'yesterday') {
    return 'hour';
  }
  if (
    range === '7d' ||
    range === '30d' ||
    range === 'lastMonth' ||
    range === 'monthToDate'
  ) {
    return 'day';
  }
  return 'month';
}

export function getDefaultIntervalByDates(
  startDate: string | null,
  endDate: string | null,
): null | keyof typeof intervals {
  if (startDate && endDate) {
    if (isSameDay(startDate, endDate)) {
      return 'hour';
    }
    if (isSameMonth(startDate, endDate)) {
      return 'day';
    }
    if (differenceInDays(endDate, startDate) <= 31) {
      return 'day';
    }
    return 'month';
  }

  return null;
}

// CVE Severity Badge Styles
export const cveSeverityStyles = {
  CRITICAL: 'uppercase border bg-red-500/10 text-red-400 border-red-400/10 bg-opacity-10',
  HIGH: 'uppercase border bg-orange-500/10 text-orange-400 border-orange-300/10 bg-opacity-10',
  MEDIUM: 'uppercase border bg-amber-500/10 text-amber-400 border-amber-300/10 bg-opacity-10',
  LOW: 'uppercase border bg-indigo-500/10 text-indigo-400 border-indigo-200/10 bg-opacity-10',
  INFO: 'uppercase border bg-green-600/10 text-green-500 border-green-400/10 bg-opacity-10',
  UNKNOWN: 'uppercase border bg-zinc-800 text-[#fff]/90 border-zinc-400/10 bg-opacity-10',
} as const;

export type CVESeverity = keyof typeof cveSeverityStyles;

export function getCVESeverityStyle(severity: string): string {
  const normalizedSeverity = severity?.toUpperCase() as CVESeverity;
  return cveSeverityStyles[normalizedSeverity] || cveSeverityStyles.UNKNOWN;
}

// Device Risk Level Border Styles
export const riskLevelBorderStyles = {
  CRITICAL: 'border-red-500/50 border-2',
  HIGH: 'border-orange-500/50 border-2',
  MEDIUM: 'border-amber-500/50 border-2',
  LOW: 'border-green-500/50 border-2',
  UNKNOWN: 'border-zinc-300/50 border-2',
} as const;

export type RiskLevel = keyof typeof riskLevelBorderStyles;

export function getRiskLevelBorderClass(riskLevel: string): string {
  const normalizedRiskLevel = riskLevel?.toUpperCase() as RiskLevel;
  return riskLevelBorderStyles[normalizedRiskLevel] || riskLevelBorderStyles.UNKNOWN;
}

// Device Status Badge Styles
export const deviceStatusStyles = {
  ONLINE: 'uppercase border bg-green-600/10 text-green-500 border-green-400/10 bg-opacity-10',
  ACTIVE: 'uppercase border bg-green-600/10 text-green-500 border-green-400/10 bg-opacity-10',
  OFFLINE: 'uppercase border bg-red-500/10 text-red-400 border-red-400/10 bg-opacity-10',
  INACTIVE: 'uppercase border bg-red-500/10 text-red-400 border-red-400/10 bg-opacity-10',
  WARNING: 'uppercase border bg-orange-500/10 text-orange-400 border-orange-300/10 bg-opacity-10',
  UNKNOWN: 'uppercase border bg-zinc-800 text-[#fff]/90 border-zinc-400/10 bg-opacity-10',
} as const;

export type DeviceStatus = keyof typeof deviceStatusStyles;

export function getDeviceStatusStyle(status: string): string {
  const normalizedStatus = status?.toUpperCase() as DeviceStatus;
  return deviceStatusStyles[normalizedStatus] || deviceStatusStyles.UNKNOWN;
}

export function getDeviceStatusBadgeClass(status: string): string {
  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${getDeviceStatusStyle(status)}`;
}

// Universal Badge Styling Functions
export function getCVESeverityBadgeClass(severity: string): string {
  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${getCVESeverityStyle(severity)}`;
}

export function getCVSSScoreBadgeClass(score: number | string): string {
  const getScoreStyle = (cvssScore?: number | string): string => {
    const score = typeof cvssScore === "string" ? parseFloat(cvssScore) : cvssScore;
    if (!score || isNaN(score)) return cveSeverityStyles.UNKNOWN;

    if (score >= 9.0) return cveSeverityStyles.CRITICAL;
    if (score >= 7.0) return cveSeverityStyles.HIGH;
    if (score >= 4.0) return cveSeverityStyles.MEDIUM;
    return cveSeverityStyles.LOW;
  };

  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md font-mono ${getScoreStyle(score)}`;
}

export function getVulnStateBadgeClass(state?: string): string {
  const getStateStyle = (state?: string): string => {
    switch (state?.toLowerCase()) {
      case "open":
        return cveSeverityStyles.CRITICAL;
      case "resolved":
        return cveSeverityStyles.INFO;
      case "mitigated":
        return cveSeverityStyles.MEDIUM;
      case "accepted":
        return cveSeverityStyles.LOW;
      default:
        return cveSeverityStyles.UNKNOWN;
    }
  };

  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${getStateStyle(state)}`;
}

export function getRiskLevelBadgeClass(riskLevel: string): string {
  const normalizedRiskLevel = riskLevel?.toUpperCase() as CVESeverity;
  const riskStyle = cveSeverityStyles[normalizedRiskLevel] || cveSeverityStyles.UNKNOWN;
  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${riskStyle}`;
}

// Tag Badge Style
export const tagBadgeStyle = 'uppercase border bg-indigo-500/10 text-indigo-400 border-indigo-200/10 bg-opacity-10';

export function getTagBadgeClass(): string {
  return `inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${tagBadgeStyle}`;
}

// Query Configuration for React Query
export const QUERY_CONFIG = {
  // Cache durations
  STALE_TIME: {
    SECONDS_30: 30 * 1000,
    MINUTES_1: 60 * 1000,
    MINUTES_5: 5 * 60 * 1000,
    MINUTES_10: 10 * 60 * 1000,
    MINUTES_30: 30 * 60 * 1000,
  },

  // Garbage collection times
  GC_TIME: {
    MINUTES_5: 5 * 60 * 1000,
    MINUTES_10: 10 * 60 * 1000,
    MINUTES_30: 30 * 60 * 1000,
    HOURS_1: 60 * 60 * 1000,
  },

  // Refetch intervals for polling
  REFETCH_INTERVAL: {
    SECONDS_1: 1000,
    SECONDS_3: 3 * 1000,
    SECONDS_5: 5 * 1000,
    SECONDS_10: 10 * 1000,
    SECONDS_30: 30 * 1000,
    MINUTES_1: 60 * 1000,
  },

  // Default configurations for different query types
  DEFAULTS: {
    // For data that changes infrequently
    STABLE_DATA: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
    // For data that needs frequent updates
    DYNAMIC_DATA: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
    },
    // For data that rarely changes
    STATIC_DATA: {
      staleTime: 30 * 60 * 1000, // 30 minutes
      gcTime: 60 * 60 * 1000, // 1 hour
    },
  },
} as const;
