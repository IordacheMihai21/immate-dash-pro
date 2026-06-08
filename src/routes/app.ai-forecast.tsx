import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
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
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPanel, InfoBanner, StatCard } from "@/components/admin-ui";
import { ChartCard } from "@/components/chart-card";
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { AiFinancialForecast } from "@/lib/predictionService";
import type { RiskClassificationResult } from "@/lib/riskClassificationService";
import type { DocumentExtractionEvaluation } from "@/lib/extractionEvaluationService";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ai-forecast")({
  head: () => ({ meta: [{ title: "AI Forecast - IMMapp" }] }),
  component: AiForecastPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function AiForecastPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [forecastStatus, setForecastStatus] = useState(() =>
    typeof window === "undefined"
      ? "updated"
      : (localStorage.getItem("immapp:ai-forecast-status") ?? "updated"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingForecast, setIsUpdatingForecast] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const dashboard = await getDashboardData();
      setDashboardData(dashboard);
    } catch {
      setErrorMessage("Nu s-au putut încărca predicțiile financiare.");
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

      toast.success("Predicția AI a fost actualizată cu datele financiare curente.");
    } catch {
      toast.error("Predicția AI nu a putut fi actualizată. Încearcă din nou.");
    } finally {
      setIsUpdatingForecast(false);
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
        Se încarcă modulul AI Forecast...
      </div>
    );
  }

  if (errorMessage || !dashboardData) {
    return (
      <div>
        <PageHeader
          title="AI Forecast"
          description="Predicții generate pe baza e-Facturilor XML încărcate în IMMapp."
        />

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage || "Nu s-au putut încărca datele predictive."}
        </div>
      </div>
    );
  }

  const prediction = dashboardData.prediction;
  const riskClassification = dashboardData.riskClassification;
  const extractionEvaluation = dashboardData.documentExtractionEvaluation;
  const hasOfficialForecast = dashboardData.invoiceCount > 0;
  const cashFlowData = [
    { period: "30 zile", value: prediction.cashFlow30Days },
    { period: "60 zile", value: prediction.cashFlow60Days },
    { period: "90 zile", value: prediction.cashFlow90Days },
  ];
  const revenueComparisonData = buildRevenueComparisonData(prediction);
  const businessStatus = getBusinessStatus(riskClassification.paymentRiskClass);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Forecast"
        description="Predicții generate pe baza e-Facturilor XML încărcate în IMMapp."
      />

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Predicții pe baza documentelor tale
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Estimările sunt calculate folosind e-Facturile XML încărcate în secțiunea Documente.
            După fiecare import sau ștergere de documente, actualizează predicția pentru rezultate
            la zi.
          </p>
        </div>

        <InfoBanner icon={<ShieldCheck className="h-4 w-4" />}>
          Flux oficial: Documente e-Factura XML → facturi extrase → istoric financiar → predicții AI
          Forecast.
        </InfoBanner>

        {forecastStatus === "outdated" && (
          <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            Datele financiare au fost modificate. Actualizează predicția AI pentru ca rezultatele să
            reflecte documentele curente.
          </InfoBanner>
        )}

        {!hasOfficialForecast ? (
          <OfficialForecastEmptyState />
        ) : (
          <>
            <BusinessSummaryCard
              prediction={prediction}
              riskClassification={riskClassification}
              statusLabel={businessStatus.label}
              statusClassName={businessStatus.className}
              isUpdatingForecast={isUpdatingForecast}
              onUpdateForecast={handleUpdateForecast}
            />

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Venit estimat"
                value={formatRON(prediction.revenueForecast)}
                description={`Perioada: ${prediction.predictedPeriod}`}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="blue"
              />
              <StatCard
                title="Cheltuieli estimate"
                value={formatRON(prediction.expensesForecast)}
                description="Costuri estimate pentru perioada următoare"
                icon={<Wallet className="h-5 w-5" />}
                tone="slate"
              />
              <StatCard
                title="Profit / Pierdere estimată"
                value={formatRON(prediction.profitForecast)}
                description={
                  prediction.profitForecast >= 0
                    ? "Rezultat estimat pozitiv"
                    : "Presiune pe profitabilitate"
                }
                icon={<Percent className="h-5 w-5" />}
                tone={prediction.profitForecast >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                title="TVA estimată"
                value={formatRON(prediction.vatForecast)}
                description="TVA estimată din facturile procesate"
                icon={<Percent className="h-5 w-5" />}
                tone="amber"
              />
              <StatCard
                title="Cash-flow 30 zile"
                value={formatRON(prediction.cashFlow30Days)}
                description="Lichiditate estimată pe termen scurt"
                icon={<Wallet className="h-5 w-5" />}
                tone={prediction.cashFlow30Days >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                title="Cash-flow 60 zile"
                value={formatRON(prediction.cashFlow60Days)}
                description="Lichiditate estimată pe termen mediu"
                icon={<Wallet className="h-5 w-5" />}
                tone={prediction.cashFlow60Days >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                title="Cash-flow 90 zile"
                value={formatRON(prediction.cashFlow90Days)}
                description="Lichiditate estimată pentru următoarele 3 luni"
                icon={<Wallet className="h-5 w-5" />}
                tone={prediction.cashFlow90Days >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                title="Risc de plată"
                value={formatRiskClass(riskClassification.paymentRiskClass)}
                description="Nivel estimat pentru întârzieri posibile"
                icon={<AlertTriangle className="h-5 w-5" />}
                tone={
                  riskClassification.paymentRiskClass === "Ridicat"
                    ? "rose"
                    : riskClassification.paymentRiskClass === "Mediu"
                      ? "amber"
                      : "emerald"
                }
              />
              <StatCard
                title="Nivel de încredere"
                value={prediction.confidenceLevel}
                description="Bazat pe istoricul financiar disponibil"
                icon={<Target className="h-5 w-5" />}
                tone="blue"
              />
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                title="Cash-flow estimat"
                description="Estimare pentru următoarele 30, 60 și 90 de zile"
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
                    <Bar
                      dataKey="value"
                      name="Cash-flow estimat"
                      fill="#2563eb"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <BusinessInterpretationCard
                prediction={prediction}
                riskClassification={riskClassification}
              />
            </div>

            <RevenueComparisonChart data={revenueComparisonData} />

            <RecommendationsCard prediction={prediction} riskClassification={riskClassification} />
          </>
        )}
      </section>

      <MethodologyAccordion
        prediction={prediction}
        riskClassification={riskClassification}
        extractionEvaluation={extractionEvaluation}
      />
    </div>
  );
}

type RevenueComparisonPoint = {
  period: string;
  actual: number | null;
  predicted: number | null;
  forecast30Days: number | null;
};

function RevenueComparisonChart({ data }: { data: RevenueComparisonPoint[] }) {
  return (
    <ChartCard
      title="Venit real vs venit estimat"
      description="Compara veniturile reale din e-Facturile incarcate cu estimarile generate de AI si directia probabila pentru urmatoarele 30 de zile."
      className="border-slate-200 bg-white shadow-sm"
    >
      {data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          Nu exista suficient istoric pentru comparatia real vs estimat.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              formatter={(value: number) => formatRON(Number(value))}
              contentStyle={tooltipStyle}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="actual"
              name="Venit real"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Venit estimat"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="forecast30Days"
              name="Directie 30 zile"
              stroke="#f59e0b"
              strokeDasharray="6 4"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function BusinessSummaryCard({
  prediction,
  riskClassification,
  statusLabel,
  statusClassName,
  isUpdatingForecast,
  onUpdateForecast,
}: {
  prediction: AiFinancialForecast;
  riskClassification: RiskClassificationResult;
  statusLabel: string;
  statusClassName: string;
  isUpdatingForecast: boolean;
  onUpdateForecast: () => void;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Analiza financiară AI</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Concluzie rapidă calculată din e-Facturile XML încărcate.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusClassName}`}>
                {statusLabel}
              </span>
            </div>

            <p className="text-base leading-7 text-slate-700">
              {getBusinessSummary(prediction, riskClassification)}
            </p>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              <span className="font-semibold">Recomandare principală: </span>
              {getPrimaryRecommendation(prediction, riskClassification)}
            </div>
          </div>

          <Button onClick={onUpdateForecast} disabled={isUpdatingForecast}>
            {isUpdatingForecast ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isUpdatingForecast ? "Se actualizează..." : "Actualizează predicția AI"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OfficialForecastEmptyState() {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-blue-50 p-4 text-blue-600">
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          Nu există suficiente documente pentru predicție
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Încarcă una sau mai multe e-Facturi XML în secțiunea Documente pentru ca IMMapp să poată
          calcula estimări financiare.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/app/documente">
            <Upload className="h-4 w-4" />
            Încarcă e-Factura XML
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function BusinessInterpretationCard({
  prediction,
  riskClassification,
}: {
  prediction: AiFinancialForecast;
  riskClassification: RiskClassificationResult;
}) {
  return (
    <Card className="border-slate-200 bg-slate-50 shadow-none">
      <CardContent className="p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          Ce înseamnă asta pentru afacerea ta
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {getBusinessInterpretation(prediction, riskClassification)}
        </p>
      </CardContent>
    </Card>
  );
}

function RecommendationsCard({
  prediction,
  riskClassification,
}: {
  prediction: AiFinancialForecast;
  riskClassification: RiskClassificationResult;
}) {
  return (
    <AdminPanel title="Recomandări" description="Acțiuni practice pentru perioada următoare.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {getRecommendations(prediction, riskClassification).map((recommendation) => (
          <div
            key={recommendation}
            className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
          >
            {recommendation}
          </div>
        ))}
      </div>
    </AdminPanel>
  );
}

function MethodologyAccordion({
  prediction,
  riskClassification,
  extractionEvaluation,
}: {
  prediction: AiFinancialForecast;
  riskClassification: RiskClassificationResult;
  extractionEvaluation: DocumentExtractionEvaluation;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value="methodology" className="border-0">
          <AccordionTrigger className="px-5 py-5 text-base font-semibold text-slate-900 hover:no-underline">
            Metodologie și evaluare
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <div className="space-y-5">
              <InfoBanner icon={<BrainCircuit className="h-4 w-4" />}>
                Aceste metrici sunt folosite pentru validarea academică și evaluarea performanței
                modelului. Predicțiile afișate clientului sunt generate exclusiv din documentele
                e-Factura XML încărcate.
              </InfoBanner>

              <ForecastEvaluationCard prediction={prediction} />
              <RiskClassificationCard riskClassification={riskClassification} />
              <ExtractionQualityCard evaluation={extractionEvaluation} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

function ForecastEvaluationCard({ prediction }: { prediction: AiFinancialForecast }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Detalii evaluare model</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Predicțiile numerice sunt evaluate cu MAE, MAPE și RMSE.
          </p>
        </div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          Model selectat: {prediction.selectedModel}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EvaluationMetric label="MAE" value={formatRON(prediction.mae)} />
        <EvaluationMetric label="MAPE" value={`${prediction.mape.toFixed(2)}%`} />
        <EvaluationMetric label="RMSE" value={formatRON(prediction.rmse)} />
        <EvaluationMetric label="Scor încredere" value={`${prediction.confidenceScore}%`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-100">
          <div className="border-b border-slate-100 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Comparație modele</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">MAPE</TableHead>
                  <TableHead className="text-right">RMSE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prediction.modelComparison.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                      Date insuficiente pentru o evaluare stabilă.
                    </TableCell>
                  </TableRow>
                ) : (
                  prediction.modelComparison.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium text-slate-900">{model.model}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(model.mae)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {model.mape.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(model.rmse)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 p-4">
          <h4 className="mb-4 text-sm font-semibold text-slate-900">Real vs estimat</h4>
          {prediction.realVsPredicted.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
              Date insuficiente pentru o evaluare stabilă.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={prediction.realVsPredicted}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  formatter={(value: number) => formatRON(Number(value))}
                  contentStyle={tooltipStyle}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Real"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Estimat"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {prediction.businessExplanation}
      </p>
    </div>
  );
}

function RiskClassificationCard({
  riskClassification,
}: {
  riskClassification: RiskClassificationResult;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">Clasificare risc</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Metricile Precision, Recall și F1 Score sunt folosite pentru clasificarea nivelului de
          risc, nu pentru predicțiile numerice.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <EvaluationMetric label="Risc plată" value={riskClassification.paymentRiskClass} />
        <EvaluationMetric label="Risc cash-flow" value={riskClassification.cashFlowRiskClass} />
        <EvaluationMetric label="Trend financiar" value={riskClassification.financialTrendClass} />
        <EvaluationMetric label="Accuracy" value={formatPercent(riskClassification.accuracy)} />
        <EvaluationMetric label="Precision" value={formatPercent(riskClassification.precision)} />
        <EvaluationMetric label="Recall" value={formatPercent(riskClassification.recall)} />
        <EvaluationMetric label="F1 Score" value={formatPercent(riskClassification.f1Score)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-100">
          <div className="border-b border-slate-100 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Confusion Matrix</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actual</TableHead>
                  <TableHead>Prezicere</TableHead>
                  <TableHead className="text-right">Număr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskClassification.confusionMatrix.map((item) => (
                  <TableRow key={`${item.actual}-${item.predicted}`}>
                    <TableCell>{item.actual}</TableCell>
                    <TableCell>{item.predicted}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Factori de risc</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {riskClassification.riskFactors.map((factor) => (
              <li key={factor} className="rounded-lg bg-slate-50 px-3 py-2">
                {factor}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-6 text-slate-600">{riskClassification.explanation}</p>
        </div>
      </div>
    </div>
  );
}

function ExtractionQualityCard({ evaluation }: { evaluation: DocumentExtractionEvaluation }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">Calitatea extragerii datelor</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Evaluarea măsoară completitudinea câmpurilor extrase din XML e-Factura.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EvaluationMetric
          label="Completitudine"
          value={formatPercent(evaluation.fieldCompletenessRate)}
        />
        <EvaluationMetric
          label="Câmpuri extrase"
          value={`${evaluation.extractedFields}/${evaluation.totalFields}`}
        />
        <EvaluationMetric label="Câmpuri lipsă" value={String(evaluation.missingFields.length)} />
        <EvaluationMetric label="Calitate" value={evaluation.extractionQualityLabel} />
      </div>

      {evaluation.missingFields.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Câmpuri lipsă: {evaluation.missingFields.join(", ")}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Câmp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valoare</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluation.fieldDetails.map((field) => (
              <TableRow key={field.field}>
                <TableCell className="font-medium text-slate-900">{field.field}</TableCell>
                <TableCell>{field.present ? "Extras" : "Lipsă"}</TableCell>
                <TableCell>{field.valuePreview ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EvaluationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatRiskClass(risk: RiskClassificationResult["paymentRiskClass"]) {
  if (risk === "Ridicat") {
    return "Ridicat";
  }

  if (risk === "Mediu") {
    return "Mediu";
  }

  return "Scăzut";
}

function getBusinessStatus(risk: RiskClassificationResult["paymentRiskClass"]) {
  if (risk === "Ridicat") {
    return {
      label: "Risc ridicat",
      className: "bg-rose-50 text-rose-700",
    };
  }

  if (risk === "Mediu") {
    return {
      label: "Risc mediu",
      className: "bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Risc scăzut",
    className: "bg-emerald-50 text-emerald-700",
  };
}

function getBusinessSummary(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  if (prediction.cashFlow30Days < 0) {
    return "Cash-flow-ul estimat pentru următoarele 30 de zile este negativ. IMMapp recomandă monitorizarea încasărilor și prioritizarea plăților esențiale.";
  }

  if (riskClassification.paymentRiskClass === "Ridicat") {
    return "Compania are semnale de risc ridicat. Urmărește încasările, controlează cheltuielile și actualizează predicția după fiecare import de e-Facturi.";
  }

  if (riskClassification.financialTrendClass === "Scadere") {
    return "Veniturile prezintă semnale de scădere. Este recomandat să verifici clienții principali și ritmul încasărilor.";
  }

  return "Situația financiară este stabilă pe baza datelor disponibile. Continuă monitorizarea cash-flow-ului și actualizează predicția după importuri noi.";
}

function getPrimaryRecommendation(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  if (prediction.cashFlow30Days < 0) {
    return "Prioritizează plățile esențiale și verifică încasările estimate în următoarele 30 de zile.";
  }

  if (riskClassification.paymentRiskClass === "Ridicat") {
    return "Urmărește facturile cu valoare mare și clienții cu risc de întârziere.";
  }

  if (riskClassification.financialTrendClass === "Scadere") {
    return "Analizează scăderea veniturilor și verifică e-Facturile recente cu impact mare.";
  }

  return "Păstrează ritmul de monitorizare și actualizează predicția după fiecare import de e-Facturi.";
}

function getBusinessInterpretation(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  if (prediction.cashFlow30Days < 0) {
    return "Cash-flow-ul negativ indică presiune de lichiditate. Este important să urmărești încasările apropiate, să eviți cheltuielile neesențiale și să verifici facturile mari.";
  }

  if (riskClassification.financialTrendClass === "Scadere") {
    return "Trendul financiar indică o posibilă scădere a veniturilor. Verifică rapid clienții importanți și e-Facturile recente cu impact mare.";
  }

  if (riskClassification.paymentRiskClass === "Ridicat") {
    return "Nivelul de risc necesită atenție la încasări și cheltuieli. O revizuire săptămânală a facturilor și plăților poate reduce presiunea pe lichiditate.";
  }

  return "Trendul financiar este stabil pe baza datelor curente. Compania poate folosi predicția pentru planificare și pentru verificarea impactului noilor e-Facturi importate.";
}

function getRecommendations(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  const recommendations = new Set<string>();

  recommendations.add("Actualizează predicția după fiecare import de e-Facturi.");
  recommendations.add("Urmărește încasările estimate în următoarele 30 de zile.");

  if (prediction.cashFlow30Days < 0) {
    recommendations.add("Prioritizează plățile esențiale.");
    recommendations.add("Verifică facturile cu valoare mare.");
  }

  if (riskClassification.paymentRiskClass !== "Scazut") {
    recommendations.add("Revizuiește clienții și furnizorii cu impact financiar mare.");
  }

  if (riskClassification.financialTrendClass === "Scadere") {
    recommendations.add("Verifică e-Facturile recente care pot explica scăderea veniturilor.");
  }

  recommendations.add("Verifică periodic documentele importate pentru date financiare corecte.");

  return Array.from(recommendations).slice(0, 5);
}

function buildRevenueComparisonData(prediction: AiFinancialForecast): RevenueComparisonPoint[] {
  const points = prediction.realVsPredicted ?? [];

  if (points.length === 0) {
    return [];
  }

  const lastPoint = points[points.length - 1];

  return [
    ...points.map((point, index) => ({
      period: point.period,
      actual: point.actual,
      predicted: point.predicted,
      forecast30Days: index === points.length - 1 ? point.predicted : null,
    })),
    {
      period: "Urmatoarele 30 zile",
      actual: null,
      predicted: null,
      forecast30Days: prediction.revenueForecast || lastPoint.predicted,
    },
  ];
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
};

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}
