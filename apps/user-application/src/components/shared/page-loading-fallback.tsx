import { Spinner } from "@/components/ui/spinner";

/**
 * Loading fallback for page content (used in Suspense boundaries)
 * Shows while child routes are loading data
 *
 * Used in _auth route to allow sidebar to render immediately
 * while page content loads progressively
 */
export function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" show={true} wait="delay-0" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
