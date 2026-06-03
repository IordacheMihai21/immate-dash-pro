import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: { value: string; positive?: boolean };
}

export function KpiCard({ label, value, hint, icon, trend }: KpiCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && (
            <div className="rounded-lg bg-secondary p-2 text-primary">{icon}</div>
          )}
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
