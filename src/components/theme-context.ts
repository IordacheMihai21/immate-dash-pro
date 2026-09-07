import { createContext, useContext } from "react";
import type { ThemePreference } from "@/lib/theme";

export type ThemeContextValue = {
  theme: ThemePreference;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme trebuie folosit in interiorul unui ThemeProvider.");
  }

  return context;
}
