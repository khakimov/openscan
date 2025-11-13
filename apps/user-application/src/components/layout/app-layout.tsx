/**
 * AppLayout - Main application shell
 *
 * Provides the top-level layout structure with sidebar and main content area.
 * Follows OpenPanel's layout primitive pattern for consistent chrome across routes.
 *
 * Usage:
 * ```tsx
 * <AppLayout
 *   sidebar={<Sidebar {...props} />}
 *   header={<Header {...props} />}  // Optional
 * >
 *   <Outlet />
 * </AppLayout>
 * ```
 */

import type { ReactNode } from 'react';

export interface AppLayoutProps {
  /** Sidebar component (typically <Sidebar />) */
  sidebar: ReactNode;
  /** Optional header component */
  header?: ReactNode;
  /** Main content area */
  children: ReactNode;
}

export function AppLayout({ sidebar, header, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-background">
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden">
        {header}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-2 pt-14 lg:pt-2">
          <div className="max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
