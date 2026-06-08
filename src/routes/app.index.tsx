import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Percent,
  ReceiptText,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { AdminPanel, StatCard } from "@/components/admin-ui";
import { ChartCard } from "@/components/chart-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard - IMMapp" }] }),
  component: Dashboard,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type InvoiceFilter = "all" | "processed" | "recent";

type FocusedKpi = {
  title: string;
  value: string;
  explanation: string;
  formula: string;
  businessMeaning: string;
  icon: ReactNode;
} | null;

const chartColors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [focusedKpi, setFocusedKpi] = useState<FocusedKpi>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");

  async function loadDashboard() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getDashboardData();
      setDashboardData(data);
    } catch {
      setErrorMessage("Nu s-au putut incarca datele financiare.");
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

  const monthlyData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    return dashboardData.monthlyInvoiceValue.map((item, index) => ({
      month: item.month,
      venituri: item.value,
      documente: dashboardData.docsPerMonth[index]?.docs ?? 0,
    }));
  }, [dashboardData]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
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

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage || "Nu s-au putut incarca datele pentru dashboard."}
        </div>
      </div>
    );
  }

  const prediction = dashboardData.prediction;
  const currentRevenue =
    monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].venituri : 0;
  const previousRevenue =
    monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].venituri : 0;
  const revenueTrendPercent = getPercentChange(currentRevenue, previousRevenue);
  const avgInvoiceValue =
    dashboardData.invoiceCount > 0
      ? dashboardData.totalValue / dashboardData.invoiceCount
      : 0;
  const filteredInvoices = filterInvoices(
    dashboardData.latestInvoices,
    invoiceFilter,
  );
  const healthScore = getFinancialHealthScore(
    prediction.confidenceLevel,
    prediction.riskLevel,
    prediction.cashFlow30Days,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Monitorizeaza veniturile, facturile, TVA-ul si predictiile financiare pentru compania ta."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          <StatCard
            title="Venit total"
            value={formatRON(dashboardData.totalValue)}
            description="Suma facturilor procesate din fluxul e-Factura XML."
            trend={`${formatPercent(revenueTrendPercent)} lunar`}
            icon={<Wallet className="h-5 w-5" />}
            tone="blue"
            onClick={() =>
              setFocusedKpi({
                title: "Venit total",
                value: formatRON(dashboardData.totalValue),
                icon: <Wallet className="h-6 w-6" />,
                explanation:
                  "Venitul total reprezinta valoarea cumulata a facturilor procesate in IMMapp.",
                formula:
                  "Venit total = suma valorilor totale ale facturilor e-Factura importate.",
                businessMeaning:
                  "Indicatorul arata volumul financiar procesat si ajuta la evaluarea dimensiunii activitatii curente.",
              })
            }
          />

          <StatCard
            title="Facturi procesate"
            value={String(dashboardData.invoiceCount)}
            description={`Valoare medie: ${formatRON(avgInvoiceValue)}`}
            trend={`${dashboardData.documentsProcessed} documente`}
            icon={<ReceiptText className="h-5 w-5" />}
            tone="emerald"
            onClick={() =>
              setFocusedKpi({
                title: "Facturi procesate",
                value: String(dashboardData.invoiceCount),
                icon: <ReceiptText className="h-6 w-6" />,
                explanation:
                  "Facturile procesate sunt documentele e-Factura XML citite si incluse in indicatorii financiari.",
                formula:
                  "Facturi procesate = numarul facturilor valide extrase din XML-urile incarcate.",
                businessMeaning:
                  "Un volum mai mare de facturi imbunatateste vizibilitatea asupra activitatii si ajuta predictiile AI sa fie mai stabile.",
              })
            }
          />
        </div>

        <FinancialHealthCard
          score={healthScore}
          confidence={prediction.confidenceLevel}
          risk={prediction.riskLevel}
          cashFlow={prediction.cashFlow30Days}
          vat={dashboardData.totalVat}
          paymentRisk={prediction.paymentDelayRisk}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Evolutie venituri"
          description="Valoare lunara pe baza facturilor procesate"
          className="border-slate-200 bg-white shadow-sm xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                formatter={(value: number) => formatRON(Number(value))}
                contentStyle={tooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="venituri"
                name="Venituri"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {prediction.confidenceLevel}
              </span>
            </div>

            <h2 className="mt-5 text-lg font-semibold text-slate-900">Predictie AI</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Estimare pentru perioada {prediction.predictedPeriod}, calculata din datele
              financiare curente.
            </p>

            <div className="mt-5 space-y-3">
              <MiniInfo label="Venit estimat" value={formatRON(prediction.revenueForecast)} />
              <MiniInfo label="Model selectat" value={prediction.selectedModel} />
              <MiniInfo label="Scor incredere" value={`${prediction.confidenceScore}%`} />
              <MiniInfo label="Nivel risc" value={dashboardData.riskClassification.paymentRiskClass} />
              <MiniInfo label="Risc plata" value={prediction.paymentDelayRisk} />
            </div>

            <Button className="mt-5 w-full" asChild>
              <Link to="/app/ai-forecast">Vezi predictiile</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AdminPanel
          title="Statistici"
          description="Compara venituri si documente procesate pe perioada recenta"
          className="xl:col-span-2"
          contentClassName="p-0"
        >
          <Tabs defaultValue="overview" className="p-5">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="venituri">Venituri</TabsTrigger>
              <TabsTrigger value="documente">Documente</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => formatRON(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="venituri"
                    name="Venituri"
                    stroke="#2563eb"
                    fill="url(#revenueGradient)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="venituri">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => formatRON(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="venituri" name="Venituri" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="documente">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="documente" name="Documente" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </AdminPanel>

        <AdminPanel
          title="Structura TVA"
          description="TVA si baza facturilor procesate"
        >
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={dashboardData.vatDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={4}
              >
                {dashboardData.vatDistribution.map((_, index) => (
                  <Cell key={index} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatRON(Number(value))}
                contentStyle={tooltipStyle}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-3">
            {dashboardData.topSuppliers.slice(0, 3).map((supplier, index) => (
              <div
                key={supplier.name}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {supplier.name}
                  </p>
                  <p className="text-xs text-slate-500">Furnizor #{index + 1}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {formatRON(supplier.value)}
                </p>
              </div>
            ))}
          </div>
        </AdminPanel>
      </section>

      <AdminPanel
        title="Facturi recente"
        description="Ultimele facturi extrase din fisiere XML e-Factura"
        action={
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={invoiceFilter === "all"}
              onClick={() => setInvoiceFilter("all")}
            >
              Toate
            </FilterButton>
            <FilterButton
              active={invoiceFilter === "processed"}
              onClick={() => setInvoiceFilter("processed")}
            >
              Procesate
            </FilterButton>
            <FilterButton
              active={invoiceFilter === "recent"}
              onClick={() => setInvoiceFilter("recent")}
            >
              Recente
            </FilterButton>
          </div>
        }
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numar factura</TableHead>
                <TableHead>Furnizor</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-500">
                    Nu exista facturi pentru filtrul selectat.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium text-slate-900">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{invoice.supplierName}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRON(invoice.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(invoice.vat)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={normalizeStatus(invoice.status)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          title="Vezi factura"
                          aria-label={`Vezi factura ${invoice.invoiceNumber}`}
                          asChild
                        >
                          <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Actiuni"
                              aria-label={`Actiuni pentru factura ${invoice.invoiceNumber}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                                Deschide detalii
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>Export in curand</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </AdminPanel>

      <KpiDialog data={focusedKpi} onClose={() => setFocusedKpi(null)} />
    </div>
  );
}

function FinancialHealthCard({
  score,
  confidence,
  risk,
  cashFlow,
  vat,
  paymentRisk,
}: {
  score: number;
  confidence: string;
  risk: string;
  cashFlow: number;
  vat: number;
  paymentRisk: string;
}) {
  return (
    <Card className="overflow-hidden border-0 bg-[#111827] text-white shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-300">Sanatate financiara</p>
            <h2 className="mt-2 text-2xl font-semibold">{score}%</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Scor orientativ bazat pe incredere, risc si cash-flow.
            </p>
          </div>

          <div
            className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#3b82f6 ${score * 3.6}deg, #1f2937 0deg)`,
            }}
          >
            <div className="grid h-24 w-24 place-items-center rounded-full bg-[#111827]">
              <div className="text-center">
                <p className="text-2xl font-semibold">{score}</p>
                <p className="text-xs text-slate-400">scor</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <DarkMetric label="TVA" value={formatRON(vat)} />
          <DarkMetric label="Cash-flow 30 zile" value={formatRON(cashFlow)} />
          <DarkMetric label="Risc plata" value={paymentRisk} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
            Incredere: {confidence}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
            Risc: {risk}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiDialog({
  data,
  onClose,
}: {
  data: FocusedKpi;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-slate-200 bg-white">
        {data && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {data.icon}
              </div>
              <DialogTitle>{data.title}</DialogTitle>
              <DialogDescription>{data.value}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <KpiDetail title="Ce inseamna" value={data.explanation} />
              <KpiDetail title="Formula" value={data.formula} />
              <KpiDetail title="Semnificatie business" value={data.businessMeaning} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KpiDetail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 p-3">
      <p className="text-xs leading-5 text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-white">
        {value}
      </p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(!active && "bg-white")}
    >
      {children}
    </Button>
  );
}

function filterInvoices(
  invoices: DashboardData["latestInvoices"],
  filter: InvoiceFilter,
) {
  if (filter === "processed") {
    return invoices.filter((invoice) => normalizeStatus(invoice.status) === "Activ");
  }

  if (filter === "recent") {
    return invoices.filter((invoice) => isRecentDate(invoice.issueDate));
  }

  return invoices;
}

function isRecentDate(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return date.getTime() >= thirtyDaysAgo;
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Activ" as any;
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ" as any;
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv" as any;
  }

  return "Activ" as any;
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
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function getFinancialHealthScore(
  confidence: "Scazut" | "Mediu" | "Ridicat",
  risk: "Scazut" | "Mediu" | "Ridicat",
  cashFlow30Days: number,
) {
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

  const cashFlowAdjustment = cashFlow30Days >= 0 ? 8 : -8;
  return Math.max(35, Math.min(94, confidenceBase - riskPenalty + cashFlowAdjustment));
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
};
