/**
 * ErrorLayout - Unified error boundary UI
 *
 * Provides consistent error display across all route boundaries.
 * Follows OpenPanel's status-aware error pattern.
 *
 * Usage:
 * ```tsx
 * <ErrorLayout
 *   status={404}
 *   title="Page Not Found"
 *   message="The page you requested could not be found."
 *   actions={[
 *     { label: 'Go Home', to: '/' },
 *     { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
 *   ]}
 * />
 * ```
 */

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ErrorAction {
  /** Button label */
  label: string;
  /** Click handler (for actions like router.invalidate(), history.back()) */
  onClick?: () => void;
  /** Link destination (for navigation actions) */
  to?: string;
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}

export interface ErrorLayoutProps {
  /** HTTP status code or custom error code */
  status: 403 | 404 | 500 | number;
  /** Error title (e.g., "Access Denied", "Page Not Found") */
  title: string;
  /** User-friendly error message */
  message: string;
  /** Optional technical details (stack trace, debug info) */
  technicalDetails?: ReactNode;
  /** Action buttons (e.g., "Go Home", "Try Again") */
  actions?: ErrorAction[];
}

export function ErrorLayout({
  status,
  title,
  message,
  technicalDetails,
  actions = [],
}: ErrorLayoutProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl">{title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {status} · {message}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {technicalDetails}

          {actions.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              {actions.map(({ label, onClick, to, variant = 'default' }, idx) => (
                <Button
                  key={idx}
                  onClick={onClick}
                  asChild={!!to}
                  variant={variant}
                  className="flex items-center gap-2"
                >
                  {to ? <a href={to}>{label}</a> : <span>{label}</span>}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
