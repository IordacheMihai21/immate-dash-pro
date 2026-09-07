"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { statCardChartHeights } from "./stat-card-chart-config";

export interface StatCardHoverState {
  value: number | null;
  label: string | null;
  trend: number | null;
}

/** Bleeds charts edge-to-edge inside stat card content padding. */
export function StatCardChart({
  children,
  className,
  size = "sm",
}: {
  children: ReactNode;
  className?: string;
  size?: keyof typeof statCardChartHeights;
}) {
  return (
    <div
      className={cn(
        "relative -mx-4 -mb-3 overflow-hidden",
        "[&_.relative.w-full]:aspect-auto! [&_.relative.w-full]:h-[var(--stat-card-chart-h)]!",
        statCardChartHeights[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
