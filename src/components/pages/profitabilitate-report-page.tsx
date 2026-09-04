import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  Eye,
  Gauge,
  Landmark,
  Layers3,
  Loader2,
  Percent,
  ReceiptText,
  TrendingUp,
  UploadCloud,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  formatPercent,
  getCustomerName,
  getInvoiceClassification,
  getInvoiceTotal,
  getSupplierName,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";
import { cn } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type ProfitabilityTab = "all" | "suppliers" | "customers" | "high";
type PartnerType = "Furnizor" | "Client";
type PeriodFilter = "6" | "12" | "24" | "all";
type MetricKey = "revenue" | "expenses" | "profit" | "margin" | "bestMonth" | "topPartner";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type PartnerRow = {
  key: string;
  name: string;
  type: PartnerType;
  invoiceCount: number;
  total: number;
  share: number;
  observation: string;
};

type MonthlyProfitPoint = {
  monthKey: string;
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  status: string;
};

type ProfitTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: MonthlyProfitPoint;
  }>;
};

type PartnerTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: {
      name: string;
      value: number;
      share: number;
      type: PartnerType;
    };
  }>;
};

const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: "6", label: "6 luni" },
  { value: "12", label: "12 luni" },
  { value: "24", label: "24 luni" },
  { value: "all", label: "Tot istoricul" },
];

export function ProfitabilityReportPage() {
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
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("12");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("profit");
  const [activeTab, setActiveTab] = useState<ProfitabilityTab>("all");
  const [search, setSearch] = useState("");
  const isLoading = isDashboardLoading || isInvoicesLoading;
  const errorMessage =
    isDashboardError || isInvoicesError
      ? "Nu s-au putut încărca datele pentru raportul de profitabilitate."
      : "";

  const report = useMemo(() => {
    if (!dashboardData) {
      return buildEmptyReport();
    }

    const classifiedInvoices = filterInvoicesByClassification(invoices, dashboardData.companyCui, [
      "revenue",
      "expense",
    ]);
    const classifiedTotal = classifiedInvoices.reduce(
      (sum, invoice) => sum + getInvoiceTotal(invoice),
      0,
    );
    const allMonthlyPoints = buildMonthlyProfitPoints(dashboardData);
    const monthlyPoints = filterMonthlyPoints(allMonthlyPoints, selectedPeriod);
    const periodRevenue = sumMonthlyValue(monthlyPoints, "revenue");
    const periodExpenses = sumMonthlyValue(monthlyPoints, "expenses");
    const periodProfit = periodRevenue - periodExpenses;
    const periodMargin = periodRevenue > 0 ? (periodProfit / periodRevenue) * 100 : 0;
    const profitableMonths = monthlyPoints.filter((point) => point.profit > 0).length;
    const bestMonth = getBestProfitMonth(monthlyPoints);
    const partners = buildPartnerRows(
      classifiedInvoices,
      classifiedTotal,
      dashboardData.companyCui,
    );
    const averagePartnerValue =
      partners.length > 0
        ? partners.reduce((sum, partner) => sum + partner.total, 0) / partners.length
        : 0;
    const topPartners = partners.slice(0, 8).map((partner) => ({
      name: partner.name,
      type: partner.type,
      value: partner.total,
      share: partner.share,
    }));
    const topCustomer = partners.find((partner) => partner.type === "Client") ?? null;
    const topSupplier = partners.find((partner) => partner.type === "Furnizor") ?? null;
    const topPartner = partners[0] ?? null;
    const topThreeShare = partners.slice(0, 3).reduce((sum, partner) => sum + partner.share, 0);
    const searchValue = normalizeText(search);
    const filteredPartners = partners.filter((partner) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "suppliers" && partner.type === "Furnizor") ||
        (activeTab === "customers" && partner.type === "Client") ||
        (activeTab === "high" && partner.total > averagePartnerValue);

      if (!matchesTab) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return normalizeText(`${partner.name} ${partner.type}`).includes(searchValue);
    });

    return {
      totalRevenue: dashboardData.totalRevenue,
      totalExpenses: dashboardData.totalExpenses,
      netProfit: dashboardData.netProfit,
      margin:
        dashboardData.totalRevenue > 0
          ? (dashboardData.netProfit / dashboardData.totalRevenue) * 100
          : 0,
      periodRevenue,
      periodExpenses,
      periodProfit,
      periodMargin,
      expenseRatio: periodRevenue > 0 ? (periodExpenses / periodRevenue) * 100 : 0,
      allMonthlyPoints,
      monthlyPoints,
      profitableMonths,
      bestMonth,
      partners,
      filteredPartners,
      topPartners,
      topPartner,
      topCustomer,
      topSupplier,
      topThreeShare,
      activePartnerCount: partners.length,
      partnerConcentration: topPartner?.share ?? 0,
    };
  }, [activeTab, dashboardData, invoices, search, selectedPeriod]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul de profitabilitate...
      </div>
    );
  }

  const hasProfitabilityData =
    Boolean(dashboardData) &&
    (dashboardData?.classifiedInvoiceCount ?? 0) > 0 &&
    report.allMonthlyPoints.length > 0;

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {!hasProfitabilityData ? (
        <ProfitabilityEmptyState />
      ) : (
        <>
          <ProfitHero
            report={report}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
          />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProfitMetricCard
              title="Venituri"
              value={formatRON(report.periodRevenue)}
              description="Facturi emise către clienți"
              badge={getTrendBadge(report.monthlyPoints, "revenue")}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
              active={activeMetric === "revenue"}
              onClick={() => setActiveMetric("revenue")}
            />
            <ProfitMetricCard
              title="Cheltuieli"
              value={formatRON(report.periodExpenses)}
              description="Facturi primite de la furnizori"
              badge={getExpensePressureBadge(report.expenseRatio)}
              icon={<Wallet className="h-5 w-5" />}
              tone="rose"
              active={activeMetric === "expenses"}
              onClick={() => setActiveMetric("expenses")}
            />
            <ProfitMetricCard
              title="Profit net"
              value={formatRON(report.periodProfit)}
              description="Diferența dintre venituri și cheltuieli"
              badge={getProfitBadge(report.periodProfit)}
              icon={<CircleDollarSign className="h-5 w-5" />}
              tone={report.periodProfit >= 0 ? "emerald" : "rose"}
              active={activeMetric === "profit"}
              onClick={() => setActiveMetric("profit")}
            />
            <ProfitMetricCard
              title="Marjă"
              value={formatPercent(report.periodMargin)}
              description="Profit raportat la venituri"
              badge={getMarginBadge(report.periodMargin)}
              icon={<Percent className="h-5 w-5" />}
              tone={
                report.periodMargin >= 15 ? "emerald" : report.periodMargin >= 5 ? "amber" : "rose"
              }
              active={activeMetric === "margin"}
              onClick={() => setActiveMetric("margin")}
            />
            <ProfitMetricCard
              title="Luna cu cel mai bun profit"
              value={report.bestMonth?.month ?? "-"}
              description={
                report.bestMonth ? formatRON(report.bestMonth.profit) : "Nu există date lunare"
              }
              badge="Top lună"
              icon={<BarChart3 className="h-5 w-5" />}
              tone="amber"
              active={activeMetric === "bestMonth"}
              onClick={() => setActiveMetric("bestMonth")}
            />
            <ProfitMetricCard
              title="Partener principal"
              value={report.topPartner?.name ?? "-"}
              description={
                report.topPartner
                  ? `${report.topPartner.type} · ${formatRON(report.topPartner.total)}`
                  : "Nu există parteneri activi"
              }
              badge={
                report.topPartner ? `${formatPercent(report.topPartner.share)} din total` : "-"
              }
              icon={<Building2 className="h-5 w-5" />}
              tone="blue"
              active={activeMetric === "topPartner"}
              onClick={() => setActiveMetric("topPartner")}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.85fr)]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-success">Analiză lunară</p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    Profit lunar și marjă
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Venituri, cheltuieli și profit net calculate din facturile clasificate corect.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Indicator activ:{" "}
                  <span className="font-semibold text-foreground">
                    {getMetricLabel(activeMetric)}
                  </span>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={report.monthlyPoints} margin={{ left: 4, right: 12, top: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value: number) => formatCompactCurrency(value)}
                  />
                  <Tooltip content={<ProfitChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                  <Bar
                    dataKey="revenue"
                    name="Venituri"
                    fill="#2563eb"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Cheltuieli"
                    fill="#f97316"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={38}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <DiagnosticPanel
              margin={report.periodMargin}
              monthlyPoints={report.monthlyPoints}
              partnerConcentration={report.partnerConcentration}
              expenseRatio={report.expenseRatio}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase text-primary">Parteneri</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Concentrarea valorii pe parteneri
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Partenerii care au cea mai mare influență asupra rezultatului financiar.
                </p>
              </div>

              <ResponsiveContainer width="100%" height={330}>
                <BarChart
                  data={report.topPartners}
                  layout="vertical"
                  margin={{ left: 10, right: 32, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(value: number) => formatCompactCurrency(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={12}
                    width={132}
                    tickLine={false}
                  />
                  <Tooltip content={<PartnerChartTooltip />} />
                  <Bar dataKey="value" name="Valoare" fill="#8b5cf6" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <PartnerInsightCard
                label="Top client"
                value={report.topCustomer?.name ?? "-"}
                detail={report.topCustomer ? formatRON(report.topCustomer.total) : "Fără date"}
                icon={<Landmark className="h-4 w-4" />}
              />
              <PartnerInsightCard
                label="Top furnizor"
                value={report.topSupplier?.name ?? "-"}
                detail={report.topSupplier ? formatRON(report.topSupplier.total) : "Fără date"}
                icon={<ReceiptText className="h-4 w-4" />}
              />
              <PartnerInsightCard
                label="Top 3 parteneri"
                value={formatPercent(report.topThreeShare)}
                detail="Pondere cumulată în valoarea clasificată"
                icon={<Layers3 className="h-4 w-4" />}
              />
              <PartnerInsightCard
                label="Parteneri activi"
                value={String(report.activePartnerCount)}
                detail="Clienți și furnizori cu impact financiar"
                icon={<Building2 className="h-4 w-4" />}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Lunar</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Performanță lunară</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Profitul lunar este calculat ca venituri minus cheltuieli.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/70">
                    <TableHead>Luna</TableHead>
                    <TableHead className="text-right">Venituri</TableHead>
                    <TableHead className="text-right">Cheltuieli</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Marjă</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.monthlyPoints.map((point) => (
                    <TableRow key={point.monthKey} className="hover:bg-muted/70">
                      <TableCell className="font-medium text-foreground">{point.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(point.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(point.expenses)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          point.profit >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {formatRON(point.profit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(point.margin)}
                      </TableCell>
                      <TableCell>
                        <ProfitStatusBadge status={point.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border p-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Detaliu parteneri
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Performanță pe parteneri
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Filtrează rapid clienții și furnizorii care influențează profitabilitatea.
                </p>
              </div>
              <div className="w-full xl:max-w-xs">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Caută partener"
                  className="h-10 w-full rounded-full border border-border bg-muted px-4 text-sm outline-none transition focus:border-primary/30 focus:bg-card focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="border-b border-border p-5">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as ProfitabilityTab)}
              >
                <TabsList className="bg-muted">
                  <TabsTrigger value="all">Toți</TabsTrigger>
                  <TabsTrigger value="suppliers">Furnizori</TabsTrigger>
                  <TabsTrigger value="customers">Clienți</TabsTrigger>
                  <TabsTrigger value="high">Valoare ridicată</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/70">
                    <TableHead>Partener</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead className="text-right">Număr facturi</TableHead>
                    <TableHead className="text-right">Valoare totală</TableHead>
                    <TableHead className="text-right">Pondere în total</TableHead>
                    <TableHead>Observație</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.filteredPartners.map((partner) => (
                    <TableRow key={partner.key} className="hover:bg-muted/70">
                      <TableCell className="font-medium text-foreground">{partner.name}</TableCell>
                      <TableCell>{partner.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {partner.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(partner.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(partner.share)}
                      </TableCell>
                      <TableCell>
                        <ProfitStatusBadge status={partner.observation} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/e-facturi">
                            <Eye className="h-4 w-4" />
                            Facturi
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ProfitHero({
  report,
  selectedPeriod,
  onSelectPeriod,
}: {
  report: ReturnType<typeof buildEmptyReport>;
  selectedPeriod: PeriodFilter;
  onSelectPeriod: (period: PeriodFilter) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground shadow-sm lg:p-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="max-w-4xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            <Gauge className="h-3.5 w-3.5" />
            Raport financiar avansat
          </div>
          <h1 className="text-3xl font-normal tracking-tight text-white lg:text-4xl">
            Profitabilitate
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-sidebar-foreground/80">
            Analiză interactivă a veniturilor, cheltuielilor și marjei companiei
          </p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white">{getHeroInsight(report)}</p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectPeriod(option.value)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  selectedPeriod === option.value
                    ? "bg-white text-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-white/15",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfitMetricCard({
  title,
  value,
  description,
  badge,
  icon,
  tone,
  active,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  badge: string;
  icon: ReactNode;
  tone: Tone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group h-full rounded-3xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-border hover:shadow-md",
        active ? "border-primary ring-4 ring-secondary" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn("rounded-2xl p-3", metricToneClasses[tone].icon)}>{icon}</div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            metricToneClasses[tone].badge,
          )}
        >
          {badge}
        </span>
      </div>
      <p className="mt-5 text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  );
}

function DiagnosticPanel({
  margin,
  monthlyPoints,
  partnerConcentration,
  expenseRatio,
}: {
  margin: number;
  monthlyPoints: MonthlyProfitPoint[];
  partnerConcentration: number;
  expenseRatio: number;
}) {
  const rows = [
    getMarginHealth(margin),
    getMonthlyStability(monthlyPoints),
    getPartnerConcentrationHealth(partnerConcentration),
    getExpensePressureHealth(expenseRatio),
  ];

  return (
    <aside className="rounded-3xl border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase text-success">Diagnostic</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Diagnostic profitabilitate</h2>
        <p className="mt-2 text-sm leading-6 text-sidebar-foreground/80">
          Indicatori rapizi pentru sănătatea financiară a perioadei selectate.
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{row.title}</p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  diagnosticToneClasses[row.tone],
                )}
              >
                {row.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.description}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PartnerInsightCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-primary">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProfitabilityEmptyState() {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <UploadCloud className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">
        Nu există suficiente date pentru analiza profitabilității.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Încarcă e-Facturi XML pentru a genera automat raportul.
      </p>
      <Button className="mt-6" asChild>
        <Link to="/app/documente">
          <UploadCloud className="h-4 w-4" />
          Încarcă e-Facturi XML
        </Link>
      </Button>
    </section>
  );
}

function ProfitChartTooltip({ active, payload }: ProfitTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-xl">
      <p className="mb-3 font-semibold text-foreground">{point.month}</p>
      <TooltipRow label="Venituri" value={formatRON(point.revenue)} color="bg-primary" />
      <TooltipRow label="Cheltuieli" value={formatRON(point.expenses)} color="bg-chart-3" />
      <TooltipRow label="Profit" value={formatRON(point.profit)} color="bg-success" />
      <TooltipRow label="Marjă" value={formatPercent(point.margin)} color="bg-chart-5" />
    </div>
  );
}

function PartnerChartTooltip({ active, payload }: PartnerTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-xl">
      <p className="font-semibold text-foreground">{point.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{point.type}</p>
      <div className="mt-3 space-y-1">
        <p className="text-foreground">{formatRON(point.value)}</p>
        <p className="text-muted-foreground">Pondere: {formatPercent(point.share)}</p>
      </div>
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ProfitStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized.includes("pierdere") || normalized.includes("presiune")
      ? "border-destructive/30 bg-destructive/15 text-destructive"
      : normalized.includes("ridicat") || normalized.includes("important")
        ? "border-success/30 bg-success/15 text-success"
        : normalized.includes("medie") || normalized.includes("peste")
          ? "border-warning/40 bg-warning/20 text-warning"
          : "border-primary/30 bg-secondary text-primary";

  return (
    <span
      className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", className)}
    >
      {status}
    </span>
  );
}

function buildEmptyReport() {
  return {
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    margin: 0,
    periodRevenue: 0,
    periodExpenses: 0,
    periodProfit: 0,
    periodMargin: 0,
    expenseRatio: 0,
    allMonthlyPoints: [] as MonthlyProfitPoint[],
    monthlyPoints: [] as MonthlyProfitPoint[],
    profitableMonths: 0,
    bestMonth: null as MonthlyProfitPoint | null,
    partners: [] as PartnerRow[],
    filteredPartners: [] as PartnerRow[],
    topPartners: [] as {
      name: string;
      type: PartnerType;
      value: number;
      share: number;
    }[],
    topPartner: null as PartnerRow | null,
    topCustomer: null as PartnerRow | null,
    topSupplier: null as PartnerRow | null,
    topThreeShare: 0,
    activePartnerCount: 0,
    partnerConcentration: 0,
  };
}

function buildMonthlyProfitPoints(dashboardData: DashboardData): MonthlyProfitPoint[] {
  const monthMap = new Map<
    string,
    {
      monthKey: string;
      month: string;
      revenue: number;
      expenses: number;
    }
  >();

  function ensureMonth(monthKey: string, month: string) {
    const existing = monthMap.get(monthKey);

    if (existing) {
      return existing;
    }

    const created = {
      monthKey,
      month,
      revenue: 0,
      expenses: 0,
    };

    monthMap.set(monthKey, created);

    return created;
  }

  dashboardData.monthlyInvoiceValue.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.revenue = point.value;
  });

  dashboardData.monthlyExpenseValue.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.expenses = point.value;
  });

  return Array.from(monthMap.values())
    .map((month) => {
      const profit = month.revenue - month.expenses;
      const margin = month.revenue > 0 ? (profit / month.revenue) * 100 : 0;

      return {
        ...month,
        profit,
        margin,
        status: getMonthlyProfitStatus(profit, margin),
      };
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function buildPartnerRows(
  invoices: ReportInvoice[],
  invoiceTotal: number,
  companyCui: string | null | undefined,
): PartnerRow[] {
  const partners = new Map<string, PartnerRow>();

  function addPartner(name: string, type: PartnerType, value: number) {
    const key = `${type}:${name}`;
    const current = partners.get(key) ?? {
      key,
      name,
      type,
      invoiceCount: 0,
      total: 0,
      share: 0,
      observation: "Monitorizare recomandată",
    };

    current.invoiceCount += 1;
    current.total += value;
    partners.set(key, current);
  }

  invoices.forEach((invoice) => {
    const value = getInvoiceTotal(invoice);
    const classification = getInvoiceClassification(invoice, companyCui);

    if (classification === "revenue") {
      addPartner(getCustomerName(invoice), "Client", value);
    } else if (classification === "expense") {
      addPartner(getSupplierName(invoice), "Furnizor", value);
    }
  });

  const rows = Array.from(partners.values()).sort((a, b) => b.total - a.total);
  const averageValue =
    rows.length > 0 ? rows.reduce((sum, partner) => sum + partner.total, 0) / rows.length : 0;

  return rows.map((partner) => ({
    ...partner,
    share: invoiceTotal > 0 ? (partner.total / invoiceTotal) * 100 : 0,
    observation:
      partner.total > averageValue * 1.25
        ? "Partener important"
        : partner.total > averageValue
          ? "Valoare peste medie"
          : "Monitorizare recomandată",
  }));
}

function filterMonthlyPoints(points: MonthlyProfitPoint[], period: PeriodFilter) {
  if (period === "all") {
    return points;
  }

  return points.slice(-Number(period));
}

function sumMonthlyValue(points: MonthlyProfitPoint[], key: "revenue" | "expenses" | "profit") {
  return points.reduce((sum, point) => sum + point[key], 0);
}

function getBestProfitMonth(points: MonthlyProfitPoint[]) {
  return points.reduce<MonthlyProfitPoint | null>((best, point) => {
    if (!best || point.profit > best.profit) {
      return point;
    }

    return best;
  }, null);
}

function getHeroInsight(report: ReturnType<typeof buildEmptyReport>) {
  const months = report.monthlyPoints.length;
  const positiveText =
    months > 0
      ? `profit pozitiv în ${report.profitableMonths} din ${months} luni analizate`
      : "istoric lunar încă limitat";

  if (report.periodProfit < 0) {
    return `Marja perioadei este de ${formatPercent(report.periodMargin)}, cu pierdere netă de ${formatRON(
      Math.abs(report.periodProfit),
    )}. Verifică lunile cu presiune pe marjă și partenerii cu impact ridicat.`;
  }

  return `Marja perioadei este de ${formatPercent(report.periodMargin)}, cu ${positiveText}. Profitul net analizat este ${formatRON(
    report.periodProfit,
  )}.`;
}

function getMonthlyProfitStatus(profit: number, margin: number) {
  if (profit < 0) {
    return "Pierdere";
  }

  if (margin >= 25) {
    return "Profit ridicat";
  }

  if (margin >= 10) {
    return "Profit stabil";
  }

  return "Presiune pe marjă";
}

function getTrendBadge(points: MonthlyProfitPoint[], key: "revenue" | "expenses" | "profit") {
  if (points.length < 2) {
    return "Fără comparație";
  }

  const current = points[points.length - 1][key];
  const previous = points[points.length - 2][key];

  if (previous === 0) {
    return current > 0 ? "+100.0%" : "Stabil";
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;
  const sign = change > 0 ? "+" : "";

  return `${sign}${change.toFixed(1)}%`;
}

function getExpensePressureBadge(expenseRatio: number) {
  if (expenseRatio >= 80) {
    return "Presiune ridicată";
  }

  if (expenseRatio >= 55) {
    return "Presiune medie";
  }

  return "Controlate";
}

function getProfitBadge(profit: number) {
  return profit >= 0 ? "Pozitiv" : "Pierdere";
}

function getMarginBadge(margin: number) {
  if (margin >= 25) {
    return "Foarte bună";
  }

  if (margin >= 10) {
    return "Bună";
  }

  if (margin >= 0) {
    return "Sub presiune";
  }

  return "Negativă";
}

function getMarginHealth(margin: number) {
  if (margin >= 20) {
    return {
      title: "Marjă operațională",
      status: "Bună",
      description: "Profitul păstrează o pondere sănătoasă în veniturile analizate.",
      tone: "emerald" as const,
    };
  }

  if (margin >= 8) {
    return {
      title: "Marjă operațională",
      status: "Medie",
      description: "Marja este pozitivă, dar merită urmărită în lunile cu cheltuieli mari.",
      tone: "amber" as const,
    };
  }

  return {
    title: "Marjă operațională",
    status: "Scăzută",
    description:
      "Profitabilitatea este sensibilă la creșterea costurilor sau scăderea veniturilor.",
    tone: "rose" as const,
  };
}

function getMonthlyStability(points: MonthlyProfitPoint[]) {
  if (points.length < 2) {
    return {
      title: "Stabilitate lunară",
      status: "Medie",
      description: "Istoricul disponibil este încă limitat pentru o concluzie fermă.",
      tone: "amber" as const,
    };
  }

  const profitableRatio =
    points.filter((point) => point.profit > 0).length / Math.max(points.length, 1);
  const profits = points.map((point) => point.profit);
  const averageProfit = profits.reduce((sum, value) => sum + value, 0) / profits.length;
  const averageDeviation =
    profits.reduce((sum, value) => sum + Math.abs(value - averageProfit), 0) / profits.length;
  const volatility = Math.abs(averageProfit) > 0 ? averageDeviation / Math.abs(averageProfit) : 1;

  if (profitableRatio >= 0.75 && volatility < 0.8) {
    return {
      title: "Stabilitate lunară",
      status: "Bună",
      description: "Profitul rămâne pozitiv în majoritatea lunilor analizate.",
      tone: "emerald" as const,
    };
  }

  if (profitableRatio >= 0.5) {
    return {
      title: "Stabilitate lunară",
      status: "Medie",
      description: "Există variații lunare, dar profitul rămâne recuperabil.",
      tone: "amber" as const,
    };
  }

  return {
    title: "Stabilitate lunară",
    status: "Scăzută",
    description: "Mai multe luni arată presiune pe profit sau rezultat negativ.",
    tone: "rose" as const,
  };
}

function getPartnerConcentrationHealth(topShare: number) {
  if (topShare <= 35) {
    return {
      title: "Concentrare parteneri",
      status: "Bună",
      description: "Valoarea este distribuită sănătos între mai mulți parteneri.",
      tone: "emerald" as const,
    };
  }

  if (topShare <= 55) {
    return {
      title: "Concentrare parteneri",
      status: "Medie",
      description: "Un partener are impact important, dar concentrarea este încă gestionabilă.",
      tone: "amber" as const,
    };
  }

  return {
    title: "Concentrare parteneri",
    status: "Scăzută",
    description: "Rezultatul depinde puternic de un partener principal.",
    tone: "rose" as const,
  };
}

function getExpensePressureHealth(expenseRatio: number) {
  if (expenseRatio <= 55) {
    return {
      title: "Presiune cheltuieli",
      status: "Scăzută",
      description: "Cheltuielile rămân într-o zonă confortabilă raportat la venituri.",
      tone: "emerald" as const,
    };
  }

  if (expenseRatio <= 80) {
    return {
      title: "Presiune cheltuieli",
      status: "Medie",
      description: "Costurile trebuie urmărite, mai ales în lunile cu venituri mai mici.",
      tone: "amber" as const,
    };
  }

  return {
    title: "Presiune cheltuieli",
    status: "Ridicată",
    description: "Cheltuielile consumă o parte mare din venituri și pot reduce rapid marja.",
    tone: "rose" as const,
  };
}

function getMetricLabel(metric: MetricKey) {
  const labels: Record<MetricKey, string> = {
    revenue: "Venituri",
    expenses: "Cheltuieli",
    profit: "Profit net",
    margin: "Marjă",
    bestMonth: "Luna de vârf",
    topPartner: "Partener principal",
  };

  return labels[metric];
}

function formatCompactCurrency(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }

  return String(Math.round(value));
}

const metricToneClasses: Record<Tone, { icon: string; badge: string }> = {
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

const diagnosticToneClasses = {
  emerald: "bg-success/20 text-success",
  amber: "bg-warning/20 text-warning",
  rose: "bg-destructive/20 text-destructive",
};
