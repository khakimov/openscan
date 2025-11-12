/**
 * AppLayoutPending - Pending shell for AppLayout
 *
 * Shows skeleton UI while loaders hydrate, maintaining consistent chrome.
 * Follows OpenPanel's pending shell pattern.
 *
 * Usage:
 * ```tsx
 * export const Route = createFileRoute('/_app')({
 *   pendingComponent: AppLayoutPending,
 *   component: () => <AppLayout ... />
 * });
 * ```
 */

import { SidebarSkeleton } from '@/components/shared/skeletons';
import { PageLoadingFallback } from '@/components/shared/page-loading-fallback';

export function AppLayoutPending() {
  return (
    <div className="flex h-screen w-full bg-background">
      <SidebarSkeleton />
      <main className="flex-1 p-2 pt-14 lg:pt-2">
        <div className="max-w-7xl h-full flex items-center justify-center">
          <PageLoadingFallback />
        </div>
      </main>
    </div>
  );
}
