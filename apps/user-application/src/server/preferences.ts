import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getCurrentUser, getCurrentOrganizationId } from "./utils/auth";
import { updateEmailSeveritiesOrDisable, resolveEmailSeverities, type NotificationSeverity } from "@repo/data-ops/queries/notifications/settings";

const logger = createLogger({ name: "preferences-server" });

export interface NotificationPreferences {
  vulnerabilityAlertsEnabled: boolean;
  alertSeverities: string[];
  weeklySummaryEnabled: boolean;
}

/**
 * Save notification preferences for the current organization
 *
 * Stores email severity threshold settings in organization_notification_settings table.
 * - If vulnerabilityAlertsEnabled is false, stores empty array (disables all alerts)
 * - If enabled, stores the selected severities
 * Note: weeklySummaryEnabled is logged but not yet persisted.
 */
export const saveNotificationPreferences = createServerFn({
  method: "POST",
})
  .inputValidator((data: NotificationPreferences) => {
    if (typeof data?.vulnerabilityAlertsEnabled !== "boolean") {
      throw new Error("vulnerabilityAlertsEnabled must be a boolean");
    }

    if (!Array.isArray(data?.alertSeverities)) {
      throw new Error("alertSeverities must be an array");
    }

    if (typeof data?.weeklySummaryEnabled !== "boolean") {
      throw new Error("weeklySummaryEnabled must be a boolean");
    }

    return data;
  })
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();
      const organizationId = await getCurrentOrganizationId();

      logger.info("Saving notification preferences", {
        userId: user.id,
        organizationId,
        preferences: data,
      });

      // Save email severity thresholds or disable alerts
      // Empty array contract: alerts disabled, email worker skips delivery
      await updateEmailSeveritiesOrDisable({
        organizationId,
        emailAllowedSeverities: data.vulnerabilityAlertsEnabled
          ? (data.alertSeverities as NotificationSeverity[])
          : [], // Empty array = disabled
      });

      logger.info("Notification preferences saved successfully", {
        userId: user.id,
        organizationId,
      });

      return {
        success: true,
        message: "Notification preferences saved",
      };
    } catch (error) {
      logger.error("Failed to save notification preferences", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save preferences",
      };
    }
  });

/**
 * Get notification preferences for the current organization
 *
 * Returns current email severity threshold settings from database.
 * Empty array contract: alerts disabled (vulnerabilityAlertsEnabled = false)
 */
export const getNotificationPreferences = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const organizationId = await getCurrentOrganizationId();

    const alertSeverities = await resolveEmailSeverities(organizationId);

    return {
      success: true,
      data: {
        // Empty array = alerts disabled
        vulnerabilityAlertsEnabled: alertSeverities.length > 0,
        alertSeverities,
        weeklySummaryEnabled: true,
      },
    };
  } catch (error) {
    logger.error("Failed to get notification preferences", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get preferences",
    };
  }
});
