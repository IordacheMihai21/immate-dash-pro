import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Search, UploadCloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ReportKpiCard({
  title,
  value,
  description,
  icon,
  tone = "blue",
  badge,
}: {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  tone?: ReportTone;
  badge?: string;
}) {
  return (
    <Card className="group h-full rounded-3xl border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className={cn("inline-flex rounded-2xl p-3", toneClasses[tone].icon)}>{icon}</div>
          {badge && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                toneClasses[tone].badge,
              )}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 break-words text-2xl font-semibold text-foreground">{value}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportPanel({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("rounded-3xl border-border bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold uppercase text-primary">{eyebrow}</p>
          )}
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function ReportHero({
  title,
  subtitle,
  eyebrow = "Raport IMMapp",
  badge,
  icon,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  badge?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground shadow-sm lg:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              {icon}
              {eyebrow}
            </span>
            {badge && (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-sidebar-foreground/80">
                {badge}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-normal tracking-tight text-white lg:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-sidebar-foreground/80">{subtitle}</p>
          {children && <div className="mt-6">{children}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-3 xl:justify-end">{actions}</div>}
      </div>
    </section>
  );
}

export function ReportInsightCard({
  title,
  description,
  value,
  icon,
  tone = "blue",
}: {
  title: string;
  description: string;
  value?: string;
  icon: ReactNode;
  tone?: ReportTone;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className={cn("mb-4 inline-flex rounded-2xl p-3", toneClasses[tone].icon)}>{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {value && <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>}
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function ReportActionCard({
  priority,
  title,
  description,
}: {
  priority: "Ridicata" | "Medie" | "Scazuta";
  title: string;
  description: string;
}) {
  const tone = priority === "Ridicata" ? "rose" : priority === "Medie" ? "amber" : "emerald";

  return (
    <div className="rounded-3xl border border-border bg-muted p-5 transition hover:border-border hover:bg-card hover:shadow-sm">
      <span
        className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone].badge)}
      >
        Prioritate {priority.toLowerCase()}
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function ImpactBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className =
    normalized.includes("ridicat") || normalized.includes("ridicata")
      ? "border-destructive/30 bg-destructive/15 text-destructive"
      : normalized.includes("mediu") || normalized.includes("medie")
        ? "border-warning/40 bg-warning/20 text-warning"
        : normalized.includes("scadere") || normalized.includes("scădere")
          ? "border-destructive/30 bg-destructive/15 text-destructive"
          : normalized.includes("crestere") || normalized.includes("creștere")
            ? "border-success/30 bg-success/15 text-success"
            : normalized.includes("stabil")
              ? "border-primary/30 bg-secondary text-primary"
              : "border-success/30 bg-success/15 text-success";

  return (
    <span
      className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", className)}
    >
      {value}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-card pl-9"
      />
    </div>
  );
}

export function ReportEmptyState() {
  return (
    <Card className="rounded-3xl border-border bg-card shadow-sm">
      <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-secondary p-4 text-primary">
          <UploadCloud className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Nu exista suficiente date pentru acest raport.
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Incarca e-Facturi XML in sectiunea Documente pentru a genera analiza.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/app/documente">
            <UploadCloud className="h-4 w-4" />
            Incarca e-Factura XML
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

type ReportTone = "blue" | "emerald" | "amber" | "rose" | "slate";

const toneClasses: Record<ReportTone, { icon: string; badge: string }> = {
  blue: {
    icon: "bg-secondary text-primary",
    badge: "bg-secondary text-primary",
  },
  emerald: {
    icon: "bg-success/15 text-success",
    badge: "bg-success/15 text-success",
  },
  amber: {
    icon: "bg-warning/20 text-warning",
    badge: "bg-warning/20 text-warning",
  },
  rose: {
    icon: "bg-destructive/15 text-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
  slate: {
    icon: "bg-muted text-muted-foreground",
    badge: "bg-muted text-foreground",
  },
};
