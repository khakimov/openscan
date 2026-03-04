export {
  CreateNotificationSchema,
  type CreateNotificationInput,
  GetNotificationsSchema,
  type GetNotificationsInput,
  MarkAsReadSchema,
  type MarkAsReadInput,
  GetUnreadCountSchema,
  type GetUnreadCountInput,
} from './schemas';

export { hashMessage, checkDuplicateNotification } from './dedupe';

export {
  createNotification,
  upsertNotification,
  createNotifications,
  SUPPRESS_WINDOWS,
  getSuppressWindowDuration,
  calculateSuppressUntil,
  type UpsertNotificationResult,
} from './crud';

export {
  getNotifications,
  getUnreadNotificationCount,
  getUnreadNotificationCountWithSeverity,
  getPendingEmailNotifications,
} from './read';

export {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markNotificationEmailSent,
} from './mutations';

export {
  expireNotifications,
  deleteOldNotifications,
  backfillMessageHashes,
} from './maintenance';

export {
  NotificationSeveritySchema,
  type NotificationSeverity,
  UpdateEmailSeveritiesSchema,
  type UpdateEmailSeveritiesInput,
  UpdateEmailSeveritiesOrDisableSchema,
  type UpdateEmailSeveritiesOrDisableInput,
  DEFAULT_EMAIL_SEVERITIES,
  getOrganizationNotificationSettings,
  resolveEmailSeverities,
  updateEmailSeverities,
  updateEmailSeveritiesOrDisable,
  resetEmailSeveritiesToDefaults,
} from './settings';

export {
  type ConfigurationDriftType,
  type ConfigurationDriftPayload,
  logConfigurationDrift,
  logServerIPChanged,
  logAppProductChanged,
  logAppVersionChanged,
  logWebTitleChanged,
  logManualEdit,
} from './configuration';

// User notification preferences
export {
  GetUserPreferencesSchema,
  type GetUserPreferencesInput,
  UpdateUserPreferencesSchema,
  type UpdateUserPreferencesInput,
  MuteDeviceSchema,
  type MuteDeviceInput,
  type ResolvedUserPreferences,
  getUserNotificationPreferences,
  resolveUserPreferences,
  updateUserNotificationPreferences,
  muteDevice,
  unmuteDevice,
  disableEmailNotifications,
  enableEmailNotifications,
  getEmailRecipients,
} from './user-preferences';
