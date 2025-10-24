import { useRouterState } from '@tanstack/react-router';
import { Spinner } from './spinner';
import { cn } from '@/utils/cn';

interface InlineRouterSpinnerProps {
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Size of the spinner
   * @default 'sm'
   */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Inline router navigation spinner
 * Shows when router status is 'pending' (during navigation)
 * Automatically hidden when navigation completes
 *
 * Usage:
 * - Place next to page titles/headers
 * - Shows only during slow navigation (>1s due to router config)
 * - Automatically hides when page loads
 *
 * @example
 * <div className="flex items-center gap-2">
 *   <h1>Dashboard</h1>
 *   <InlineRouterSpinner />
 * </div>
 */
export function InlineRouterSpinner({
  className,
  size = 'sm',
}: InlineRouterSpinnerProps) {
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' });

  // Only render when loading (completely hidden when not loading)
  if (!isLoading) {
    return null;
  }

  return (
    <div className={cn('inline-flex items-center', className)}>
      <Spinner show={isLoading} wait="delay-0" size={size} />
    </div>
  );
}
