import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Gauge,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview financiar - IMMapp" }] }),
  component: Dashboard,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type OverviewTab = "status" | "activity" | "risks" | "actions";
type PeriodFilter = "30" | "90" | "all";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate" | "violet";

type FocusedKpi = {
  title: string;
  value: string;
  explanation: string;
  businessMeaning: string;
  icon: ReactNode;
} | null;

type MonthlyOverviewPoint = {
  monthKey: string;
  month: string;
  revenue: number;
  expenses: number;
  invoices: number;
  documents: number;
  activityIndex: number;
};

type PipelineStage = {
  stage: string;
  value: number;
  description: string;
  color: string;
};

type RelationshipPoint = {
  label: string;
  value: number;
  type: "count" | "percent";
};

type ActionItem = {
  priority: "High" | "Medium" | "Low";
  title: string;
  explanation: string;
  nextStep: string;
};

type PulseTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: MonthlyOverviewPoint;
  }>;
};

type PipelineTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: PipelineStage;
  }>;
};

type RelationshipTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: RelationshipPoint;
  }>;
};

const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: "30", label: "30 zile" },
  { value: "90", label: "90 zile" },
  { value: "all", label: "Toate datele" },
];

const relationshipColors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6"];

function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("90");
  const [overviewTab, setOverviewTab] = useState<OverviewTab>("status");
  const [focusedKpi, setFocusedKpi] = useState<FocusedKpi>(null);

  async function loadDashboard() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getDashboardData();
      setDashboardData(data);
    } catch {
      setErrorMessage("Nu s-au putut incarca datele pentru panoul principal.");
    } finally {
      setIsLoading(false);
    }
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

  const model = useMemo(() => {
    if (!dashboardData) {
      return null;
    }

    return buildExecutiveOverview(dashboardData, selectedPeriod);
  }, [dashboardData, selectedPeriod]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca privirea financiara...
      </div>
    );
  }

  if (errorMessage || !dashboardData || !model) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {errorMessage || "Nu s-au putut incarca datele pentru overview."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverviewHero
        model={model}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={setSelectedPeriod}
      />

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <CommandKpiCard
          title="Scor de sanatate financiara"
          value={`${model.healthScore}%`}
          description="Semnal rapid despre stabilitate, risc si activitatea curenta."
          badge={model.status.label}
          icon={<Gauge className="h-5 w-5" />}
          tone={model.status.tone}
          onClick={() =>
            setFocusedKpi({
              title: "Scor de sanatate financiara",
              value: `${model.healthScore}%`,
              icon: <Gauge className="h-6 w-6" />,
              explanation:
                "Scorul combina increderea predictiei, nivelul de risc, presiunea pe cash-flow, calitatea datelor si concentrarea relatiilor comerciale.",
              businessMeaning:
                "Ofera proprietarului o imagine rapida: compania este stabila, necesita atentie sau intra intr-o zona de risc.",
            })
          }
        />
        <CommandKpiCard
          title="Activitate lunară"
          value={`${model.monthlyProcessedDocuments} documente`}
          description={
            model.latestMonth
              ? model.monthlyProcessedDocuments > 0
                ? `Documente procesate în ${model.latestMonth.month.replace(/\.$/, "")}.`
                : `Fără documente procesate în ${model.latestMonth.month.replace(/\.$/, "")}.`
              : "Nu există încă activitate lunară."
          }
          badge={model.activityTrend}
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
          onClick={() =>
            setFocusedKpi({
              title: "Activitate lunară",
              value: `${model.monthlyProcessedDocuments} documente`,
              icon: <Activity className="h-6 w-6" />,
              explanation:
                "Activitatea lunară urmărește numărul documentelor procesate în perioada curentă.",
              businessMeaning:
                "Arata daca ritmul operational este suficient pentru o vizibilitate financiara relevanta.",
            })
          }
        />
        <CommandKpiCard
          title="Documente procesate"
          value={String(dashboardData.documentsProcessed)}
          description="Fisiere e-Factura XML incluse in analiza companiei."
          badge={`${dashboardData.invoiceCount} facturi`}
          icon={<FileText className="h-5 w-5" />}
          tone="emerald"
          onClick={() =>
            setFocusedKpi({
              title: "Documente procesate",
              value: String(dashboardData.documentsProcessed),
              icon: <FileText className="h-6 w-6" />,
              explanation:
                "Documentele sunt sursa operationala pentru facturi, indicatori si istoricul folosit in predictii.",
              businessMeaning:
                "Cu cat istoricul de documente este mai complet, cu atat concluziile si recomandarile sunt mai utile.",
            })
          }
        />
        <CommandKpiCard
          title="Calitatea datelor"
          value={`${dashboardData.documentExtractionEvaluation.fieldCompletenessRate.toFixed(1)}%`}
          description="Completitudinea campurilor importante din documentele analizate."
          badge={dashboardData.documentExtractionEvaluation.extractionQualityLabel}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={getQualityTone(dashboardData.documentExtractionEvaluation.fieldCompletenessRate)}
          onClick={() =>
            setFocusedKpi({
              title: "Calitatea datelor",
              value: `${dashboardData.documentExtractionEvaluation.fieldCompletenessRate.toFixed(1)}%`,
              icon: <ClipboardCheck className="h-6 w-6" />,
              explanation:
                "Calitatea datelor arata cate campuri importante din facturi sunt disponibile pentru analiza.",
              businessMeaning:
                "O completitudine buna reduce verificarile manuale si face indicatorii mai usor de folosit in decizii.",
            })
          }
        />
        <CommandKpiCard
          title="Concentrare clienti"
          value={formatPercent(model.topCustomerShare)}
          description={
            model.topCustomerName
              ? `Client principal: ${model.topCustomerName}`
              : "Nu exista inca o concentrare relevanta"
          }
          badge={getConcentrationLabel(model.topCustomerShare)}
          icon={<Users className="h-5 w-5" />}
          tone={model.topCustomerShare > 50 ? "amber" : "violet"}
          onClick={() =>
            setFocusedKpi({
              title: "Concentrare clienti",
              value: formatPercent(model.topCustomerShare),
              icon: <Users className="h-6 w-6" />,
              explanation:
                "Concentrarea clientilor arata cat de mult depinde activitatea de cel mai important client.",
              businessMeaning:
                "O pondere ridicata poate crea risc de dependenta daca acel client intarzie comenzile sau platile.",
            })
          }
        />
        <CommandKpiCard
          title="Stabilitate furnizori"
          value={formatPercent(model.topSupplierShare)}
          description={
            model.topSupplierName
              ? `Furnizor principal: ${model.topSupplierName}`
              : "Nu exista inca o dependenta relevanta"
          }
          badge={getConcentrationLabel(model.topSupplierShare)}
          icon={<Building2 className="h-5 w-5" />}
          tone={model.topSupplierShare > 50 ? "amber" : "slate"}
          onClick={() =>
            setFocusedKpi({
              title: "Stabilitate furnizori",
              value: formatPercent(model.topSupplierShare),
              icon: <Building2 className="h-6 w-6" />,
              explanation:
                "Stabilitatea furnizorilor arata daca cheltuielile sunt distribuite intre mai multi parteneri sau concentrate intr-o singura relatie.",
              businessMeaning:
                "O baza echilibrata de furnizori reduce presiunea operationala cand un furnizor modifica preturile sau conditiile.",
            })
          }
        />
      </section>

      <Tabs value={overviewTab} onValueChange={(value) => setOverviewTab(value as OverviewTab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:w-auto sm:grid-cols-4">
            <TabsTrigger value="status" className="rounded-xl">
              Status
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-xl">
              Activitate
            </TabsTrigger>
            <TabsTrigger value="risks" className="rounded-xl">
              Riscuri
            </TabsTrigger>
            <TabsTrigger value="actions" className="rounded-xl">
              Actiuni
            </TabsTrigger>
          </TabsList>

          <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <div className="grid grid-cols-3 gap-1">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedPeriod(option.value)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs font-semibold transition",
                    selectedPeriod === option.value
                      ? "bg-slate-950 text-white"
                      : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <TabsContent value="status" className="mt-4 space-y-4">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <CommandPanel
              eyebrow="Operatiuni"
              title="Flux documente"
              description="Urmareste parcursul documentelor de la import pana la elementele care necesita atentie."
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={model.pipelineStages} margin={{ left: 8, right: 12, top: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="stage" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} tickLine={false} />
                  <Tooltip content={<PipelineTooltip />} />
                  <Bar dataKey="value" name="Documente" radius={[12, 12, 0, 0]}>
                    {model.pipelineStages.map((stage) => (
                      <Cell key={stage.stage} fill={stage.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CommandPanel>

            <HealthSnapshot model={model} />
          </section>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.75fr)]">
            <CommandPanel
              eyebrow="Ritm"
              title="Pulsul afacerii"
              description="Indice de activitate calculat din volumul de documente si facturi, nu din venit brut."
            >
              {model.pulseData.length === 0 ? (
                <CommandEmptyState message="Importa documente pentru a construi evolutia activitatii." />
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={model.pulseData} margin={{ left: 8, right: 12, top: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="count" stroke="#64748b" fontSize={12} allowDecimals={false} />
                    <YAxis
                      yAxisId="index"
                      orientation="right"
                      domain={[0, 100]}
                      stroke="#64748b"
                      fontSize={12}
                    />
                    <Tooltip content={<PulseTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 14 }} />
                    <Bar
                      yAxisId="count"
                      dataKey="documents"
                      name="Documente"
                      fill="#93c5fd"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="invoices"
                      name="Facturi"
                      fill="#10b981"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="index"
                      type="monotone"
                      dataKey="activityIndex"
                      name="Pulsul afacerii"
                      stroke="#111827"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CommandPanel>

            <ActivityDigest model={model} />
          </section>

          <RecentInvoicesTable invoices={dashboardData.latestInvoices} />
        </TabsContent>

        <TabsContent value="risks" className="mt-4 space-y-4">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
            <CommandPanel
              eyebrow="Parteneri"
              title="Relatii comerciale"
              description="Echilibrul si dependentele fata de clienti si furnizori."
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={model.relationshipData}
                  layout="vertical"
                  margin={{ left: 12, right: 48, top: 12, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke="#64748b"
                    width={138}
                    fontSize={12}
                  />
                  <Tooltip content={<RelationshipTooltip />} />
                  <Bar dataKey="value" name="Valoare" radius={[0, 10, 10, 0]}>
                    {model.relationshipData.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={relationshipColors[index % relationshipColors.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CommandPanel>

            <RiskSignalPanel model={model} />
          </section>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <ActionQueue actions={model.actions} />
        </TabsContent>
      </Tabs>

      <KpiDialog data={focusedKpi} onClose={() => setFocusedKpi(null)} />
    </div>
  );
}

function OverviewHero({
  model,
  selectedPeriod,
  onSelectPeriod,
}: {
  model: ReturnType<typeof buildExecutiveOverview>;
  selectedPeriod: PeriodFilter;
  onSelectPeriod: (period: PeriodFilter) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,#0f172a_0%,#134e4a_55%,#166534_100%)] p-6 text-white shadow-sm lg:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
            <Sparkles className="h-3.5 w-3.5" />
            Centru executiv de control
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-white lg:text-4xl">
            Overview financiar
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            O vedere rapida asupra sanatatii financiare, activitatii documentelor, riscurilor
            comerciale si actiunilor recomandate de AI.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMiniMetric label="Status" value={model.status.label} tone={model.status.tone} />
            <HeroMiniMetric
              label="Perioada analizata"
              value={getPeriodLabel(selectedPeriod)}
              tone="blue"
            />
            <HeroMiniMetric
              label="Ultima activitate"
              value={model.latestActivityDate}
              tone="slate"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-white text-slate-950 hover:bg-slate-100">
              <Link to="/app/documente">
                <UploadCloud className="h-4 w-4" />
                Importa documente
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link to="/app/rapoarte/cash-flow">
                <BarChart3 className="h-4 w-4" />
                Vezi cash-flow
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link to="/app/ai-forecast">
                <BrainCircuit className="h-4 w-4" />
                Analiza AI
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Scor de sanatate financiara</p>
              <p className="mt-3 text-5xl font-semibold text-white">{model.healthScore}</p>
              <p className="mt-2 text-sm text-slate-300">din 100</p>
            </div>
            <div
              className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#34d399 ${model.healthScore * 3.6}deg, rgba(255,255,255,0.14) 0deg)`,
              }}
            >
              <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-950/80">
                <ShieldCheck className="h-7 w-7 text-emerald-300" />
              </div>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-200">{model.status.description}</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectPeriod(option.value)}
                className={cn(
                  "rounded-2xl px-3 py-2 text-xs font-semibold transition",
                  selectedPeriod === option.value
                    ? "bg-white text-slate-950"
                    : "bg-white/10 text-slate-200 hover:bg-white/15",
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

function CommandKpiCard({
  title,
  value,
  description,
  badge,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  badge?: string | null;
  icon: ReactNode;
  tone: Tone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn("rounded-2xl p-3", toneClasses[tone].icon)}>{icon}</div>
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
      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </button>
  );
}

function CommandPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase text-blue-600">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function HealthSnapshot({ model }: { model: ReturnType<typeof buildExecutiveOverview> }) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
      <p className="text-xs font-semibold uppercase text-emerald-300">Sinteza</p>
      <h2 className="mt-1 text-lg font-semibold">Ce necesita atentie</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        O citire scurta a pozitiei operationale curente.
      </p>

      <div className="mt-5 space-y-3">
        <SnapshotRow
          label="Presiune cash-flow"
          value={model.cashFlowSignal}
          tone={
            model.cashFlowSignal === "Risc"
              ? "rose"
              : model.cashFlowSignal === "Atentie"
                ? "amber"
                : "emerald"
          }
        />
        <SnapshotRow
          label="Calitatea documentelor"
          value={model.qualitySignal}
          tone={
            model.qualitySignal === "Risc"
              ? "rose"
              : model.qualitySignal === "Atentie"
                ? "amber"
                : "emerald"
          }
        />
        <SnapshotRow
          label="Risc relatii comerciale"
          value={model.relationshipSignal}
          tone={
            model.relationshipSignal === "Risc"
              ? "rose"
              : model.relationshipSignal === "Atentie"
                ? "amber"
                : "emerald"
          }
        />
      </div>
    </aside>
  );
}

function ActivityDigest({ model }: { model: ReturnType<typeof buildExecutiveOverview> }) {
  const items = [
    {
      label: "Media lunara de facturi",
      value: String(model.averageMonthlyInvoices),
      icon: <ReceiptText className="h-4 w-4" />,
    },
    {
      label: "Tendinta activitatii",
      value: model.activityTrend ?? "Fără comparație",
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: "Facturi clasificate",
      value: String(model.classifiedInvoiceCount),
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: "Necesita atentie",
      value: String(model.needsAttentionCount),
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  return (
    <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {item.icon}
          </div>
          <p className="text-xs font-semibold uppercase text-slate-500">{item.label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{item.value}</p>
        </div>
      ))}
    </aside>
  );
}

function RiskSignalPanel({ model }: { model: ReturnType<typeof buildExecutiveOverview> }) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-amber-600">Scanare riscuri</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-950">Privire asupra dependentelor</h2>
      <div className="mt-5 space-y-4">
        <RiskMeter label="Dependenta de clientul principal" value={model.topCustomerShare} />
        <RiskMeter label="Dependenta de furnizorul principal" value={model.topSupplierShare} />
        <RiskMeter label="Presiune facturi neclasificate" value={model.unclassifiedShare} />
      </div>
    </aside>
  );
}

function ActionQueue({ actions }: { actions: ActionItem[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-600">Ghidare AI</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Actiuni recomandate de AI</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Recomandari prioritizate pe baza semnalelor curente din overview.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/app/ai-forecast">
            Deschide analiza AI
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 p-5 lg:grid-cols-2">
        {actions.map((action) => (
          <div
            key={action.title}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <PriorityBadge priority={action.priority} />
              <Zap className="h-4 w-4 text-slate-400" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-950">{action.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{action.explanation}</p>
            <div className="mt-4 rounded-2xl bg-white p-3 text-sm leading-6 text-slate-700">
              <span className="font-semibold text-slate-950">Pas recomandat: </span>
              {action.nextStep}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentInvoicesTable({ invoices }: { invoices: DashboardData["latestInvoices"] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <p className="text-xs font-semibold uppercase text-slate-500">Activitate recenta</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Ultimele facturi</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Facturile recente raman disponibile pentru verificari operationale rapide.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70">
              <TableHead>Factura</TableHead>
              <TableHead>Furnizor</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actiune</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                  Nu exista facturi disponibile inca.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-slate-50/70">
                  <TableCell className="font-medium text-slate-900">
                    {invoice.invoiceNumber}
                  </TableCell>
                  <TableCell>{invoice.supplierName}</TableCell>
                  <TableCell>{invoice.customerName}</TableCell>
                  <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatRON(invoice.total)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={normalizeStatus(invoice.status)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                        <Eye className="h-4 w-4" />
                        Vezi
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function KpiDialog({ data, onClose }: { data: FocusedKpi; onClose: () => void }) {
  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-slate-200 bg-white">
        {data && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                {data.icon}
              </div>
              <DialogTitle>{data.title}</DialogTitle>
              <DialogDescription>{data.value}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <KpiDetail title="Ce inseamna" value={data.explanation} />
              <KpiDetail title="Impact business" value={data.businessMeaning} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KpiDetail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}

function HeroMiniMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
      <p className="text-xs font-semibold uppercase text-slate-300">{label}</p>
      <p className={cn("mt-2 text-base font-semibold", heroToneClasses[tone])}>{value}</p>
    </div>
  );
}

function SnapshotRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <span
          className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", darkToneClasses[tone])}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function RiskMeter({ label, value }: { label: string; value: number }) {
  const tone = value > 60 ? "rose" : value > 40 ? "amber" : "emerald";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span
          className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone].badge)}
        >
          {formatPercent(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", meterToneClasses[tone])}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: ActionItem["priority"] }) {
  const className = {
    High: "bg-rose-50 text-rose-700 border-rose-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[priority];

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", className)}>
      {formatPriority(priority)}
    </span>
  );
}

function formatPriority(priority: ActionItem["priority"]) {
  if (priority === "High") {
    return "Prioritate ridicata";
  }

  if (priority === "Medium") {
    return "Prioritate medie";
  }

  return "Prioritate scazuta";
}

function CommandEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function PulseTooltip({ active, payload }: PulseTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      <p className="mb-3 font-semibold text-slate-950">{point.month}</p>
      <TooltipRow label="Documente" value={String(point.documents)} color="bg-blue-300" />
      <TooltipRow label="Facturi" value={String(point.invoices)} color="bg-emerald-500" />
      <TooltipRow
        label="Pulsul afacerii"
        value={`${point.activityIndex}/100`}
        color="bg-slate-950"
      />
    </div>
  );
}

function PipelineTooltip({ active, payload }: PipelineTooltipProps) {
  const stage = payload?.[0]?.payload;

  if (!active || !stage) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      <p className="font-semibold text-slate-950">{stage.stage}</p>
      <p className="mt-1 text-slate-600">{stage.value} elemente</p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{stage.description}</p>
    </div>
  );
}

function RelationshipTooltip({ active, payload }: RelationshipTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      <p className="font-semibold text-slate-950">{point.label}</p>
      <p className="mt-2 text-slate-700">
        {point.type === "percent" ? formatPercent(point.value) : String(point.value)}
      </p>
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-slate-500">
        <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
        {label}
      </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function buildExecutiveOverview(dashboardData: DashboardData, selectedPeriod: PeriodFilter) {
  const monthlyData = filterMonthlyData(buildMonthlyDashboardData(dashboardData), selectedPeriod);
  const fullMonthlyData = buildMonthlyDashboardData(dashboardData);
  const prediction = dashboardData.prediction;
  const qualityRate = dashboardData.documentExtractionEvaluation.fieldCompletenessRate;
  const topCustomer = dashboardData.topCustomers[0] ?? null;
  const topSupplier = dashboardData.topSuppliers[0] ?? null;
  const topSupplierShare =
    dashboardData.totalExpenses > 0 && topSupplier
      ? (topSupplier.value / dashboardData.totalExpenses) * 100
      : 0;
  const unclassifiedShare =
    dashboardData.totalValue > 0
      ? (dashboardData.unclassifiedInvoiceValue / dashboardData.totalValue) * 100
      : 0;
  const healthScore = getBusinessHealthScore({
    confidence: prediction.confidenceLevel,
    risk: prediction.riskLevel,
    cashFlow30Days: prediction.cashFlow30Days,
    qualityRate,
    customerShare: topCustomer?.share ?? 0,
    supplierShare: topSupplierShare,
    unclassifiedShare,
  });
  const status = getBusinessStatus({
    healthScore,
    risk: prediction.riskLevel,
    cashFlow30Days: prediction.cashFlow30Days,
    qualityRate,
  });
  const latestMonth = monthlyData[monthlyData.length - 1] ?? null;
  const previousMonth = monthlyData[monthlyData.length - 2] ?? null;
  const activityTrend = getActivityTrend(latestMonth, previousMonth);
  const monthlyProcessedDocuments = latestMonth?.documents ?? 0;
  const averageMonthlyInvoices =
    monthlyData.length > 0
      ? Math.round(monthlyData.reduce((sum, point) => sum + point.invoices, 0) / monthlyData.length)
      : 0;
  const pulseData = buildBusinessPulse(monthlyData);
  const needsAttentionCount =
    dashboardData.unclassifiedInvoiceCount +
    Math.max(dashboardData.documentExtractionEvaluation.missingFields.length, 0);
  const pipelineStages = buildPipelineStages(dashboardData, needsAttentionCount);
  const relationshipData = [
    { label: "Clienti activi", value: dashboardData.customerCount, type: "count" as const },
    { label: "Furnizori activi", value: dashboardData.supplierCount, type: "count" as const },
    { label: "Pondere client principal", value: topCustomer?.share ?? 0, type: "percent" as const },
    { label: "Pondere furnizor principal", value: topSupplierShare, type: "percent" as const },
  ];
  const actions = buildActionQueue({
    dashboardData,
    topCustomerShare: topCustomer?.share ?? 0,
    topSupplierShare,
    unclassifiedShare,
    monthlyPointsCount: fullMonthlyData.length,
  });

  return {
    healthScore,
    status,
    qualitySignal: qualityRate < 70 ? "Risc" : qualityRate < 90 ? "Atentie" : "Stabil",
    cashFlowSignal:
      prediction.cashFlow30Days < 0
        ? "Risc"
        : prediction.cashFlow30Days < 1000
          ? "Atentie"
          : "Stabil",
    relationshipSignal:
      Math.max(topCustomer?.share ?? 0, topSupplierShare) > 60
        ? "Risc"
        : Math.max(topCustomer?.share ?? 0, topSupplierShare) > 40
          ? "Atentie"
          : "Stabil",
    latestActivityDate: getLatestActivityDate(dashboardData),
    latestMonth,
    monthlyProcessedDocuments,
    averageMonthlyInvoices,
    activityTrend,
    classifiedInvoiceCount: dashboardData.classifiedInvoiceCount,
    needsAttentionCount,
    topCustomerName: topCustomer?.name ?? "",
    topCustomerShare: topCustomer?.share ?? 0,
    topSupplierName: topSupplier?.name ?? "",
    topSupplierShare,
    unclassifiedShare,
    pipelineStages,
    pulseData,
    relationshipData,
    actions,
  };
}

function buildMonthlyDashboardData(dashboardData: DashboardData): MonthlyOverviewPoint[] {
  const monthMap = new Map<
    string,
    {
      monthKey: string;
      month: string;
      revenue: number;
      expenses: number;
      invoices: number;
      documents: number;
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
      invoices: 0,
      documents: 0,
    };

    monthMap.set(monthKey, created);

    return created;
  }

  dashboardData.monthlyInvoiceValue.forEach((item) => {
    const month = ensureMonth(item.monthKey, item.month);

    month.revenue = item.value;
    month.invoices += item.invoiceCount;
  });

  dashboardData.monthlyExpenseValue.forEach((item) => {
    const month = ensureMonth(item.monthKey, item.month);

    month.expenses = item.value;
    month.invoices += item.invoiceCount;
  });

  dashboardData.docsPerMonth.forEach((item) => {
    const month = ensureMonth(item.monthKey, item.month);

    month.documents = item.docs;
  });

  return buildBusinessPulse(
    Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
  );
}

function buildBusinessPulse(
  points: Array<Omit<MonthlyOverviewPoint, "activityIndex"> | MonthlyOverviewPoint>,
): MonthlyOverviewPoint[] {
  const maxInvoices = Math.max(...points.map((point) => point.invoices), 1);
  const maxDocuments = Math.max(...points.map((point) => point.documents), 1);

  return points.map((point) => {
    const invoiceScore = (point.invoices / maxInvoices) * 58;
    const documentScore = (point.documents / maxDocuments) * 32;
    const consistencyScore = point.invoices > 0 && point.documents > 0 ? 10 : 0;

    return {
      ...point,
      activityIndex: Math.round(Math.min(100, invoiceScore + documentScore + consistencyScore)),
    };
  });
}

function filterMonthlyData(points: MonthlyOverviewPoint[], period: PeriodFilter) {
  if (period === "all") {
    return points;
  }

  const monthCount = period === "30" ? 1 : 3;

  return points.slice(-monthCount);
}

function buildPipelineStages(
  dashboardData: DashboardData,
  attentionCount: number,
): PipelineStage[] {
  return [
    {
      stage: "Importate",
      value: dashboardData.documentsProcessed,
      description: "Documente incarcate in fluxul oficial de lucru.",
      color: "#2563eb",
    },
    {
      stage: "Procesate",
      value: dashboardData.invoiceCount,
      description: "Facturi extrase din documentele XML incarcate.",
      color: "#10b981",
    },
    {
      stage: "Validate",
      value: dashboardData.classifiedInvoiceCount,
      description: "Facturi asociate clar cu firma curenta.",
      color: "#8b5cf6",
    },
    {
      stage: "Necesita atentie",
      value: attentionCount,
      description:
        "Elemente care pot necesita verificarea profilului, CUI-ului sau calitatii datelor.",
      color: "#f59e0b",
    },
  ];
}

function buildActionQueue({
  dashboardData,
  topCustomerShare,
  topSupplierShare,
  unclassifiedShare,
  monthlyPointsCount,
}: {
  dashboardData: DashboardData;
  topCustomerShare: number;
  topSupplierShare: number;
  unclassifiedShare: number;
  monthlyPointsCount: number;
}): ActionItem[] {
  const actions: ActionItem[] = [];

  if (topCustomerShare > 50) {
    actions.push({
      priority: "High",
      title: "Concentrare ridicata pe un client",
      explanation: "O parte mare din activitate depinde de o singura relatie comerciala.",
      nextStep:
        "Deschide rapoartele si verifica daca veniturile viitoare depind prea mult de acest client.",
    });
  }

  if (dashboardData.prediction.cashFlow30Days < 0) {
    actions.push({
      priority: "High",
      title: "Presiune negativa pe cash-flow",
      explanation: "Estimarea cash-flow pentru urmatoarele 30 de zile este sub zero.",
      nextStep: "Verifica incasarile, platile esentiale si analiza AI inainte de noi cheltuieli.",
    });
  }

  if (topSupplierShare > 50) {
    actions.push({
      priority: "Medium",
      title: "Dependenta de furnizor",
      explanation: "Cheltuielile sunt concentrate in jurul unui furnizor principal.",
      nextStep:
        "Verifica termenii furnizorului si ia in calcul alternative pentru achizitiile critice.",
    });
  }

  if (dashboardData.documentExtractionEvaluation.fieldCompletenessRate < 85) {
    actions.push({
      priority: "Medium",
      title: "Calitatea datelor trebuie imbunatatita",
      explanation: "Unele campuri importante din facturi lipsesc din analiza curenta.",
      nextStep:
        "Verifica documentele incarcate si reincarca XML-urile problematice daca este necesar.",
    });
  }

  if (monthlyPointsCount < 3) {
    actions.push({
      priority: "Low",
      title: "Istoric lunar limitat",
      explanation: "Privirea generala are putine luni de activitate disponibile pentru comparatie.",
      nextStep:
        "Importa mai multe e-Facturi XML istorice pentru o vizibilitate mai buna asupra trendurilor.",
    });
  }

  if (unclassifiedShare > 10) {
    actions.push({
      priority: "Medium",
      title: "Facturi de asociat cu firma",
      explanation: "Unele facturi nu au putut fi asociate clar cu profilul companiei.",
      nextStep: "Verifica CUI-ul in profilul companiei si revizuieste facturile neclasificate.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: "Low",
      title: "Mentine fluxul actualizat",
      explanation: "Privirea generala nu indica presiuni operationale urgente in acest moment.",
      nextStep: "Continua sa importi e-Facturi XML dupa fiecare ciclu de activitate.",
    });
  }

  return actions.slice(0, 6);
}

function getBusinessHealthScore({
  confidence,
  risk,
  cashFlow30Days,
  qualityRate,
  customerShare,
  supplierShare,
  unclassifiedShare,
}: {
  confidence: "Scazut" | "Mediu" | "Ridicat";
  risk: "Scazut" | "Mediu" | "Ridicat";
  cashFlow30Days: number;
  qualityRate: number;
  customerShare: number;
  supplierShare: number;
  unclassifiedShare: number;
}) {
  const confidenceBase = {
    Scazut: 58,
    Mediu: 72,
    Ridicat: 86,
  }[confidence];
  const riskPenalty = {
    Scazut: 4,
    Mediu: 14,
    Ridicat: 28,
  }[risk];
  const cashFlowAdjustment = cashFlow30Days >= 0 ? 8 : -10;
  const qualityAdjustment = qualityRate >= 90 ? 6 : qualityRate >= 75 ? 0 : -10;
  const concentrationPenalty =
    Math.max(customerShare, supplierShare) > 60
      ? 8
      : Math.max(customerShare, supplierShare) > 40
        ? 4
        : 0;
  const unclassifiedPenalty = unclassifiedShare > 10 ? 6 : 0;

  return Math.max(
    30,
    Math.min(
      96,
      Math.round(
        confidenceBase +
          cashFlowAdjustment +
          qualityAdjustment -
          riskPenalty -
          concentrationPenalty -
          unclassifiedPenalty,
      ),
    ),
  );
}

function getBusinessStatus({
  healthScore,
  risk,
  cashFlow30Days,
  qualityRate,
}: {
  healthScore: number;
  risk: "Scazut" | "Mediu" | "Ridicat";
  cashFlow30Days: number;
  qualityRate: number;
}) {
  if (healthScore < 55 || risk === "Ridicat" || cashFlow30Days < 0) {
    return {
      label: "Risc",
      tone: "rose" as const,
      description:
        "Compania necesita atentie deoarece riscul, cash-flow-ul sau calitatea datelor sunt sub presiune.",
    };
  }

  if (healthScore < 75 || risk === "Mediu" || qualityRate < 85) {
    return {
      label: "Atentie",
      tone: "amber" as const,
      description:
        "Compania functioneaza, dar cateva semnale trebuie monitorizate inaintea urmatoarelor decizii.",
    };
  }

  return {
    label: "Stabil",
    tone: "emerald" as const,
    description:
      "Compania arata stabil pe baza documentelor, activitatii si semnalelor financiare curente.",
  };
}

function getLatestActivityDate(dashboardData: DashboardData) {
  const latestDocument = dashboardData.latestDocuments[0]?.uploadedAt;
  const latestInvoice = dashboardData.latestInvoices[0]?.issueDate;

  return formatDate(latestDocument ?? latestInvoice);
}

function getActivityTrend(
  latest: MonthlyOverviewPoint | null,
  previous: MonthlyOverviewPoint | null,
) {
  if (!latest || !previous) {
    return null;
  }

  const currentActivity = Math.max(latest.documents, 0);
  const previousActivity = Math.max(previous.documents, 0);

  if (previousActivity < 10) {
    return null;
  }

  const change = ((currentActivity - previousActivity) / previousActivity) * 100;

  if (!Number.isFinite(change) || Math.abs(change) > 100) {
    return null;
  }

  if (change > 5) {
    return `+${change.toFixed(1)}%`;
  }

  if (change < -5) {
    return `${change.toFixed(1)}%`;
  }

  return "Stabil";
}

function getConcentrationLabel(value: number) {
  if (value > 60) {
    return "Ridicata";
  }

  if (value > 40) {
    return "Medie";
  }

  return "Echilibrata";
}

function getQualityTone(value: number): Tone {
  if (value >= 90) {
    return "emerald";
  }

  if (value >= 75) {
    return "amber";
  }

  return "rose";
}

function getPeriodLabel(period: PeriodFilter) {
  if (period === "30") {
    return "Ultimele 30 zile";
  }

  if (period === "90") {
    return "Ultimele 90 zile";
  }

  return "Toate datele";
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Activ" as const;
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ" as const;
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv" as const;
  }

  return "Activ" as const;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${value.toFixed(1)}%`;
}

const toneClasses: Record<Tone, { icon: string; badge: string }> = {
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

const heroToneClasses: Record<Tone, string> = {
  blue: "text-blue-100",
  emerald: "text-emerald-100",
  amber: "text-amber-100",
  rose: "text-rose-100",
  slate: "text-slate-100",
  violet: "text-violet-100",
};

const darkToneClasses: Record<Tone, string> = {
  blue: "bg-blue-300 text-blue-950",
  emerald: "bg-emerald-300 text-emerald-950",
  amber: "bg-amber-300 text-amber-950",
  rose: "bg-rose-300 text-rose-950",
  slate: "bg-slate-300 text-slate-950",
  violet: "bg-violet-300 text-violet-950",
};

const meterToneClasses: Record<"emerald" | "amber" | "rose", string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};
