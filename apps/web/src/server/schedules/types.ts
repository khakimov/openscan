/**
 * Type definitions for schedule server functions
 */

import type { ScheduleInterval, SchedulePreset } from '@repo/data-ops';

export interface ScheduleEntity {
  id: number | string;
  scheduleId: string;
  deviceId: string;
  preset: SchedulePreset | string;
  interval: ScheduleInterval | any;  // Can be complex interval config
  nextRunAt: string | null;  // ISO string after JSON serialization
  status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED' | string;
  isActive: boolean;
  // NOTE: Database may include additional fields. Index signature uses `any` for TanStack compatibility,
  // but handlers should treat unknown fields as type `unknown` for safety.
  [key: string]: any;
}

export interface ScheduleWithRuntimeState {
  id: number | string;
  scheduleId: string;
  deviceId: string;
  preset: SchedulePreset | string;
  interval: ScheduleInterval | any;  // Can be complex interval config
  nextRunAt: string | null;  // ISO string after JSON serialization
  status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED' | string;
  isActive: boolean;
  runtimeState?: {
    scheduleId: string;
    status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
    nextExecutionTime?: string;
    consecutiveFailures: number;
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    lastRunAt?: string;
    currentLeaseId?: string;
  };
  // NOTE: Database may include additional fields. Index signature uses `any` for TanStack compatibility,
  // but handlers should treat unknown fields as type `unknown` for safety.
  [key: string]: any;
}

// Create schedule result types
export interface CreateScheduleSuccess {
  success: true;
  schedule: {
    id: number | string;
    scheduleId: string;
    deviceId: string;
    preset: SchedulePreset | string;
    interval: ScheduleInterval | any;
    nextRunAt: string | null;
    status: string;
    isActive: boolean;
  };
  error?: undefined;
}

export interface CreateScheduleError {
  success: false;
  schedule?: {
    id: number | string;
    scheduleId: string;
    deviceId: string;
    preset: SchedulePreset | string;
    interval: ScheduleInterval | any;
    nextRunAt: string | null;
    status: string;
    isActive: boolean;
  };
  error: string;
}

export type CreateScheduleResult =
  | CreateScheduleSuccess
  | CreateScheduleError;

// Pause schedule result types
export interface PauseScheduleSuccess {
  success: true;
  error?: undefined;
}

export interface PauseScheduleError {
  success: false;
  error: string;
}

export type PauseScheduleResult =
  | PauseScheduleSuccess
  | PauseScheduleError;

// Resume schedule result types
export interface ResumeScheduleSuccess {
  success: true;
  nextRunAt: string;
  error?: undefined;
}

export interface ResumeScheduleError {
  success: false;
  nextRunAt?: undefined;
  error: string;
}

export type ResumeScheduleResult =
  | ResumeScheduleSuccess
  | ResumeScheduleError;

// Delete schedule result types
export interface DeleteScheduleSuccess {
  success: true;
  error?: undefined;
}

export interface DeleteScheduleError {
  success: false;
  error: string;
}

export type DeleteScheduleResult =
  | DeleteScheduleSuccess
  | DeleteScheduleError;

// Get schedule detail result types
export interface GetScheduleSuccess {
  success: true;
  schedule: ScheduleWithRuntimeState;
  error?: undefined;
}

export interface GetScheduleError {
  success: false;
  schedule?: undefined;
  error: string;
}

export type GetScheduleResult =
  | GetScheduleSuccess
  | GetScheduleError;

// Get schedules list result types
export interface SchedulesListSuccess {
  success: true;
  schedules: ScheduleEntity[];
  error?: undefined;
}

export interface SchedulesListError {
  success: false;
  schedules: never[];
  error?: string;
}

export type SchedulesListResult =
  | SchedulesListSuccess
  | SchedulesListError;
