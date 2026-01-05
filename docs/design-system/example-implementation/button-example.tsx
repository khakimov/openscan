/**
 * Example: Button component using semantic tokens
 *
 * This shows the recommended pattern for creating components
 * that automatically adapt to theme changes.
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button Variants using CVA (Class Variance Authority)
 *
 * ✅ Uses semantic tokens (primary, success, danger)
 * ❌ Does NOT use primitives (pumpkin-600, green-500)
 *
 * Benefits:
 * - Automatic dark mode (via CSS variables)
 * - Easy rebranding (change token mapping, not 50 components)
 * - Consistent naming across codebase
 */
const buttonVariants = cva(
  // Base styles (applied to all buttons)
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  {
    variants: {
      /**
       * Variant = Visual style/prominence
       *
       * Use semantic colors from semantic-tokens.css
       * Format: bg-{semantic} text-{semantic}-foreground hover:bg-{semantic}-hover
       */
      variant: {
        // High emphasis - primary actions (submit, save, confirm)
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active focus-visible:ring-primary",

        // Medium emphasis - secondary actions
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active focus-visible:ring-secondary",

        // Status variants
        success: "bg-success text-success-foreground hover:bg-success-hover focus-visible:ring-success",
        warning: "bg-warning text-warning-foreground hover:bg-warning-hover focus-visible:ring-warning",
        danger: "bg-danger text-danger-foreground hover:bg-danger-hover focus-visible:ring-danger",

        // Low emphasis - tertiary actions
        outline: "border border-border bg-background hover:bg-surface-secondary focus-visible:ring-primary",
        ghost: "hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-primary",
        link: "text-primary underline-offset-4 hover:underline focus-visible:ring-0",
      },

      /**
       * Size = Physical dimensions
       */
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },

      /**
       * Full width option
       */
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

/**
 * Button Component Props
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Render as a child component (useful for Next.js Link, TanStack Router Link)
   * @example <Button asChild><Link to="/home">Home</Link></Button>
   */
  asChild?: boolean;
}

/**
 * Button Component
 *
 * @example
 * // Primary action
 * <Button variant="primary">Save Changes</Button>
 *
 * @example
 * // Destructive action
 * <Button variant="danger">Delete Account</Button>
 *
 * @example
 * // With icon
 * <Button variant="outline" size="icon">
 *   <PlusIcon className="h-4 w-4" />
 * </Button>
 *
 * @example
 * // As a link (TanStack Router)
 * <Button asChild variant="ghost">
 *   <Link to="/profile">Profile</Link>
 * </Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

/**
 * Usage Examples in Real Components
 */

// ✅ CORRECT - Uses semantic variants
export function SaveFormButton() {
  return (
    <Button variant="primary" size="lg">
      Save Changes
    </Button>
  );
}

// ✅ CORRECT - Status-based variant
export function DeleteAccountButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="danger" onClick={onClick}>
      Delete Account
    </Button>
  );
}

// ✅ CORRECT - Adapts to dark mode automatically
export function ThemedButton() {
  // No need to check theme - semantic tokens handle it!
  return <Button variant="primary">Works in light & dark</Button>;
}

// ❌ WRONG - Don't use primitive colors
export function BadButton() {
  return (
    <button className="bg-pumpkin-600 text-white hover:bg-pumpkin-700">
      {/* This won't adapt to theme changes! */}
      Don't do this
    </button>
  );
}

// ✅ CORRECT - Custom styling when needed (rare)
export function CustomBrandedButton() {
  // For one-off designs, you CAN use primitives in className
  // But this should be exceptional - prefer adding a new variant instead
  return (
    <Button
      variant="outline"
      className="border-brand bg-gradient-to-r from-pumpkin-500 to-danube-500 text-white"
    >
      Special Promo
    </Button>
  );
}
