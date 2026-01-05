import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NotificationModule } from '@repo/contracts';

type ModuleFilter = 'ALL' | NotificationModule;

interface NotificationFilterTabsProps {
  value: ModuleFilter;
  onValueChange: (value: ModuleFilter) => void;
  className?: string;
}

/**
 * Notification Filter Tabs
 *
 * Allows filtering notifications by module:
 * - ALL: Show all notifications
 * - VULNERABILITY_MANAGEMENT: CVE alerts
 * - NETWORK_SECURITY: Port/service changes
 * - CONFIGURATION: Config drift (IP, product, version changes)
 * - DEVICE_LIFECYCLE: Device status changes
 */
export function NotificationFilterTabs({
  value,
  onValueChange,
  className,
}: NotificationFilterTabsProps) {
  const tabs = [
    { value: 'ALL' as const, label: 'All' },
    { value: 'VULNERABILITY_MANAGEMENT' as const, label: 'Vuln' },
    { value: 'NETWORK_SECURITY' as const, label: 'Network' },
    { value: 'CONFIGURATION' as const, label: 'Config' },
    { value: 'DEVICE_LIFECYCLE' as const, label: 'Lifecycle' },
  ];

  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as ModuleFilter)} className={className}>
      <TabsList className="grid w-full grid-cols-5">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
