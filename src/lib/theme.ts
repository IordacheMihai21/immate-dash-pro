export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "immapp:theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = localStorage.getItem(STORAGE_KEY);

  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setStoredTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  if (theme === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function prefersDarkSystem(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveIsDark(theme: ThemePreference): boolean {
  return theme === "dark" || (theme === "system" && prefersDarkSystem());
}

export function applyThemeClass(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Runs as a blocking inline script in <head>, before the stylesheet and
 * before React hydrates -- reads the stored preference synchronously and
 * sets the .dark class immediately, so the page never paints the wrong
 * theme first and then flips (flash of wrong theme). Kept as one literal
 * string (not built from the functions above) specifically so it has zero
 * dependencies and can't accidentally break by referencing something not
 * yet defined this early in page load; the logic is intentionally
 * duplicated in miniature, not shared, for that reason.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
