import * as React from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
  systemTheme: "light" | "dark";
};

type ThemeScriptProps = {
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "ui-theme",
  attribute = "class",
  enableSystem = true,
  disableTransitionOnChange = false,
  ...props
}: ThemeProviderProps) {
  const fallbackTheme: "light" | "dark" = defaultTheme === "light" ? "light" : "dark";

  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }

    try {
      const stored = window.localStorage.getItem(storageKey) as Theme | null;
      return stored || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [systemTheme, setSystemTheme] = React.useState<"light" | "dark">(() => {
    if (enableSystem && typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    if (defaultTheme === "system") {
      return fallbackTheme;
    }

    return defaultTheme;
  });

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      try {
        window.localStorage.setItem(storageKey, newTheme);
      } catch {
        // Ignore localStorage write errors
      }
      setThemeState(newTheme);
    },
    [storageKey]
  );

  const applyTheme = React.useCallback(
    (targetTheme: "light" | "dark") => {
      if (typeof document === "undefined") return;

      const root = document.documentElement;

      if (disableTransitionOnChange) {
        const css = document.createElement("style");
        css.appendChild(
          document.createTextNode(
            `*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
          )
        );
        document.head.appendChild(css);

        // Force reflow
        void window.getComputedStyle(document.body);

        setTimeout(() => {
          document.head.removeChild(css);
        }, 1);
      }

      if (attribute === "class") {
        root.classList.remove("light", "dark");
        root.classList.add(targetTheme);
      } else {
        root.setAttribute(attribute, targetTheme);
      }
    },
    [attribute, disableTransitionOnChange]
  );

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useIsomorphicLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme, applyTheme]);

  React.useEffect(() => {
    if (!enableSystem || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    }

    // Safari < 14
    mediaQuery.addListener(handleSystemThemeChange);
    return () => mediaQuery.removeListener(handleSystemThemeChange);
  }, [enableSystem]);

  const value = React.useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
    }),
    [theme, setTheme, resolvedTheme, systemTheme]
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function ThemeScript({
  defaultTheme = "system",
  storageKey = "ui-theme",
  attribute = "class",
  enableSystem = true,
}: ThemeScriptProps) {
  const fallbackTheme = defaultTheme === "light" ? "light" : "dark";

  const script = `
;(() => {
  try {
    var attribute = ${JSON.stringify(attribute)};
    var storageKey = ${JSON.stringify(storageKey)};
    var enableSystem = ${enableSystem};
    var defaultTheme = ${JSON.stringify(defaultTheme)};
    var fallbackTheme = ${JSON.stringify(fallbackTheme)};

    var stored = window.localStorage ? window.localStorage.getItem(storageKey) : null;
    var resolved = stored || defaultTheme;

    if (resolved === "system") {
      var systemTheme = enableSystem && window.matchMedia
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : fallbackTheme;
      resolved = systemTheme || fallbackTheme;
    }

    if (resolved !== "dark" && resolved !== "light") {
      resolved = fallbackTheme;
    }

    var root = document.documentElement;
    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
    } else {
      root.setAttribute(attribute, resolved);
    }
  } catch (err) {
    // Non-critical: theme will fall back to default
    console.debug('Theme script injection failed:', err);
  }
})();`;

  return (
    <script
      data-theme-script="true"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
