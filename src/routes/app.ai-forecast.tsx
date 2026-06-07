import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/chart-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardData } from "@/lib/dashboardService";
import {
  evaluateSavedPredictions,
  getAiTrainingRuns,
  getPredictionResults,
  saveAiTrainingRun,
  type AiTrainingRun,
  type SavedPredictionResult,
} from "@/lib/aiTrainingService";
import {
  buildAiFinancialForecast,
  type AiFinancialForecast,
} from "@/lib/predictionService";
import {
  parseClientDataset,
  type ClientDatasetParseResult,
} from "@/lib/clientDatasetParser";
import { formatRON } from "@/lib/mock-data";
import {
  BrainCircuit,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Activity,
  Save,
  History,
  Upload,
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
import { toast } from "sonner";

export const Route = createFileRoute("/app/ai-forecast")({
  head: () => ({ meta: [{ title: "AI Forecast — IMMapp" }] }),
  component: AiForecastPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function getAccuracyLabel(mae: number | null | undefined) {
  if (mae === null || mae === undefined || Number.isNaN(mae)) {
    return "In curs de calcul";
  }

  if (mae < 100) {
    return "Foarte buna";
  }

  if (mae < 500) {
    return "Buna";
  }

  if (mae < 1000) {
    return "Acceptabila";
  }

  return "Necesita mai multe date";
}

function getModelLabel(modelName: string | null | undefined) {
  if (!modelName) {
    return "-";
  }

  const labels: Record<string, string> = {
    "Linear Regression": "Predictie liniara",
    "Moving Average": "Medie mobila",
    "Exponential Smoothing": "Netezire exponentiala",
  };

  return labels[modelName] ?? modelName;
}

function AiForecastPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [trainingRuns, setTrainingRuns] = useState<AiTrainingRun[]>([]);
  const [predictionResults, setPredictionResults] = useState<SavedPredictionResult[]>([]);
  const [clientDataset, setClientDataset] = useState<ClientDatasetParseResult | null>(null);
  const [clientDatasetPrediction, setClientDatasetPrediction] =
    useState<AiFinancialForecast | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTraining, setIsSavingTraining] = useState(false);
  const [isEvaluatingPredictions, setIsEvaluatingPredictions] = useState(false);
  const [isParsingClientDataset, setIsParsingClientDataset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [dashboard, runs, predictions] = await Promise.all([
        getDashboardData(),
        getAiTrainingRuns(),
        getPredictionResults(),
      ]);

      setDashboardData(dashboard);
      setTrainingRuns(runs);
      setPredictionResults(predictions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la incarcarea modulului AI Forecast.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTrainAndSaveModel() {
    if (!dashboardData) {
      return;
    }

    try {
      setIsSavingTraining(true);

      await saveAiTrainingRun({
        prediction: dashboardData.prediction,
        trainingData: dashboardData.monthlyInvoiceValue,
        trainingPoints: dashboardData.monthlyInvoiceValue.length,
      });

      toast.success("Predictia AI a fost actualizata si salvata.");

      const [runs, predictions] = await Promise.all([
        getAiTrainingRuns(),
        getPredictionResults(),
      ]);

      setTrainingRuns(runs);
      setPredictionResults(predictions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la actualizarea predictiei AI.";

      toast.error(message);
    } finally {
      setIsSavingTraining(false);
    }
  }

  async function handleEvaluatePredictions() {
    try {
      setIsEvaluatingPredictions(true);

      const result = await evaluateSavedPredictions();

      toast.success(
        `Verificare finalizata: ${result.evaluatedCount} predictii actualizate, ${result.skippedCount} in asteptare.`,
      );

      const predictions = await getPredictionResults();
      setPredictionResults(predictions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la verificarea predictiilor.";

      toast.error(message);
    } finally {
      setIsEvaluatingPredictions(false);
    }
  }

  async function handleClientDatasetUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      setIsParsingClientDataset(true);

      const parsedDataset = await parseClientDataset(file);
      const predictionResult = buildAiFinancialForecast(parsedDataset.monthlyPoints);

      setClientDataset(parsedDataset);
      setClientDatasetPrediction(predictionResult);

      toast.success("Fisierul a fost procesat si simularea AI a fost generata.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la procesarea fisierului pentru simulare.";

      toast.error(message);
    } finally {
      setIsParsingClientDataset(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground">
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
          description="Predictii financiare automate pentru IMM-uri."
        />

        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
    <div className="space-y-8">
      <PageHeader
        title="AI Forecast"
        description="Predictii automate pentru cash-flow, venituri, cheltuieli, profit si riscuri financiare."
      />

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <BrainCircuit className="h-6 w-6" />
              </div>

              <div>
                <p className="text-sm font-medium text-primary">AI Forecast</p>
                <h2 className="mt-1 text-2xl font-semibold">
                  Predictii financiare automate pentru compania ta
                </h2>
                <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                  IMMapp analizeaza datele companiei si estimeaza evolutia cash-flow-ului,
                  veniturilor, cheltuielilor si riscurilor financiare. In productie, aceste
                  predictii se vor actualiza automat dupa sincronizarea cu ANAF/SPV si, optional,
                  cu banca.
                </p>
              </div>
            </div>

            <div className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              Sistem AI activ
            </div>
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionTitle
            title="Predictii automate IMMapp"
            description="Zona principala pentru client: estimari financiare generate pe baza datelor din aplicatie."
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleTrainAndSaveModel} disabled={isSavingTraining}>
              {isSavingTraining ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSavingTraining ? "Se actualizeaza predictia..." : "Actualizeaza predictia AI"}
            </Button>

            <Button
              variant="outline"
              onClick={handleEvaluatePredictions}
              disabled={isEvaluatingPredictions}
            >
              {isEvaluatingPredictions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="mr-2 h-4 w-4" />
              )}
              Verifica predictiile
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PredictionCard
            label="Venituri estimate"
            value={formatRON(prediction.revenueForecast)}
            hint={`Perioada: ${prediction.predictedPeriod}`}
          />

          <PredictionCard
            label="Cheltuieli estimate"
            value={formatRON(prediction.expensesForecast)}
            hint="Estimate pe baza istoricului lunar"
          />

          <PredictionCard
            label="Profit / Pierdere estimata"
            value={formatRON(prediction.profitForecast)}
            hint={`Cash-flow estimat: ${formatRON(prediction.cashFlowForecast)}`}
          />

          <PredictionCard
            label="Acuratete model"
            value={getAccuracyLabel(prediction.mae)}
            hint={`Metoda de predictie: ${getModelLabel(prediction.selectedModel)}`}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <PredictionCard
            label="Cash-flow 30 zile"
            value={formatRON(prediction.cashFlow30Days)}
            hint="Scenariu pe termen scurt"
          />

          <PredictionCard
            label="Cash-flow 60 zile"
            value={formatRON(prediction.cashFlow60Days)}
            hint="Scenariu pe termen mediu"
          />

          <PredictionCard
            label="Cash-flow 90 zile"
            value={formatRON(prediction.cashFlow90Days)}
            hint="Scenariu extins"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Scenariu cash-flow"
            description="Cash-flow estimat pe 30/60/90 zile"
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  formatter={(v: number) => formatRON(v)}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Interpretare cash-flow</h2>
              </div>

              <p className="text-sm text-muted-foreground">
                Cash-flow-ul este estimat pe baza diferentelor dintre veniturile si cheltuielile
                previzionate, ajustate cu TVA-ul estimat. Pentru productie, acest modul poate
                integra si data efectiva a incasarilor din extrasele bancare.
              </p>

              <div className="mt-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                <p className="font-medium">Risc intarziere plata</p>
                <p className="mt-1 text-muted-foreground">
                  Nivel estimat: {prediction.paymentDelayRisk}. Acest scor este derivat din
                  cash-flow-ul estimat si din raportul dintre cheltuieli si venituri.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Interpretare automata AI</h2>
              </div>

              <p className="text-sm text-muted-foreground">{prediction.explanation}</p>

              <div className="mt-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                <p className="font-medium">Cum se foloseste in business</p>
                <p className="mt-1 text-muted-foreground">
                  Proprietarul vede direct estimari si riscuri financiare, fara sa interactioneze
                  cu detalii tehnice despre modele, antrenare sau erori statistice.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Sincronizare automata</h2>
              </div>

              <p className="text-sm text-muted-foreground">
                In flow-ul final, clientul conecteaza o singura data ANAF/SPV si, optional,
                banca. IMMapp sincronizeaza datele, actualizeaza dashboard-ul si recalculeaza
                predictiile automat.
              </p>

              <div className="mt-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                <p className="font-medium">Pentru demo</p>
                <p className="mt-1 text-muted-foreground">
                  Butonul „Actualizeaza predictia AI” simuleaza rularea automata din productie.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <SectionTitle
          title="Risc client si semnale de intarziere"
          description="Semnale simple privind clientii, intarzierile la plata si riscul de churn."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {prediction.clientRiskSignals.map((signal) => (
            <Card key={signal.clientName}>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-semibold">{signal.clientName}</h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Risc client" value={signal.riskLevel} />
                  <MiniMetric
                    label="Probabilitate intarziere"
                    value={`${Math.round(signal.delayProbability * 100)}%`}
                  />
                  <MiniMetric
                    label="Intarziere medie"
                    value={`${signal.averageDelayDays} zile`}
                  />
                </div>

                <p className="mt-4 text-sm text-muted-foreground">{signal.explanation}</p>
              </CardContent>
            </Card>
          ))}

          {prediction.churnSignals.map((signal) => (
            <Card key={signal.clientName}>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-semibold">Semnal churn</h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Client" value={signal.clientName} />
                  <MiniMetric label="Risc churn" value={signal.riskLevel} />
                  <MiniMetric
                    label="Zile fara factura"
                    value={`${signal.daysSinceLastInvoice} zile`}
                  />
                </div>

                <p className="mt-4 text-sm text-muted-foreground">{signal.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Demand / activitate business"
          description="Semnale privind evolutia cererii sau activitatii financiare."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {prediction.demandSignals.map((signal) => (
            <Card key={signal.category}>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Categorie
                </p>
                <p className="mt-2 text-xl font-semibold">{signal.category}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Valoare curenta"
                    value={formatRON(signal.currentValue)}
                  />
                  <MiniMetric
                    label="Valoare anterioara"
                    value={formatRON(signal.previousValue)}
                  />
                  <MiniMetric
                    label="Trend"
                    value={`${signal.trendLabel} (${signal.trendPercent.toFixed(1)}%)`}
                  />
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  Forecast categorie: {formatRON(signal.forecastValue)}. Acest semnal ajuta la
                  identificarea zonelor de business cu activitate in crestere sau scadere.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Simulare / What-if Analysis</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Incarca un fisier CSV, XLS sau XLSX pentru a testa scenarii separate de datele
                  reale din IMMapp. Aceasta zona este utila pentru demo, analiza pe date istorice
                  sau estimari pe seturi externe.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  In productie, forecast-ul principal vine din sincronizarea ANAF/SPV si din datele
                  companiei. Upload-ul manual ramane fallback, test sau simulare.
                </p>
              </div>

              <div>
                <label>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={(event) => {
                      handleClientDatasetUpload(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />

                  <Button type="button" disabled={isParsingClientDataset} asChild>
                    <span>
                      {isParsingClientDataset ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Simuleaza cu date proprii
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {clientDataset && clientDatasetPrediction && (
          <div className="mt-6 space-y-6">
            <SectionTitle
              title="Rezultat simulare"
              description="Predictie generata pe fisierul incarcat, separat de datele reale din IMMapp."
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <PredictionCard
                label="Fisier"
                value={clientDataset.datasetName}
                hint={`${clientDataset.validRows} randuri valide din ${clientDataset.rowCount}`}
              />

              <PredictionCard
                label="Venit estimat"
                value={formatRON(clientDatasetPrediction.revenueForecast)}
                hint={`Perioada: ${clientDatasetPrediction.predictedPeriod}`}
              />

              <PredictionCard
                label="Cash-flow estimat"
                value={formatRON(clientDatasetPrediction.cashFlowForecast)}
                hint={`Risc: ${clientDatasetPrediction.riskLevel}`}
              />

              <PredictionCard
                label="Acuratete model"
                value={getAccuracyLabel(clientDatasetPrediction.mae)}
                hint={`Metoda: ${getModelLabel(clientDatasetPrediction.selectedModel)}`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Evolutie venituri simulare"
                description="Venituri lunare extrase din fisierul incarcat"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={clientDataset.monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                    <Tooltip
                      formatter={(v: number) => formatRON(v)}
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <Card>
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-semibold">Interpretare AI simulare</h2>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {clientDatasetPrediction.explanation}
                  </p>

                  <div className="mt-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                    <p className="font-medium">Observatie</p>
                    <p className="mt-1 text-muted-foreground">
                      Acest rezultat nu modifica datele principale din IMMapp. Este folosit ca
                      analiza separata pentru scenarii si demonstratii.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </section>

      <section>
        <Card>
          <CardContent className="p-5">
            <details>
              <summary className="cursor-pointer text-lg font-semibold">
                Detalii tehnice model pentru demo/licenta
              </summary>

              <p className="mt-2 text-sm text-muted-foreground">
                Aceasta zona pastreaza informatiile tehnice necesare pentru validarea modelului:
                metoda de predictie, MAE, backtesting, rulari AI si predictii salvate.
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Metoda de predictie
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {getModelLabel(prediction.selectedModel)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Model selectat automat prin backtesting.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      MAE tehnic
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatRON(prediction.mae)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      MAE masoara diferenta medie dintre valorile estimate si cele reale.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Risc financiar estimat
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{prediction.riskLevel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nivel incredere predictie: {prediction.confidenceLevel}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Comparatie modele AI/ML"
                  description="Eroare MAE pe baza backtesting-ului"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={prediction.modelComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="modelName"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                      <Tooltip
                        formatter={(v: number) => formatRON(v)}
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="mae" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {clientDataset && clientDatasetPrediction && (
                  <ChartCard
                    title="Comparatie modele pe simulare"
                    description="MAE calculat prin backtesting pe fisierul incarcat"
                  >
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={clientDatasetPrediction.modelComparison}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis
                          dataKey="modelName"
                          stroke="var(--color-muted-foreground)"
                          fontSize={11}
                        />
                        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                        <Tooltip
                          formatter={(v: number) => formatRON(v)}
                          contentStyle={{
                            backgroundColor: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                          }}
                        />
                        <Bar dataKey="mae" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 border-b border-border p-5">
                      <History className="h-5 w-5 text-primary" />
                      <div>
                        <h2 className="text-base font-semibold">Istoric rulari AI</h2>
                        <p className="text-xs text-muted-foreground">
                          Rulari salvate ale modelului AI pe datele disponibile.
                        </p>
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Metoda</TableHead>
                          <TableHead>Puncte</TableHead>
                          <TableHead>MAE</TableHead>
                          <TableHead>Risc</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {trainingRuns.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                              Nu exista inca rulari AI salvate.
                            </TableCell>
                          </TableRow>
                        ) : (
                          trainingRuns.map((run) => (
                            <TableRow key={run.id}>
                              <TableCell>{formatDate(run.trained_at)}</TableCell>
                              <TableCell>{getModelLabel(run.selected_model)}</TableCell>
                              <TableCell>{run.training_points}</TableCell>
                              <TableCell>{formatRON(Number(run.mae ?? 0))}</TableCell>
                              <TableCell>{run.risk_level ?? "-"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 border-b border-border p-5">
                      <Save className="h-5 w-5 text-primary" />
                      <div>
                        <h2 className="text-base font-semibold">Predictii salvate</h2>
                        <p className="text-xs text-muted-foreground">
                          Predictii generate si comparate ulterior cu valorile reale.
                        </p>
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Perioada</TableHead>
                          <TableHead>Profit estimat</TableHead>
                          <TableHead>Cash-flow</TableHead>
                          <TableHead>Metoda</TableHead>
                          <TableHead>Eroare reala</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {predictionResults.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                              Nu exista inca predictii salvate.
                            </TableCell>
                          </TableRow>
                        ) : (
                          predictionResults.map((result) => (
                            <TableRow key={result.id}>
                              <TableCell>{result.predicted_period}</TableCell>
                              <TableCell>{formatRON(Number(result.predicted_profit ?? 0))}</TableCell>
                              <TableCell>
                                {formatRON(Number(result.predicted_cash_flow ?? 0))}
                              </TableCell>
                              <TableCell>{getModelLabel(result.selected_model)}</TableCell>
                              <TableCell>
                                {result.actual_error === null
                                  ? "In asteptare"
                                  : formatRON(Number(result.actual_error))}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </details>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SectionTitle({
  title,
  description,
  className = "",
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`mb-4 ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PredictionCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
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
    month: "2-digit",
    year: "numeric",
  });
}