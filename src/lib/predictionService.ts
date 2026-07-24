export type MonthlyFinancialPoint = {
  monthKey: string;
  revenue: number;
  expenses: number;
  vat: number;
  invoiceCount: number;
};

export type CategoryPoint = {
  category: string;
  currentValue: number;
  previousValue: number;
  forecastValue: number;
  trendPercent: number;
  trendLabel: "Crestere" | "Scadere" | "Stabil";
};

export type ClientRiskSignal = {
  clientName: string;
  riskLevel: "Scazut" | "Mediu" | "Ridicat";
  delayProbability: number;
  averageDelayDays: number;
  explanation: string;
};

export type ChurnSignal = {
  clientName: string;
  riskLevel: "Scazut" | "Mediu" | "Ridicat";
  daysSinceLastInvoice: number;
  explanation: string;
};

export type ModelResult = {
  model: string;
  modelName: string;
  prediction: number;
  mae: number;
  mape: number;
  rmse: number;
  realVsPredicted: {
    period: string;
    actual: number;
    predicted: number;
  }[];
};

export type AiFinancialForecast = {
  predictedPeriod: string;

  revenueForecast: number;
  expensesForecast: number;
  profitForecast: number;
  vatForecast: number;
  cashFlowForecast: number;

  cashFlow30Days: number;
  cashFlow60Days: number;
  cashFlow90Days: number;

  trendLabel: string;
  trendDirection: "crestere" | "scadere" | "stabil";
  trendPercent: number;

  selectedModel: string;
  mae: number;
  mape: number;
  rmse: number;
  confidenceScore: number;
  realVsPredicted: {
    period: string;
    actual: number;
    predicted: number;
  }[];
  confidenceLevel: "Scazut" | "Mediu" | "Ridicat";

  modelComparison: ModelResult[];
  businessExplanation: string;

  riskLevel: "Scazut" | "Mediu" | "Ridicat";
  paymentDelayRisk: "Scazut" | "Mediu" | "Ridicat";

  demandSignals: CategoryPoint[];
  clientRiskSignals: ClientRiskSignal[];
  churnSignals: ChurnSignal[];

  explanation: string;
};

function toSafeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function getNextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  date.setMonth(date.getMonth() + 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("ro-RO", {
    month: "short",
    year: "numeric",
  });
}

function movingAverage(values: number[], windowSize = 3): number {
  if (values.length === 0) {
    return 0;
  }

  const window = values.slice(-windowSize);
  const sum = window.reduce((acc, value) => acc + value, 0);

  return sum / window.length;
}

function weightedMovingAverage(values: number[], windowSize = 3): number {
  if (values.length === 0) {
    return 0;
  }

  const window = values.slice(-windowSize);
  const weightedSum = window.reduce((sum, value, index) => sum + value * (index + 1), 0);
  const totalWeight = window.reduce((sum, _value, index) => sum + index + 1, 0);

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function linearRegression(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  const n = values.length;
  const x = values.map((_, index) => index + 1);
  const y = values;

  const sumX = x.reduce((acc, value) => acc + value, 0);
  const sumY = y.reduce((acc, value) => acc + value, 0);
  const sumXY = x.reduce((acc, value, index) => acc + value * y[index], 0);
  const sumX2 = x.reduce((acc, value) => acc + value * value, 0);

  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return y[y.length - 1];
  }

  const a = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - a * sumX) / n;

  const nextX = n + 1;

  return Math.max(a * nextX + b, 0);
}

function exponentialSmoothing(values: number[], alpha = 0.5): number {
  if (values.length === 0) {
    return 0;
  }

  let forecast = values[0];

  for (let i = 1; i < values.length; i++) {
    forecast = alpha * values[i] + (1 - alpha) * forecast;
  }

  return Math.max(forecast, 0);
}

function calculateMae(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || predicted.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const errors = actual.map((value, index) => Math.abs(value - predicted[index]));
  const sum = errors.reduce((acc, value) => acc + value, 0);

  return sum / errors.length;
}

function calculateMape(actual: number[], predicted: number[]): number {
  const errors = actual
    .map((value, index) => {
      if (Math.abs(value) === 0) {
        return null;
      }

      return Math.abs((value - predicted[index]) / value) * 100;
    })
    .filter((value): value is number => value !== null);

  if (errors.length === 0) {
    return 0;
  }

  return errors.reduce((sum, value) => sum + value, 0) / errors.length;
}

function calculateRmse(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || predicted.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const meanSquaredError =
    actual.reduce((sum, value, index) => {
      const error = value - predicted[index];

      return sum + error * error;
    }, 0) / actual.length;

  return Math.sqrt(meanSquaredError);
}

function roundMetric(value: number, decimals = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(decimals));
}

function backtestModel(
  values: number[],
  modelName: string,
  predictor: (trainingValues: number[]) => number,
  periods: string[] = values.map((_, index) => `P${index + 1}`),
): ModelResult {
  if (values.length < 3) {
    const prediction = predictor(values);

    return {
      model: modelName,
      modelName,
      prediction,
      mae: Number.POSITIVE_INFINITY,
      mape: Number.POSITIVE_INFINITY,
      rmse: Number.POSITIVE_INFINITY,
      realVsPredicted: [],
    };
  }

  const actual: number[] = [];
  const predicted: number[] = [];

  for (let i = 2; i < values.length; i++) {
    const trainingValues = values.slice(0, i);
    const forecast = predictor(trainingValues);

    actual.push(values[i]);
    predicted.push(forecast);
  }

  const realVsPredicted = actual.map((value, index) => ({
    period: periods[index + 2] ?? `P${index + 3}`,
    actual: roundMetric(value),
    predicted: roundMetric(predicted[index]),
  }));

  return {
    model: modelName,
    modelName,
    prediction: predictor(values),
    mae: calculateMae(actual, predicted),
    mape: calculateMape(actual, predicted),
    rmse: calculateRmse(actual, predicted),
    realVsPredicted,
  };
}

function selectBestModel(values: number[], periods?: string[]): ModelResult {
  const models: ModelResult[] = [
    backtestModel(values, "Regresie liniara", linearRegression, periods),
    backtestModel(values, "Medie mobila", (data) => movingAverage(data, 3), periods),
    backtestModel(
      values,
      "Medie mobila ponderata",
      (data) => weightedMovingAverage(data, 3),
      periods,
    ),
    backtestModel(
      values,
      "Netezire exponentiala",
      (data) => exponentialSmoothing(data, 0.5),
      periods,
    ),
  ];

  const validModels = models.filter((model) => Number.isFinite(model.mae));

  if (validModels.length === 0) {
    return {
      model: "Medie mobila",
      modelName: "Medie mobila",
      prediction: movingAverage(values, 3),
      mae: 0,
      mape: 0,
      rmse: 0,
      realVsPredicted: [],
    };
  }

  return validModels.sort((a, b) => a.mae - b.mae)[0];
}

function getModelComparison(values: number[], periods?: string[]): ModelResult[] {
  return [
    backtestModel(values, "Regresie liniara", linearRegression, periods),
    backtestModel(values, "Medie mobila", (data) => movingAverage(data, 3), periods),
    backtestModel(
      values,
      "Medie mobila ponderata",
      (data) => weightedMovingAverage(data, 3),
      periods,
    ),
    backtestModel(
      values,
      "Netezire exponentiala",
      (data) => exponentialSmoothing(data, 0.5),
      periods,
    ),
  ].map((model) => ({
    ...model,
    mae: roundMetric(model.mae),
    mape: roundMetric(model.mape),
    rmse: roundMetric(model.rmse),
    prediction: roundMetric(model.prediction),
  }));
}

function getConfidenceScore(pointsCount: number, mape: number, rmse: number, averageValue: number) {
  if (pointsCount < 3) {
    return 35;
  }

  const relativeRmse = averageValue > 0 ? (rmse / averageValue) * 100 : 80;
  const errorPenalty = Math.min(75, mape * 0.65 + relativeRmse * 0.35);
  const volumeBonus = Math.min(20, pointsCount * 3);

  return Math.max(20, Math.min(95, Math.round(100 - errorPenalty + volumeBonus - 15)));
}

function getConfidenceLevel(pointsCount: number, confidenceScore: number) {
  if (pointsCount < 3 || confidenceScore < 50) {
    return "Scazut" as const;
  }

  if (pointsCount >= 6 && confidenceScore >= 75) {
    return "Ridicat" as const;
  }

  if (pointsCount >= 4 && confidenceScore >= 58) {
    return "Mediu" as const;
  }

  return "Scazut" as const;
}

function getRiskLevel(profitForecast: number, expensesForecast: number, revenueForecast: number) {
  if (profitForecast < 0) {
    return "Ridicat" as const;
  }

  if (revenueForecast === 0 && expensesForecast > 0) {
    return "Ridicat" as const;
  }

  const margin = revenueForecast > 0 ? profitForecast / revenueForecast : 0;

  if (margin < 0.1) {
    return "Mediu" as const;
  }

  return "Scazut" as const;
}

function getPaymentDelayRisk(
  revenueForecast: number,
  expensesForecast: number,
  cashFlowForecast: number,
) {
  if (cashFlowForecast < 0) {
    return "Ridicat" as const;
  }

  if (expensesForecast > revenueForecast * 0.8) {
    return "Mediu" as const;
  }

  return "Scazut" as const;
}

function buildCashFlowScenario(
  revenueForecast: number,
  expensesForecast: number,
  vatForecast: number,
) {
  const monthlyNetCashFlow = revenueForecast - expensesForecast - vatForecast;

  return {
    cashFlow30Days: monthlyNetCashFlow,
    cashFlow60Days: monthlyNetCashFlow * 2,
    cashFlow90Days: monthlyNetCashFlow * 3,
  };
}

function buildDemandSignals(points: MonthlyFinancialPoint[]): CategoryPoint[] {
  if (points.length === 0) {
    return [];
  }

  const ordered = [...points].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const last = ordered[ordered.length - 1];
  const previous = ordered[ordered.length - 2] ?? last;

  const currentDemandValue = last.revenue + last.expenses;
  const previousDemandValue = previous.revenue + previous.expenses;

  const trendPercent =
    previousDemandValue > 0
      ? ((currentDemandValue - previousDemandValue) / previousDemandValue) * 100
      : 0;

  let trendLabel: "Crestere" | "Scadere" | "Stabil" = "Stabil";

  if (trendPercent > 5) {
    trendLabel = "Crestere";
  } else if (trendPercent < -5) {
    trendLabel = "Scadere";
  }

  return [
    {
      category: "Activitate financiara generala",
      currentValue: currentDemandValue,
      previousValue: previousDemandValue,
      forecastValue: movingAverage(
        ordered.map((point) => point.revenue + point.expenses),
        3,
      ),
      trendPercent,
      trendLabel,
    },
  ];
}

function buildClientRiskSignals(
  revenueForecast: number,
  expensesForecast: number,
  riskLevel: "Scazut" | "Mediu" | "Ridicat",
): ClientRiskSignal[] {
  const imbalance = revenueForecast > 0 ? Math.min(expensesForecast / revenueForecast, 1) : 1;

  const delayProbability = riskLevel === "Ridicat" ? 0.78 : riskLevel === "Mediu" ? 0.46 : 0.18;

  return [
    {
      clientName: "Portofoliu clienti",
      riskLevel,
      delayProbability,
      averageDelayDays: Math.round(imbalance * 21),
      explanation:
        riskLevel === "Ridicat"
          ? "Analiza indica risc ridicat deoarece cheltuielile sau obligatiile depasesc nivelul veniturilor estimate."
          : riskLevel === "Mediu"
            ? "Analiza indica risc mediu deoarece marja financiara este redusa."
            : "Analiza indica risc scazut pe baza marjei financiare pozitive.",
    },
  ];
}

function buildChurnSignals(points: MonthlyFinancialPoint[]): ChurnSignal[] {
  if (points.length < 2) {
    return [
      {
        clientName: "Portofoliu clienti",
        riskLevel: "Scazut",
        daysSinceLastInvoice: 0,
        explanation:
          "Nu exista suficient istoric pentru detectarea scaderii activitatii clientilor.",
      },
    ];
  }

  const ordered = [...points].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const last = ordered[ordered.length - 1];
  const previous = ordered[ordered.length - 2];

  const lastActivity = last.revenue + last.expenses;
  const previousActivity = previous.revenue + previous.expenses;

  const dropPercent =
    previousActivity > 0 ? ((previousActivity - lastActivity) / previousActivity) * 100 : 0;

  let riskLevel: "Scazut" | "Mediu" | "Ridicat" = "Scazut";

  if (dropPercent > 40) {
    riskLevel = "Ridicat";
  } else if (dropPercent > 20) {
    riskLevel = "Mediu";
  }

  return [
    {
      clientName: "Portofoliu clienti",
      riskLevel,
      daysSinceLastInvoice: 30,
      explanation:
        riskLevel === "Ridicat"
          ? "Activitatea financiara a scazut semnificativ fata de luna precedenta, ceea ce poate indica risc de churn sau reducere a comenzilor."
          : riskLevel === "Mediu"
            ? "Activitatea financiara prezinta o scadere moderata fata de luna precedenta."
            : "Nu au fost identificate semnale puternice de churn in istoricul analizat.",
    },
  ];
}

export function buildAiFinancialForecast(
  monthlyPoints: MonthlyFinancialPoint[],
): AiFinancialForecast {
  const orderedPoints = [...monthlyPoints].sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  if (orderedPoints.length === 0) {
    return {
      predictedPeriod: "N/A",
      revenueForecast: 0,
      expensesForecast: 0,
      profitForecast: 0,
      vatForecast: 0,
      cashFlowForecast: 0,
      cashFlow30Days: 0,
      cashFlow60Days: 0,
      cashFlow90Days: 0,
      trendLabel: "Date insuficiente",
      trendDirection: "stabil",
      trendPercent: 0,
      selectedModel: "N/A",
      mae: 0,
      mape: 0,
      rmse: 0,
      confidenceScore: 0,
      realVsPredicted: [],
      confidenceLevel: "Scazut",
      modelComparison: [],
      businessExplanation: "Nu exista suficiente date financiare pentru generarea unei predictii.",
      riskLevel: "Scazut",
      paymentDelayRisk: "Scazut",
      demandSignals: [],
      clientRiskSignals: [],
      churnSignals: [],
      explanation: "Nu exista suficiente date financiare pentru generarea unei predictii.",
    };
  }

  const periods = orderedPoints.map((point) => getMonthLabel(point.monthKey));
  const revenueValues = orderedPoints.map((point) => toSafeNumber(point.revenue));
  const expenseValues = orderedPoints.map((point) => toSafeNumber(point.expenses));
  const vatValues = orderedPoints.map((point) => toSafeNumber(point.vat));
  const profitValues = orderedPoints.map(
    (point) => toSafeNumber(point.revenue) - toSafeNumber(point.expenses),
  );

  const revenueModel = selectBestModel(revenueValues, periods);
  const expensesModel = selectBestModel(expenseValues, periods);
  const vatModel = selectBestModel(vatValues, periods);
  const profitModel = selectBestModel(
    profitValues.map((value) => Math.max(value, 0)),
    periods,
  );

  const revenueForecast = Math.max(revenueModel.prediction, 0);
  const expensesForecast = Math.max(expensesModel.prediction, 0);
  const vatForecast = Math.max(vatModel.prediction, 0);

  let profitForecast = revenueForecast - expensesForecast;

  if (revenueValues.some((value) => value > 0) && expenseValues.some((value) => value > 0)) {
    profitForecast = revenueForecast - expensesForecast;
  } else {
    profitForecast = profitValues[profitValues.length - 1] ?? profitModel.prediction;
  }

  const cashFlowForecast = profitForecast - vatForecast;

  const cashFlowScenario = buildCashFlowScenario(revenueForecast, expensesForecast, vatForecast);

  const lastProfit = profitValues[profitValues.length - 1] ?? 0;
  const previousProfit = profitValues[profitValues.length - 2] ?? lastProfit;

  let trendPercent = 0;

  if (Math.abs(previousProfit) > 0) {
    trendPercent = ((lastProfit - previousProfit) / Math.abs(previousProfit)) * 100;
  }

  let trendLabel = "Stabil";
  let trendDirection: "crestere" | "scadere" | "stabil" = "stabil";

  if (trendPercent > 5) {
    trendLabel = "Crestere";
    trendDirection = "crestere";
  } else if (trendPercent < -5) {
    trendLabel = "Scadere";
    trendDirection = "scadere";
  }

  const averageRevenue =
    revenueValues.reduce((sum, value) => sum + value, 0) / revenueValues.length;

  const averageMae = (revenueModel.mae + expensesModel.mae + vatModel.mae) / 3;
  const averageMape = (revenueModel.mape + expensesModel.mape + vatModel.mape) / 3;
  const averageRmse = (revenueModel.rmse + expensesModel.rmse + vatModel.rmse) / 3;
  const confidenceScore = getConfidenceScore(
    orderedPoints.length,
    averageMape,
    averageRmse,
    averageRevenue,
  );

  const confidenceLevel = getConfidenceLevel(orderedPoints.length, confidenceScore);

  const riskLevel = getRiskLevel(profitForecast, expensesForecast, revenueForecast);

  const paymentDelayRisk = getPaymentDelayRisk(revenueForecast, expensesForecast, cashFlowForecast);

  const lastMonth = orderedPoints[orderedPoints.length - 1].monthKey;
  const predictedPeriod = getMonthLabel(getNextMonthKey(lastMonth));

  const selectedModel = revenueModel.modelName;

  const modelComparison = getModelComparison(revenueValues, periods);

  const demandSignals = buildDemandSignals(orderedPoints);
  const clientRiskSignals = buildClientRiskSignals(revenueForecast, expensesForecast, riskLevel);
  const churnSignals = buildChurnSignals(orderedPoints);

  const profitText =
    profitForecast >= 0
      ? `un profit estimat de ${profitForecast.toFixed(2)} RON`
      : `o pierdere estimata de ${Math.abs(profitForecast).toFixed(2)} RON`;

  const businessExplanation =
    `Analiza AI estimeaza pentru perioada ${predictedPeriod} venituri de ${revenueForecast.toFixed(
      2,
    )} RON si cheltuieli de ${expensesForecast.toFixed(2)} RON, rezultand ${profitText}. ` +
    `Cash-flow-ul estimat pentru 30 de zile este ${cashFlowScenario.cashFlow30Days.toFixed(
      2,
    )} RON, iar riscul de intarziere la plata este ${paymentDelayRisk.toLowerCase()}. ` +
    `Nivelul de risc financiar estimat este ${riskLevel.toLowerCase()}, iar increderea predictiei este ${confidenceLevel.toLowerCase()}.`;

  return {
    predictedPeriod,
    revenueForecast,
    expensesForecast,
    profitForecast,
    vatForecast,
    cashFlowForecast,
    cashFlow30Days: cashFlowScenario.cashFlow30Days,
    cashFlow60Days: cashFlowScenario.cashFlow60Days,
    cashFlow90Days: cashFlowScenario.cashFlow90Days,
    trendLabel,
    trendDirection,
    trendPercent,
    selectedModel,
    mae: roundMetric(averageMae),
    mape: roundMetric(averageMape),
    rmse: roundMetric(averageRmse),
    confidenceScore,
    realVsPredicted: revenueModel.realVsPredicted,
    confidenceLevel,
    modelComparison,
    businessExplanation,
    riskLevel,
    paymentDelayRisk,
    demandSignals,
    clientRiskSignals,
    churnSignals,
    explanation: businessExplanation,
  };
}
