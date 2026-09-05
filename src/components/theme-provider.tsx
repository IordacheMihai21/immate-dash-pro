import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  applyThemeClass,
  getStoredTheme,
  resolveIsDark,
  setStoredTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemePreference;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Deliberately NOT initialized from localStorage here, even though the
  // blocking script in __root.tsx already set the real .dark class on
  // <html> before this ever mounts (so the page's actual colors are
  // already correct with zero flash). If this state read localStorage
  // synchronously, the server-rendered "system" default and the client's
  // real stored value ("dark", say) would disagree on the very first
  // render, and React would flag a hydration mismatch on anything that
  // reads `theme` (e.g. ThemeToggle's aria-checked/className) -- confirmed
  // live, not theoretical: this exact mismatch showed up in the console
  // before this fix. Starting both server and client at the same "system"
  // default, then correcting via useEffect (client-only, post-hydration)
  // avoids it at the cost of one harmless re-render right after mount.
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [isDark, setIsDark] = useState(() => resolveIsDark("system"));

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setIsDark(resolveIsDark(stored));
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setStoredTheme(next);
    setThemeState(next);
    const dark = resolveIsDark(next);
    setIsDark(dark);
    applyThemeClass(dark);
  }, []);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function handleChange() {
      const dark = resolveIsDark("system");
      setIsDark(dark);
      applyThemeClass(dark);
    }

    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, isDark, setTheme }), [theme, isDark, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme trebuie folosit in interiorul unui ThemeProvider.");
  }

  return context;
}
