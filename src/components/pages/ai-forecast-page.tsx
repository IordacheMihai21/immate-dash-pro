import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  FileText,
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
import { InfoBanner } from "@/components/admin-ui";
import { ChartCard } from "@/components/chart-card";
import {
  ReportActionCard,
  ReportHero,
  ReportInsightCard,
  ReportKpiCard,
  ReportPanel,
} from "@/components/report-ui";
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
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/formatters";
import type { AiFinancialForecast } from "@/lib/predictionService";
import type { RiskClassificationResult } from "@/lib/riskClassificationService";
import type { DocumentExtractionEvaluation } from "@/lib/extractionEvaluationService";
import { toast } from "sonner";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export function AiForecastPage() {
  const { data: dashboardData, isLoading, isError, refetch } = useDashboardData();
  const [forecastStatus, setForecastStatus] = useState(() =>
    typeof window === "undefined"
      ? "updated"
      : (localStorage.getItem("immapp:ai-forecast-status") ?? "updated"),
  );
  const [isUpdatingForecast, setIsUpdatingForecast] = useState(false);

  async function handleUpdateForecast() {
    try {
      setIsUpdatingForecast(true);
      await refetch();
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
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă modulul AI Forecast...
      </div>
    );
  }

  if (isError || !dashboardData) {
    return (
      <div className="space-y-6">
        <ReportHero
          title="AI Forecast"
          subtitle="Estimari si scenarii generate pe baza e-Facturilor XML incarcate in IMMapp."
          eyebrow="Planificare business"
          icon={<BrainCircuit className="h-3.5 w-3.5" />}
        />

        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          Nu s-au putut încărca datele predictive.
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
      <ReportHero
        title="Forecast AI"
        subtitle="Estimari, scenarii si recomandari pentru planificarea afacerii, generate exclusiv din documentele e-Factura XML incarcate."
        eyebrow="Predictii si scenarii"
        badge={forecastStatus === "outdated" ? "Necesita actualizare" : "Actualizat"}
        icon={<BrainCircuit className="h-3.5 w-3.5" />}
        actions={
          <Button
            onClick={handleUpdateForecast}
            disabled={isUpdatingForecast}
            className="rounded-full bg-card text-foreground hover:bg-muted"
          >
            {isUpdatingForecast ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isUpdatingForecast ? "Se actualizeaza..." : "Actualizeaza predictia"}
          </Button>
        }
      />

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Predicții pe baza documentelor tale
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
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

        {dashboardData.unclassifiedInvoiceCount > 0 && (
          <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            Unele facturi nu au putut fi asociate clar cu firma curenta. Verifica CUI-ul din Profil
            companie.
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
              <ReportKpiCard
                title="Venit estimat"
                value={formatRON(prediction.revenueForecast)}
                description={`Perioada: ${prediction.predictedPeriod}`}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="blue"
              />
              <ReportKpiCard
                title="Cheltuieli estimate"
                value={formatRON(prediction.expensesForecast)}
                description="Costuri estimate pentru perioada următoare"
                icon={<Wallet className="h-5 w-5" />}
                tone="slate"
              />
              <ReportKpiCard
                title="Profit estimat"
                value={formatRON(prediction.profitForecast)}
                description={
                  prediction.profitForecast >= 0
                    ? "Rezultat estimat pozitiv"
                    : "Presiune pe profitabilitate"
                }
                icon={<Percent className="h-5 w-5" />}
                tone={prediction.profitForecast >= 0 ? "emerald" : "rose"}
              />
              <ReportKpiCard
                title="Nivel de incredere"
                value={prediction.confidenceLevel}
                description={`${prediction.confidenceScore}% scor intern de incredere`}
                icon={<Target className="h-5 w-5" />}
                tone="blue"
              />
              <ReportKpiCard
                title="Risc estimat"
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
              <ReportKpiCard
                title="Date disponibile pentru predictie"
                value={`${dashboardData.invoiceCount} facturi`}
                description={`${dashboardData.documentsProcessed} documente procesate in istoricul curent`}
                icon={<FileText className="h-5 w-5" />}
                tone="emerald"
              />
            </section>

            <RevenueComparisonChart data={revenueComparisonData} />

            <ScenarioSection prediction={prediction} />

            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                title="Cash-flow estimat"
                description="Estimare pentru următoarele 30, 60 și 90 de zile"
                className="border-border bg-card shadow-sm xl:col-span-2"
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
      className="border-border bg-card shadow-sm"
    >
      {data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
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

function ScenarioSection({ prediction }: { prediction: AiFinancialForecast }) {
  const scenarios = [
    {
      title: "Scenariu prudent",
      revenue: prediction.revenueForecast * 0.9,
      expenses: prediction.expensesForecast * 1.05,
      description:
        "Ipoteza in care veniturile cresc mai lent, iar costurile raman usor peste nivelul estimat.",
      tone: "amber" as const,
    },
    {
      title: "Scenariu realist",
      revenue: prediction.revenueForecast,
      expenses: prediction.expensesForecast,
      description:
        "Estimarea centrala calculata din istoricul financiar disponibil in documentele incarcate.",
      tone: "blue" as const,
    },
    {
      title: "Scenariu optimist",
      revenue: prediction.revenueForecast * 1.1,
      expenses: prediction.expensesForecast * 0.98,
      description:
        "Ipoteza in care veniturile depasesc estimarea, iar presiunea cheltuielilor ramane controlata.",
      tone: "emerald" as const,
    },
  ];

  return (
    <ReportPanel
      eyebrow="Planificare"
      title="Scenarii pentru perioada urmatoare"
      description="Scenariile sunt orientative si ajuta la planificare, fara a garanta rezultatele viitoare."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {scenarios.map((scenario) => {
          const profit = scenario.revenue - scenario.expenses;

          return (
            <ReportInsightCard
              key={scenario.title}
              title={scenario.title}
              value={formatRON(profit)}
              description={`${scenario.description} Venit estimat: ${formatRON(
                scenario.revenue,
              )}. Cheltuieli estimate: ${formatRON(scenario.expenses)}.`}
              icon={<Target className="h-5 w-5" />}
              tone={scenario.tone}
            />
          );
        })}
      </div>
    </ReportPanel>
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
    <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-sm">
      <CardContent className="p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Analiza financiară AI</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Concluzie rapidă calculată din e-Facturile XML încărcate.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusClassName}`}>
                {statusLabel}
              </span>
            </div>

            <p className="text-base leading-7 text-foreground">
              {getBusinessSummary(prediction, riskClassification)}
            </p>

            <div className="mt-4 rounded-xl border border-primary/20 bg-secondary p-4 text-sm leading-6 text-primary">
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
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-secondary p-4 text-primary">
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Nu există suficiente documente pentru predicție
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
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
    <Card className="border-border bg-muted shadow-none">
      <CardContent className="p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Ce înseamnă asta pentru afacerea ta
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
    <ReportPanel
      eyebrow="Recomandari"
      title="Ce influenteaza predictia"
      description="Elemente de urmarit pentru ca estimarile sa ramana utile in planificarea afacerii."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <ReportActionCard
          priority={prediction.cashFlow30Days < 0 ? "Ridicata" : "Medie"}
          title="Ce influenteaza estimarea"
          description={getForecastInfluence(prediction, riskClassification)}
        />
        <ReportActionCard
          priority={prediction.realVsPredicted.length < 3 ? "Medie" : "Scazuta"}
          title="Date de completat"
          description={getMissingDataGuidance(prediction)}
        />
        <ReportActionCard
          priority={riskClassification.paymentRiskClass === "Ridicat" ? "Ridicata" : "Medie"}
          title="Ce trebuie monitorizat"
          description={getMonitoringGuidance(prediction, riskClassification)}
        />
      </div>
    </ReportPanel>
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
    <Card className="border-border bg-card shadow-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value="methodology" className="border-0">
          <AccordionTrigger className="px-5 py-5 text-base font-semibold text-foreground hover:no-underline">
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Detalii evaluare model</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Predicțiile numerice sunt evaluate cu MAE, MAPE și RMSE.
          </p>
        </div>
        <div className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary">
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
        <div className="rounded-xl border border-border">
          <div className="border-b border-border p-4">
            <h4 className="text-sm font-semibold text-foreground">Comparație modele</h4>
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
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Date insuficiente pentru o evaluare stabilă.
                    </TableCell>
                  </TableRow>
                ) : (
                  prediction.modelComparison.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium text-foreground">{model.model}</TableCell>
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

        <div className="rounded-xl border border-border p-4">
          <h4 className="mb-4 text-sm font-semibold text-foreground">Real vs estimat</h4>
          {prediction.realVsPredicted.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
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

      <p className="mt-5 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">Clasificare risc</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Scor de risc bazat pe reguli explicabile, calculat direct din datele tale financiare
          recente — nu este un model antrenat separat.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <EvaluationMetric label="Risc plată" value={riskClassification.paymentRiskClass} />
        <EvaluationMetric label="Risc cash-flow" value={riskClassification.cashFlowRiskClass} />
        <EvaluationMetric label="Trend financiar" value={riskClassification.financialTrendClass} />
      </div>

      <div className="mt-5 rounded-xl border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Factori de risc</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {riskClassification.riskFactors.map((factor) => (
            <li key={factor} className="rounded-lg bg-muted px-3 py-2">
              {factor}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {riskClassification.explanation}
        </p>
      </div>
    </div>
  );
}

function ExtractionQualityCard({ evaluation }: { evaluation: DocumentExtractionEvaluation }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">Calitatea extragerii datelor</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
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
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/20 p-4 text-sm leading-6 text-warning">
          Câmpuri lipsă: {evaluation.missingFields.join(", ")}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
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
                <TableCell className="font-medium text-foreground">{field.field}</TableCell>
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
    <div className="rounded-xl border border-border bg-muted p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-foreground">{value}</p>
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
      className: "bg-destructive/15 text-destructive",
    };
  }

  if (risk === "Mediu") {
    return {
      label: "Risc mediu",
      className: "bg-warning/20 text-warning",
    };
  }

  return {
    label: "Risc scăzut",
    className: "bg-success/15 text-success",
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

function getForecastInfluence(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  if (prediction.cashFlow30Days < 0) {
    return "Cash-flow-ul estimat negativ are impact direct asupra scenariilor. Verifica incasarile apropiate si platile esentiale.";
  }

  if (riskClassification.financialTrendClass === "Scadere") {
    return "Trendul veniturilor influenteaza estimarea. Urmareste clientii principali si facturile recente cu valori mari.";
  }

  return "Estimarea este influentata de istoricul veniturilor, cheltuielilor, TVA-ului si ritmul documentelor importate.";
}

function getMissingDataGuidance(prediction: AiFinancialForecast) {
  if (prediction.realVsPredicted.length < 3) {
    return "Istoricul disponibil este limitat. Importa mai multe e-Facturi XML pentru comparatii lunare si scenarii mai stabile.";
  }

  return "Datele disponibile permit comparatii istorice. Continua importul dupa fiecare perioada de facturare pentru rezultate la zi.";
}

function getMonitoringGuidance(
  prediction: AiFinancialForecast,
  riskClassification: RiskClassificationResult,
) {
  if (riskClassification.paymentRiskClass === "Ridicat") {
    return "Monitorizeaza incasarile, facturile mari si clientii cu posibile intarzieri inainte de noi angajamente financiare.";
  }

  if (prediction.profitForecast < 0) {
    return "Urmareste costurile estimate si verifica daca facturile primite cresc mai rapid decat veniturile.";
  }

  return "Monitorizeaza cash-flow-ul la 30 de zile, evolutia veniturilor si schimbarile aparute dupa importuri noi.";
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
