import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  Building2,
  FileText,
  Loader2,
  ReceiptText,
  TrendingUp,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ImpactBadge,
  ReportActionCard,
  ReportEmptyState,
  ReportHero,
  ReportInsightCard,
  ReportKpiCard,
  ReportPanel,
} from "@/components/report-ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useDocumentsData } from "@/hooks/use-documents-data";
import { useInvoicesData } from "@/hooks/use-invoices-data";
import { getDashboardData } from "@/lib/dashboardService";
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
type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function MonthlyActivityReportPage() {
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
  } = useDashboardData();
  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    isError: isInvoicesError,
  } = useInvoicesData();
  const { data: documentsData, isLoading: isDocumentsLoading } = useDocumentsData();
  const invoices = useMemo(
    () => (invoicesData as unknown as ReportInvoice[]) ?? [],
    [invoicesData],
  );
  const documents = useMemo(
    () => (documentsData as unknown as ReportDocument[]) ?? [],
    [documentsData],
  );
  const [activeTab, setActiveTab] = useState<ActivityTab>("6");
  const isLoading = isDashboardLoading || isInvoicesLoading || isDocumentsLoading;
  const errorMessage =
    isDashboardError || isInvoicesError
      ? "Nu s-au putut încărca datele pentru activitatea lunară."
      : "";

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
    const latestActivity = latest ? latest.documents + latest.invoices : 0;
    const previousActivity = previous ? previous.documents + previous.invoices : 0;
    const evolution =
      latest && previous && previousActivity > 0
        ? ((latestActivity - previousActivity) / previousActivity) * 100
        : latest && !previous
          ? 100
          : 0;

    return {
      rows: visibleRows.map((row, index) => {
        const previousRow = visibleRows[index - 1];
        const activityScore = row.documents + row.invoices;
        const previousActivityScore = previousRow
          ? previousRow.documents + previousRow.invoices
          : 0;
        const rowEvolution =
          previousActivityScore > 0
            ? ((activityScore - previousActivityScore) / previousActivityScore) * 100
            : index === 0
              ? 0
              : activityScore > 0
                ? 100
                : 0;

        return {
          ...row,
          activityScore,
          evolution: rowEvolution,
          status: getMonthlyStatus(rowEvolution),
        };
      }),
      totalDocuments: documents.length,
      totalInvoices: invoices.length,
      activeMonths: allRows.filter((row) => row.documents + row.invoices > 0).length,
      customerCount: dashboardData?.customerCount ?? 0,
      supplierCount: dashboardData?.supplierCount ?? 0,
      maxActivityMonth: maxActivity?.month ?? "-",
      averageMonthlyRhythm:
        allRows.length > 0
          ? Math.round(
              allRows.reduce((sum, row) => sum + row.documents + row.invoices, 0) / allRows.length,
            )
          : 0,
      evolution,
      activityTrend: getMonthlyStatus(evolution),
    };
  }, [activeTab, dashboardData, documents, invoices]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă activitatea lunară...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportHero
        title="Activitate lunară"
        subtitle="Urmareste ritmul lunar al documentelor si facturilor procesate, fara a amesteca analiza operationala cu veniturile sau profitul."
        eyebrow="Raport operational"
        badge="Ritm lunar"
        icon={<Activity className="h-3.5 w-3.5" />}
        actions={
          <Button asChild className="rounded-full bg-card text-foreground hover:bg-muted">
            <Link to="/app/documente">
              <UploadCloud className="h-4 w-4" />
              Importa documente
            </Link>
          </Button>
        }
      />

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportKpiCard
              title="Documente procesate"
              value={String(report.totalDocuments)}
              description="Documente încărcate în secțiunea Documente"
              icon={<FileText className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Luni active"
              value={String(report.activeMonths)}
              description="Luni cu documente sau facturi inregistrate"
              icon={<Activity className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Clienti activi"
              value={String(report.customerCount)}
              description="Clienti identificati in facturile emise"
              icon={<Users className="h-5 w-5" />}
              tone="emerald"
            />
            <ReportKpiCard
              title="Furnizori activi"
              value={String(report.supplierCount)}
              description="Furnizori identificati in facturile primite"
              icon={<Building2 className="h-5 w-5" />}
              tone="slate"
            />
            <ReportKpiCard
              title="Luna cu activitate maximă"
              value={report.maxActivityMonth}
              description="După documente și facturi procesate"
              icon={<Activity className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="Ritm mediu lunar"
              value={String(report.averageMonthlyRhythm)}
              description="Documente si facturi procesate in medie pe luna"
              icon={<TrendingUp className="h-5 w-5" />}
              tone="amber"
            />
          </section>

          <ReportPanel
            eyebrow="Volum operational"
            title="Volum lunar de documente si facturi"
            description="Compara documentele incarcate, facturile procesate si ritmul total lunar."
          >
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={report.rows} margin={{ left: 4, right: 12, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Bar dataKey="documents" name="Documente" fill="#2563eb" radius={[8, 8, 0, 0]} />
                <Bar dataKey="invoices" name="Facturi" fill="#10b981" radius={[8, 8, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="activityScore"
                  name="Ritm total"
                  stroke="#111827"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ReportPanel>

          <section className="grid gap-4 lg:grid-cols-3">
            <ReportInsightCard
              title="Distributie activitate"
              value={`${report.activeMonths} luni active`}
              description="Arata cat de distribuita este activitatea in timp, pe baza documentelor si facturilor procesate."
              icon={<Activity className="h-5 w-5" />}
              tone="blue"
            />
            <ReportInsightCard
              title="Balanta clienti / furnizori"
              value={`${report.customerCount} / ${report.supplierCount}`}
              description="Compara rapid baza de clienti si furnizori activi din documentele procesate."
              icon={<Users className="h-5 w-5" />}
              tone="blue"
            />
            <ReportInsightCard
              title="Consistenta operationala"
              value={report.activityTrend}
              description={getActivityInterpretation(report.activityTrend, report.evolution)}
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

          <ReportPanel
            eyebrow="Recomandari"
            title="Actiuni pentru mentinerea ritmului operational"
            description="Pasi simpli pentru ca raportarea lunara sa ramana relevanta."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ReportActionCard
                priority="Scazuta"
                title="Importa documentele constant"
                description="Un ritm regulat de import mentine rapoartele actualizate si reduce golurile lunare."
              />
              <ReportActionCard
                priority={report.activeMonths < 3 ? "Medie" : "Scazuta"}
                title="Completeaza istoricul"
                description="Daca exista putine luni active, importa e-Facturi istorice pentru o analiza mai stabila."
              />
              <ReportActionCard
                priority="Scazuta"
                title="Verifica lunile atipice"
                description="Lunile cu activitate foarte ridicata sau foarte scazuta pot explica schimbari operationale."
              />
            </div>
          </ReportPanel>

          <ReportPanel
            title="Activitate lunară detaliată"
            description="Compara documentele si facturile procesate pe fiecare luna."
            contentClassName="p-0"
          >
            <div className="border-b border-border p-5">
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
                    <TableHead className="text-right">Evoluție</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.monthKey}>
                      <TableCell className="font-medium text-foreground">{row.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.documents}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
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
            <p className="text-sm leading-6 text-muted-foreground">
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
