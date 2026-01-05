# Design System Cheat Sheet (Tailwind v4.0)

Quick reference for implementing and using the color system.

---

## 🎨 Setup (Copy-Paste Ready)

### Add to `src/styles.css`:

```css
@import "tailwindcss";

@theme {
  /* Your brand colors (get from https://uicolors.app/create) */
  --color-pumpkin-50: oklch(97.5% 0.020 53.4);
  --color-pumpkin-100: oklch(94.8% 0.045 53.4);
  --color-pumpkin-200: oklch(88.2% 0.082 53.4);
  --color-pumpkin-300: oklch(81.6% 0.118 53.4);
  --color-pumpkin-400: oklch(75.5% 0.145 53.4);
  --color-pumpkin-500: oklch(70.0% 0.165 53.4);
  --color-pumpkin-600: oklch(64.2% 0.165 53.4);  /* ← Main UI color */
  --color-pumpkin-700: oklch(56.5% 0.142 53.4);
  --color-pumpkin-800: oklch(48.0% 0.118 53.4);
  --color-pumpkin-900: oklch(38.5% 0.089 53.4);
  --color-pumpkin-950: oklch(28.0% 0.058 53.4);
}

:root {
  --color-primary: var(--color-pumpkin-600);
  --color-primary-hover: var(--color-pumpkin-700);
}

.dark {
  --color-primary: var(--color-pumpkin-500);  /* Lighter for dark bg */
}
```

---

## 📖 Usage Patterns

### Pattern 1: Component Variants (Recommended)

```tsx
// components/ui/button.tsx
import { cva } from "class-variance-authority";

const buttonVariants = cva("...", {
  variants: {
    variant: {
      primary: "bg-pumpkin-600 text-white hover:bg-pumpkin-700",
      //        ↑ Use primitive directly (it's a utility!)
    },
  },
});

// Usage
<Button variant="primary">Save</Button>
```

### Pattern 2: Direct Utilities (Quick & Dirty)

```tsx
<div className="bg-pumpkin-600 text-white hover:bg-pumpkin-700">
  Quick button
</div>
```

### Pattern 3: CSS Variables (Runtime/Inline)

```tsx
<div style={{ backgroundColor: "var(--color-primary)" }}>
  Dynamic color
</div>
```

---

## 🎯 Common Tasks

### Add a New Brand Color

1. Generate scale at https://uicolors.app/create
2. Add to `@theme`:
```css
@theme {
  --color-forest-50: oklch(...);
  --color-forest-100: oklch(...);
  /* ... */
  --color-forest-600: oklch(...);
}
```
3. Use immediately:
```tsx
<div className="bg-forest-600">Works!</div>
```

### Create Semantic Token

```css
:root {
  --color-success: var(--color-green-600);
}

.dark {
  --color-success: var(--color-green-500);
}
```

### Rebrand Primary Color

```css
/* Change ONE line */
:root {
  --color-primary: var(--color-blue-600);  /* Was: pumpkin-600 */
}
```

---

## ✅ DO / ❌ DON'T

| Scenario | ✅ DO | ❌ DON'T |
|----------|-------|----------|
| **Component styles** | `variant: "primary"` (CVA) | `className="bg-[var(--color-primary)]"` |
| **Add color** | `@theme { --color-x-600: oklch(...) }` | `className="bg-[#FF0000]"` |
| **Dark mode** | `.dark { --color-primary: var(--x-500) }` | `dark:bg-pumpkin-500` everywhere |
| **Runtime** | `style={{ color: "var(--color-primary)" }}` | ❓ Either is fine |
| **Quick test** | `className="bg-pumpkin-600"` | ✅ This is actually fine! |

---

## 🔍 Quick Debugging

### Colors not showing?

```bash
# Check if @theme is correct
grep "@theme" apps/user-application/src/styles.css

# Restart dev server
pnpm dev
```

### Dark mode broken?

```tsx
// Check HTML has .dark class
<html className={theme === 'dark' ? 'dark' : ''}>
```

### Autocomplete not working?

1. Restart VSCode
2. Check you're using `@theme` (not `@layer theme`)
3. Verify color format: `--color-name-weight` (e.g., `--color-pumpkin-600`)

---

## 📐 Naming Convention

```
@theme {
  --color-{palette}-{weight}
          ↓         ↓
          ↓         50, 100, 200, ..., 950
          pumpkin, danube, slate, green, red
}

:root {
  --color-{intent}[-modifier]
          ↓         ↓
          ↓         hover, foreground, subtle
          primary, success, danger, text, border
}
```

---

## 🎨 Color Scale Template

Copy-paste this and replace values:

```css
@theme {
  --color-YOURCOLOR-50:  oklch(...);
  --color-YOURCOLOR-100: oklch(...);
  --color-YOURCOLOR-200: oklch(...);
  --color-YOURCOLOR-300: oklch(...);
  --color-YOURCOLOR-400: oklch(...);
  --color-YOURCOLOR-500: oklch(...);  /* Base brand color */
  --color-YOURCOLOR-600: oklch(...);  /* Main UI color */
  --color-YOURCOLOR-700: oklch(...);
  --color-YOURCOLOR-800: oklch(...);
  --color-YOURCOLOR-900: oklch(...);
  --color-YOURCOLOR-950: oklch(...);
}
```

Get values from: https://uicolors.app/create

---

## 🚀 Complete Button Example

```tsx
// components/ui/button.tsx
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center gap-2 rounded-md font-medium transition-all disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-pumpkin-600 text-white hover:bg-pumpkin-700",
        success: "bg-green-600 text-white hover:bg-green-700",
        danger: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-slate-200 hover:bg-slate-50",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

// Usage:
<Button variant="primary" size="lg">Save Changes</Button>
<Button variant="danger">Delete</Button>
<Button variant="outline" size="sm">Cancel</Button>
```

---

## 📚 Full Documentation

- [TAILWIND_V4_GUIDE.md](./TAILWIND_V4_GUIDE.md) - Complete v4.0 guide
- [color-system-guide.md](./color-system-guide.md) - Design philosophy
- [README.md](./README.md) - Documentation index

---

**Need help?** Read the full guides above or ask your team!
