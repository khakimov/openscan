/**
 * TabbedPageLayout - Layout for pages with tab navigation and actions
 *
 * Provides consistent spacing and structure for tabbed content pages.
 * Supports pending state to keep tabs mounted during navigation.
 *
 * Usage:
 * ```tsx
 * <TabbedPageLayout
 *   tabs={<ServersTabHeader />}
 *   actions={<Button>Add Device</Button>}
 *   pending={false}
 * >
 *   <DeviceTable />
 * </TabbedPageLayout>
 * ```
 */

import type { ReactNode } from 'react';
import { Padding } from '@/components/ui/padding';
import { PageLoadingFallback } from '@/components/shared/page-loading-fallback';

export interface TabbedPageLayoutProps {
  /** Tab navigation component */
  tabs: ReactNode;
  /** Optional action buttons in the header */
  actions?: ReactNode;
  /** Page content */
  children: ReactNode;
  /** Show loading state while keeping tabs mounted */
  pending?: boolean;
}

export function TabbedPageLayout({
  tabs,
  actions,
  children,
  pending = false,
}: TabbedPageLayoutProps) {
  return (
    <Padding>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">{tabs}</div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {pending ? <PageLoadingFallback compact /> : children}
    </Padding>
  );
}
