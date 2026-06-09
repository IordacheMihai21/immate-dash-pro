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
  Clock3,
  Eye,
  FileText,
  Gauge,
  Layers3,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  Wallet,
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
  head: () => ({ meta: [{ title: "Dashboard - IMMapp" }] }),
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
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All data" },
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
      setErrorMessage("Nu s-au putut incarca datele pentru dashboard.");
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
        Loading dashboard...
      </div>
    );
  }

  if (errorMessage || !dashboardData || !model) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {errorMessage || "Dashboard data could not be loaded."}
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
          title="Business Health Score"
          value={`${model.healthScore}%`}
          description="Overall operating signal based on risk, confidence and current activity."
          badge={model.status.label}
          icon={<Gauge className="h-5 w-5" />}
          tone={model.status.tone}
          onClick={() =>
            setFocusedKpi({
              title: "Business Health Score",
              value: `${model.healthScore}%`,
              icon: <Gauge className="h-6 w-6" />,
              explanation:
                "The score combines forecast confidence, risk level, cash-flow pressure, document quality and relationship concentration.",
              businessMeaning:
                "It gives the owner a fast read on whether the company looks stable, needs attention or is entering a risk zone.",
            })
          }
        />
        <CommandKpiCard
          title="Monthly activity"
          value={`${model.latestMonth?.invoices ?? 0} invoices`}
          description={model.latestMonth ? `${model.latestMonth.documents} documents in ${model.latestMonth.month}` : "No monthly activity yet"}
          badge={model.activityTrend}
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
          onClick={() =>
            setFocusedKpi({
              title: "Monthly activity",
              value: `${model.latestMonth?.invoices ?? 0} invoices`,
              icon: <Activity className="h-6 w-6" />,
              explanation:
                "Monthly activity follows document and invoice volume, not revenue or profit.",
              businessMeaning:
                "It shows whether the business operations are active enough to support reliable financial visibility.",
            })
          }
        />
        <CommandKpiCard
          title="Processed documents"
          value={String(dashboardData.documentsProcessed)}
          description="Official e-Factura XML files included in the workspace."
          badge={`${dashboardData.invoiceCount} invoices`}
          icon={<FileText className="h-5 w-5" />}
          tone="emerald"
          onClick={() =>
            setFocusedKpi({
              title: "Processed documents",
              value: String(dashboardData.documentsProcessed),
              icon: <FileText className="h-6 w-6" />,
              explanation:
                "Documents are the operational source for invoices, dashboard signals and AI forecast history.",
              businessMeaning:
                "More complete document coverage improves the quality of overview insights and recommendations.",
            })
          }
        />
        <CommandKpiCard
          title="Data quality"
          value={`${dashboardData.documentExtractionEvaluation.fieldCompletenessRate.toFixed(1)}%`}
          description="Completeness of key fields extracted from the latest invoice."
          badge={dashboardData.documentExtractionEvaluation.extractionQualityLabel}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={getQualityTone(dashboardData.documentExtractionEvaluation.fieldCompletenessRate)}
          onClick={() =>
            setFocusedKpi({
              title: "Data quality",
              value: `${dashboardData.documentExtractionEvaluation.fieldCompletenessRate.toFixed(1)}%`,
              icon: <ClipboardCheck className="h-6 w-6" />,
              explanation:
                "Data quality tracks how many important invoice fields are available for analysis.",
              businessMeaning:
                "High completeness reduces manual checking and makes dashboards and forecasts more trustworthy.",
            })
          }
        />
        <CommandKpiCard
          title="Customer concentration"
          value={formatPercent(model.topCustomerShare)}
          description={model.topCustomerName ? `Top customer: ${model.topCustomerName}` : "No customer concentration yet"}
          badge={getConcentrationLabel(model.topCustomerShare)}
          icon={<Users className="h-5 w-5" />}
          tone={model.topCustomerShare > 50 ? "amber" : "violet"}
          onClick={() =>
            setFocusedKpi({
              title: "Customer concentration",
              value: formatPercent(model.topCustomerShare),
              icon: <Users className="h-6 w-6" />,
              explanation:
                "Customer concentration shows how much activity depends on the largest customer.",
              businessMeaning:
                "A high percentage can create dependency risk if that customer delays orders or payments.",
            })
          }
        />
        <CommandKpiCard
          title="Supplier stability"
          value={formatPercent(model.topSupplierShare)}
          description={model.topSupplierName ? `Top supplier: ${model.topSupplierName}` : "No supplier dependency yet"}
          badge={getConcentrationLabel(model.topSupplierShare)}
          icon={<Building2 className="h-5 w-5" />}
          tone={model.topSupplierShare > 50 ? "amber" : "slate"}
          onClick={() =>
            setFocusedKpi({
              title: "Supplier stability",
              value: formatPercent(model.topSupplierShare),
              icon: <Building2 className="h-6 w-6" />,
              explanation:
                "Supplier stability indicates whether expenses are spread across multiple suppliers or concentrated in one relationship.",
              businessMeaning:
                "A balanced supplier base can reduce operational pressure when one supplier changes pricing or terms.",
            })
          }
        />
      </section>

      <Tabs value={overviewTab} onValueChange={(value) => setOverviewTab(value as OverviewTab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:w-auto sm:grid-cols-4">
            <TabsTrigger value="status" className="rounded-xl">Status</TabsTrigger>
            <TabsTrigger value="activity" className="rounded-xl">Activity</TabsTrigger>
            <TabsTrigger value="risks" className="rounded-xl">Risks</TabsTrigger>
            <TabsTrigger value="actions" className="rounded-xl">Actions</TabsTrigger>
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
              eyebrow="Operations"
              title="Document Pipeline"
              description="Operational document flow from import to attention points."
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={model.pipelineStages} margin={{ left: 8, right: 12, top: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="stage" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} tickLine={false} />
                  <Tooltip content={<PipelineTooltip />} />
                  <Bar dataKey="value" name="Documents" radius={[12, 12, 0, 0]}>
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
              eyebrow="Pulse"
              title="Business Pulse"
              description="Activity index based on document and invoice volume, not raw revenue."
            >
              {model.pulseData.length === 0 ? (
                <CommandEmptyState message="Import documents to build the activity timeline." />
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={model.pulseData} margin={{ left: 8, right: 12, top: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="count" stroke="#64748b" fontSize={12} allowDecimals={false} />
                    <YAxis yAxisId="index" orientation="right" domain={[0, 100]} stroke="#64748b" fontSize={12} />
                    <Tooltip content={<PulseTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 14 }} />
                    <Bar
                      yAxisId="count"
                      dataKey="documents"
                      name="Documents"
                      fill="#93c5fd"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="invoices"
                      name="Invoices"
                      fill="#10b981"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="index"
                      type="monotone"
                      dataKey="activityIndex"
                      name="Business Pulse"
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
              eyebrow="Relationships"
              title="Commercial Relationships"
              description="Dependency and diversity across customers and suppliers."
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={model.relationshipData}
                  layout="vertical"
                  margin={{ left: 12, right: 48, top: 12, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="label" stroke="#64748b" width={138} fontSize={12} />
                  <Tooltip content={<RelationshipTooltip />} />
                  <Bar dataKey="value" name="Value" radius={[0, 10, 10, 0]}>
                    {model.relationshipData.map((entry, index) => (
                      <Cell key={entry.label} fill={relationshipColors[index % relationshipColors.length]} />
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
            Executive Command Center
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-white lg:text-4xl">
            Financial Overview
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            A fast business view of company health, document activity, commercial risk and AI-guided next steps.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMiniMetric label="Status" value={model.status.label} tone={model.status.tone} />
            <HeroMiniMetric label="Analyzed period" value={getPeriodLabel(selectedPeriod)} tone="blue" />
            <HeroMiniMetric label="Latest activity" value={model.latestActivityDate} tone="slate" />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-white text-slate-950 hover:bg-slate-100">
              <Link to="/app/documente">
                <UploadCloud className="h-4 w-4" />
                Import documents
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link to="/app/rapoarte">
                <BarChart3 className="h-4 w-4" />
                View reports
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link to="/app/ai-forecast">
                <BrainCircuit className="h-4 w-4" />
                AI analysis
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Business Health Score</p>
              <p className="mt-3 text-5xl font-semibold text-white">{model.healthScore}</p>
              <p className="mt-2 text-sm text-slate-300">out of 100</p>
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
  badge: string;
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
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone].badge)}>
          {badge}
        </span>
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
      <p className="text-xs font-semibold uppercase text-emerald-300">Snapshot</p>
      <h2 className="mt-1 text-lg font-semibold">What needs attention</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        A short read of the current operating position.
      </p>

      <div className="mt-5 space-y-3">
        <SnapshotRow
          label="Cash-flow pressure"
          value={model.cashFlowSignal}
          tone={model.cashFlowSignal === "Risk" ? "rose" : model.cashFlowSignal === "Attention" ? "amber" : "emerald"}
        />
        <SnapshotRow
          label="Document quality"
          value={model.qualitySignal}
          tone={model.qualitySignal === "Risk" ? "rose" : model.qualitySignal === "Attention" ? "amber" : "emerald"}
        />
        <SnapshotRow
          label="Relationship risk"
          value={model.relationshipSignal}
          tone={model.relationshipSignal === "Risk" ? "rose" : model.relationshipSignal === "Attention" ? "amber" : "emerald"}
        />
      </div>
    </aside>
  );
}

function ActivityDigest({ model }: { model: ReturnType<typeof buildExecutiveOverview> }) {
  const items = [
    {
      label: "Average monthly invoices",
      value: String(model.averageMonthlyInvoices),
      icon: <ReceiptText className="h-4 w-4" />,
    },
    {
      label: "Activity trend",
      value: model.activityTrend,
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: "Classified invoices",
      value: String(model.classifiedInvoiceCount),
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: "Needs attention",
      value: String(model.needsAttentionCount),
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  return (
    <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {items.map((item) => (
        <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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
      <p className="text-xs font-semibold uppercase text-amber-600">Risk scan</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-950">Dependency overview</h2>
      <div className="mt-5 space-y-4">
        <RiskMeter label="Top customer dependency" value={model.topCustomerShare} />
        <RiskMeter label="Top supplier dependency" value={model.topSupplierShare} />
        <RiskMeter label="Unclassified pressure" value={model.unclassifiedShare} />
      </div>
    </aside>
  );
}

function ActionQueue({ actions }: { actions: ActionItem[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-600">AI guidance</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">AI Action Queue</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Prioritized recommendations generated from the current overview signals.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/app/ai-forecast">
            Open AI analysis
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
              <span className="font-semibold text-slate-950">Next step: </span>
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
        <p className="text-xs font-semibold uppercase text-slate-500">Recent activity</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Latest invoices</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Recent invoices remain available for operational drill-down.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70">
              <TableHead>Invoice</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                  No invoices available yet.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-slate-50/70">
                  <TableCell className="font-medium text-slate-900">{invoice.invoiceNumber}</TableCell>
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
                        View
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
              <KpiDetail title="What it means" value={data.explanation} />
              <KpiDetail title="Business meaning" value={data.businessMeaning} />
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
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", darkToneClasses[tone])}>
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
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone].badge)}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", meterToneClasses[tone])} style={{ width: `${Math.min(value, 100)}%` }} />
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
      {priority}
    </span>
  );
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
      <TooltipRow label="Documents" value={String(point.documents)} color="bg-blue-300" />
      <TooltipRow label="Invoices" value={String(point.invoices)} color="bg-emerald-500" />
      <TooltipRow label="Business Pulse" value={`${point.activityIndex}/100`} color="bg-slate-950" />
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
      <p className="mt-1 text-slate-600">{stage.value} items</p>
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
    dashboardData.totalExpenses > 0 && topSupplier ? (topSupplier.value / dashboardData.totalExpenses) * 100 : 0;
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
    { label: "Active customers", value: dashboardData.customerCount, type: "count" as const },
    { label: "Active suppliers", value: dashboardData.supplierCount, type: "count" as const },
    { label: "Top customer share", value: topCustomer?.share ?? 0, type: "percent" as const },
    { label: "Top supplier share", value: topSupplierShare, type: "percent" as const },
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
    qualitySignal: qualityRate < 70 ? "Risk" : qualityRate < 90 ? "Attention" : "Stable",
    cashFlowSignal: prediction.cashFlow30Days < 0 ? "Risk" : prediction.cashFlow30Days < 1000 ? "Attention" : "Stable",
    relationshipSignal:
      Math.max(topCustomer?.share ?? 0, topSupplierShare) > 60
        ? "Risk"
        : Math.max(topCustomer?.share ?? 0, topSupplierShare) > 40
          ? "Attention"
          : "Stable",
    latestActivityDate: getLatestActivityDate(dashboardData),
    latestMonth,
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

  return buildBusinessPulse(Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)));
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

function buildPipelineStages(dashboardData: DashboardData, attentionCount: number): PipelineStage[] {
  return [
    {
      stage: "Imported",
      value: dashboardData.documentsProcessed,
      description: "Documents uploaded into the official document flow.",
      color: "#2563eb",
    },
    {
      stage: "Processed",
      value: dashboardData.invoiceCount,
      description: "Invoices extracted from imported XML documents.",
      color: "#10b981",
    },
    {
      stage: "Validated",
      value: dashboardData.classifiedInvoiceCount,
      description: "Invoices clearly associated with the current company.",
      color: "#8b5cf6",
    },
    {
      stage: "Needs attention",
      value: attentionCount,
      description: "Items that may need profile, CUI or field-quality review.",
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
      title: "High customer concentration",
      explanation: "A large share of activity depends on one customer relationship.",
      nextStep: "Open reports and review whether future revenue depends too much on this customer.",
    });
  }

  if (dashboardData.prediction.cashFlow30Days < 0) {
    actions.push({
      priority: "High",
      title: "Negative cash-flow pressure",
      explanation: "The 30-day cash-flow estimate is below zero.",
      nextStep: "Review collections, essential payments and the AI forecast before committing new expenses.",
    });
  }

  if (topSupplierShare > 50) {
    actions.push({
      priority: "Medium",
      title: "Supplier dependency risk",
      explanation: "Expenses are concentrated around a primary supplier.",
      nextStep: "Check supplier terms and consider alternative suppliers for critical purchases.",
    });
  }

  if (dashboardData.documentExtractionEvaluation.fieldCompletenessRate < 85) {
    actions.push({
      priority: "Medium",
      title: "Low data quality",
      explanation: "Some important invoice fields are missing from the latest extraction quality check.",
      nextStep: "Review imported documents and re-import problematic XML files if needed.",
    });
  }

  if (monthlyPointsCount < 3) {
    actions.push({
      priority: "Low",
      title: "Insufficient monthly history",
      explanation: "The overview has limited monthly activity to compare against.",
      nextStep: "Import more historical e-Factura XML files to improve trend visibility.",
    });
  }

  if (unclassifiedShare > 10) {
    actions.push({
      priority: "Medium",
      title: "Invoices need company matching",
      explanation: "Some invoices could not be clearly matched to the company profile.",
      nextStep: "Verify the company CUI in company settings and re-check unmatched invoices.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: "Low",
      title: "Keep the workflow current",
      explanation: "The overview does not show urgent operational pressure right now.",
      nextStep: "Continue importing e-Factura XML files after each business cycle.",
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
  const concentrationPenalty = Math.max(customerShare, supplierShare) > 60 ? 8 : Math.max(customerShare, supplierShare) > 40 ? 4 : 0;
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
      label: "Risk",
      tone: "rose" as const,
      description:
        "The company needs attention because risk, cash-flow or data signals are under pressure.",
    };
  }

  if (healthScore < 75 || risk === "Mediu" || qualityRate < 85) {
    return {
      label: "Attention",
      tone: "amber" as const,
      description:
        "The company is operating, but a few signals should be monitored before the next decisions.",
    };
  }

  return {
    label: "Stable",
    tone: "emerald" as const,
    description: "The company looks stable based on current documents, activity and forecast signals.",
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
    return "New baseline";
  }

  const currentActivity = latest.invoices + latest.documents;
  const previousActivity = previous.invoices + previous.documents;
  const change = getPercentChange(currentActivity, previousActivity);

  if (change > 5) {
    return `+${change.toFixed(1)}%`;
  }

  if (change < -5) {
    return `${change.toFixed(1)}%`;
  }

  return "Stable";
}

function getConcentrationLabel(value: number) {
  if (value > 60) {
    return "High";
  }

  if (value > 40) {
    return "Medium";
  }

  return "Balanced";
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
    return "Last 30 days";
  }

  if (period === "90") {
    return "Last 90 days";
  }

  return "All data";
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

function getPercentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / previous) * 100;
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
