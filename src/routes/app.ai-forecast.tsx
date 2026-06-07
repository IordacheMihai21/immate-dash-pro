import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  FileSpreadsheet,
  Loader2,
  Percent,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPanel, EmptyState, InfoBanner, StatCard } from "@/components/admin-ui";
import { ChartCard } from "@/components/chart-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardData } from "@/lib/dashboardService";
import { analyzeSimulationDataset } from "@/lib/forecastService";
import { formatRON } from "@/lib/mock-data";
import type { ClientDatasetParseResult } from "@/lib/clientDatasetParser";
import type { AiFinancialForecast } from "@/lib/predictionService";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ai-forecast")({
  head: () => ({ meta: [{ title: "AI Forecast - IMMapp" }] }),
  component: AiForecastPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function AiForecastPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [clientDataset, setClientDataset] = useState<ClientDatasetParseResult | null>(null);
  const [clientDatasetPrediction, setClientDatasetPrediction] =
    useState<AiFinancialForecast | null>(null);
  const [forecastStatus, setForecastStatus] = useState(() =>
    typeof window === "undefined"
      ? "updated"
      : localStorage.getItem("immapp:ai-forecast-status") ?? "updated",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingForecast, setIsUpdatingForecast] = useState(false);
  const [isParsingClientDataset, setIsParsingClientDataset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const dashboard = await getDashboardData();
      setDashboardData(dashboard);
    } catch {
      setErrorMessage("Nu s-au putut incarca predictiile financiare.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateForecast() {
    try {
      setIsUpdatingForecast(true);

      const dashboard = await getDashboardData();

      setDashboardData(dashboard);
      localStorage.setItem("immapp:ai-forecast-status", "updated");
      setForecastStatus("updated");

      toast.success("Predictia AI a fost actualizata cu datele financiare curente.");
    } catch {
      toast.error("Predictia AI nu a putut fi actualizata. Incearca din nou.");
    } finally {
      setIsUpdatingForecast(false);
    }
  }

  async function handleClientDatasetUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast.error("Incarca un fisier CSV, XLS sau XLSX pentru simulare.");
      return;
    }

    try {
      setIsParsingClientDataset(true);

      const { dataset, prediction } = await analyzeSimulationDataset(file);

      setClientDataset(dataset);
      setClientDatasetPrediction(prediction);

      toast.success("Fisierul a fost procesat si simularea AI a fost generata.");
    } catch {
      toast.error("Date insuficiente pentru o predictie stabila.");
      setClientDataset(null);
      setClientDatasetPrediction(null);
    } finally {
      setIsParsingClientDataset(false);
    }
  }

  useEffect(() => {
    loadData();

    const handleForecastOutdated = () => {
      setForecastStatus("outdated");
    };

    window.addEventListener("immapp:ai-forecast-outdated", handleForecastOutdated);

    return () => {
      window.removeEventListener("immapp:ai-forecast-outdated", handleForecastOutdated);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca modulul AI Forecast...
      </div>
    );
  }

  if (errorMessage || !dashboardData) {
    return (
      <div>
        <PageHeader
          title="AI Forecast"
          description="Estimari financiare clare pentru IMM-uri."
        />

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage || "Nu s-au putut incarca datele predictive."}
        </div>
      </div>
    );
  }

  const prediction = dashboardData.prediction;
  const cashFlowData = [
    { period: "30 zile", value: prediction.cashFlow30Days },
    { period: "60 zile", value: prediction.cashFlow60Days },
    { period: "90 zile", value: prediction.cashFlow90Days },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Forecast"
        description="Predictii pe date reale si simulari separate pentru scenarii de business."
      />

      <AdminPanel
        title="Predictii pe date reale"
        description="Estimari generate din documentele e-Factura XML importate de companie."
        action={
          <Button onClick={handleUpdateForecast} disabled={isUpdatingForecast}>
            {isUpdatingForecast ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isUpdatingForecast ? "Se actualizeaza..." : "Actualizeaza predictia AI"}
          </Button>
        }
      >
        <div className="space-y-5">
          {forecastStatus === "outdated" && (
            <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
              Datele financiare au fost modificate. Actualizeaza predictia AI pentru ca
              rezultatele sa reflecte documentele curente.
            </InfoBanner>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Venit estimat"
              value={formatRON(prediction.revenueForecast)}
              description={`Perioada: ${prediction.predictedPeriod}`}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
            />
            <StatCard
              title="Profit estimat"
              value={formatRON(prediction.profitForecast)}
              description={`Tendinta: ${prediction.trendLabel}`}
              icon={<BarChart3 className="h-5 w-5" />}
              tone={prediction.profitForecast >= 0 ? "emerald" : "rose"}
            />
            <StatCard
              title="TVA estimata"
              value={formatRON(prediction.vatForecast)}
              description="Impact fiscal estimat"
              icon={<Percent className="h-5 w-5" />}
              tone="amber"
            />
            <StatCard
              title="Cash-flow 30 zile"
              value={formatRON(prediction.cashFlow30Days)}
              description="Scenariu pe termen scurt"
              icon={<Wallet className="h-5 w-5" />}
              tone={prediction.cashFlow30Days >= 0 ? "emerald" : "rose"}
            />
            <StatCard
              title="Risc plata"
              value={prediction.paymentDelayRisk}
              description="Semnal pentru intarzieri posibile"
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={prediction.paymentDelayRisk === "Ridicat" ? "rose" : "slate"}
            />
            <StatCard
              title="Nivel incredere"
              value={prediction.confidenceLevel}
              description={
                dashboardData.monthlyInvoiceValue.length < 3
                  ? "Date insuficiente pentru o predictie stabila."
                  : "Indicator calculat din istoricul curent"
              }
              icon={<Target className="h-5 w-5" />}
              tone="blue"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Forecast 30/60/90 zile"
              description="Scenariu de cash-flow pentru urmatoarele perioade"
              className="border-slate-200 bg-white shadow-sm xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => formatRON(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="value" name="Cash-flow" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card className="border-slate-200 bg-slate-50 shadow-none">
              <CardContent className="p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  Interpretare AI
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {prediction.explanation}
                </p>
                <div className="mt-5 rounded-xl border border-blue-100 bg-white p-4 text-sm leading-6 text-slate-600">
                  Proprietarul poate folosi aceste semnale pentru decizii de incasari,
                  cheltuieli si prioritizare operationala.
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {prediction.clientRiskSignals.map((signal) => (
              <RiskCard
                key={signal.clientName}
                icon={<AlertTriangle className="h-5 w-5" />}
                title={signal.clientName}
                metrics={[
                  ["Risc client", signal.riskLevel],
                  ["Probabilitate intarziere", `${Math.round(signal.delayProbability * 100)}%`],
                  ["Intarziere medie", `${signal.averageDelayDays} zile`],
                ]}
                description={signal.explanation}
              />
            ))}

            {prediction.demandSignals.map((signal) => (
              <RiskCard
                key={signal.category}
                icon={<Activity className="h-5 w-5" />}
                title={signal.category}
                metrics={[
                  ["Valoare curenta", formatRON(signal.currentValue)],
                  ["Valoare anterioara", formatRON(signal.previousValue)],
                  ["Trend", `${signal.trendLabel} (${signal.trendPercent.toFixed(1)}%)`],
                ]}
                description={`Estimare categorie: ${formatRON(signal.forecastValue)}.`}
              />
            ))}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Simulare cu Excel / CSV"
        description="Fisierele incarcate aici sunt folosite doar pentru analiza si scenarii. Nu modifica dashboard-ul principal si nu sunt tratate ca e-Facturi."
        action={
          <label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                handleClientDatasetUpload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />

            <Button type="button" disabled={isParsingClientDataset} asChild>
              <span>
                {isParsingClientDataset ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Simuleaza cu date proprii
              </span>
            </Button>
          </label>
        }
      >
        <div className="space-y-5">
          <InfoBanner icon={<ShieldCheck className="h-4 w-4" />}>
            Fisierele incarcate aici sunt folosite doar pentru analiza si scenarii.
            Nu modifica dashboard-ul principal si nu sunt tratate ca e-Facturi.
          </InfoBanner>

          {!clientDataset || !clientDatasetPrediction ? (
            <EmptyState
              title="Nicio simulare incarcata"
              description="Incarca un fisier CSV, XLS sau XLSX pentru a calcula o simulare separata."
              icon={<FileSpreadsheet className="h-6 w-6" />}
            />
          ) : (
            <SimulationResult
              dataset={clientDataset}
              prediction={clientDatasetPrediction}
            />
          )}
        </div>
      </AdminPanel>
    </div>
  );
}

function SimulationResult({
  dataset,
  prediction,
}: {
  dataset: ClientDatasetParseResult;
  prediction: AiFinancialForecast;
}) {
  const weakData = dataset.monthlyPoints.length < 3;

  return (
    <div className="space-y-5">
      {weakData && (
        <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          Date insuficiente pentru o predictie stabila.
        </InfoBanner>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Fisier"
          value={dataset.datasetName}
          description={`${dataset.validRows} randuri valide din ${dataset.rowCount}`}
          icon={<FileSpreadsheet className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          title="Venit estimat"
          value={formatRON(prediction.revenueForecast)}
          description={`Perioada: ${prediction.predictedPeriod}`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Valoare medie"
          value={formatRON(
            dataset.validRows > 0
              ? dataset.monthlyPoints.reduce((sum, point) => sum + point.revenue, 0) /
                  dataset.validRows
              : 0,
          )}
          description="Media randurilor valide"
          icon={<Wallet className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          title="Nivel incredere"
          value={prediction.confidenceLevel}
          description={weakData ? "Date insuficiente pentru o predictie stabila." : "Calitate estimare: buna"}
          icon={<Target className="h-5 w-5" />}
          tone={weakData ? "amber" : "blue"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Evolutie venituri simulare"
          description="Venituri lunare extrase din fisierul incarcat"
          className="border-slate-200 bg-white shadow-sm xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dataset.monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                formatter={(value: number) => formatRON(Number(value))}
                contentStyle={tooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Venituri"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="border-slate-200 bg-slate-50 shadow-none">
          <CardContent className="p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Interpretare simulare
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {prediction.explanation}
            </p>
            <div className="mt-5 rounded-xl border border-emerald-100 bg-white p-4 text-sm leading-6 text-slate-600">
              Acest rezultat este separat de datele oficiale si poate fi folosit pentru
              scenarii, planificare si comparatii rapide.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RiskCard({
  icon,
  title,
  metrics,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  metrics: [string, string][];
  description: string;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-3 text-slate-600">{icon}</div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
};
