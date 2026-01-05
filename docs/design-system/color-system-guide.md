# Color System & Design Standardization Guide

A comprehensive guide to organizing colors and design tokens for consistent UI across the project.

## Table of Contents

1. [Design System Hierarchy](#design-system-hierarchy)
2. [Color Organization Strategy](#color-organization-strategy)
3. [Implementation Steps](#implementation-steps)
4. [Usage Patterns](#usage-patterns)
5. [Maintenance & Evolution](#maintenance--evolution)

---

## Design System Hierarchy

A well-organized design system has **three layers**:

```
┌─────────────────────────────────────────────────────┐
│ 3. Component Layer                                   │
│    <Button color="primary" />                        │
│    ↓ Uses semantic tokens                            │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 2. Semantic Layer (Intent-Based)                     │
│    --color-primary: var(--color-pumpkin-600)         │
│    --color-success: var(--color-green-600)           │
│    --color-danger: var(--color-red-600)              │
│    ↓ Maps to primitives                              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 1. Primitive Layer (Raw Color Scales)                │
│    --color-pumpkin-50: oklch(...)                    │
│    --color-pumpkin-600: oklch(...)                   │
│    --color-green-500: oklch(...)                     │
└─────────────────────────────────────────────────────┘
```

### Why This Structure?

- **Primitives** = Your color palette (never change meaning)
- **Semantics** = What colors mean in your app (can be remapped)
- **Components** = Use semantic names (unaware of actual colors)

**Example:** If you want to rebrand from pumpkin-orange to blue:
- ❌ Without layers: Change 50+ components manually
- ✅ With layers: Change ONE line: `--color-primary: var(--color-blue-600)`

---

## Color Organization Strategy

### Step 1: Define Color Scales (Primitives)

Every brand color should have a **scale from 50 to 950** (11 shades).

#### Tool Recommendations

**Option A: Figma Variables (Recommended)**
1. Create a Figma file called "Design Tokens"
2. Add color variables using Collections:
   - Collection: "Primitives/Pumpkin"
   - Variables: pumpkin-50, pumpkin-100, ..., pumpkin-950

**Option B: Online Generators**
- [UI Colors](https://uicolors.app/create) - Generate Tailwind-compatible scales
- [Colorbox](https://colorbox.io/) - Advanced color scale generator
- [Leonardo Color](https://leonardocolor.io/) - Adobe's accessible color system

**Option C: AI-Assisted**
```prompt
"Generate an 11-shade color scale (50-950) for hex color #EF944E in OKLCH format,
optimized for accessibility with WCAG AA contrast on white/dark backgrounds"
```

#### Example Color Scale Structure

```css
/* Pumpkin (Brand Primary) */
--color-pumpkin-50:  oklch(97% 0.02 53);   /* Very light tint */
--color-pumpkin-100: oklch(94% 0.04 53);
--color-pumpkin-200: oklch(88% 0.08 53);
--color-pumpkin-300: oklch(82% 0.12 53);
--color-pumpkin-400: oklch(76% 0.14 53);
--color-pumpkin-500: oklch(70% 0.16 53);   /* Base brand color */
--color-pumpkin-600: oklch(64% 0.16 53);   /* Primary UI color */
--color-pumpkin-700: oklch(56% 0.14 53);
--color-pumpkin-800: oklch(48% 0.12 53);
--color-pumpkin-900: oklch(38% 0.09 53);
--color-pumpkin-950: oklch(28% 0.06 53);   /* Very dark shade */

/* Danube (Brand Secondary) */
--color-danube-50:  oklch(96% 0.02 264);
--color-danube-100: oklch(92% 0.04 264);
/* ... repeat pattern ... */
--color-danube-600: oklch(62% 0.18 264);
--color-danube-950: oklch(26% 0.08 264);
```

#### Naming Convention Rules

```
--color-{name}-{weight}

{name}   = Descriptive, memorable name (pumpkin, danube, NOT orange, blue)
{weight} = 50, 100, 200, ... 950 (Tailwind convention)
```

**✅ Good Names:**
- `pumpkin` (evokes warmth, autumn, security)
- `danube` (calming, trust, professional)
- `slate`, `stone`, `zinc` (neutrals)

**❌ Bad Names:**
- `orange`, `blue` (too generic)
- `brand-color-1` (meaningless)
- `color-400` (what is this?)

---

### Step 2: Create Semantic Tokens

Map primitives to **intent-based names** that describe **usage**, not appearance.

```css
/* Light Theme Semantics */
:root {
  /* Interactive */
  --color-primary:           var(--color-pumpkin-600);
  --color-primary-hover:     var(--color-pumpkin-700);
  --color-primary-foreground: var(--color-pumpkin-50);

  --color-secondary:         var(--color-danube-600);
  --color-secondary-hover:   var(--color-danube-700);

  /* Status */
  --color-success:           var(--color-green-600);
  --color-warning:           var(--color-amber-600);
  --color-danger:            var(--color-red-600);
  --color-info:              var(--color-blue-600);

  /* Surfaces */
  --color-background:        var(--color-white);
  --color-surface:           var(--color-slate-50);
  --color-surface-elevated:  var(--color-white);

  /* Text */
  --color-text-primary:      var(--color-slate-900);
  --color-text-secondary:    var(--color-slate-600);
  --color-text-tertiary:     var(--color-slate-400);

  /* Borders */
  --color-border:            var(--color-slate-200);
  --color-border-strong:     var(--color-slate-300);
}

/* Dark Theme Overrides */
.dark {
  --color-primary:           var(--color-pumpkin-500); /* Lighter in dark mode */
  --color-primary-hover:     var(--color-pumpkin-400);

  --color-background:        var(--color-slate-950);
  --color-surface:           var(--color-slate-900);

  --color-text-primary:      var(--color-slate-50);
  --color-text-secondary:    var(--color-slate-400);

  --color-border:            var(--color-slate-800);
}
```

#### Semantic Token Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Interactive** | Buttons, links, active states | primary, secondary, tertiary |
| **Status** | Feedback states | success, warning, danger, info |
| **Surfaces** | Backgrounds, cards, panels | background, surface, overlay |
| **Text** | Typography colors | text-primary, text-secondary |
| **Borders** | Dividers, outlines | border, border-strong |
| **Special** | Unique UI elements | brand, accent, highlight |

---

### Step 3: Configure Tailwind

Make primitives available as Tailwind utilities while keeping semantics in CSS variables.

```js
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primitive scales (for rare direct usage)
        pumpkin: {
          50:  "oklch(97% 0.02 53)",
          100: "oklch(94% 0.04 53)",
          // ... rest of scale
          600: "oklch(64% 0.16 53)",
          950: "oklch(28% 0.06 53)",
        },
        danube: {
          50:  "oklch(96% 0.02 264)",
          // ... full scale
        },

        // Semantic tokens (primary usage in components)
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        secondary: "var(--color-secondary)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",

        // Alias existing design system tokens
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        border: "var(--color-border)",
      },
    },
  },
} satisfies Config;
```

---

## Implementation Steps

### Phase 1: Audit Current Colors

```bash
# Find all color usages in your codebase
rg "bg-\[|text-\[|border-\[" --type tsx
rg "#[0-9A-Fa-f]{6}" --type css
rg "oklch\(|hsl\(|rgb\(" --type css
```

Create a spreadsheet:
| Current Usage | Location | Intended Purpose | New Semantic Token |
|---------------|----------|------------------|-------------------|
| `bg-[#EF944E]` | button.tsx | Primary CTA | `bg-primary` |
| `text-orange-600` | badge.tsx | Warning state | `text-warning` |

### Phase 2: Create Primitive Scales

**Option A: Use a generator**
1. Go to https://uicolors.app/create
2. Enter your brand colors:
   - Pumpkin: `#EF944E`
   - Danube: `#6366F1` (example)
3. Export as CSS variables (OKLCH format)
4. Copy to `src/styles/primitives.css`

**Option B: Manual in Figma**
1. Create Figma file "Design Tokens"
2. Use plugins:
   - "Color Shades Generator" for auto-scales
   - "Design Tokens" to export JSON
3. Convert JSON to CSS:
   ```bash
   # Use token transformer
   npx token-transformer input.json output.css
   ```

### Phase 3: Define Semantic Layer

Create `src/styles/semantic-tokens.css`:

```css
@layer base {
  :root {
    /* Map semantics to primitives */
    --color-primary: var(--color-pumpkin-600);
    --color-primary-hover: var(--color-pumpkin-700);
    /* ... rest of mappings */
  }

  .dark {
    /* Adjust for dark mode */
    --color-primary: var(--color-pumpkin-500);
    /* ... */
  }
}
```

### Phase 4: Create Component Variants

Update your button component to use semantic tokens:

```tsx
// src/components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 ...",
  {
    variants: {
      variant: {
        // Use semantic colors (not primitives!)
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        success: "bg-success text-white hover:bg-success/90",
        danger: "bg-danger text-white hover:bg-danger/90",
        outline: "border border-border bg-background hover:bg-surface",
        ghost: "hover:bg-surface hover:text-text-primary",
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

// Usage: <Button variant="primary" size="lg">Click me</Button>
```

### Phase 5: Document Usage Rules

Create `DESIGN_GUIDELINES.md`:

```markdown
## Color Usage Rules

### ✅ DO:
- Use semantic tokens in components: `bg-primary`, `text-danger`
- Use Tailwind color utilities: `bg-pumpkin-600` (only for custom one-offs)
- Refer to Figma for the source of truth

### ❌ DON'T:
- Hardcode hex values: `bg-[#EF944E]`
- Use arbitrary OKLCH inline: `bg-[oklch(...)]`
- Mix semantic and primitive naming in same component

### Semantic Token Reference

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `primary` | pumpkin-600 | pumpkin-500 | Primary CTAs, active states |
| `secondary` | danube-600 | danube-500 | Secondary actions |
| `success` | green-600 | green-500 | Success messages, confirmations |
| `danger` | red-600 | red-500 | Errors, destructive actions |
```

---

## Usage Patterns

### Pattern 1: Component with Semantic Colors

```tsx
// ✅ CORRECT - Uses semantic tokens
function Alert({ type }: { type: 'success' | 'warning' | 'danger' }) {
  const styles = {
    success: "bg-success/10 border-success text-success",
    warning: "bg-warning/10 border-warning text-warning",
    danger: "bg-danger/10 border-danger text-danger",
  };

  return <div className={`border-l-4 p-4 ${styles[type]}`}>...</div>;
}
```

### Pattern 2: Dynamic Color with Primitives

```tsx
// ✅ ACCEPTABLE - Using primitive scale for data visualization
function StatusBadge({ severity }: { severity: number }) {
  // severity: 0-100
  const colorClass = severity > 80 ? "bg-pumpkin-700" :
                     severity > 50 ? "bg-pumpkin-500" :
                     "bg-pumpkin-300";

  return <span className={`${colorClass} px-2 py-1 rounded`}>{severity}</span>;
}
```

### Pattern 3: Theme-Aware Components

```tsx
// ✅ CORRECT - Automatically adapts to light/dark via semantic tokens
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h3 className="text-text-primary">{children}</h3>
    </div>
  );
}

// No need for dark: variants - CSS variables handle it!
```

### Pattern 4: State-Based Colors

```tsx
// ✅ CORRECT - Semantic states
function ValidationInput({ isValid, value }: { isValid: boolean; value: string }) {
  return (
    <input
      className={`
        border-2 rounded px-3 py-2
        ${isValid
          ? 'border-success focus:ring-success'
          : 'border-danger focus:ring-danger'
        }
      `}
      value={value}
    />
  );
}
```

---

## Maintenance & Evolution

### Adding a New Brand Color

**Scenario:** Designer requests adding "forest green" for eco-friendly features.

**Steps:**
1. Generate scale in Figma/generator: `forest-50` to `forest-950`
2. Add to `primitives.css`:
   ```css
   --color-forest-50: oklch(...);
   /* ... */
   --color-forest-600: oklch(...);
   ```
3. Add semantic mapping:
   ```css
   :root {
     --color-eco: var(--color-forest-600);
     --color-eco-hover: var(--color-forest-700);
   }
   ```
4. Create component variant:
   ```tsx
   eco: "bg-eco text-white hover:bg-eco-hover"
   ```
5. Document in `DESIGN_GUIDELINES.md`

### Rebranding (Changing Primary Color)

**Scenario:** Rebrand from pumpkin-orange to indigo-blue.

**Impact with proper system:** 🎯 **Change 1 line**
```css
/* Before */
--color-primary: var(--color-pumpkin-600);

/* After */
--color-primary: var(--color-indigo-600);
```

**Impact without system:** 😱 Change 200+ files manually.

### Dark Mode Color Adjustments

**Problem:** Color looks great in light mode but invisible in dark mode.

**Solution:** Adjust semantic mapping in `.dark`:
```css
:root {
  --color-accent: var(--color-amber-600); /* Good on white */
}

.dark {
  --color-accent: var(--color-amber-400); /* Lighter for dark bg */
}
```

Components automatically update - no code changes needed!

---

## Tooling Recommendations

### Design Tools
- **Figma Variables** - Store and sync design tokens
- **Tokens Studio** - Figma plugin for advanced token management
- **Design Tokens Community** - Export to code formats

### Code Tools
- **Style Dictionary** - Transform design tokens to multiple formats
  ```bash
  npx style-dictionary build
  ```
- **Tailwind CSS** - Consume tokens as utilities
- **CVA (Class Variance Authority)** - Type-safe component variants

### Validation
- **Contrast Checker** - Ensure WCAG AA/AAA compliance
  ```bash
  npx @adobe/leonardo-contrast-colors validate
  ```
- **Chromatic** - Visual regression testing for design system

---

## Quick Start Checklist

- [ ] Audit current colors in codebase
- [ ] Generate primitive color scales (50-950 for each brand color)
- [ ] Create `src/styles/primitives.css` with all color scales
- [ ] Create `src/styles/semantic-tokens.css` with intent-based mappings
- [ ] Update `tailwind.config.ts` to include both primitives and semantics
- [ ] Refactor Button component to use semantic variants
- [ ] Update 5-10 other components as proof of concept
- [ ] Document system in `DESIGN_GUIDELINES.md`
- [ ] Create Figma file as source of truth
- [ ] Set up design token sync workflow (Figma → Code)

---

## Example: Full Implementation

See `/docs/design-system/example-implementation/` for:
- Complete CSS file structure
- Sample component library
- Figma template file
- Token sync automation scripts

**Next Steps:**
1. Review this guide with your design team
2. Choose a color palette strategy (generator vs Figma)
3. Start with primitives for your 2-3 brand colors
4. Add semantic layer for common UI patterns
5. Refactor components incrementally (start with Button, Badge, Alert)
