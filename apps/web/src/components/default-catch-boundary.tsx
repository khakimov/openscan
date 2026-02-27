/**
 * DefaultCatchBoundary - Root error boundary using unified ErrorLayout
 *
 * Catches unhandled errors and displays them using the ErrorLayout primitive.
 * Provides "Try Again", navigation actions, and technical details.
 */

import { rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ErrorLayout, type ErrorAction } from "./error-layout";
import { ErrorStackTrace } from "./error-stack-trace";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error(error);

  // Format error details for display
  const errorMessage = error?.message || "An unexpected error occurred";
  const errorStack = error?.stack || "";
  const hasStack = errorStack.length > 0;

  // Build actions based on context
  const actions: ErrorAction[] = [
    {
      label: 'Try Again',
      onClick: () => router.invalidate(),
      variant: 'default',
    },
    isRoot
      ? { label: 'Go Home', to: '/', variant: 'outline' }
      : { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ];

  return (
    <ErrorLayout
      status={500}
      title="Something went wrong"
      message="We encountered an unexpected error. Please try again."
      technicalDetails={
        hasStack ? (
          <ErrorStackTrace
            errorMessage={errorMessage}
            stack={errorStack}
          />
        ) : null
      }
      actions={actions}
    />
  );
}
