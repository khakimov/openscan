import { useQuery } from '@tanstack/react-query';
import { notificationQueries } from '@/queries/notification-queries';
import { useTRPCClient } from '@/integrations/trpc/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NotificationIndicatorProps {
  activeOrganizationId?: string | null;
}

/**
 * Notification Indicator - Pulsing Dot (OpenPanel tRPC pattern)
 *
 * Shows a pulsing colored dot based on unread notification severity:
 * - Red: CRITICAL or HIGH severity notifications
 * - Yellow: MEDIUM severity notifications
 * - Green: Only LOW/INFO notifications
 * - Gray: No unread notifications
 *
 * Usage: Add next to navigation items (e.g., Servers in sidebar)
 *
 * Uses tRPC query with consistent polling for real-time badge updates.
 */
export function NotificationIndicator({ activeOrganizationId }: NotificationIndicatorProps) {
  const trpcClient = useTRPCClient();

  // Poll unread count every 30 seconds (OpenPanel tRPC pattern)
  const { data: countData } = useQuery({
    queryKey: notificationQueries.unreadCount.key(),
    queryFn: () => trpcClient.notification.unreadCount.query(),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 30_000, // Auto-refetch every 30 seconds
    refetchIntervalInBackground: true, // Keep polling when tab is inactive
    enabled: !!activeOrganizationId, // Disable query if no active organization
  });

  const unreadCount = countData?.count ?? 0;
  const criticalCount = countData?.criticalCount ?? 0;
  const highCount = countData?.highCount ?? 0;
  const mediumCount = countData?.mediumCount ?? 0;

  // Determine color based on severity
  const getColorClass = () => {
    if (criticalCount > 0 || highCount > 0) return 'bg-red-500';
    if (mediumCount > 0) return 'bg-yellow-500';
    if (unreadCount > 0) return 'bg-emerald-500';
    return 'bg-gray-400';
  };

  const getTooltipMessage = () => {
    if (unreadCount === 0) return 'No new notifications';

    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (highCount > 0) parts.push(`${highCount} high`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);

    if (parts.length === 0) {
      return `${unreadCount} notification${unreadCount === 1 ? '' : 's'}`;
    }

    return `${unreadCount} notification${unreadCount === 1 ? '' : 's'}: ${parts.join(', ')}`;
  };

  const colorClass = getColorClass();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex items-center justify-center">
            {/* Pulsing animation (outer ring) */}
            <div
              className={cn(
                'h-2 w-2 rounded-full opacity-75 transition-all',
                colorClass,
                unreadCount > 0 && 'animate-ping'
              )}
            />
            {/* Static dot (inner) */}
            <div
              className={cn(
                'absolute h-2 w-2 rounded-full transition-all',
                colorClass
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {getTooltipMessage()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
