import { formatDistanceToNow } from "date-fns";
import {
  ShieldAlert,
  ShieldCheck,
  Network,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Loader2 } from "lucide-react";

import type {
  NotificationItem,
  NotificationType,
  NotificationSeverity,
} from "@/server/notifications/types";

/**
 * Activity Timeline - Minimal changelog view
 *
 * Shows security changes for a device with minimal UI:
 * - Icon + severity badge
 * - Title (from notification catalog)
 * - Key details only (port, CVE ID, etc.)
 * - Timestamp
 */
export function ActivityTimeline({
  notifications,
  isLoading,
}: {
  notifications?: NotificationItem[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Security changes will appear here when scans detect new ports, CVEs, or service changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {notifications.map((notification) => (
        <ActivityItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

function ActivityItem({ notification }: { notification: NotificationItem }) {
  const Icon = getEventIcon(notification.type);

  return (
    <div className="group flex items-start gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Icon + Severity Indicator */}
      <div className="relative flex-shrink-0 mt-0.5">
        <Icon className={`h-4 w-4 ${getIconColor(notification.severity)}`} />
        <SeverityDot severity={notification.severity} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="text-sm font-medium leading-tight">
              {notification.title}
            </h4>
            <EventDetails
              type={notification.type}
              data={notification.data}
            />
          </div>
          <time className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </time>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal event details - only show key info
 */
function EventDetails({ type, data }: { type: NotificationType; data: Record<string, any> | null }) {
  if (!data) return null;

  // Port events
  if (type === "NEW_PORT" || type === "CLOSED_PORT") {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        Port {data.port}/{data.protocol}
        {data.service && ` · ${data.service}`}
        {data.version && ` ${data.version}`}
      </p>
    );
  }

  // CVE events
  if (type.includes("CVE")) {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        {data.cveId}
        {data.cvssScore && ` · CVSS ${data.cvssScore}`}
        {data.affectedService && ` · ${data.affectedService}`}
        {type === "CVE_SEVERITY_INCREASE" &&
          data.oldSeverity &&
          data.newSeverity &&
          ` · ${data.oldSeverity} → ${data.newSeverity}`}
      </p>
    );
  }

  // Service drift
  if (type === "SERVICE_DRIFT") {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        {data.port && `Port ${data.port} · `}
        {data.oldService || "unknown"} → {data.newService || "unknown"}
      </p>
    );
  }

  return null;
}

/**
 * Minimal severity indicator - small colored dot in corner
 */
function SeverityDot({ severity }: { severity: NotificationSeverity | string }) {
  const colors: Record<NotificationSeverity | string, string> = {
    CRITICAL: "bg-red-500",
    HIGH: "bg-orange-500",
    MEDIUM: "bg-yellow-500",
    LOW: "bg-blue-500",
    INFO: "bg-gray-400",
  };

  return (
    <div
      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
        colors[severity] || colors.INFO
      }`}
    />
  );
}

function getEventIcon(type: NotificationType) {
  switch (type) {
    case "NEW_PORT":
      return Network;
    case "CLOSED_PORT":
      return ShieldCheck;
    case "NEW_CVE":
    case "CVE_SEVERITY_INCREASE":
    case "CVE_REGRESSED":
      return ShieldAlert;
    case "CVE_FIXED":
      return ShieldCheck;
    case "SERVICE_DRIFT":
      return TrendingUp;
    default:
      return AlertCircle;
  }
}

function getIconColor(severity: NotificationSeverity | string): string {
  switch (severity) {
    case "CRITICAL":
      return "text-red-500";
    case "HIGH":
      return "text-orange-500";
    case "MEDIUM":
      return "text-yellow-500";
    case "LOW":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}
