# Design System for Tailwind CSS v4.0

**Updated guide specifically for Tailwind CSS v4.0's CSS-first configuration**

Tailwind v4.0 changes everything about how you configure the framework - instead of a JavaScript config file, you configure everything in CSS using `@theme`. This actually makes our design system even easier to implement!

---

## 🎯 The v4.0 Advantage

In Tailwind v4.0, **everything is CSS variables**. This means:

✅ No JavaScript config file needed
✅ Design tokens ARE CSS variables (not transformed)
✅ @theme block replaces tailwind.config.js
✅ All colors automatically available as CSS variables
✅ Better performance (no JS evaluation needed)

---

## Quick Start for v4.0

### Step 1: Create Your Color System (30 min)

Generate your color scales using https://uicolors.app/create:

1. Input your brand color: `#EF944E`
2. Get OKLCH output
3. Copy the values

### Step 2: Add Colors to Your CSS (15 min)

In Tailwind v4.0, you add everything directly to your CSS file using `@theme`:

```css
/* apps/user-application/src/styles.css */
@import "tailwindcss";

/**
 * Theme Configuration (replaces tailwind.config.js)
 */
@theme {
  /* ===== PRIMITIVE COLOR SCALES ===== */

  /* Pumpkin (Brand Primary) */
  --color-pumpkin-50: oklch(97.5% 0.020 53.4);
  --color-pumpkin-100: oklch(94.8% 0.045 53.4);
  --color-pumpkin-200: oklch(88.2% 0.082 53.4);
  --color-pumpkin-300: oklch(81.6% 0.118 53.4);
  --color-pumpkin-400: oklch(75.5% 0.145 53.4);
  --color-pumpkin-500: oklch(70.0% 0.165 53.4);
  --color-pumpkin-600: oklch(64.2% 0.165 53.4);
  --color-pumpkin-700: oklch(56.5% 0.142 53.4);
  --color-pumpkin-800: oklch(48.0% 0.118 53.4);
  --color-pumpkin-900: oklch(38.5% 0.089 53.4);
  --color-pumpkin-950: oklch(28.0% 0.058 53.4);

  /* Danube (Brand Secondary) */
  --color-danube-50: oklch(96.5% 0.018 264.3);
  --color-danube-100: oklch(92.8% 0.042 264.3);
  --color-danube-200: oklch(86.2% 0.078 264.3);
  --color-danube-300: oklch(79.5% 0.115 264.3);
  --color-danube-400: oklch(72.0% 0.165 264.3);
  --color-danube-500: oklch(65.8% 0.198 264.3);
  --color-danube-600: oklch(58.5% 0.198 264.3);
  --color-danube-700: oklch(52.0% 0.175 264.3);
  --color-danube-800: oklch(44.2% 0.148 264.3);
  --color-danube-900: oklch(35.8% 0.112 264.3);
  --color-danube-950: oklch(26.0% 0.078 264.3);

  /* Slate (Neutral) */
  --color-slate-50: oklch(98.5% 0.002 264.0);
  --color-slate-100: oklch(96.8% 0.004 264.0);
  --color-slate-200: oklch(93.5% 0.008 264.0);
  --color-slate-300: oklch(87.2% 0.012 264.0);
  --color-slate-400: oklch(70.5% 0.018 264.0);
  --color-slate-500: oklch(55.8% 0.022 264.0);
  --color-slate-600: oklch(45.2% 0.020 264.0);
  --color-slate-700: oklch(38.5% 0.018 264.0);
  --color-slate-800: oklch(28.0% 0.014 264.0);
  --color-slate-900: oklch(20.5% 0.010 264.0);
  --color-slate-950: oklch(14.2% 0.006 264.0);

  /* Status Colors */
  --color-green-600: oklch(57.8% 0.158 142.0);
  --color-red-600: oklch(57.7% 0.245 27.3);
  --color-amber-600: oklch(64.6% 0.182 85.0);
  --color-blue-600: oklch(58.2% 0.198 240.0);
}

/**
 * Semantic Token Mappings
 * These reference the primitives defined in @theme above
 */
:root {
  /* Interactive Colors */
  --color-primary: var(--color-pumpkin-600);
  --color-primary-hover: var(--color-pumpkin-700);
  --color-primary-foreground: oklch(100% 0 0); /* white */

  --color-secondary: var(--color-danube-600);
  --color-secondary-hover: var(--color-danube-700);
  --color-secondary-foreground: oklch(100% 0 0);

  /* Status */
  --color-success: var(--color-green-600);
  --color-danger: var(--color-red-600);
  --color-warning: var(--color-amber-600);
  --color-info: var(--color-blue-600);

  /* Surfaces */
  --color-background: oklch(100% 0 0);
  --color-surface: var(--color-slate-50);

  /* Text */
  --color-text-primary: var(--color-slate-900);
  --color-text-secondary: var(--color-slate-600);

  /* Borders */
  --color-border: var(--color-slate-200);
}

/**
 * Dark Theme Overrides
 */
.dark {
  --color-primary: var(--color-pumpkin-500); /* Lighter for dark bg */
  --color-primary-hover: var(--color-pumpkin-400);
  --color-primary-foreground: var(--color-slate-950);

  --color-background: var(--color-slate-950);
  --color-surface: var(--color-slate-900);

  --color-text-primary: var(--color-slate-50);
  --color-text-secondary: var(--color-slate-400);

  --color-border: var(--color-slate-800);
}
```

### Step 3: Use in Components

**That's it!** In Tailwind v4.0, colors defined in `@theme` are automatically available as utilities:

```tsx
// Primitives available automatically
<div className="bg-pumpkin-600 text-white">Brand button</div>

// Semantic tokens via custom properties
<div className="bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
  Semantic button
</div>
```

---

## 🎨 The v4.0 Pattern

### What Goes in @theme (Primitives)

```css
@theme {
  /* Raw color scales - these become Tailwind utilities */
  --color-pumpkin-600: oklch(64.2% 0.165 53.4);

  /* Usage: className="bg-pumpkin-600" ✅ */
}
```

### What Goes in :root (Semantics)

```css
:root {
  /* Intent-based mappings - these are CSS variables only */
  --color-primary: var(--color-pumpkin-600);

  /* Usage: className="bg-[var(--color-primary)]" ✅ */
  /* Usage: style={{ color: "var(--color-primary)" }} ✅ */
}
```

---

## 💡 Recommended Approach for v4.0

Since v4.0 makes primitives SO easy to use, here's the recommended pattern:

### Pattern 1: CVA with Semantic Mapping (Best for Components)

```tsx
// components/ui/button.tsx
import { cva } from "class-variance-authority";

const buttonVariants = cva("...", {
  variants: {
    variant: {
      // Map semantic intent to primitive utilities
      primary: "bg-pumpkin-600 text-white hover:bg-pumpkin-700",
      success: "bg-green-600 text-white hover:bg-green-700",
      danger: "bg-red-600 text-white hover:bg-red-700",
    },
  },
});

// Usage: <Button variant="primary" />
```

**Why this works:**
- Primitives are directly available (bg-pumpkin-600)
- Semantic meaning in variant names (variant="primary")
- No CSS variable syntax needed
- Best autocomplete experience

### Pattern 2: CSS Variables for Runtime Values

```tsx
// For things that need to be accessed in inline styles or animations
<div style={{
  backgroundColor: "var(--color-primary)",
  transform: `rotate(${angle}deg)`
}}>
```

---

## 📊 Complete Example

Here's how to set up a complete design system in v4.0:

```css
/* apps/user-application/src/styles.css */
@import "tailwindcss";

/* ================================================
   DESIGN SYSTEM CONFIGURATION
   ================================================ */

@theme {
  /* ----- Brand Colors ----- */
  --color-pumpkin-*: ...; /* Your full scale */
  --color-danube-*: ...;  /* Your full scale */

  /* ----- Neutrals ----- */
  --color-slate-*: ...;   /* Your full scale */

  /* ----- Status Colors ----- */
  --color-green-*: ...;
  --color-red-*: ...;
  --color-amber-*: ...;
  --color-blue-*: ...;

  /* ----- Spacing Scale ----- */
  --spacing: 0.25rem; /* Base unit (4px) */

  /* ----- Typography ----- */
  --font-display: "Satoshi", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Muoto", ui-sans-serif, system-ui, sans-serif;
  --font-code: "Fira Code", ui-monospace, monospace;

  /* ----- Breakpoints ----- */
  --breakpoint-3xl: 1920px;

  /* ----- Animation ----- */
  --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
}

/* ----- Semantic Tokens (Light Theme) ----- */
:root {
  --color-primary: var(--color-pumpkin-600);
  --color-primary-hover: var(--color-pumpkin-700);
  --color-secondary: var(--color-danube-600);
  --color-success: var(--color-green-600);
  --color-danger: var(--color-red-600);
  --color-background: oklch(100% 0 0);
  --color-surface: var(--color-slate-50);
  --color-text-primary: var(--color-slate-900);
  --color-border: var(--color-slate-200);
}

/* ----- Dark Theme Overrides ----- */
.dark {
  --color-primary: var(--color-pumpkin-500);
  --color-primary-hover: var(--color-pumpkin-400);
  --color-background: var(--color-slate-950);
  --color-surface: var(--color-slate-900);
  --color-text-primary: var(--color-slate-50);
  --color-border: var(--color-slate-800);
}
```

---

## 🧩 Component Examples for v4.0

### Button Component

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all disabled:opacity-50",
  {
    variants: {
      variant: {
        // Use primitives directly (they're just utilities now!)
        primary: "bg-pumpkin-600 text-white hover:bg-pumpkin-700",
        secondary: "bg-danube-600 text-white hover:bg-danube-700",
        success: "bg-green-600 text-white hover:bg-green-700",
        danger: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-slate-200 hover:bg-slate-50",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export function Button({ variant, size, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant, size })} {...props} />;
}
```

### Alert Component

```tsx
const alertVariants = cva("rounded-lg border p-4", {
  variants: {
    variant: {
      success: "bg-green-50 border-green-200 text-green-600",
      warning: "bg-amber-50 border-amber-200 text-amber-600",
      danger: "bg-red-50 border-red-200 text-red-600",
      info: "bg-blue-50 border-blue-200 text-blue-600",
    },
  },
});
```

---

## 🚀 Migration from v3 to v4

If you're upgrading from v3:

### Before (v3 with tailwind.config.js):

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        pumpkin: {
          600: '#EF944E',
        },
      },
    },
  },
};
```

### After (v4 with @theme):

```css
/* styles.css */
@theme {
  --color-pumpkin-600: oklch(64.2% 0.165 53.4);
}
```

**Benefits:**
- ✅ No JavaScript evaluation
- ✅ Faster build times
- ✅ Native CSS variables (can use in inline styles)
- ✅ Better tooling support

---

## 📝 Usage Rules for v4.0

### DO ✅

```tsx
// Use primitive utilities in components (via CVA)
<Button variant="primary" />  // Maps to bg-pumpkin-600 internally

// Use CSS variables for runtime/inline styles
<div style={{ backgroundColor: "var(--color-primary)" }} />

// Define everything in @theme
@theme {
  --color-brand-600: oklch(...);
}
```

### DON'T ❌

```tsx
// Don't use arbitrary values if primitive exists
<div className="bg-[oklch(64.2% 0.165 53.4)]" />  // Use bg-pumpkin-600 instead

// Don't mix semantic variables in className
<div className="bg-[var(--color-primary)]" />  // Verbose, use CVA variant instead
```

---

## 🎯 Quick Reference

| Need | Solution | Example |
|------|----------|---------|
| Add color scale | Add to @theme | `--color-pumpkin-600: oklch(...)` |
| Use in utility | Reference directly | `className="bg-pumpkin-600"` |
| Semantic mapping | :root variable | `--color-primary: var(--color-pumpkin-600)` |
| Component variant | CVA with primitives | `primary: "bg-pumpkin-600 text-white"` |
| Runtime value | CSS variable | `style={{ color: "var(--color-primary)" }}` |
| Dark mode | .dark override | `.dark { --color-primary: var(--color-pumpkin-500); }` |

---

## 🔗 Next Steps

1. Read the main color-system-guide.md for design philosophy
2. Copy the @theme block from this guide
3. Add your brand colors
4. Update your Button component with CVA variants
5. Test in light and dark mode

**v4.0 makes design systems simpler than ever - enjoy! 🎉**
