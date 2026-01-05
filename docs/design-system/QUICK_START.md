# Design System Quick Start

A step-by-step guide to implementing the color system in your project **right now**.

## 🎯 Goal

Transform your current ad-hoc color usage into a maintainable, scalable design system in 2-3 hours.

## 📋 Prerequisites

- [ ] Read `color-system-guide.md` (understand the 3-layer hierarchy)
- [ ] Have your brand colors ready (e.g., #EF944E for pumpkin)
- [ ] Access to Figma (optional but recommended)

---

## Step 1: Generate Color Scales (30 minutes)

### Option A: Using UI Colors (Fastest)

1. Go to https://uicolors.app/create
2. Enter your brand color: `#EF944E`
3. Name it: `pumpkin`
4. Click "Export" → Choose "CSS (OKLCH)"
5. Copy the output

**Example output:**
```css
--pumpkin-50: oklch(97.5% 0.020 53.4);
--pumpkin-100: oklch(94.8% 0.045 53.4);
/* ... */
--pumpkin-600: oklch(64.2% 0.165 53.4);
```

6. Repeat for your secondary color (if you have one)

### Option B: Using AI

Prompt ChatGPT/Claude:
```
Generate an 11-shade color scale (50-950) for hex color #EF944E
in OKLCH format. Make it suitable for both light and dark themes,
with good contrast ratios. Use the name "pumpkin".
```

### Option C: Use the Example Files

Copy from `docs/design-system/example-implementation/primitives.css` and adjust the values.

---

## Step 2: Create Color Files (15 minutes)

Create two new CSS files in your project:

### File 1: `src/styles/colors/primitives.css`

```bash
# Create directory
mkdir -p apps/user-application/src/styles/colors

# Create file
touch apps/user-application/src/styles/colors/primitives.css
```

Paste your generated color scales:

```css
@layer base {
  :root {
    /* Your generated pumpkin scale */
    --color-pumpkin-50: oklch(97.5% 0.020 53.4);
    --color-pumpkin-100: oklch(94.8% 0.045 53.4);
    /* ... rest of scale ... */

    /* Add neutral grays (slate or stone) */
    --color-slate-50: oklch(98.5% 0.002 264.0);
    /* ... */

    /* Add status colors (green, red, amber, blue) */
    --color-green-50: oklch(96.8% 0.025 142.0);
    /* ... */
  }
}
```

### File 2: `src/styles/colors/semantic-tokens.css`

```bash
touch apps/user-application/src/styles/colors/semantic-tokens.css
```

Map your primitives to semantic names:

```css
@layer base {
  :root {
    /* Interactive */
    --color-primary: var(--color-pumpkin-600);
    --color-primary-hover: var(--color-pumpkin-700);
    --color-primary-foreground: var(--color-white);

    /* Status */
    --color-success: var(--color-green-600);
    --color-danger: var(--color-red-600);

    /* Surfaces */
    --color-background: var(--color-white);
    --color-surface: var(--color-slate-50);

    /* Text */
    --color-text-primary: var(--color-slate-900);
    --color-text-secondary: var(--color-slate-600);

    /* Borders */
    --color-border: var(--color-slate-200);
  }

  .dark {
    /* Adjust for dark mode */
    --color-primary: var(--color-pumpkin-500);  /* Lighter */
    --color-background: var(--color-slate-950);
    --color-text-primary: var(--color-slate-50);
    --color-border: var(--color-slate-800);
  }
}
```

**💡 Tip:** Copy from `example-implementation/semantic-tokens.css` and customize.

---

## Step 3: Import into Your App (5 minutes)

Edit `src/styles.css` (or main CSS file):

```css
/* Add at the top, after Tailwind imports */
@import "tailwindcss";

/* Import color system */
@import "./colors/primitives.css";
@import "./colors/semantic-tokens.css";

/* Rest of your styles... */
```

**Restart your dev server** to apply changes:
```bash
pnpm dev
```

---

## Step 4: Update Tailwind Config (10 minutes)

Edit `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic tokens (use these in components!)
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          foreground: "var(--color-primary-foreground)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          foreground: "var(--color-white)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          foreground: "var(--color-white)",
        },

        // Surfaces & text
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
        },
        border: "var(--color-border)",

        // Primitives (for rare direct use)
        pumpkin: {
          50: "var(--color-pumpkin-50)",
          100: "var(--color-pumpkin-100)",
          // ... rest of scale
          600: "var(--color-pumpkin-600)",
          950: "var(--color-pumpkin-950)",
        },
      },
    },
  },
} satisfies Config;
```

**Test autocomplete:**
- Type `className="bg-` in a component
- You should see `bg-primary`, `bg-success`, etc.

---

## Step 5: Refactor One Component (20 minutes)

Let's update your Button component as proof of concept.

**Before (ad-hoc colors):**
```tsx
<button className="bg-[#EF944E] hover:bg-[#D87D3E] text-white">
  Click me
</button>
```

**After (semantic tokens):**
```tsx
<Button variant="primary">Click me</Button>
```

**Implementation:**

1. Open `src/components/ui/button.tsx`
2. Replace the `color` variant section with semantic variants:

```tsx
const buttonVariants = cva("...", {
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
      success: "bg-success text-white hover:bg-success/90",
      danger: "bg-danger text-white hover:bg-danger/90",
      outline: "border border-border hover:bg-surface",
      ghost: "hover:bg-surface",
    },
    size: { /* ... */ },
  },
});
```

3. Test in your app:
```tsx
<Button variant="primary">Save</Button>
<Button variant="danger">Delete</Button>
<Button variant="outline">Cancel</Button>
```

---

## Step 6: Test Dark Mode (10 minutes)

1. Toggle dark mode in your app
2. Check that colors adapt automatically
3. If colors look wrong in dark mode, adjust semantic tokens:

```css
.dark {
  /* Make colors lighter/more vibrant for dark backgrounds */
  --color-primary: var(--color-pumpkin-500);  /* Was 600 */
  --color-text-primary: var(--color-slate-50);  /* Was 900 */
}
```

---

## Step 7: Document Usage (15 minutes)

Create `docs/design-system/USAGE_GUIDE.md`:

```markdown
# Color System Usage

## Quick Reference

### Interactive Colors
- `bg-primary` - Primary CTAs (Save, Submit, Confirm)
- `bg-success` - Success states
- `bg-danger` - Destructive actions (Delete, Remove)
- `bg-outline` - Secondary actions

### Text Colors
- `text-text-primary` - Main content
- `text-text-secondary` - Captions, labels
- `text-text-tertiary` - Placeholders

### Surfaces
- `bg-background` - Page background
- `bg-surface` - Cards, panels
- `border-border` - Dividers, outlines

## Rules
1. ✅ Use semantic tokens: `bg-primary`, `text-success`
2. ❌ Don't use arbitrary values: `bg-[#EF944E]`
3. ✅ Primitives OK for charts: `bg-pumpkin-600`
4. ❌ Don't hardcode theme logic: `dark:bg-slate-900`
```

---

## 🎉 Success Checklist

After completing these steps, you should have:

- [ ] Color primitives defined (50-950 scales)
- [ ] Semantic tokens mapped (primary, success, danger, etc.)
- [ ] Tailwind config updated
- [ ] Button component refactored
- [ ] Dark mode working automatically
- [ ] Documentation created

**Next Steps:**
1. Refactor 3-5 more components (Badge, Alert, Card)
2. Audit codebase for hardcoded colors: `rg "bg-\[#" --type tsx`
3. Create Figma file to sync design tokens
4. Share usage guide with team

---

## 🆘 Troubleshooting

### Colors not showing up?

**Check 1:** CSS files imported in correct order
```css
@import "tailwindcss";
@import "./colors/primitives.css";  /* Must be AFTER Tailwind */
@import "./colors/semantic-tokens.css";
```

**Check 2:** Restart dev server after Tailwind config changes
```bash
# Kill server (Ctrl+C)
pnpm dev
```

**Check 3:** Verify CSS variables in browser DevTools
- Inspect an element
- Check "Computed" tab
- Search for `--color-primary`
- Should show the OKLCH value

### Dark mode not working?

**Check 1:** HTML has `.dark` class
```tsx
// In your root component
<html className={theme === 'dark' ? 'dark' : ''}>
```

**Check 2:** Semantic tokens have dark overrides
```css
.dark {
  --color-primary: var(--color-pumpkin-500);  /* Must exist! */
}
```

### Autocomplete not showing semantic colors?

**Check 1:** TypeScript/VSCode extension updated
**Check 2:** Restart VSCode
**Check 3:** Tailwind config has correct format:
```ts
primary: "var(--color-primary)",  // ✅ String
// NOT: { DEFAULT: "..." }  // ❌ (unless you want modifiers)
```

---

## 📚 Next: Advanced Topics

Once basics work:
- [ ] Set up Figma → Code token sync
- [ ] Add more semantic categories (info, warning)
- [ ] Create color accessibility tests (contrast ratios)
- [ ] Implement theming (multiple brand variants)
- [ ] Add color documentation site (Storybook)

See `color-system-guide.md` for advanced patterns.
