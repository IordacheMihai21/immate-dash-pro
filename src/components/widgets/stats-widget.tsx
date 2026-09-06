/**
 * Adapted from "Stats Widget" by ravikatiyar162 (21st.dev).
 * Source: https://21st.dev/@ravikatiyar162/components/stats-widget
 * Localized to RON for IMMapp; wired to our design tokens instead of the standalone demo's own CSS vars.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import NumberTicker from "@/components/widgets/number-ticker";

function getRandom(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSmoothPath(points: number[], width: number, height: number) {
  if (!points || points.length < 2) {
    return `M 0 ${height}`;
  }

  const xStep = width / (points.length - 1);
  const pathData = points.map((point, i) => {
    const x = i * xStep;
    const y = height - (point / 100) * (height * 0.8) - height * 0.1;
    return [x, y];
  });

  let path = `M ${pathData[0][0]} ${pathData[0][1]}`;

  for (let i = 0; i < pathData.length - 1; i++) {
    const [x1, y1] = pathData[i];
    const [x2, y2] = pathData[i + 1];
    const midX = (x1 + x2) / 2;
    path += ` C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  return path;
}

export function StatsWidget({
  label = "Săptămâna aceasta",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [stats, setStats] = useState({
    amount: 2830,
    change: 12,
    chartData: [30, 55, 45, 75, 60, 85, 70],
  });
  const linePathRef = useRef<SVGPathElement>(null);
  const areaPathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setStats({
        amount: getRandom(1500, 9990),
        change: getRandom(-30, 60),
        chartData: Array.from({ length: 7 }, () => getRandom(10, 90)),
      });
    }, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const svgWidth = 150;
  const svgHeight = 60;

  const linePath = useMemo(
    () => generateSmoothPath(stats.chartData, svgWidth, svgHeight),
    [stats.chartData],
  );

  const areaPath = useMemo(() => {
    if (!linePath.startsWith("M")) return "";
    return `${linePath} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;
  }, [linePath]);

  useEffect(() => {
    const path = linePathRef.current;
    const area = areaPathRef.current;

    if (path && area) {
      const length = path.getTotalLength();
      path.style.transition = "none";
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = `${length}`;

      area.style.transition = "none";
      area.style.opacity = "0";

      path.getBoundingClientRect();

      path.style.transition = "stroke-dashoffset 0.8s ease-in-out, stroke 0.5s ease";
      path.style.strokeDashoffset = "0";

      area.style.transition = "opacity 0.8s ease-in-out 0.2s, fill 0.5s ease";
      area.style.opacity = "1";
    }
  }, [linePath]);

  const isPositive = stats.change >= 0;
  const gradientId = isPositive ? "stats-widget-gradient-up" : "stats-widget-gradient-down";

  return (
    <div className={cn("rounded-2xl border bg-card p-5 text-card-foreground shadow-sm", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center text-sm text-muted-foreground">
            <span>{label}</span>
            <span
              className={cn(
                "ml-2 flex items-center font-semibold",
                isPositive ? "text-success" : "text-destructive",
              )}
            >
              {Math.abs(stats.change)}%
              {isPositive ? (
                <ArrowUp className="ml-1 h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="ml-1 h-3.5 w-3.5" />
              )}
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            <NumberTicker value={stats.amount} /> RON
          </p>
        </div>

        <div className="h-16 w-1/2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="stats-widget-gradient-up" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="stats-widget-gradient-down" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path ref={areaPathRef} d={areaPath} fill={`url(#${gradientId})`} />
            <path
              ref={linePathRef}
              d={linePath}
              fill="none"
              stroke={isPositive ? "var(--color-success)" : "var(--color-destructive)"}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
