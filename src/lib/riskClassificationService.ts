import type { AiFinancialForecast, MonthlyFinancialPoint } from "./predictionService";

export type RiskClass = "Scazut" | "Mediu" | "Ridicat";
export type TrendClass = "Crestere" | "Stabil" | "Scadere";

export type RiskClassificationResult = {
  paymentRiskClass: RiskClass;
  cashFlowRiskClass: RiskClass;
  financialTrendClass: TrendClass;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confusionMatrix: {
    actual: RiskClass;
    predicted: RiskClass;
    count: number;
  }[];
  riskFactors: string[];
  explanation: string;
};

const RISK_CLASSES: RiskClass[] = ["Scazut", "Mediu", "Ridicat"];

function toSafeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function roundMetric(value: number, decimals = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(decimals));
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getVolatility(values: number[]) {
  const average = getAverage(values);

  if (values.length < 2 || average <= 0) {
    return 0;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function getGrowthRate(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function classifyTrend(growthRate: number): TrendClass {
  if (growthRate > 5) {
    return "Crestere";
  }

  if (growthRate < -5) {
    return "Scadere";
  }

  return "Stabil";
}

function classifyRiskScore(score: number): RiskClass {
  if (score >= 70) {
    return "Ridicat";
  }

  if (score >= 42) {
    return "Mediu";
  }

  return "Scazut";
}

function deriveRiskLabel(growthRate: number, volatility: number, cashFlowEstimate: number) {
  let score = 20;

  if (growthRate < -20) {
    score += 45;
  } else if (growthRate < -10) {
    score += 25;
  } else if (growthRate > 5) {
    score -= 8;
  }

  if (volatility > 0.45) {
    score += 35;
  } else if (volatility > 0.25) {
    score += 18;
  }

  if (cashFlowEstimate < 0) {
    score += 25;
  }

  return classifyRiskScore(score);
}

function buildEvaluationPairs(points: MonthlyFinancialPoint[]) {
  const ordered = [...points].sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  if (ordered.length < 3) {
    return [];
  }

  return ordered.slice(2).map((point, relativeIndex) => {
    const index = relativeIndex + 2;
    const history = ordered.slice(0, index);
    const previous = ordered[index - 1];
    const actualGrowth = getGrowthRate(point.revenue, previous.revenue);
    const predictedGrowth = getGrowthRate(
      history[history.length - 1].revenue,
      history[history.length - 2]?.revenue ?? history[history.length - 1].revenue,
    );
    const historyVolatility = getVolatility(history.map((item) => item.revenue));
    const actualVolatility = getVolatility(
      ordered.slice(Math.max(0, index - 2), index + 1).map((item) => item.revenue),
    );
    const predictedCashFlow =
      history[history.length - 1].revenue -
      history[history.length - 1].expenses -
      history[history.length - 1].vat;
    const actualCashFlow = point.revenue - point.expenses - point.vat;

    return {
      actual: deriveRiskLabel(actualGrowth, actualVolatility, actualCashFlow),
      predicted: deriveRiskLabel(predictedGrowth, historyVolatility, predictedCashFlow),
    };
  });
}

function buildConfusionMatrix(pairs: { actual: RiskClass; predicted: RiskClass }[]) {
  return RISK_CLASSES.flatMap((actual) =>
    RISK_CLASSES.map((predicted) => ({
      actual,
      predicted,
      count: pairs.filter((pair) => pair.actual === actual && pair.predicted === predicted)
        .length,
    })),
  );
}

function calculateClassificationMetrics(pairs: { actual: RiskClass; predicted: RiskClass }[]) {
  if (pairs.length === 0) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      confusionMatrix: buildConfusionMatrix([]),
    };
  }

  const correct = pairs.filter((pair) => pair.actual === pair.predicted).length;
  const precisionValues = RISK_CLASSES.map((label) => {
    const truePositive = pairs.filter(
      (pair) => pair.actual === label && pair.predicted === label,
    ).length;
    const falsePositive = pairs.filter(
      (pair) => pair.actual !== label && pair.predicted === label,
    ).length;

    return truePositive + falsePositive > 0
      ? truePositive / (truePositive + falsePositive)
      : 0;
  });
  const recallValues = RISK_CLASSES.map((label) => {
    const truePositive = pairs.filter(
      (pair) => pair.actual === label && pair.predicted === label,
    ).length;
    const falseNegative = pairs.filter(
      (pair) => pair.actual === label && pair.predicted !== label,
    ).length;

    return truePositive + falseNegative > 0
      ? truePositive / (truePositive + falseNegative)
      : 0;
  });

  const precision = getAverage(precisionValues);
  const recall = getAverage(recallValues);
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy: roundMetric((correct / pairs.length) * 100),
    precision: roundMetric(precision * 100),
    recall: roundMetric(recall * 100),
    f1Score: roundMetric(f1Score * 100),
    confusionMatrix: buildConfusionMatrix(pairs),
  };
}

export function buildRiskClassification(
  points: MonthlyFinancialPoint[],
  forecast: AiFinancialForecast,
): RiskClassificationResult {
  const ordered = [...points].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const revenueValues = ordered.map((point) => toSafeNumber(point.revenue));
  const last = ordered[ordered.length - 1];
  const previous = ordered[ordered.length - 2] ?? last;
  const volatility = getVolatility(revenueValues);
  const recentGrowthRate = last && previous ? getGrowthRate(last.revenue, previous.revenue) : 0;
  const totalInvoiceCount = ordered.reduce((sum, point) => sum + point.invoiceCount, 0);
  const totalRevenue = ordered.reduce((sum, point) => sum + point.revenue, 0);
  const totalVat = ordered.reduce((sum, point) => sum + point.vat, 0);
  const averageInvoiceValue = totalInvoiceCount > 0 ? totalRevenue / totalInvoiceCount : 0;
  const vatRatio = totalRevenue > 0 ? totalVat / totalRevenue : 0;
  const pairs = buildEvaluationPairs(ordered);
  const metrics = calculateClassificationMetrics(pairs);

  const paymentScore =
    (recentGrowthRate < -20 ? 38 : recentGrowthRate < -10 ? 24 : 8) +
    (volatility > 0.45 ? 30 : volatility > 0.25 ? 18 : 6) +
    (forecast.paymentDelayRisk === "Ridicat" ? 28 : forecast.paymentDelayRisk === "Mediu" ? 15 : 4) +
    (totalInvoiceCount < 6 ? 10 : 0);

  const cashFlowScore =
    (forecast.cashFlow30Days < 0 ? 50 : forecast.cashFlow30Days < averageInvoiceValue ? 22 : 6) +
    (volatility > 0.35 ? 20 : 6) +
    (totalInvoiceCount < 4 ? 12 : 0);

  const paymentRiskClass = classifyRiskScore(paymentScore);
  const cashFlowRiskClass = classifyRiskScore(cashFlowScore);
  const financialTrendClass = classifyTrend(recentGrowthRate);
  const riskFactors: string[] = [];

  if (recentGrowthRate < -10) {
    riskFactors.push(`Veniturile au scazut cu ${Math.abs(recentGrowthRate).toFixed(1)}% recent.`);
  }

  if (volatility > 0.25) {
    riskFactors.push("Veniturile lunare au variatie ridicata.");
  }

  if (forecast.cashFlow30Days < 0) {
    riskFactors.push("Cash-flow-ul estimat pe 30 de zile este negativ.");
  }

  if (vatRatio > 0.2) {
    riskFactors.push("Ponderea TVA in total este ridicata.");
  }

  if (totalInvoiceCount < 6) {
    riskFactors.push("Volumul de date este redus pentru o clasificare stabila.");
  }

  if (riskFactors.length === 0) {
    riskFactors.push("Activitatea este stabila pe baza regulilor de evaluare disponibile.");
  }

  return {
    paymentRiskClass,
    cashFlowRiskClass,
    financialTrendClass,
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    f1Score: metrics.f1Score,
    confusionMatrix: metrics.confusionMatrix,
    riskFactors,
    explanation:
      pairs.length === 0
        ? "Clasificarea foloseste reguli explicabile, dar nu exista suficient istoric pentru evaluarea stabila a metricilor."
        : "Clasificarea foloseste etichete derivate din comportamentul financiar istoric: scaderi abrupte, volatilitate si cash-flow negativ cresc nivelul de risc.",
  };
}
