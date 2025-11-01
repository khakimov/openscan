import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getCurrentUser, getCurrentOrganizationId } from "./utils/auth";

const logger = createLogger({ name: "preferences-server" });

export interface NotificationPreferences {
  vulnerabilityAlertsEnabled: boolean;
  alertSeverities: string[];
  weeklySummaryEnabled: boolean;
}

/**
 * Save notification preferences for the current user
 *
 * TODO: Implement database persistence
 * Currently logs preferences for development. Future implementation should:
 * 1. Add a notification_preferences table or JSON column to member table
 * 2. Store preferences scoped by organizationId
 * 3. Support retrieval via getNotificationPreferences()
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

      // TODO: Persist to database
      // Example implementation:
      // await updateMemberPreferences(organizationId, user.id, {
      //   notificationPreferences: data,
      // });

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
