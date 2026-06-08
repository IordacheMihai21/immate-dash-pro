import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, FileText, Loader2, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/chart-card";
import { PageHeader } from "@/components/page-header";
import { ImpactBadge, ReportEmptyState, ReportKpiCard, ReportPanel } from "@/components/report-ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardData } from "@/lib/dashboardService";
import { getDocuments, getInvoices } from "@/lib/invoiceService";
import { formatRON } from "@/lib/mock-data";
import {
  buildMonthlyReportPoints,
  formatPercent,
  type MonthlyReportPoint,
  type ReportDocument,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/activitate-lunara")({
  head: () => ({ meta: [{ title: "Activitate lunară - IMMapp" }] }),
  component: MonthlyActivityReportPage,
});

type ActivityTab = "6" | "12" | "all";

function MonthlyActivityReportPage() {
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [documents, setDocuments] = useState<ReportDocument[]>([]);
  const [activeTab, setActiveTab] = useState<ActivityTab>("6");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadReport() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [, invoiceData, documentData] = await Promise.all([
          getDashboardData(),
          getInvoices(),
          getDocuments(),
        ]);

        setInvoices(invoiceData as unknown as ReportInvoice[]);
        setDocuments(documentData as unknown as ReportDocument[]);
      } catch {
        setErrorMessage("Nu s-au putut încărca datele pentru activitatea lunară.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const allRows = buildMonthlyReportPoints(invoices, documents);
    const visibleRows = activeTab === "all" ? allRows : allRows.slice(activeTab === "6" ? -6 : -12);
    const maxActivity = allRows.reduce<MonthlyReportPoint | null>((max, row) => {
      if (!max) {
        return row;
      }

      const maxScore = max.documents + max.invoices;
      const rowScore = row.documents + row.invoices;

      return rowScore > maxScore ? row : max;
    }, null);
    const latest = allRows.at(-1);
    const previous = allRows.at(-2);
    const evolution =
      latest && previous && previous.value > 0
        ? ((latest.value - previous.value) / previous.value) * 100
        : latest && !previous
          ? 100
          : 0;

    return {
      rows: visibleRows.map((row, index) => {
        const previousRow = visibleRows[index - 1];
        const rowEvolution =
          previousRow && previousRow.value > 0
            ? ((row.value - previousRow.value) / previousRow.value) * 100
            : index === 0
              ? 0
              : row.value > 0
                ? 100
                : 0;

        return {
          ...row,
          evolution: rowEvolution,
          status: getMonthlyStatus(rowEvolution),
        };
      }),
      totalDocuments: documents.length,
      totalInvoices: invoices.length,
      maxActivityMonth: maxActivity?.month ?? "-",
      evolution,
      activityTrend: getMonthlyStatus(evolution),
    };
  }, [activeTab, documents, invoices]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă activitatea lunară...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activitate lunară"
        description="Monitorizează evoluția lunară a documentelor, facturilor și valorilor financiare procesate."
      />

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ReportKpiCard
              title="Documente procesate"
              value={String(report.totalDocuments)}
              description="Documente încărcate în secțiunea Documente"
              icon={<FileText className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Facturi procesate"
              value={String(report.totalInvoices)}
              description="Facturi extrase din e-Facturi XML"
              icon={<ReceiptText className="h-5 w-5" />}
              tone="emerald"
            />
            <ReportKpiCard
              title="Luna cu activitate maximă"
              value={report.maxActivityMonth}
              description="După documente și facturi procesate"
              icon={<Activity className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="Evoluție față de luna anterioară"
              value={formatPercent(report.evolution)}
              description={report.activityTrend}
              icon={<TrendingUp className="h-5 w-5" />}
              tone={
                report.activityTrend === "Creștere"
                  ? "emerald"
                  : report.activityTrend === "Scădere"
                    ? "rose"
                    : "slate"
              }
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Documente procesate pe lună"
              description="Volumul operațional al documentelor încărcate"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="documents" name="Documente" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Valoare facturi pe lună"
              description="Evoluția valorii totale procesate lunar"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={report.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Valoare facturi"
                    stroke="#10b981"
                    fill="#d1fae5"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ReportPanel
            title="Activitate lunară detaliată"
            description="Compară documentele, facturile și valoarea financiară pe fiecare lună."
            contentClassName="p-0"
          >
            <div className="border-b border-slate-100 p-5">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActivityTab)}>
                <TabsList>
                  <TabsTrigger value="6">Ultimele 6 luni</TabsTrigger>
                  <TabsTrigger value="12">Ultimele 12 luni</TabsTrigger>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Luna</TableHead>
                    <TableHead className="text-right">Documente</TableHead>
                    <TableHead className="text-right">Facturi</TableHead>
                    <TableHead className="text-right">Valoare totală</TableHead>
                    <TableHead className="text-right">TVA lunară</TableHead>
                    <TableHead className="text-right">Evoluție</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.monthKey}>
                      <TableCell className="font-medium text-slate-900">{row.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.documents}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.vat)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.evolution)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportPanel>

          <ReportPanel title="Interpretare activitate">
            <p className="text-sm leading-6 text-slate-600">
              {getActivityInterpretation(report.activityTrend, report.evolution)}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

function getMonthlyStatus(evolution: number) {
  if (evolution > 5) {
    return "Creștere";
  }

  if (evolution < -5) {
    return "Scădere";
  }

  return "Stabil";
}

function getActivityInterpretation(status: string, evolution: number) {
  if (status === "Creștere") {
    return `Activitatea este în creștere față de luna anterioară, cu o variație de ${formatPercent(evolution)}. Volumul mai mare de documente și facturi poate indica o perioadă comercială mai intensă.`;
  }

  if (status === "Scădere") {
    return `Activitatea este în scădere față de luna anterioară, cu o variație de ${formatPercent(evolution)}. Verifică dacă scăderea vine din mai puține documente importate sau din valori mai mici ale facturilor.`;
  }

  return "Activitatea lunară este stabilă. Menține ritmul de import al e-Facturilor XML pentru ca rapoartele și predicțiile să rămână actualizate.";
}
