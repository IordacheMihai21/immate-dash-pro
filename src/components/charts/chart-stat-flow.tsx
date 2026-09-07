"use client";

import NumberFlow from "@number-flow/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { defaultChartStatFlowFormat, type ChartStatFlowFormat } from "./chart-stat-flow-format";

function formatStatValue(
  value: number,
  formatOptions: ChartStatFlowFormat,
  prefix?: string,
  suffix?: string,
): string {
  const formatted = new Intl.NumberFormat(undefined, formatOptions).format(value);
  return `${prefix ?? ""}${formatted}${suffix ?? ""}`;
}

function useNumberFlowElementReady(): boolean {
  // Always start false (matching SSR) even if the custom element is already
  // registered client-side — flipping only inside the effect below keeps the
  // first client render identical to the server-rendered HTML and avoids a
  // hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    customElements.whenDefined("number-flow-react").then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

export interface ChartStatFlowProps {
  value: number;
  label: string;
  formatOptions?: ChartStatFlowFormat;
  prefix?: string;
  suffix?: string;
  valueClassName?: string;
  labelClassName?: string;
  icon?: ReactNode;
}

/**
 * Shared value + label stack using NumberFlow (same layout as pie / ring centers).
 * Parent should provide flex alignment and sizing when needed.
 */
export function ChartStatFlow({
  value,
  label,
  formatOptions = defaultChartStatFlowFormat,
  prefix,
  suffix,
  valueClassName = "text-2xl font-bold",
  labelClassName = "text-xs",
  icon,
}: ChartStatFlowProps) {
  const numberFlowReady = useNumberFlowElementReady();
  const staticValue = useMemo(
    () => formatStatValue(value, formatOptions, prefix, suffix),
    [value, formatOptions, prefix, suffix],
  );

  return (
    <>
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
      ) : null}
      <span className={cn("text-foreground tabular-nums", valueClassName)}>
        {numberFlowReady ? (
          <NumberFlow
            format={formatOptions}
            isolate
            prefix={prefix}
            suffix={suffix}
            value={value}
            willChange
          />
        ) : (
          staticValue
        )}
      </span>
      <span className={cn("mt-0.5 text-chart-label", labelClassName)}>{label}</span>
    </>
  );
}

ChartStatFlow.displayName = "ChartStatFlow";
