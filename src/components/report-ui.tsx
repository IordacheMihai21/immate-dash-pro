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
    <Card className="group h-full rounded-3xl border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
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
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 break-words text-2xl font-semibold text-slate-900">{value}</p>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
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
    <Card className={cn("rounded-3xl border-slate-200 bg-white shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold uppercase text-blue-600">{eyebrow}</p>
          )}
          <CardTitle className="text-base font-semibold text-slate-950">{title}</CardTitle>
          {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
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
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,#0f172a_0%,#134e4a_58%,#166534_100%)] p-6 text-white shadow-sm lg:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
              {icon}
              {eyebrow}
            </span>
            {badge && (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                {badge}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-white lg:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">{subtitle}</p>
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
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={cn("mb-4 inline-flex rounded-2xl p-3", toneClasses[tone].icon)}>{icon}</div>
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      {value && <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>}
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
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
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm">
      <span
        className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone].badge)}
      >
        Prioritate {priority.toLowerCase()}
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

export function ImpactBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className =
    normalized.includes("ridicat") || normalized.includes("ridicata")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : normalized.includes("mediu") || normalized.includes("medie")
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalized.includes("scadere") || normalized.includes("scădere")
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : normalized.includes("crestere") || normalized.includes("creștere")
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : normalized.includes("stabil")
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";

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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-white pl-9"
      />
    </div>
  );
}

export function ReportEmptyState() {
  return (
    <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
      <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-blue-50 p-4 text-blue-600">
          <UploadCloud className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          Nu exista suficiente date pentru acest raport.
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
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

type ReportTone = "blue" | "emerald" | "amber" | "rose" | "slate" | "violet";

const toneClasses: Record<ReportTone, { icon: string; badge: string }> = {
  blue: {
    icon: "bg-blue-50 text-blue-600",
    badge: "bg-blue-50 text-blue-700",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    badge: "bg-amber-50 text-amber-700",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600",
    badge: "bg-rose-50 text-rose-700",
  },
  slate: {
    icon: "bg-slate-100 text-slate-600",
    badge: "bg-slate-100 text-slate-700",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600",
    badge: "bg-violet-50 text-violet-700",
  },
};
