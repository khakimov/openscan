import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, AlertTriangle, Info, ShieldAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/server/notifications/types';

/**
 * NotificationList - Displays normalized notifications from server
 *
 * Server normalizes data via normalizeNotificationList(), so we receive
 * pre-validated types/severities and ISO strings. This component just
 * converts ISO → Date for display formatting.
 */

interface NotificationListProps {
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  isMarkingAsRead: boolean;
}

type PortNotificationData = {
  port: number | string;
  protocol?: string;
  service?: string;
  previousState?: string;
  currentState?: string;
};

type CVENotificationData = {
  cveId: string;
  cvssScore?: number | string;
  oldSeverity?: string;
  newSeverity?: string;
  affectedService?: string;
};

type ServiceDetails = {
  name?: string;
  product?: string;
  version?: string;
};

type ServiceDriftData = {
  port: number | string;
  protocol?: string;
  oldService?: ServiceDetails;
  newService?: ServiceDetails;
};

type ServerPromotedData = {
  deviceName?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isPortNotificationData(value: Record<string, unknown>): value is PortNotificationData {
  return typeof value.port === 'number' || typeof value.port === 'string';
}

function isCVENotificationData(value: Record<string, unknown>): value is CVENotificationData {
  return typeof value.cveId === 'string';
}

function isServiceDetails(value: unknown): value is ServiceDetails {
  return isRecord(value);
}

function isServiceDriftData(value: Record<string, unknown>): value is ServiceDriftData {
  return (
    (typeof value.port === 'number' || typeof value.port === 'string') &&
    (isServiceDetails(value.oldService) || typeof value.oldService === 'undefined') &&
    (isServiceDetails(value.newService) || typeof value.newService === 'undefined')
  );
}

function isServerPromotedData(value: Record<string, unknown>): value is ServerPromotedData {
  return typeof value.deviceName === 'string';
}

const severityConfig: Record<
  NotificationItem['severity'],
  {
    icon: typeof ShieldAlert;
    bgColor: string;
    borderColor: string;
    iconColor: string;
    badgeVariant: 'destructive' | 'outline' | 'secondary';
  }
> = {
  CRITICAL: {
    icon: ShieldAlert,
    bgColor: 'bg-destructive/10',
    borderColor: 'border-l-destructive',
    iconColor: 'text-destructive',
    badgeVariant: 'destructive',
  },
  HIGH: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    badgeVariant: 'destructive',
  },
  MEDIUM: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-l-yellow-500',
    iconColor: 'text-yellow-500',
    badgeVariant: 'outline',
  },
  LOW: {
    icon: Info,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-500',
    badgeVariant: 'outline',
  },
  INFO: {
    icon: Info,
    bgColor: 'bg-muted',
    borderColor: 'border-l-muted-foreground',
    iconColor: 'text-muted-foreground',
    badgeVariant: 'secondary',
  },
};

const typeLabels = {
  NEW_PORT: 'New Port',
  CLOSED_PORT: 'Port Closed',
  NEW_CVE: 'New CVE',
  CVE_SEVERITY_INCREASE: 'CVE Severity Increase',
  CVE_FIXED: 'CVE Fixed',
  CVE_REGRESSED: 'CVE Regressed',
  SERVICE_DRIFT: 'Service Drift',
  SERVER_PROMOTED: 'Server Promotion',
} satisfies Record<NotificationItem['type'], string>;

export function NotificationList({
  notifications,
  onMarkAsRead,
  isMarkingAsRead,
}: NotificationListProps) {
  return (
    <div className="space-y-2">
      {notifications.map((notification) => {
        // Convert ISO strings → Date objects just-in-time for display
        const createdAt = new Date(notification.createdAt);
        const readAt = notification.readAt ? new Date(notification.readAt) : null;

        const config = severityConfig[notification.severity];
        const Icon = config.icon;
        const isUnread = !readAt;
        const rawData = isRecord(notification.data)
          ? (notification.data as Record<string, unknown>)
          : {};
        const portData = isPortNotificationData(rawData) ? rawData : null;
        const cveData = isCVENotificationData(rawData) ? rawData : null;
        const serviceDriftData = isServiceDriftData(rawData) ? rawData : null;
        const serverPromotedData = isServerPromotedData(rawData) ? rawData : null;

        return (
          <div
            key={notification.id}
            className={cn(
              'relative rounded-lg border border-l-4 p-4 transition-colors',
              config.borderColor,
              isUnread ? config.bgColor : 'bg-muted/30',
              'hover:bg-muted/50',
            )}
          >
            {/* Unread indicator dot */}
            {isUnread && (
              <div className="absolute right-4 top-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
              </div>
            )}

            <div className="flex gap-3">
              {/* Icon */}
              <div className={cn('mt-0.5', config.iconColor)}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 space-y-1.5">
                {/* Title and badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold leading-tight">
                      {notification.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={config.badgeVariant} className="text-[10px]">
                      {notification.severity}
                    </Badge>
                  </div>
                </div>

                {/* Message */}
                {notification.message && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {notification.message}
                  </p>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                  <span>{typeLabels[notification.type]}</span>
                  <span>•</span>
                  <span>
                    {formatDistanceToNow(createdAt, {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {/* Additional data (if present) */}
                {Object.keys(rawData).length > 0 && (
                  <div className="mt-2 rounded bg-muted/50 px-2 py-1.5 text-[11px] font-mono space-y-1.5">
                    {(notification.type === 'NEW_PORT' || notification.type === 'CLOSED_PORT') &&
                      portData && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Port:</span>
                          <span className="font-semibold">
                            {`${portData.port}/${portData.protocol ?? 'tcp'}`}
                          </span>
                          {portData.service && (
                            <>
                              <span className="text-muted-foreground">Service:</span>
                              <span>{String(portData.service)}</span>
                            </>
                          )}
                          {notification.type === 'CLOSED_PORT' && (
                            <>
                              {portData.previousState && (
                                <>
                                  <span className="text-muted-foreground">Previous:</span>
                                  <span>{String(portData.previousState)}</span>
                                </>
                              )}
                              {portData.currentState && (
                                <>
                                  <span className="text-muted-foreground">Current:</span>
                                  <span>{String(portData.currentState)}</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}

                    {(
                      notification.type === 'NEW_CVE' ||
                      notification.type === 'CVE_SEVERITY_INCREASE' ||
                      notification.type === 'CVE_FIXED' ||
                      notification.type === 'CVE_REGRESSED'
                    ) &&
                      cveData && (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">CVE:</span>
                            <span className="font-semibold">{String(cveData.cveId)}</span>
                            {typeof cveData.cvssScore !== 'undefined' && (
                              <>
                                <span className="text-muted-foreground">CVSS:</span>
                                <span>{String(cveData.cvssScore)}</span>
                              </>
                            )}
                          </div>
                          {notification.type === 'CVE_SEVERITY_INCREASE' && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">Severity:</span>
                              <span>{`${String(cveData.oldSeverity)} → ${String(
                                cveData.newSeverity,
                              )}`}</span>
                            </div>
                          )}
                          {cveData.affectedService && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">Affected:</span>
                              <span>{String(cveData.affectedService)}</span>
                            </div>
                          )}
                        </div>
                      )}

                    {notification.type === 'SERVICE_DRIFT' && serviceDriftData && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Port:</span>
                          <span className="font-semibold">
                            {`${serviceDriftData.port}/${serviceDriftData.protocol ?? 'tcp'}`}
                          </span>
                        </div>
                        {serviceDriftData.oldService && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">Old:</span>
                            <span>
                              {String(
                                serviceDriftData.oldService.product ||
                                  serviceDriftData.oldService.name ||
                                  'unknown',
                              )}
                              {serviceDriftData.oldService.version
                                ? ` ${serviceDriftData.oldService.version}`
                                : ''}
                            </span>
                          </div>
                        )}
                        {serviceDriftData.newService && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">New:</span>
                            <span>
                              {String(
                                serviceDriftData.newService.product ||
                                  serviceDriftData.newService.name ||
                                  'unknown',
                              )}
                              {serviceDriftData.newService.version
                                ? ` ${serviceDriftData.newService.version}`
                                : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {notification.type === 'SERVER_PROMOTED' && serverPromotedData?.deviceName && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">Server:</span>
                        <span>{serverPromotedData.deviceName}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mark as read button */}
                {isUnread && (
                  <div className="pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onMarkAsRead(notification.id)}
                      disabled={isMarkingAsRead}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Mark as read
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
