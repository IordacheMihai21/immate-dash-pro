import type { AiFinancialForecast, MonthlyFinancialPoint } from "./predictionService";

export type RiskClass = "Scazut" | "Mediu" | "Ridicat";
export type TrendClass = "Crestere" | "Stabil" | "Scadere";

export type RiskClassificationResult = {
  paymentRiskClass: RiskClass;
  cashFlowRiskClass: RiskClass;
  financialTrendClass: TrendClass;
  riskFactors: string[];
  explanation: string;
};

function toSafeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
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

  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;

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

  const paymentScore =
    (recentGrowthRate < -20 ? 38 : recentGrowthRate < -10 ? 24 : 8) +
    (volatility > 0.45 ? 30 : volatility > 0.25 ? 18 : 6) +
    (forecast.paymentDelayRisk === "Ridicat"
      ? 28
      : forecast.paymentDelayRisk === "Mediu"
        ? 15
        : 4) +
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
    riskFactors,
    // Deliberately not a trained/evaluated classifier: this is a
    // transparent point-scoring heuristic over recent growth, revenue
    // volatility and estimated cash flow. An earlier version of this
    // service reported accuracy/precision/recall/F1/a confusion matrix,
    // but those were computed by grading this same heuristic against
    // itself on shifted time windows -- there was no independent ground
    // truth, so the numbers looked like a validated ML model when they
    // were not. Removed 2026-09-04; the risk factors below are the real,
    // checkable explanation for the score instead.
    explanation:
      "Clasificarea foloseste reguli explicabile pe baza istoricului financiar recent: scaderi abrupte, volatilitate si cash-flow negativ cresc nivelul de risc. Nu este un model antrenat -- fiecare factor de mai jos e verificabil direct in datele tale.",
  };
}
