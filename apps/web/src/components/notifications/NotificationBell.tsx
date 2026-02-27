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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import {
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
} from '@/queries';
import { useTRPC } from '@/integrations/trpc/react';
import { NotificationList } from './NotificationList';
import { useState } from 'react';
import type { NotificationModule } from '@repo/contracts';

/**
 * Notification Bell Component (OpenPanel tRPC pattern)
 *
 * Features:
 * - Real-time unread badge (polls every 30s)
 * - Slide-out sheet with notification list
 * - Module-based filtering (All, Vuln, Network, Config, Lifecycle)
 * - Mark as read (individual + bulk)
 * - Severity-based styling (CRITICAL=red, HIGH=orange, etc.)
 *
 * Integration:
 * - Add to Header component in the top-right corner
 * - Automatically appears after first scan completes
 */
type ModuleFilter = 'ALL' | NotificationModule;

interface NotificationBellProps {
  activeOrganizationId?: string | null;
}

// Filter tabs configuration
const NOTIFICATION_FILTER_TABS = [
  { value: 'ALL' as const, label: 'All' },
  { value: 'VULNERABILITY_MANAGEMENT' as const, label: 'Vuln' },
  { value: 'NETWORK_SECURITY' as const, label: 'Network' },
  { value: 'CONFIGURATION' as const, label: 'Config' },
  { value: 'DEVICE_LIFECYCLE' as const, label: 'Lifecycle' },
];

export function NotificationBell({ activeOrganizationId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('ALL');
  const trpc = useTRPC();

  // Poll unread count every 30 seconds
  const { data: countData } = useQuery({
    ...trpc.notification.unreadCount.queryOptions(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    enabled: !!activeOrganizationId,
  });
  const unreadCount = countData?.count ?? 0;

  // Fetch full notifications when sheet opens (filtered by module)
  const module = moduleFilter === 'ALL' ? undefined : moduleFilter;
  const { data: notificationsData, isLoading } = useQuery({
    ...trpc.notification.list.queryOptions({ unreadOnly: false, module }),
    enabled: isOpen && !!activeOrganizationId,
    staleTime: 30_000,
  });

  // Mark single notification as read (tRPC mutation)
  const markAsReadMutation = useMarkNotificationAsReadMutation();

  // Mark all notifications as read (tRPC mutation)
  const markAllAsReadMutation = useMarkAllNotificationsAsReadMutation();

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

        <Tabs
          value={moduleFilter}
          onValueChange={(v) => setModuleFilter(v as ModuleFilter)}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-5">
            {NOTIFICATION_FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ScrollArea className="h-[calc(100vh-16rem)] mt-4">
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
                  {moduleFilter === 'ALL'
                    ? "You'll be notified when scans detect new ports or vulnerabilities"
                    : `No ${moduleFilter.toLowerCase().replace('_', ' ')} notifications`
                  }
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
