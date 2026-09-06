import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiTone = "primary" | "success" | "warning" | "destructive" | "muted";

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  primary: "bg-secondary text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const EASE_OUT_EXPO = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const NUMBER_PATTERN = /-?[\d][\d.,]*/;

/** Animates the leading numeric run of a KPI value on mount/change; leaves the rest of the string untouched. */
function useCountUpDisplay(value: string | number): string {
  const stringValue = String(value);
  const [display, setDisplay] = useState(stringValue);
  const previousValue = useRef(stringValue);

  useEffect(() => {
    if (stringValue === previousValue.current) {
      return;
    }
    previousValue.current = stringValue;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const match = stringValue.match(NUMBER_PATTERN);
    if (!match || prefersReducedMotion) {
      setDisplay(stringValue);
      return;
    }

    const raw = match[0];
    const target = Number.parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(target)) {
      setDisplay(stringValue);
      return;
    }

    const decimals = raw.includes(".") ? (raw.split(".")[1]?.length ?? 0) : 0;
    const duration = 500;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = EASE_OUT_EXPO(elapsed);
      const current = target * eased;
      const formatted = current.toLocaleString("ro-RO", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      setDisplay(stringValue.replace(raw, formatted));

      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(stringValue);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stringValue]);

  return display;
}

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: KpiTone;
  trend?: { value: string; positive?: boolean };
}

export function KpiCard({ label, value, hint, icon, tone = "primary", trend }: KpiCardProps) {
  const display = useCountUpDisplay(value);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{display}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && <div className={cn("rounded-lg p-2", TONE_ICON_CLASSES[tone])}>{icon}</div>}
        </div>
        {trend && (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              trend.positive ? "text-success" : "text-destructive",
            )}
          >
            {trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
