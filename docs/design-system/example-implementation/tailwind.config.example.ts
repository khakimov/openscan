/**
 * Example Tailwind Configuration for Design System
 *
 * This shows how to integrate primitives and semantic tokens
 * into Tailwind CSS for use in className utilities.
 */

import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "./apps/*/src/**/*.{ts,tsx}",
  ],

  /**
   * Dark mode strategy
   *
   * 'class' = Controlled by .dark class on HTML element
   * Semantic tokens in CSS variables handle the actual color switching
   */
  darkMode: "class",

  theme: {
    extend: {
      /**
       * Color System Integration
       *
       * We expose both primitives (for rare direct use) and
       * semantic tokens (for 95% of cases) as Tailwind utilities.
       */
      colors: {
        /* =====================================================
           SEMANTIC TOKENS (Primary Usage)
           Use these in 95% of cases
           ===================================================== */

        // Interactive colors
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          foreground: "var(--color-primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          hover: "var(--color-secondary-hover)",
          active: "var(--color-secondary-active)",
          foreground: "var(--color-secondary-foreground)",
        },
        tertiary: {
          DEFAULT: "var(--color-tertiary)",
          hover: "var(--color-tertiary-hover)",
          foreground: "var(--color-tertiary-foreground)",
        },

        // Status colors
        success: {
          DEFAULT: "var(--color-success)",
          hover: "var(--color-success-hover)",
          foreground: "var(--color-success-foreground)",
          subtle: "var(--color-success-subtle)",
          border: "var(--color-success-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          hover: "var(--color-warning-hover)",
          foreground: "var(--color-warning-foreground)",
          subtle: "var(--color-warning-subtle)",
          border: "var(--color-warning-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          hover: "var(--color-danger-hover)",
          foreground: "var(--color-danger-foreground)",
          subtle: "var(--color-danger-subtle)",
          border: "var(--color-danger-border)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          hover: "var(--color-info-hover)",
          foreground: "var(--color-info-foreground)",
          subtle: "var(--color-info-subtle)",
          border: "var(--color-info-border)",
        },

        // Surfaces
        background: {
          DEFAULT: "var(--color-background)",
          secondary: "var(--color-background-secondary)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          elevated: "var(--color-surface-elevated)",
          secondary: "var(--color-surface-secondary)",
          tertiary: "var(--color-surface-tertiary)",
        },

        // Text
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          disabled: "var(--color-text-disabled)",
          inverse: "var(--color-text-inverse)",
        },

        // Borders
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          subtle: "var(--color-border-subtle)",
        },

        // Special
        brand: "var(--color-brand)",
        accent: "var(--color-accent)",

        /* =====================================================
           PRIMITIVE SCALES (Direct Usage - Rare)
           Use these for:
           - Data visualization (charts, graphs)
           - One-off custom designs
           - Gradients with specific shades
           ===================================================== */

        pumpkin: {
          50:  "var(--color-pumpkin-50)",
          100: "var(--color-pumpkin-100)",
          200: "var(--color-pumpkin-200)",
          300: "var(--color-pumpkin-300)",
          400: "var(--color-pumpkin-400)",
          500: "var(--color-pumpkin-500)",
          600: "var(--color-pumpkin-600)",
          700: "var(--color-pumpkin-700)",
          800: "var(--color-pumpkin-800)",
          900: "var(--color-pumpkin-900)",
          950: "var(--color-pumpkin-950)",
        },
        danube: {
          50:  "var(--color-danube-50)",
          100: "var(--color-danube-100)",
          200: "var(--color-danube-200)",
          300: "var(--color-danube-300)",
          400: "var(--color-danube-400)",
          500: "var(--color-danube-500)",
          600: "var(--color-danube-600)",
          700: "var(--color-danube-700)",
          800: "var(--color-danube-800)",
          900: "var(--color-danube-900)",
          950: "var(--color-danube-950)",
        },
        slate: {
          50:  "var(--color-slate-50)",
          100: "var(--color-slate-100)",
          200: "var(--color-slate-200)",
          300: "var(--color-slate-300)",
          400: "var(--color-slate-400)",
          500: "var(--color-slate-500)",
          600: "var(--color-slate-600)",
          700: "var(--color-slate-700)",
          800: "var(--color-slate-800)",
          900: "var(--color-slate-900)",
          950: "var(--color-slate-950)",
        },
        // ... repeat for stone, green, red, amber, blue
      },

      /**
       * Chart colors for data visualization
       * (These typically use primitive scales for precise control)
       */
      charts: {
        1: "var(--color-chart-1)",
        2: "var(--color-chart-2)",
        3: "var(--color-chart-3)",
        4: "var(--color-chart-4)",
        5: "var(--color-chart-5)",
      },
    },
  },

  plugins: [],
} satisfies Config;

/**
 * Usage Examples with This Config
 */

/*
✅ RECOMMENDED - Semantic tokens (adapt to theme automatically)
─────────────────────────────────────────────────────────────
<div className="bg-primary text-primary-foreground">Primary Button</div>
<div className="bg-success-subtle border-success-border">Success Alert</div>
<p className="text-text-secondary">Muted text</p>
<div className="border-border hover:bg-surface-secondary">Card</div>


✅ ACCEPTABLE - Primitives for specific needs
─────────────────────────────────────────────
// Gradient with exact shades
<div className="bg-gradient-to-r from-pumpkin-500 to-danube-500" />

// Chart with specific color
<div className="bg-pumpkin-600" style={{ width: `${percentage}%` }} />


❌ AVOID - Inline arbitrary values
──────────────────────────────────
<div className="bg-[#EF944E]">  // Don't do this
<div className="text-[oklch(...)]">  // Don't do this


💡 TIP: Autocomplete in VSCode
─────────────────────────────────
With this config, typing "bg-" will show:
  - bg-primary (semantic - use this!)
  - bg-pumpkin-600 (primitive - rare)
  - bg-success (semantic - use this!)

Your editor will help you choose the right abstraction!
*/
