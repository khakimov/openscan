# Design System Documentation

A comprehensive design system for standardizing colors, typography, and components across the project.

## 📚 Documentation Index

### Getting Started

> **⚡ Using Tailwind CSS v4.0?** Start with one of these guides based on your learning style:

| Guide | Best For | Time Required |
|-------|----------|---------------|
| **[CHEAT_SHEET.md](./CHEAT_SHEET.md)** ⚡ | Quick reference, copy-paste | 5 minutes |
| **[TAILWIND_V4_GUIDE.md](./TAILWIND_V4_GUIDE.md)** ⭐ | Complete v4.0 implementation | 30 minutes |
| **[VISUAL_GUIDE.md](./VISUAL_GUIDE.md)** 📊 | Understanding the architecture | 15 minutes |
| **[QUICK_START.md](./QUICK_START.md)** | General guide (works for v3 too) | 2-3 hours |
| **[color-system-guide.md](./color-system-guide.md)** | Deep dive & philosophy | 1 hour |

### Examples
- **[example-implementation/](./example-implementation/)** - Working code examples
  - `primitives.css` - Full color scale definitions
  - `semantic-tokens.css` - Intent-based color mappings
  - `button-example.tsx` - Button component with variants
  - `alert-example.tsx` - Status feedback component
  - `tailwind.config.example.ts` - Tailwind integration

---

## 🎨 System Overview

### The 3-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Components                             │
│  What developers write                           │
│                                                  │
│  <Button variant="primary">Save</Button>         │
│  <Alert variant="success">Done!</Alert>          │
│                                                  │
│  ↓ Uses semantic names only                      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Layer 2: Semantic Tokens                        │
│  What colors MEAN in your app                    │
│                                                  │
│  --color-primary: var(--color-pumpkin-600)       │
│  --color-success: var(--color-green-600)         │
│  --color-danger: var(--color-red-600)            │
│                                                  │
│  ↓ Maps intent to actual colors                  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Layer 1: Primitives                             │
│  Your actual color palette                       │
│                                                  │
│  --color-pumpkin-50: oklch(97.5% 0.02 53.4)      │
│  --color-pumpkin-100: oklch(94.8% 0.045 53.4)    │
│  ...                                             │
│  --color-pumpkin-600: oklch(64.2% 0.165 53.4)    │
│  --color-pumpkin-950: oklch(28.0% 0.058 53.4)    │
└─────────────────────────────────────────────────┘
```

### Why This Works

**Scenario: Rebrand from orange to blue**

❌ **Without system:**
```tsx
// Change in 200+ files 😱
<button className="bg-[#EF944E]">  // Find and replace...
<div className="text-orange-600">   // Find and replace...
<span className="border-[#EF944E]"> // Find and replace...
```

✅ **With system:**
```css
/* Change ONE line in semantic-tokens.css 🎉 */
--color-primary: var(--color-blue-600);  /* Was: pumpkin-600 */

/* All 200+ components update automatically! */
```

---

## 🚀 Quick Implementation Path

### 1. Generate Color Scales (30 min)
Use https://uicolors.app/create to generate OKLCH scales for your brand colors.

**Input:**
- Primary color: `#EF944E` (your pumpkin orange)
- Secondary color: `#6366F1` (example blue)

**Output:**
- 11-shade scale (50-950) for each color
- OKLCH format (better for interpolation than hex)

### 2. Create CSS Files (15 min)
```bash
mkdir -p apps/user-application/src/styles/colors
touch apps/user-application/src/styles/colors/primitives.css
touch apps/user-application/src/styles/colors/semantic-tokens.css
```

Copy from `example-implementation/` and customize.

### 3. Update Imports (5 min)
```css
/* src/styles.css */
@import "tailwindcss";
@import "./colors/primitives.css";
@import "./colors/semantic-tokens.css";
```

### 4. Configure Tailwind (10 min)
Add semantic and primitive colors to `tailwind.config.ts`.

See `example-implementation/tailwind.config.example.ts`.

### 5. Refactor Button Component (20 min)
Update `src/components/ui/button.tsx` to use semantic variants.

See `example-implementation/button-example.tsx`.

### Total Time: ~2 hours ⏱️

---

## 📖 Key Concepts

### Semantic vs Primitive Colors

| Type | Example | When to Use |
|------|---------|-------------|
| **Semantic** | `bg-primary`, `text-success` | 95% of cases - all UI components |
| **Primitive** | `bg-pumpkin-600`, `bg-slate-200` | Charts, gradients, one-off designs |

### Color Naming Convention

```
Primitives:  --color-{palette}-{weight}
             --color-pumpkin-600

Semantics:   --color-{intent}[-modifier]
             --color-primary
             --color-primary-hover
             --color-success-subtle
```

### Dark Mode Strategy

Semantic tokens handle theme switching automatically:

```css
:root {
  --color-primary: var(--color-pumpkin-600);  /* Dark on light */
}

.dark {
  --color-primary: var(--color-pumpkin-500);  /* Lighter on dark */
}
```

Components don't need `dark:` utilities:
```tsx
// ✅ Works in both themes automatically
<div className="bg-primary text-primary-foreground">

// ❌ Don't do this (duplicates theme logic)
<div className="bg-pumpkin-600 dark:bg-pumpkin-500">
```

---

## 🎯 Usage Guidelines

### DO ✅

```tsx
// Use semantic tokens in components
<Button variant="primary">Save</Button>
<Alert variant="success">Success!</Alert>
<div className="bg-surface border-border">Card</div>
<p className="text-text-secondary">Caption</p>
```

### DON'T ❌

```tsx
// Don't hardcode hex values
<button className="bg-[#EF944E]">

// Don't use arbitrary OKLCH
<div className="text-[oklch(64% 0.16 53)]">

// Don't mix semantic and primitive in same pattern
<Button className="bg-pumpkin-600 hover:bg-primary-hover">  // Inconsistent!
```

### When Primitives Are OK ✅

```tsx
// Data visualization with specific shades
<div className="bg-pumpkin-600" style={{ width: `${percent}%` }} />

// Gradients requiring exact colors
<div className="bg-gradient-to-r from-pumpkin-500 to-danube-500" />

// Brand logo (uses exact brand color)
<Logo className="text-pumpkin-500" />
```

---

## 🏗️ Project Structure

```
apps/user-application/
├── src/
│   ├── styles/
│   │   ├── styles.css                 # Main CSS (imports below)
│   │   └── colors/
│   │       ├── primitives.css         # Color scales (50-950)
│   │       └── semantic-tokens.css    # Intent mappings
│   ├── components/
│   │   └── ui/
│   │       ├── button.tsx             # Uses semantic variants
│   │       ├── alert.tsx              # Uses semantic variants
│   │       └── badge.tsx              # Uses semantic variants
│   └── tailwind.config.ts             # Color integration

docs/design-system/
├── README.md                          # This file
├── QUICK_START.md                     # Step-by-step guide
├── color-system-guide.md              # Comprehensive reference
└── example-implementation/
    ├── primitives.css
    ├── semantic-tokens.css
    ├── button-example.tsx
    ├── alert-example.tsx
    └── tailwind.config.example.ts
```

---

## 🔧 Tools & Resources

### Color Generators
- **[UI Colors](https://uicolors.app/create)** - Generate Tailwind-style color scales
- **[Colorbox](https://colorbox.io/)** - Advanced color scale builder
- **[Leonardo](https://leonardocolor.io/)** - Adobe's accessible color tool
- **[Palettte](https://palettte.app/)** - Interactive palette editor

### Design Token Tools
- **[Tokens Studio](https://tokens.studio/)** - Figma plugin for design tokens
- **[Style Dictionary](https://amzn.github.io/style-dictionary/)** - Transform tokens to code
- **[Theo](https://github.com/salesforce-ux/theo)** - Salesforce token transformer

### Accessibility
- **[Contrast Checker](https://webaim.org/resources/contrastchecker/)** - WCAG compliance
- **[Who Can Use](https://www.whocanuse.com/)** - Color blindness simulator
- **[Accessible Colors](https://accessible-colors.com/)** - Find accessible combinations

---

## 📊 Semantic Token Categories

### Interactive Colors
Used for clickable elements (buttons, links)
- `primary` - Main CTAs (Save, Submit, Confirm)
- `secondary` - Secondary actions
- `tertiary` - Low-emphasis actions

### Status Colors
Used for feedback and alerts
- `success` - Confirmations, successful operations
- `warning` - Warnings, non-critical issues
- `danger` - Errors, destructive actions
- `info` - Informational messages

### Surface Colors
Used for backgrounds and layers
- `background` - Page background
- `surface` - Cards, modals, panels
- `surface-elevated` - Raised surfaces (dropdowns, tooltips)

### Text Colors
Used for typography
- `text-primary` - Main content
- `text-secondary` - Captions, labels
- `text-tertiary` - Placeholders, disabled text

### Border Colors
Used for dividers and outlines
- `border` - Default borders
- `border-strong` - Emphasized dividers
- `border-subtle` - Faint separators

---

## 🧪 Testing Your Implementation

### Visual Test
1. Build a test page with all variants:
```tsx
<div className="space-y-4 p-8">
  <Button variant="primary">Primary</Button>
  <Button variant="success">Success</Button>
  <Button variant="danger">Danger</Button>
  <Alert variant="success">Success alert</Alert>
  <Alert variant="danger">Error alert</Alert>
</div>
```

2. Toggle dark mode - all colors should adapt

### Accessibility Test
```bash
# Check contrast ratios
npx @adobe/leonardo-contrast-colors validate \
  --foreground "var(--color-primary-foreground)" \
  --background "var(--color-primary)"
```

### Developer Experience Test
- Type `className="bg-` in VSCode
- Autocomplete should show semantic tokens first
- Primitives should be available but lower in list

---

## 🎓 Learning Path

### For Beginners
1. Read QUICK_START.md
2. Implement Steps 1-5 (primitives + semantics + Tailwind)
3. Refactor one component (Button)
4. See it work in light/dark mode

### For Teams
1. Designer creates Figma color library
2. Export tokens to JSON
3. Developer transforms JSON → CSS
4. Set up auto-sync workflow
5. Document usage rules

### For Advanced Users
- Multiple theme variants (not just light/dark)
- Per-customer branding (white-label)
- Animated color transitions
- Color accessibility automation

---

## 🐛 Common Issues & Solutions

### "Colors not showing up"
- ✅ Import order: Tailwind → primitives → semantics
- ✅ Restart dev server after config changes
- ✅ Check browser DevTools computed styles

### "Dark mode not working"
- ✅ Verify `.dark` class on `<html>`
- ✅ Ensure semantic tokens have `.dark` overrides
- ✅ Use semantic tokens, not primitives with `dark:` modifiers

### "Autocomplete not showing colors"
- ✅ Restart VSCode/editor
- ✅ Check Tailwind config syntax
- ✅ Run `npx tailwindcss --help` to verify Tailwind is installed

---

## 📞 Getting Help

### Internal Resources
- Design team: Questions about color usage
- Engineering: Technical implementation help
- This documentation: All examples and patterns

### External Resources
- [Tailwind Discord](https://discord.gg/tailwindcss) - Community support
- [Figma Community](https://www.figma.com/community) - Design token examples
- [GitHub Issues](../../../.github/CONTRIBUTING.md) - Report bugs in this system

---

## 🎯 Success Metrics

You've successfully implemented the system when:

- [ ] No hardcoded hex/rgb values in components
- [ ] All components use semantic tokens
- [ ] Dark mode works without `dark:` utilities
- [ ] New team members understand the system in < 30 minutes
- [ ] Changing brand color takes < 5 minutes (one CSS variable)
- [ ] Design and code tokens stay in sync

**Goal:** Make color changes a configuration task, not a refactoring project.

---

## 🚦 Next Steps

1. **Today:** Follow QUICK_START.md to set up basics (2-3 hours)
2. **This Week:** Refactor 5-10 components to use semantic tokens
3. **This Month:** Create Figma library and sync workflow
4. **Ongoing:** Maintain and evolve as design needs change

**Questions?** Open an issue or ask in team chat!
