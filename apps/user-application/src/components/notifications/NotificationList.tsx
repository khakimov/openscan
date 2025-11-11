import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, AlertTriangle, Info, ShieldAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Notification type from data-ops
export type DisplayNotification = {
  id: string;
  type:
    | 'NEW_PORT'
    | 'CLOSED_PORT'
    | 'NEW_CVE'
    | 'CVE_SEVERITY_INCREASE'
    | 'CVE_FIXED'
    | 'CVE_REGRESSED'
    | 'SERVICE_DRIFT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  message: string | null;
  data: Record<string, any> | null;
  readAt: Date | null;
  createdAt: Date;
  deviceId: string | null;
  scanRunId: string | null;
};

const ALLOWED_TYPES = new Set<DisplayNotification['type']>([
  'NEW_PORT',
  'CLOSED_PORT',
  'NEW_CVE',
  'CVE_SEVERITY_INCREASE',
  'CVE_FIXED',
  'CVE_REGRESSED',
  'SERVICE_DRIFT',
]);

const ALLOWED_SEVERITIES = new Set<DisplayNotification['severity']>([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
]);

export function toDisplayNotification(record: any): DisplayNotification | null {
  if (!record) return null;

  const type =
    typeof record.type === 'string' && ALLOWED_TYPES.has(record.type)
      ? (record.type as DisplayNotification['type'])
      : null;

  if (!type) {
    return null;
  }

  const severity =
    typeof record.severity === 'string' && ALLOWED_SEVERITIES.has(record.severity)
      ? (record.severity as DisplayNotification['severity'])
      : 'INFO';

  const createdAt = new Date(record.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const readAt = record.readAt ? new Date(record.readAt) : null;

  return {
    id: String(record.id),
    type,
    severity,
    title: record.title ?? 'Notification',
    message: record.message ?? null,
    data: record.data ?? null,
    readAt,
    createdAt,
    deviceId: record.deviceId ?? null,
    scanRunId: record.scanRunId ?? null,
  };
}

interface NotificationListProps {
  notifications: DisplayNotification[];
  onMarkAsRead: (id: string) => void;
  isMarkingAsRead: boolean;
}

const severityConfig = {
  CRITICAL: {
    icon: ShieldAlert,
    bgColor: 'bg-destructive/10',
    borderColor: 'border-l-destructive',
    iconColor: 'text-destructive',
    badgeVariant: 'destructive' as const,
  },
  HIGH: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    badgeVariant: 'destructive' as const,
  },
  MEDIUM: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-l-yellow-500',
    iconColor: 'text-yellow-500',
    badgeVariant: 'outline' as const,
  },
  LOW: {
    icon: Info,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-500',
    badgeVariant: 'outline' as const,
  },
  INFO: {
    icon: Info,
    bgColor: 'bg-muted',
    borderColor: 'border-l-muted-foreground',
    iconColor: 'text-muted-foreground',
    badgeVariant: 'secondary' as const,
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
} as const;

export function NotificationList({
  notifications,
  onMarkAsRead,
  isMarkingAsRead,
}: NotificationListProps) {
  return (
    <div className="space-y-2">
      {notifications.map((notification) => {
        const config = severityConfig[notification.severity];
        const Icon = config.icon;
        const isUnread = !notification.readAt;

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
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {/* Additional data (if present) */}
                {notification.data && Object.keys(notification.data).length > 0 && (
                  <div className="mt-2 rounded bg-muted/50 px-2 py-1.5 text-[11px] font-mono space-y-1.5">
                    {(notification.type === 'NEW_PORT' || notification.type === 'CLOSED_PORT') &&
                      notification.data.port && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Port:</span>
                          <span className="font-semibold">
                            {notification.data.port}/{notification.data.protocol}
                          </span>
                          {notification.data.service && (
                            <>
                              <span className="text-muted-foreground">Service:</span>
                              <span>{notification.data.service}</span>
                            </>
                          )}
                          {notification.type === 'CLOSED_PORT' && (
                            <>
                              {notification.data.previousState && (
                                <>
                                  <span className="text-muted-foreground">Previous:</span>
                                  <span>{notification.data.previousState}</span>
                                </>
                              )}
                              {notification.data.currentState && (
                                <>
                                  <span className="text-muted-foreground">Current:</span>
                                  <span>{notification.data.currentState}</span>
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
                      notification.data.cveId && (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">CVE:</span>
                            <span className="font-semibold">{notification.data.cveId}</span>
                            {notification.data.cvssScore && (
                              <>
                                <span className="text-muted-foreground">CVSS:</span>
                                <span>{notification.data.cvssScore}</span>
                              </>
                            )}
                          </div>
                          {notification.type === 'CVE_SEVERITY_INCREASE' && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">Severity:</span>
                              <span>
                                {notification.data.oldSeverity} → {notification.data.newSeverity}
                              </span>
                            </div>
                          )}
                          {notification.data.affectedService && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">Affected:</span>
                              <span>{notification.data.affectedService}</span>
                            </div>
                          )}
                        </div>
                      )}

                    {notification.type === 'SERVICE_DRIFT' && notification.data.port && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Port:</span>
                          <span className="font-semibold">
                            {notification.data.port}/{notification.data.protocol}
                          </span>
                        </div>
                        {notification.data.oldService && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">Old:</span>
                            <span>
                              {notification.data.oldService.product || notification.data.oldService.name || 'unknown'}
                              {notification.data.oldService.version ? ` ${notification.data.oldService.version}` : ''}
                            </span>
                          </div>
                        )}
                        {notification.data.newService && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">New:</span>
                            <span>
                              {notification.data.newService.product || notification.data.newService.name || 'unknown'}
                              {notification.data.newService.version ? ` ${notification.data.newService.version}` : ''}
                            </span>
                          </div>
                        )}
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
