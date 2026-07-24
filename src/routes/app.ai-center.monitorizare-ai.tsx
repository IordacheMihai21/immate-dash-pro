import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Gauge, Loader2, ListChecks, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDocumentAiMonitoringSummary,
  type DocumentAiMonitoringSummary,
} from "@/lib/documentAiMonitoringService";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ai-center/monitorizare-ai")({
  head: () => ({ meta: [{ title: "Monitorizare AI - IMMapp" }] }),
  component: MonitoringAiPage,
});

const FIELD_LABELS: Record<string, string> = {
  invoice_number: "Numar factura",
  issue_date: "Data emiterii",
  due_date: "Data scadentei",
  currency: "Moneda",
  supplier_name: "Denumire furnizor",
  supplier_cui: "CUI furnizor",
  customer_name: "Denumire client",
  customer_cui: "CUI client",
  tax_exclusive_amount: "Valoare fara TVA",
  tax_amount: "TVA",
  tax_inclusive_amount: "Valoare cu TVA",
  payable_amount: "Total de plata",
  invoiceNumber: "Numar factura",
  invoiceDate: "Data emiterii",
  supplierName: "Denumire furnizor",
  supplierCui: "CUI furnizor",
  customerName: "Denumire client",
  customerCui: "CUI client",
  subtotal: "Valoare fara TVA",
  vatAmount: "TVA",
  totalAmount: "Total de plata",
};

function fieldLabel(fieldType: string): string {
  return FIELD_LABELS[fieldType] ?? fieldType;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function MonitoringAiPage() {
  const [threshold, setThreshold] = useState(85);
  const [summary, setSummary] = useState<DocumentAiMonitoringSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const thresholdRatio = threshold / 100;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const data = await getDocumentAiMonitoringSummary(thresholdRatio);

        if (!cancelled) {
          setSummary(data);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Statisticile nu au putut fi incarcate.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [thresholdRatio]);

  const weakestFields = useMemo(() => summary?.fieldStats.slice(0, 5) ?? [], [summary]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitorizare AI"
        description="Pragul de incredere pentru auto-acceptare si campurile care necesita cel mai des verificare manuala."
      />

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label htmlFor="threshold">Prag de auto-acceptare</Label>
            <p className="text-sm text-slate-500">
              Campurile sub acest prag sunt considerate ca necesita verificare manuala.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="threshold"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value) || 0)}
              className="w-24"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Se calculeaza statisticile...
        </div>
      ) : summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MonitoringCard
              title="Campuri analizate AI"
              value={String(summary.totalFields)}
              icon={<ListChecks className="h-5 w-5" />}
              tone="blue"
            />
            <MonitoringCard
              title="Rata auto-acceptare"
              value={formatPercent(summary.autoAcceptRate)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="emerald"
            />
            <MonitoringCard
              title="Necesita verificare"
              value={String(summary.needsReviewCount)}
              icon={<ShieldAlert className="h-5 w-5" />}
              tone="amber"
            />
            <MonitoringCard
              title="Corectii inregistrate"
              value={String(summary.correctionsCount)}
              icon={<Gauge className="h-5 w-5" />}
              tone="slate"
            />
          </section>

          <Card>
            <CardHeader className="border-b border-slate-100 p-5">
              <CardTitle className="text-base font-semibold text-slate-900">
                Incredere medie pe camp
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Camp</TableHead>
                    <TableHead>Incredere medie</TableHead>
                    <TableHead className="text-right">Sub prag</TableHead>
                    <TableHead className="text-right">Total masuratori</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.fieldStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        Nu exista inca documente procesate prin Document AI.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.fieldStats.map((stat) => (
                      <TableRow key={stat.fieldType}>
                        <TableCell className="font-medium text-slate-900">
                          {fieldLabel(stat.fieldType)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  stat.averageConfidence >= thresholdRatio
                                    ? "bg-emerald-500"
                                    : "bg-amber-500",
                                )}
                                style={{
                                  width: `${Math.round(stat.averageConfidence * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm tabular-nums text-slate-600">
                              {formatPercent(stat.averageConfidence)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stat.belowThresholdCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{stat.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-100 p-5">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Campuri cu cea mai mica incredere
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {weakestFields.length === 0 ? (
                  <p className="text-sm text-slate-500">Nu exista date suficiente.</p>
                ) : (
                  weakestFields.map((stat) => (
                    <div key={stat.fieldType} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{fieldLabel(stat.fieldType)}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          stat.averageConfidence >= thresholdRatio
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                        )}
                      >
                        {formatPercent(stat.averageConfidence)}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-100 p-5">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Cele mai corectate campuri
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {summary.correctionsByField.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nu exista inca corectii inregistrate de utilizatori.
                  </p>
                ) : (
                  summary.correctionsByField.map((entry) => (
                    <div
                      key={entry.fieldName}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-slate-700">{fieldLabel(entry.fieldName)}</span>
                      <span className="font-medium text-slate-900">{entry.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MonitoringCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className={cn("mb-5 inline-flex rounded-xl p-3", toneClass)}>{icon}</div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
