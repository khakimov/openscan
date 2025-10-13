import { useSyncExternalStore } from 'react';

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Hook to detect if the viewport is below a specific breakpoint
 * Uses useSyncExternalStore for concurrent-safe subscriptions
 */
export function useBreakpoint(breakpoint: keyof typeof breakpoints) {
  const mediaQuery = typeof window !== 'undefined'
    ? window.matchMedia(`(max-width: ${breakpoints[breakpoint] - 1}px)`)
    : null;

  const isBelowBreakpoint = useSyncExternalStore(
    // Subscribe function
    (callback) => {
      if (!mediaQuery) return () => {};

      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    },
    // Get snapshot function (client)
    () => mediaQuery?.matches ?? false,
    // Get server snapshot function (SSR)
    () => false
  );

  return {
    [`isBelow${breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1)}`]: isBelowBreakpoint,
  } as const;
}