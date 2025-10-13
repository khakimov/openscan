export const MAX_PORTS_PER_SCAN_PRESETS = {
  quick: 200,
  standard: 1000,
  full: 65535,
} as const;

export const MAX_PORTS_PER_SCAN_DEFAULT = MAX_PORTS_PER_SCAN_PRESETS.quick;

export type MaxPortsPreset = keyof typeof MAX_PORTS_PER_SCAN_PRESETS;
