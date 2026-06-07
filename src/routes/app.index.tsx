import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { ChartCard } from "@/components/chart-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BrainCircuit,
  FileText,
  Loader2,
  Percent,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  AlertTriangle,
  X,
} from "lucide-react";
import { formatRON } from "@/lib/mock-data";
import { getDashboardData } from "@/lib/dashboardService";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — IMMapp" }] }),
  component: Dashboard,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

type FocusedKpi = {
  title: string;
  value: string;
  trend: string;
  positive: boolean;
  explanation: string;
  formula: string;
  businessMeaning: string;
  icon: ReactNode;
} | null;

const chartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [focusedKpi, setFocusedKpi] = useState<FocusedKpi>(null);
  const [isKpiModalClosing, setIsKpiModalClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDashboard() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getDashboardData();
      setDashboardData(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la incarcarea dashboard-ului.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  function openKpiModal(data: NonNullable<FocusedKpi>) {
    setIsKpiModalClosing(false);
    setFocusedKpi(data);
  }

  function closeKpiModal() {
    setIsKpiModalClosing(true);

    window.setTimeout(() => {
      setFocusedKpi(null);
      setIsKpiModalClosing(false);
    }, 180);
  }

  useEffect(() => {
    loadDashboard();

    const handleDataChanged = () => {
      loadDashboard();
    };

    window.addEventListener("immapp:invoice-imported", handleDataChanged);
    window.addEventListener("immapp:invoice-deleted", handleDataChanged);

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleDataChanged);
      window.removeEventListener("immapp:invoice-deleted", handleDataChanged);
    };
  }, []);

  const monthlyData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    return dashboardData.monthlyInvoiceValue.map((item, index) => ({
      month: item.month,
      revenue: item.value,
      docs: dashboardData.docsPerMonth[index]?.docs ?? 0,
    }));
  }, [dashboardData]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca dashboard-ul...
      </div>
    );
  }

  if (errorMessage || !dashboardData) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="O imagine clara asupra activitatii companiei."
        />

        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage || "Nu s-au putut incarca datele pentru dashboard."}
        </div>
      </div>
    );
  }

  const prediction = dashboardData.prediction;

  const currentRevenue =
    monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].revenue : 0;
  const previousRevenue =
    monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].revenue : 0;

  const revenueTrendPercent = getPercentChange(currentRevenue, previousRevenue);

  const estimatedMargin =
    prediction.revenueForecast > 0
      ? (prediction.profitForecast / prediction.revenueForecast) * 100
      : 0;

  const vatRatio =
    dashboardData.totalValue > 0
      ? (dashboardData.totalVat / dashboardData.totalValue) * 100
      : 0;

  const avgInvoiceValue =
    dashboardData.invoiceCount > 0
      ? dashboardData.totalValue / dashboardData.invoiceCount
      : 0;

  const cashFlowChartData = [
    { period: "30 zile", value: prediction.cashFlow30Days },
    { period: "60 zile", value: prediction.cashFlow60Days },
    { period: "90 zile", value: prediction.cashFlow90Days },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Monitorizeaza performanta financiara, activitatea documentelor si estimarile AI intr-un singur loc."
      />

      <Card className="border-border/60 bg-gradient-to-br from-background via-background to-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Centru de performanta
              </div>

              <h2 className="text-2xl font-semibold tracking-tight">
                Imagine completa asupra companiei tale
              </h2>

              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Urmareste veniturile, TVA-ul, activitatea documentelor, partenerii
                principali si estimarile financiare generate automat.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <BadgeInfo label="Facturi" value={String(dashboardData.invoiceCount)} />
              <BadgeInfo label="Furnizori" value={String(dashboardData.supplierCount)} />
              <BadgeInfo label="Clienti" value={String(dashboardData.customerCount)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section>
        <SectionTitle title="Overview" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            title="Venit total"
            value={formatRON(dashboardData.totalValue)}
            icon={<Wallet className="h-5 w-5" />}
            trend={`${formatPercent(revenueTrendPercent)} fata de luna anterioara`}
            positive={revenueTrendPercent >= 0}
            onClick={() =>
              openKpiModal({
                title: "Venit total",
                value: formatRON(dashboardData.totalValue),
                trend: `${formatPercent(revenueTrendPercent)} fata de luna anterioara`,
                positive: revenueTrendPercent >= 0,
                icon: <Wallet className="h-6 w-6" />,
                explanation:
                  "Venitul total reprezinta valoarea totala a facturilor procesate in aplicatie.",
                formula:
                  "Venit total = suma valorilor totale ale facturilor importate.",
                businessMeaning:
                  "Acest indicator arata volumul financiar total al activitatii procesate si ajuta la intelegerea dimensiunii companiei.",
              })
            }
          />

          <OverviewCard
            title="Clienti activi"
            value={String(dashboardData.customerCount)}
            icon={<Users className="h-5 w-5" />}
            trend="parteneri activi in platforma"
            positive
            onClick={() =>
              openKpiModal({
                title: "Clienti activi",
                value: String(dashboardData.customerCount),
                trend: "parteneri activi in platforma",
                positive: true,
                icon: <Users className="h-6 w-6" />,
                explanation:
                  "Clientii activi sunt companiile identificate automat din documentele procesate.",
                formula:
                  "Clienti activi = numarul clientilor unici identificati in facturile incarcate.",
                businessMeaning:
                  "Acest indicator ajuta la intelegerea bazei de clienti si a gradului de diversificare a veniturilor.",
              })
            }
          />

          <OverviewCard
            title="Marja estimata"
            value={`${estimatedMargin.toFixed(1)}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            trend="bazata pe predictia curenta"
            positive={estimatedMargin >= 0}
            onClick={() =>
              openKpiModal({
                title: "Marja estimata",
                value: `${estimatedMargin.toFixed(1)}%`,
                trend: "bazata pe predictia curenta",
                positive: estimatedMargin >= 0,
                icon: <TrendingUp className="h-6 w-6" />,
                explanation:
                  "Marja estimata arata raportul dintre profitul estimat si veniturile estimate.",
                formula:
                  "Marja estimata = profit estimat / venit estimat × 100.",
                businessMeaning:
                  "O marja pozitiva indica o activitate profitabila, iar o marja negativa poate semnala presiune pe costuri sau cash-flow.",
              })
            }
          />

          <OverviewCard
            title="TVA colectata"
            value={formatRON(dashboardData.totalVat)}
            icon={<Percent className="h-5 w-5" />}
            trend={`${vatRatio.toFixed(1)}% din valoarea totala`}
            positive
            onClick={() =>
              openKpiModal({
                title: "TVA colectata",
                value: formatRON(dashboardData.totalVat),
                trend: `${vatRatio.toFixed(1)}% din valoarea totala`,
                positive: true,
                icon: <Percent className="h-6 w-6" />,
                explanation:
                  "TVA colectata reprezinta suma TVA-ului extras din facturile procesate.",
                formula:
                  "TVA colectata = suma valorilor TVA din facturile importate.",
                businessMeaning:
                  "Acest indicator ajuta compania sa urmareasca impactul fiscal si obligatiile legate de TVA.",
              })
            }
          />
        </div>
      </section>

      <section>
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard
            title="Evolutie venituri"
            description="Valoarea lunara a activitatii financiare"
            className="xl:col-span-2"
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number) => formatRON(v)}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Venit"
                  stroke="var(--color-chart-1)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">AI Forecast</h2>
              </div>

              <p className="text-4xl font-semibold">{prediction.confidenceLevel}</p>

              <p className="mt-2 text-sm text-muted-foreground">
                Nivelul de incredere al predictiei, calculat pe baza activitatii
                financiare curente.
              </p>

              <div className="mt-5 grid gap-3">
                <MiniInfo label="Nivel risc" value={prediction.riskLevel} />
                <MiniInfo
                  label="Risc intarziere plata"
                  value={prediction.paymentDelayRisk}
                />
              </div>

              <Button
                className="mt-5 w-full"
                onClick={() => (window.location.href = "/app/ai-forecast")}
              >
                Vezi predictiile
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Risc de plata</h2>
              </div>

              <p className="text-3xl font-semibold">{prediction.paymentDelayRisk}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Semnal timpuriu privind probabilitatea de intarziere la plata.
              </p>

              <div className="mt-5">
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={monthlyData}>
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-chart-3)"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Activitate documente</h2>
              </div>

              <p className="text-3xl font-semibold">{dashboardData.documentsProcessed}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Documente procesate in platforma pana in acest moment.
              </p>

              <div className="mt-4 rounded-xl bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Valoare medie / factura</p>
                <p className="mt-1 text-sm font-semibold">{formatRON(avgInvoiceValue)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Portofoliu furnizori</h2>
              </div>

              <div className="space-y-4">
                {dashboardData.topSuppliers.slice(0, 3).map((supplier, index) => (
                  <div
                    key={supplier.name}
                    className="flex items-center justify-between rounded-xl bg-secondary/30 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium line-clamp-1">
                        {supplier.name}
                      </p>
                      <p className="text-xs text-muted-foreground">Top #{index + 1}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatRON(supplier.value)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard
            title="Estimare cash-flow"
            description="Proiectie pentru urmatoarele 30, 60 si 90 de zile"
            className="xl:col-span-2"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cashFlowChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number) => formatRON(v)}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                  }}
                />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {cashFlowChartData.map((_, index) => (
                    <Cell key={index} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Structura TVA"
            description="Pondere TVA si baza fara TVA"
          >
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={dashboardData.vatDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  {dashboardData.vatDistribution.map((_, index) => (
                    <Cell key={index} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatRON(v)}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <section>
        <SectionTitle title="Indicatori cheie" />

        <div className="grid gap-4 lg:grid-cols-3">
          <MetricCard
            label="Profit estimat"
            value={formatRON(prediction.profitForecast)}
            subtitle="Estimare bazata pe datele disponibile"
            icon={<TrendingUp className="h-5 w-5" />}
          />

          <MetricCard
            label="TVA estimata"
            value={formatRON(prediction.vatForecast)}
            subtitle="Impact fiscal estimat pentru perioada urmatoare"
            icon={<Percent className="h-5 w-5" />}
          />

          <MetricCard
            label="Cash-flow 30 zile"
            value={formatRON(prediction.cashFlow30Days)}
            subtitle="Semnal rapid pentru lichiditate"
            icon={<Wallet className="h-5 w-5" />}
          />
        </div>
      </section>

      <section>
        <ChartCard
          title="Volum documente"
          description="Numarul documentelor procesate pe fiecare luna"
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                }}
              />
              <Bar dataKey="docs" name="Documente" radius={[10, 10, 0, 0]}>
                {monthlyData.map((_, index) => (
                  <Cell key={index} fill={chartColors[index % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {focusedKpi && (
        <KpiFocusModal
          data={focusedKpi}
          isClosing={isKpiModalClosing}
          onClose={closeKpiModal}
        />
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

function BadgeInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full bg-primary/10 px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold text-primary">{value}</span>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  icon,
  trend,
  positive,
  onClick,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  trend: string;
  positive: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="h-full text-left">
      <Card className="h-full cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3 text-primary">{icon}</div>
            <p className="text-sm font-medium">{title}</p>
          </div>

          <p className="text-2xl font-semibold">{value}</p>

          <div
            className={`mt-3 flex items-center gap-1 text-xs ${
              positive ? "text-emerald-600" : "text-red-500"
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{trend}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function KpiFocusModal({
  data,
  isClosing,
  onClose,
}: {
  data: NonNullable<FocusedKpi>;
  isClosing: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm ${
        isClosing ? "kpi-overlay-out" : "kpi-overlay-in"
      }`}
      onClick={onClose}
    >
      <style>
        {`
          @keyframes kpiOverlayIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes kpiOverlayOut {
            from {
              opacity: 1;
            }
            to {
              opacity: 0;
            }
          }

          @keyframes kpiModalIn {
            from {
              opacity: 0;
              transform: scale(0.84) translateY(22px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          @keyframes kpiModalOut {
            from {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
            to {
              opacity: 0;
              transform: scale(0.84) translateY(22px);
            }
          }

          .kpi-overlay-in {
            animation: kpiOverlayIn 180ms ease-out forwards;
          }

          .kpi-overlay-out {
            animation: kpiOverlayOut 180ms ease-in forwards;
          }

          .kpi-modal-in {
            animation: kpiModalIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
            transform-origin: center center;
          }

          .kpi-modal-out {
            animation: kpiModalOut 180ms ease-in forwards;
            transform-origin: center center;
          }
        `}
      </style>

      <Card
        className={`w-full max-w-3xl border-primary/20 shadow-2xl ${
          isClosing ? "kpi-modal-out" : "kpi-modal-in"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <CardContent className="p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-4 text-primary">
                {data.icon}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Indicator financiar</p>
                <h2 className="mt-1 text-2xl font-semibold">{data.title}</h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Inchide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-2xl border bg-secondary/30 p-5">
            <p className="text-sm text-muted-foreground">Valoare curenta</p>
            <p className="mt-2 text-4xl font-semibold">{data.value}</p>

            <div
              className={`mt-3 flex items-center gap-1 text-sm ${
                data.positive ? "text-emerald-600" : "text-red-500"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>{data.trend}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoBlock
              title="Ce reprezinta"
              description={data.explanation}
            />

            <InfoBlock
              title="Cum se calculeaza"
              description={data.formula}
            />

            <InfoBlock
              title="De ce conteaza"
              description={data.businessMeaning}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function MiniInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-secondary/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>

          <div className="rounded-full bg-primary/10 p-4 text-primary">
            {icon}
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function getPercentChange(current: number, previous: number) {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPercent(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}