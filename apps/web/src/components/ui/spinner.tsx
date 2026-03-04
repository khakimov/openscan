import { cn } from '@/utils/cn';

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
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

/**
 * Rock hand spinner with pulse animation
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
          ? `opacity-100 duration-500 ${wait}`
          : 'opacity-0 duration-500 delay-0',
        className
      )}
    >
      <img
        src="/favicon.svg"
        alt=""
        className={cn('animate-pulse', sizeClasses[size])}
      />
    </div>
  );
}
