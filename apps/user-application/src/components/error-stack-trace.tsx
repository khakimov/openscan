/**
 * ErrorStackTrace - Collapsible technical details for error boundaries
 *
 * Displays stack traces and technical information in a collapsible section.
 * Used in ErrorLayout's technicalDetails slot.
 *
 * Usage:
 * ```tsx
 * <ErrorLayout
 *   ...
 *   technicalDetails={
 *     <ErrorStackTrace
 *       stack={error.stack}
 *       errorMessage={error.message}
 *     />
 *   }
 * />
 * ```
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AlertTriangle, Bug, ChevronDown, Mail } from 'lucide-react';

export interface ErrorStackTraceProps {
  /** Error message to display */
  errorMessage: string;
  /** Stack trace string */
  stack?: string;
  /** Optional callback for reporting errors */
  onReportError?: () => void;
}

export function ErrorStackTrace({
  errorMessage,
  stack,
  onReportError,
}: ErrorStackTraceProps) {
  const [showDetails, setShowDetails] = useState(false);
  const hasStack = !!stack && stack.length > 0;

  const handleDefaultReport = () => {
    const subject = encodeURIComponent('Error Report');
    const body = encodeURIComponent(
      `An error occurred in the application:\n\nError: ${errorMessage}\n\nStack Trace:\n${stack}\n\nPlease describe what you were doing when this error occurred:`
    );
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
  };

  return (
    <>
      {/* Error Alert */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="font-medium">
          {errorMessage}
        </AlertDescription>
      </Alert>

      {/* Stack Trace (Collapsible) */}
      {hasStack && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Bug className="h-4 w-4" />
              Technical Details
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  showDetails ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            <div className="rounded-lg bg-muted p-4">
              <h4 className="text-sm font-medium mb-2">Error Stack Trace:</h4>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {stack}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Help Section */}
      {(onReportError || hasStack) && (
        <div className="border-t pt-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-sm text-muted-foreground">
              If this error persists, please report it to our support team.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onReportError || handleDefaultReport}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Report Error
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
