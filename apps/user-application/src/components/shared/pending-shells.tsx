/**
 * Unified pending shell components
 * 
 * Standardized loading states for route pending components.
 * Following OpenPanel's pending shell pattern for consistency.
 */

import { Spinner } from "@/components/ui/spinner";
import { Padding } from "@/components/ui/padding";
import { SectionHeaderSkeleton, CardGridSkeleton } from "@/components/shared/skeletons";

interface CenteredSpinnerProps {
  /** Delay before showing spinner (prevents flash on fast loads) */
  wait?: "delay-0" | "delay-100" | "delay-200" | "delay-300";
  /** Spinner size */
  size?: "sm" | "md" | "lg";
  /** Container height class */
  height?: string;
}

/**
 * Centered spinner for route pending states
 * Used when the entire page content is loading
 */
export function CenteredSpinner({
  wait = "delay-200",
  size = "md",
  height = "h-[60vh]",
}: CenteredSpinnerProps) {
  return (
    <div className={`flex ${height} items-center justify-center`}>
      <Spinner size={size} wait={wait} />
    </div>
  );
}

/**
 * Organization route pending shell
 * Shows centered spinner while org data loads
 */
export function OrganizationPendingShell() {
  return <CenteredSpinner size="md" wait="delay-200" />;
}

/**
 * Project route pending shell
 * Shows centered spinner while project data loads
 */
export function ProjectPendingShell() {
  return <CenteredSpinner size="md" wait="delay-200" />;
}

/**
 * Organization index pending shell
 * Shows skeleton UI for the projects list page
 */
export function OrganizationIndexPending() {
  return (
    <Padding>
      <SectionHeaderSkeleton />
      <CardGridSkeleton columns={3} rows={2} />
    </Padding>
  );
}

/**
 * Project dashboard pending shell
 * Shows compact loading state with tabs preserved
 */
export function ProjectDashboardPending() {
  return (
    <Padding>
      <div className="flex items-center mb-4">
        <div className="h-10 w-32 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-64 bg-muted/50 rounded animate-pulse" />
    </Padding>
  );
}
