import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  LineChart as LineChartIcon,
  Loader2,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
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
  SearchInput,
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
import { useInvoicesData } from "@/hooks/use-invoices-data";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/formatters";
import {
  filterInvoicesByClassification,
  formatDate,
  getCustomerName,
  getInvoiceDate,
  getInvoiceTotal,
  getNewestInvoiceTime,
  getSupplierName,
  isRecentInvoice,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/cash-flow")({
  head: () => ({ meta: [{ title: "Raport cash-flow - IMMapp" }] }),
  component: CashFlowReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type CashFlowTab = "all" | "high" | "recent";

type CashFlowMonthlyPoint = {
  monthKey: string;
  month: string;
  cashIn: number;
  cashOut: number;
  net: number;
};

function CashFlowReportPage() {
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
  const invoices = useMemo(
    () => (invoicesData as unknown as ReportInvoice[]) ?? [],
    [invoicesData],
  );
  const [activeTab, setActiveTab] = useState<CashFlowTab>("all");
  const [search, setSearch] = useState("");
  const isLoading = isDashboardLoading || isInvoicesLoading;
  const errorMessage =
    isDashboardError || isInvoicesError
      ? "Nu s-au putut încărca datele pentru raportul cash-flow."
      : "";

  const report = useMemo(() => {
    const classifiedInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["revenue", "expense"])
      : [];
    const invoiceTotal = classifiedInvoices.reduce(
      (sum, invoice) => sum + getInvoiceTotal(invoice),
      0,
    );
    const averageInvoiceValue =
      classifiedInvoices.length > 0 ? invoiceTotal / classifiedInvoices.length : 0;
    const newestTime = getNewestInvoiceTime(classifiedInvoices);
    const monthlyPoints = dashboardData?.monthlyInvoiceValue ?? [];
    const cashFlowMonthly = dashboardData ? buildCashFlowMonthly(dashboardData) : [];
    const totalCashIn = cashFlowMonthly.reduce((sum, point) => sum + point.cashIn, 0);
    const totalCashOut = cashFlowMonthly.reduce((sum, point) => sum + point.cashOut, 0);
    const netCashFlow = totalCashIn - totalCashOut;
    const riskMonths = cashFlowMonthly.filter((point) => point.net < 0);
    const bestMonth = getBestCashFlowMonth(cashFlowMonthly);
    const weakestMonth = getWeakestCashFlowMonth(cashFlowMonthly);

    const rows = classifiedInvoices
      .map((invoice) => {
        const total = getInvoiceTotal(invoice);
        const impact = getInvoiceImpact(total, averageInvoiceValue);

        return {
          invoice,
          invoiceNumber: invoice.invoice_number ?? "-",
          customer: getCustomerName(invoice),
          supplier: getSupplierName(invoice),
          issueDate: formatDate(getInvoiceDate(invoice)),
          total,
          impact,
          observation: getCashFlowObservation(impact),
          recent: isRecentInvoice(invoice, newestTime),
        };
      })
      .sort((a, b) => getInvoiceTotal(b.invoice) - getInvoiceTotal(a.invoice));

    const searchValue = normalizeText(search);
    const filteredRows = rows.filter((row) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "high" && row.impact === "Ridicat") ||
        (activeTab === "recent" && row.recent);

      if (!matchesTab) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return normalizeText(`${row.invoiceNumber} ${row.customer} ${row.supplier}`).includes(
        searchValue,
      );
    });

    return {
      averageInvoiceValue,
      highImpactCount: rows.filter((row) => row.impact === "Ridicat").length,
      liquidityPressure: getLiquidityPressure(
        dashboardData?.prediction.cashFlow30Days ?? 0,
        averageInvoiceValue,
      ),
      liquidityScenario: dashboardData
        ? [
            { period: "30 zile", value: dashboardData.prediction.cashFlow30Days },
            { period: "60 zile", value: dashboardData.prediction.cashFlow60Days },
            { period: "90 zile", value: dashboardData.prediction.cashFlow90Days },
          ]
        : [],
      cashFlowMonthly,
      totalCashIn,
      totalCashOut,
      netCashFlow,
      riskMonths,
      bestMonth,
      weakestMonth,
      rows: filteredRows,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul cash-flow...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportHero
        title="Cash-flow"
        subtitle="Analizeaza lichiditatea, miscarea lunara a banilor si lunile in care fluxul de numerar poate pune presiune pe companie."
        eyebrow="Raport lichiditate"
        badge="Date din e-Facturi XML"
        icon={<Wallet className="h-3.5 w-3.5" />}
        actions={
          <Button asChild className="rounded-full bg-card text-foreground hover:bg-muted">
            <Link to="/app/documente">Importa documente</Link>
          </Button>
        }
      />

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 || !dashboardData ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportKpiCard
              title="Sold net estimat"
              value={formatRON(report.netCashFlow)}
              description="Diferenta dintre intrari si iesiri in lunile analizate"
              icon={<Wallet className="h-5 w-5" />}
              tone={report.netCashFlow >= 0 ? "emerald" : "rose"}
              badge={report.netCashFlow >= 0 ? "Pozitiv" : "Sub presiune"}
            />
            <ReportKpiCard
              title="Intrari totale"
              value={formatRON(report.totalCashIn)}
              description="Valoarea facturilor emise de companie"
              icon={<ArrowUpCircle className="h-5 w-5" />}
              tone="emerald"
            />
            <ReportKpiCard
              title="Iesiri totale"
              value={formatRON(report.totalCashOut)}
              description="Valoarea facturilor primite de la furnizori"
              icon={<ArrowDownCircle className="h-5 w-5" />}
              tone="rose"
            />
            <ReportKpiCard
              title="Luni cu presiune pe cash-flow"
              value={String(report.riskMonths.length)}
              description="Luni in care iesirile depasesc intrarile"
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={report.riskMonths.length > 0 ? "amber" : "emerald"}
            />
            <ReportKpiCard
              title="Cea mai buna luna"
              value={report.bestMonth?.month ?? "-"}
              description={report.bestMonth ? formatRON(report.bestMonth.net) : "Nu exista date"}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Cea mai slaba luna"
              value={report.weakestMonth?.month ?? "-"}
              description={
                report.weakestMonth ? formatRON(report.weakestMonth.net) : "Nu exista date"
              }
              icon={<TrendingDown className="h-5 w-5" />}
              tone={report.weakestMonth && report.weakestMonth.net < 0 ? "rose" : "slate"}
            />
          </section>

          <ReportPanel
            eyebrow="Miscare lunara"
            title="Cash-in vs Cash-out vs Net cash-flow"
            description="Compara intrarile, iesirile si soldul net pe fiecare luna disponibila."
          >
            {report.cashFlowMonthly.length === 0 ? (
              <div className="flex h-[340px] items-center justify-center rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">
                Nu exista suficiente date lunare pentru graficul de cash-flow.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart
                  data={report.cashFlowMonthly}
                  margin={{ left: 4, right: 12, top: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                  <Bar
                    dataKey="cashIn"
                    name="Intrari"
                    fill="#10b981"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="cashOut"
                    name="Iesiri"
                    fill="#f97316"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={38}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Net cash-flow"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ReportPanel>

          <section className="grid gap-4 lg:grid-cols-3">
            <ReportInsightCard
              title="Luni cu risc"
              value={
                report.riskMonths.length > 0
                  ? report.riskMonths.map((month) => month.month).join(", ")
                  : "Fara luni negative"
              }
              description="Lunile cu sold net negativ trebuie urmarite inainte de angajarea unor plati suplimentare."
              icon={<ShieldAlert className="h-5 w-5" />}
              tone={report.riskMonths.length > 0 ? "amber" : "emerald"}
            />
            <ReportInsightCard
              title="Evolutia lichiditatii"
              value={getLiquidityTrend(report.cashFlowMonthly)}
              description="Semnal calculat din ultimele luni disponibile, pe baza soldului net lunar."
              icon={<LineChartIcon className="h-5 w-5" />}
              tone="blue"
            />
            <ReportInsightCard
              title="Facturi cu impact ridicat"
              value={String(report.highImpactCount)}
              description="Facturile mari pot schimba rapid disponibilul pe termen scurt."
              icon={<Search className="h-5 w-5" />}
              tone="amber"
            />
          </section>

          <ReportPanel
            eyebrow="Recomandari"
            title="Recomandari operationale"
            description="Actiuni simple pentru reducerea presiunii pe lichiditate."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ReportActionCard
                priority={report.riskMonths.length > 0 ? "Ridicata" : "Scazuta"}
                title="Urmareste lunile negative"
                description="Planifica platile esentiale in functie de lunile in care iesirile depasesc intrarile."
              />
              <ReportActionCard
                priority={report.highImpactCount > 0 ? "Medie" : "Scazuta"}
                title="Verifica facturile mari"
                description="Facturile cu impact ridicat merita revizuite inainte de decizii de plata sau incasare."
              />
              <ReportActionCard
                priority="Medie"
                title="Actualizeaza dupa import"
                description="Importa documentele noi pentru ca raportul sa reflecte miscarea reala a banilor."
              />
            </div>
          </ReportPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportPanel
              title="Scenariu cash-flow 30/60/90 zile"
              description="Cash-flow estimat pentru urmatoarele intervale"
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={report.liquidityScenario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar
                    dataKey="value"
                    name="Cash-flow estimat"
                    fill="#2563eb"
                    radius={[8, 8, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ReportPanel>

            <ReportPanel
              title="Interpretare cash-flow"
              description="Concluzie business pe baza lichiditatii si facturilor cu impact."
            >
              <p className="text-sm leading-6 text-muted-foreground">
                {getCashFlowInterpretation(
                  dashboardData.prediction.cashFlow30Days,
                  report.highImpactCount,
                  report.liquidityPressure,
                )}
              </p>
            </ReportPanel>
          </div>

          <ReportPanel
            title="Facturi cu impact asupra cash-flow-ului"
            description="Filtrează facturile care pot influența rapid lichiditatea."
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Caută factură sau partener"
              />
            }
            contentClassName="p-0"
          >
            <div className="border-b border-border p-5">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CashFlowTab)}>
                <TabsList>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                  <TabsTrigger value="high">Impact ridicat</TabsTrigger>
                  <TabsTrigger value="recent">Recente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Număr factură</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Furnizor</TableHead>
                    <TableHead>Data emitere</TableHead>
                    <TableHead className="text-right">Valoare</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Observație</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.invoice.id}>
                      <TableCell className="font-medium text-foreground">
                        {row.invoiceNumber}
                      </TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{row.supplier}</TableCell>
                      <TableCell>{row.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.total)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={row.impact} />
                      </TableCell>
                      <TableCell className="min-w-[220px] text-muted-foreground">
                        {row.observation}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/e-facturi/$id" params={{ id: row.invoice.id }}>
                            <Eye className="h-4 w-4" />
                            Detalii
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

function getInvoiceImpact(total: number, average: number) {
  if (average <= 0) {
    return "Scăzut";
  }

  if (total > average * 1.25) {
    return "Ridicat";
  }

  if (total >= average * 0.75) {
    return "Mediu";
  }

  return "Scăzut";
}

function getCashFlowObservation(impact: string) {
  if (impact === "Ridicat") {
    return "Poate schimba semnificativ disponibilul pe termen scurt.";
  }

  if (impact === "Mediu") {
    return "Merită urmărită în planificarea încasărilor și plăților.";
  }

  return "Impact redus asupra lichidității curente.";
}

function getLiquidityPressure(cashFlow30Days: number, averageInvoiceValue: number) {
  if (cashFlow30Days < 0) {
    return "Ridicată";
  }

  if (cashFlow30Days <= Math.max(averageInvoiceValue * 0.25, 1000)) {
    return "Medie";
  }

  return "Scăzută";
}

function buildCashFlowMonthly(dashboardData: DashboardData): CashFlowMonthlyPoint[] {
  const monthMap = new Map<string, CashFlowMonthlyPoint>();

  function ensureMonth(monthKey: string, month: string) {
    const existing = monthMap.get(monthKey);

    if (existing) {
      return existing;
    }

    const created = {
      monthKey,
      month,
      cashIn: 0,
      cashOut: 0,
      net: 0,
    };

    monthMap.set(monthKey, created);

    return created;
  }

  dashboardData.monthlyInvoiceValue.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.cashIn = point.value;
    month.net = month.cashIn - month.cashOut;
  });

  dashboardData.monthlyExpenseValue.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.cashOut = point.value;
    month.net = month.cashIn - month.cashOut;
  });

  return Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function getBestCashFlowMonth(points: CashFlowMonthlyPoint[]) {
  return points.reduce<CashFlowMonthlyPoint | null>((best, point) => {
    if (!best) {
      return point;
    }

    return point.net > best.net ? point : best;
  }, null);
}

function getWeakestCashFlowMonth(points: CashFlowMonthlyPoint[]) {
  return points.reduce<CashFlowMonthlyPoint | null>((weakest, point) => {
    if (!weakest) {
      return point;
    }

    return point.net < weakest.net ? point : weakest;
  }, null);
}

function getLiquidityTrend(points: CashFlowMonthlyPoint[]) {
  if (points.length < 2) {
    return "Istoric limitat";
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];

  if (latest.net > previous.net) {
    return "In imbunatatire";
  }

  if (latest.net < previous.net) {
    return "In scadere";
  }

  return "Stabila";
}

function getCashFlowInterpretation(
  cashFlow30Days: number,
  highImpactInvoices: number,
  pressure: string,
) {
  if (cashFlow30Days < 0) {
    return `Cash-flow-ul estimat este negativ, iar presiunea pe lichiditate este ${pressure.toLowerCase()}. Prioritizează plățile esențiale și verifică facturile cu impact ridicat înainte de noi angajamente financiare.`;
  }

  if (highImpactInvoices > 0) {
    return `Cash-flow-ul este pozitiv, dar există ${highImpactInvoices} facturi cu impact ridicat. Urmărește încasările și plățile asociate acestor facturi pentru a evita presiunea de lichiditate.`;
  }

  return "Fluxul de numerar estimat este stabil. Continuă monitorizarea facturilor recente și actualizează analiza după fiecare import de e-Facturi XML.";
}
