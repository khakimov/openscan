/**
 * Shared skeleton components for pending states
 * Used in route pendingComponent to keep layout chrome mounted while data loads
 */

import { cn } from "@/lib/utils";

/**
 * Section header skeleton - mimics page title + description
 */
export const SectionHeaderSkeleton = () => (
  <div className="animate-pulse space-y-2 mb-6">
    <div className="h-8 w-48 rounded bg-muted" />
    <div className="h-4 w-96 rounded bg-muted/70" />
  </div>
);

/**
 * Card skeleton - represents a loading card
 */
export const CardSkeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "h-32 rounded-lg border bg-card/50 animate-pulse",
      className
    )}
  />
);

/**
 * Card grid skeleton - grid of loading cards
 */
interface CardGridSkeletonProps {
  columns?: 2 | 3 | 4;
  rows?: number;
  className?: string;
}

export const CardGridSkeleton = ({
  columns = 3,
  rows = 2,
  className
}: CardGridSkeletonProps) => (
  <div
    className={cn(
      "grid gap-4",
      columns === 2 && "md:grid-cols-2",
      columns === 3 && "md:grid-cols-2 lg:grid-cols-3",
      columns === 4 && "md:grid-cols-2 lg:grid-cols-4",
      className
    )}
  >
    {Array.from({ length: columns * rows }).map((_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Collection skeleton - table-like skeleton for lists
 */
export const CollectionSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-16 rounded-lg border bg-card/30 animate-pulse"
      />
    ))}
  </div>
);

/**
 * Sidebar skeleton - loading state for sidebar
 */
export const SidebarSkeleton = () => (
  <div className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border lg:bg-[color-mix(in_oklab,var(--color-background),black_50%)]">
    {/* Header */}
    <div className="flex h-16 items-center px-6 border-b border-border">
      <div className="h-8 w-32 rounded bg-muted animate-pulse" />
    </div>

    {/* Navigation */}
    <div className="flex-1 px-3 py-4 space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-10 w-full rounded bg-muted/50 animate-pulse"
        />
      ))}
    </div>

    {/* Footer */}
    <div className="border-t border-border p-4">
      <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50">
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
        </div>
      </div>
    </div>
  </div>
);

/**
 * Device header skeleton - loading state for device detail page header
 * Shows animated placeholders for device name, IP, and action buttons
 */
export const DeviceHeaderSkeleton = () => (
  <div className="flex items-start justify-between mb-6">
    <div className="space-y-2 animate-pulse">
      <div className="h-9 w-64 rounded bg-muted" />
      <div className="h-5 w-32 rounded bg-muted/70" />
    </div>
    <div className="flex gap-2">
      <div className="h-9 w-20 rounded bg-muted/50 animate-pulse" />
      <div className="h-9 w-16 rounded bg-muted/50 animate-pulse" />
      <div className="h-9 w-20 rounded bg-muted/50 animate-pulse" />
    </div>
  </div>
);
