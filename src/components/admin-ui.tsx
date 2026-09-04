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
    <Card className={cn("border-border bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
    blue: "bg-secondary text-primary",
    emerald: "bg-success/15 text-success",
    amber: "bg-warning/20 text-warning",
    rose: "bg-destructive/15 text-destructive",
    slate: "bg-muted text-muted-foreground",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-xl p-3", toneClass)}>{icon}</div>
        {trend && (
          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {trend}
          </span>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="h-full rounded-xl text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="h-full border-border bg-card shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <CardContent className="p-5">{content}</CardContent>
        </Card>
      </button>
    );
  }

  return (
    <Card className="h-full border-border bg-card shadow-sm">
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
    blue: "border-primary/30 bg-secondary text-primary",
    amber: "border-warning/40 bg-warning/20 text-warning",
    emerald: "border-success/30 bg-success/15 text-success",
    rose: "border-destructive/30 bg-destructive/15 text-destructive",
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
      <div className="mb-4 rounded-full bg-muted p-4 text-muted-foreground">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
