import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  /**
   * Controls visibility of the spinner
   * @default true
   */
  show?: boolean;
  /**
   * Delay before showing spinner (prevents flash on fast loads)
   * @example 'delay-300', 'delay-500', 'delay-1000'
   * @default 'delay-300'
   */
  wait?: `delay-${number}`;
  /**
   * Size of the spinner
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Additional CSS classes
   */
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

/**
 * Reusable spinner component with smooth fade-in/out transitions
 *
 * Features:
 * - Configurable delay before showing (prevents flash on fast operations)
 * - Smooth opacity transitions
 * - Multiple sizes
 * - TanStack Router compatible
 *
 * @example
 * // Basic usage
 * <Spinner />
 *
 * @example
 * // With delay and size
 * <Spinner wait="delay-500" size="lg" />
 *
 * @example
 * // Conditional display
 * <Spinner show={isLoading} wait="delay-300" />
 */
export function Spinner({
  show = true,
  wait = 'delay-300',
  size = 'md',
  className,
}: SpinnerProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center transition-opacity',
        show
          ? `opacity-100 duration-500 ${wait}` // Fade in with delay
          : 'opacity-0 duration-500 delay-0',    // Fade out immediately
        className
      )}
    >
      <Loader2
        className={cn(
          'animate-spin text-muted-foreground',
          sizeClasses[size]
        )}
      />
    </div>
  );
}
