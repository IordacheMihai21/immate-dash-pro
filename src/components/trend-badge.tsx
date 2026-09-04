import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Value-delta convention: colored text + mono number, never a colored background —
 * financial deltas (revenue, cash-flow, profitability) read as a value, not a status.
 * Categorical state (document/invoice status) stays a tinted pill — see StatusBadge.
 */
export function TrendBadge({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm font-medium tabular-nums",
        positive ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
