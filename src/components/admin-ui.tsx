import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("border-slate-200 bg-white shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-slate-900">
            {title}
          </CardTitle>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  tone = "blue",
  onClick,
}: {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  trend?: string;
  tone?: "blue" | "emerald" | "amber" | "rose" | "slate";
  onClick?: () => void;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-xl p-3", toneClass)}>{icon}</div>
        {trend && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {trend}
          </span>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="h-full rounded-xl text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Card className="h-full border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
          <CardContent className="p-5">{content}</CardContent>
        </Card>
      </button>
    );
  }

  return (
    <Card className="h-full border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">{content}</CardContent>
    </Card>
  );
}

export function InfoBanner({
  children,
  tone = "blue",
  icon,
}: {
  children: ReactNode;
  tone?: "blue" | "amber" | "emerald" | "rose";
  icon?: ReactNode;
}) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm", styles)}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertCircle className="h-4 w-4" />}</span>
      <div className="leading-6">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-slate-100 p-4 text-slate-500">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
