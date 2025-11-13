import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import {
  notificationListQuery,
  unreadNotificationCountQuery,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/queries';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { NotificationList } from './NotificationList';
import { useState } from 'react';

/**
 * Notification Bell Component
 *
 * Features:
 * - Real-time unread badge (polls every 30s)
 * - Slide-out sheet with notification list
 * - Mark as read (individual + bulk)
 * - Severity-based styling (CRITICAL=red, HIGH=orange, etc.)
 *
 * Integration:
 * - Add to Header component in the top-right corner
 * - Automatically appears after first scan completes
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);

  // Poll unread count every 30 seconds (uses query helper with built-in polling)
  const { data: countData } = useQuery(unreadNotificationCountQuery);
  const unreadCount = countData?.count ?? 0;

  // Fetch full notifications when sheet opens (uses query helper)
  const { data: notificationsData, isLoading } = useQuery({
    ...notificationListQuery({ unreadOnly: false }),
    enabled: isOpen, // Only fetch when sheet is open
  });

  // Mark single notification as read (unified mutation helper)
  const markAsReadMutation = useMutationWithToast({
    mutationKey: ['notifications', 'mark-single'],
    mutationFn: markNotificationAsRead,
    successMessage: 'Notification marked as read',
    invalidateKeys: [
      notificationListQuery({ unreadOnly: false }).queryKey,
      unreadNotificationCountQuery.queryKey,
    ],
    toastOnSuccess: false, // Silent success for better UX
  });

  // Mark all notifications as read (unified mutation helper)
  const markAllAsReadMutation = useMutationWithToast({
    mutationKey: ['notifications', 'mark-all'],
    mutationFn: markAllNotificationsAsRead,
    successMessage: 'All notifications marked as read',
    invalidateKeys: [
      notificationListQuery({ unreadOnly: false }).queryKey,
      unreadNotificationCountQuery.queryKey,
    ],
  });

  // Server already normalized data via normalizeNotificationList()
  // No client-side guards needed - just use the pre-validated items
  const notifications = notificationsData?.items ?? [];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-[20px] rounded-full px-1 text-[10px] font-bold"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                Mark all as read
              </Button>
            )}
          </div>
          <SheetDescription>
            Security scan alerts and vulnerability notifications
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-12rem)] mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                You'll be notified when scans detect new ports or vulnerabilities
              </p>
            </div>
          ) : (
            <NotificationList
              notifications={notifications}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
              isMarkingAsRead={markAsReadMutation.isPending}
            />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
