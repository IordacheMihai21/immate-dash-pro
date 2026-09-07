import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-context";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Luminos", icon: Sun },
  { value: "dark", label: "Intunecat", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
];

/**
 * Real 3-way theme control (light / dark / system) -- replaces the toggle
 * removed earlier this session, which flipped a CSS class nothing
 * responded to. Now every state genuinely changes what's rendered.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label="Tema interfata"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
