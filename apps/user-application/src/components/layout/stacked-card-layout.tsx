/**
 * StackedCardLayout - Centered card layout for wizards and auth flows
 *
 * Provides a centered, bordered card with shadow on a tall background.
 * Used for onboarding, settings wizards, and authorization flows.
 *
 * Usage:
 * ```tsx
 * <StackedCardLayout header={<Progress />}>
 *   <OnboardingStep />
 * </StackedCardLayout>
 * ```
 */

import type { ReactNode } from 'react';

export interface StackedCardLayoutProps {
  /** Optional header component (e.g., progress indicator) */
  header?: ReactNode;
  /** Card content */
  children: ReactNode;
}

export function StackedCardLayout({ header, children }: StackedCardLayoutProps) {
  return (
    <div className="relative min-h-screen pt-32 pb-8">
      <div className="relative z-10 border bg-background rounded-lg shadow-xl shadow-muted/50 max-w-xl mx-auto">
        {header}
        {children}
      </div>
    </div>
  );
}
