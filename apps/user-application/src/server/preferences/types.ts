/**
 * Type definitions for notification preferences server functions
 */

export interface NotificationPreferencesData {
  vulnerabilityAlertsEnabled: boolean;
  alertSeverities: string[];
  weeklySummaryEnabled: boolean;
}

// Get notification preferences result types
export interface NotificationPreferencesFetchSuccess {
  success: true;
  data: NotificationPreferencesData;
  error?: undefined;
}

export interface NotificationPreferencesFetchError {
  success: false;
  data?: undefined;
  error: string;
}

export type NotificationPreferencesFetchResult =
  | NotificationPreferencesFetchSuccess
  | NotificationPreferencesFetchError;

// Save notification preferences result types
export interface NotificationPreferencesSaveSuccess {
  success: true;
  message: string;
  error?: undefined;
}

export interface NotificationPreferencesSaveError {
  success: false;
  message?: undefined;
  error: string;
}

export type NotificationPreferencesSaveResult =
  | NotificationPreferencesSaveSuccess
  | NotificationPreferencesSaveError;
