import { AlertCircle, type LucideIcon } from "lucide-react";
import { Padding } from "@/components/ui/padding";

/**
 * Full-page error state component
 * Used in route error boundaries to show user-friendly error messages
 *
 * Examples:
 * - Device not found
 * - Project access denied
 * - Network errors
 * - Loader failures
 */
interface FullPageErrorStateProps {
  /** Error title (e.g., "Device Not Found") */
  title?: string;
  /** Error description/message */
  description?: string;
  /** Icon to display (defaults to AlertCircle) */
  icon?: LucideIcon;
  /** Action buttons (e.g., retry, back navigation) */
  children?: React.ReactNode;
  /** Use compact padding (for nested layouts) */
  compact?: boolean;
}

export function FullPageErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  icon: Icon = AlertCircle,
  children,
  compact = false,
}: FullPageErrorStateProps) {
  const Content = (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Icon className="h-12 w-12 text-destructive" />
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {description}
        </p>
      </div>
      {children && (
        <div className="flex gap-3">
          {children}
        </div>
      )}
    </div>
  );

  // Compact mode doesn't add extra padding (for nested routes)
  return compact ? Content : <Padding>{Content}</Padding>;
}
