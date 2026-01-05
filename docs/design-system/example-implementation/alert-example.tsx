/**
 * Example: Alert component with semantic color variants
 *
 * Shows how status colors (success, warning, danger, info) create
 * a consistent feedback system across the app.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Alert Variants
 *
 * Uses semantic status tokens for consistent feedback colors
 */
const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:pl-7",
  {
    variants: {
      variant: {
        /**
         * Status variants use semantic tokens for:
         * - Background: {status}-subtle (very light tint)
         * - Border: {status}-border (medium shade)
         * - Icon/Text: {status} (main color)
         *
         * This creates a cohesive color system where all status
         * colors follow the same pattern.
         */
        success: "bg-success-subtle border-success-border text-success",
        warning: "bg-warning-subtle border-warning-border text-warning",
        danger: "bg-danger-subtle border-danger-border text-danger",
        info: "bg-info-subtle border-info-border text-info",

        // Default/neutral state
        default: "bg-surface-secondary border-border text-text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/**
 * Icon mapping for each variant
 */
const iconMap = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
  default: Info,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /**
   * Optional custom icon (defaults to variant icon)
   */
  icon?: React.ReactNode;
}

/**
 * Alert Component
 *
 * @example
 * // Success message
 * <Alert variant="success">
 *   <AlertTitle>Success!</AlertTitle>
 *   <AlertDescription>Your changes have been saved.</AlertDescription>
 * </Alert>
 *
 * @example
 * // Error with custom content
 * <Alert variant="danger">
 *   <AlertTitle>Authentication Failed</AlertTitle>
 *   <AlertDescription>
 *     Invalid credentials. <a href="/reset">Reset password</a>
 *   </AlertDescription>
 * </Alert>
 */
export function Alert({
  className,
  variant = "default",
  icon,
  children,
  ...props
}: AlertProps) {
  const Icon = iconMap[variant || "default"];

  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icon || <Icon className="h-4 w-4" />}
      <div>{children}</div>
    </div>
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  );
}

/**
 * Real-World Usage Examples
 */

// ✅ Form validation feedback
export function FormSuccessAlert() {
  return (
    <Alert variant="success">
      <AlertTitle>Profile Updated</AlertTitle>
      <AlertDescription>Your changes have been saved successfully.</AlertDescription>
    </Alert>
  );
}

// ✅ Warning about destructive action
export function DeleteWarning({ itemName }: { itemName: string }) {
  return (
    <Alert variant="warning">
      <AlertTitle>Are you sure?</AlertTitle>
      <AlertDescription>
        Deleting "{itemName}" is permanent and cannot be undone.
      </AlertDescription>
    </Alert>
  );
}

// ✅ Error from API
export function ApiErrorAlert({ error }: { error: string }) {
  return (
    <Alert variant="danger">
      <AlertTitle>Request Failed</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

// ✅ Informational notice
export function MaintenanceNotice() {
  return (
    <Alert variant="info">
      <AlertTitle>Scheduled Maintenance</AlertTitle>
      <AlertDescription>
        System will be unavailable on Saturday 2AM-4AM UTC for updates.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Color Behavior Demonstration
 *
 * This component shows how semantic tokens automatically handle
 * light/dark mode without any code changes.
 */
export function ThemeAwareAlerts() {
  return (
    <div className="space-y-4">
      <Alert variant="success">
        {/* In light mode: green-50 background, green-600 text */}
        {/* In dark mode: green-900/20 background, green-400 text */}
        {/* No code changes needed - CSS variables handle it! */}
        <AlertDescription>Automatically adapts to theme</AlertDescription>
      </Alert>

      <Alert variant="danger">
        {/* Same automatic theming for all variants */}
        <AlertDescription>Works in both light and dark modes</AlertDescription>
      </Alert>
    </div>
  );
}
