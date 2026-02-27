import { Spinner } from "@/components/ui/spinner";

/**
 * Loading fallback for page content (used in Suspense boundaries and route pendingComponent)
 * Shows while child routes are loading data
 *
 * Used in _auth route to allow sidebar to render immediately
 * while page content loads progressively
 */
interface PageLoadingFallbackProps {
  /** Compact mode with smaller height and no text */
  compact?: boolean;
  /** Custom height class (defaults to h-64 or h-40 for compact) */
  height?: string;
}

export function PageLoadingFallback({
  compact = false,
  height
}: PageLoadingFallbackProps = {}) {
  const defaultHeight = compact ? "h-40" : "h-64";

  return (
    <div className={`flex items-center justify-center ${height ?? defaultHeight}`}>
      <div className="flex flex-col items-center gap-3">
        <Spinner size={compact ? "md" : "lg"} show={true} wait={compact ? "delay-100" : "delay-0"} />
        {!compact && <p className="text-sm text-muted-foreground">Loading...</p>}
      </div>
    </div>
  );
}
