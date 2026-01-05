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
