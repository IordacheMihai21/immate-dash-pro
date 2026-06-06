import { DEMO_COMPANY_ID, supabase } from "./supabaseClient";
import type { AiFinancialForecast } from "./predictionService";

const DEMO_COMPANY_CUI = "RO12345678";

export type AiTrainingRun = {
  id: string;
  company_id: string;
  model_version: string;
  target_metric: string;
  selected_model: string;
  training_points: number;
  mae: number | null;
  confidence_level: string | null;
  risk_level: string | null;
  training_data: unknown;
  model_comparison: unknown;
  model_output: unknown;
  trained_at: string;
};

export type SavedPredictionResult = {
  id: string;
  company_id: string;
  model_training_run_id: string | null;
  prediction_type: string;
  predicted_period: string;
  predicted_revenue: number | null;
  predicted_expenses: number | null;
  predicted_profit: number | null;
  predicted_vat: number | null;
  predicted_cash_flow: number | null;
  cash_flow_30_days: number | null;
  cash_flow_60_days: number | null;
  cash_flow_90_days: number | null;
  selected_model: string | null;
  mae: number | null;
  confidence_level: string | null;
  risk_level: string | null;
  actual_revenue: number | null;
  actual_expenses: number | null;
  actual_profit: number | null;
  actual_cash_flow: number | null;
  actual_error: number | null;
  explanation: string | null;
  created_at: string;
};

type SaveAiTrainingInput = {
  prediction: AiFinancialForecast;
  trainingData: unknown[];
  trainingPoints: number;
};

type RelationParty =
  | {
      name: string | null;
      cui: string | null;
    }
  | {
      name: string | null;
      cui: string | null;
    }[]
  | null
  | undefined;

type MonthlyActuals = {
  monthLabel: string;
  revenue: number;
  expenses: number;
  profit: number;
  cashFlow: number;
};

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCui(cui: string | null | undefined): string {
  return (cui ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function getMonthKey(dateValue: string | null | undefined): string {
  if (!dateValue) {
    return "Necunoscut";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Necunoscut";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  if (monthKey === "Necunoscut") {
    return "N/A";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("ro-RO", {
    month: "short",
    year: "numeric",
  });
}

export async function saveAiTrainingRun({
  prediction,
  trainingData,
  trainingPoints,
}: SaveAiTrainingInput) {
  const { data: trainingRun, error: trainingError } = await supabase
    .from("ai_model_training_runs")
    .insert({
      company_id: DEMO_COMPANY_ID,
      model_version: "IMMAPP-AI-v1",
      target_metric: "financial_forecast",
      selected_model: prediction.selectedModel,
      training_points: trainingPoints,
      mae: prediction.mae,
      confidence_level: prediction.confidenceLevel,
      risk_level: prediction.riskLevel,
      training_data: trainingData,
      model_comparison: prediction.modelComparison,
      model_output: prediction,
    })
    .select("id")
    .single();

  if (trainingError) {
    throw new Error(
      `Eroare la salvarea antrenarii AI: ${trainingError.message}`,
    );
  }

  const { data: predictionResult, error: predictionError } = await supabase
    .from("prediction_results")
    .insert({
      company_id: DEMO_COMPANY_ID,
      model_training_run_id: trainingRun.id,
      prediction_type: "financial_forecast",
      predicted_period: prediction.predictedPeriod,
      predicted_revenue: prediction.revenueForecast,
      predicted_expenses: prediction.expensesForecast,
      predicted_profit: prediction.profitForecast,
      predicted_vat: prediction.vatForecast,
      predicted_cash_flow: prediction.cashFlowForecast,
      cash_flow_30_days: prediction.cashFlow30Days,
      cash_flow_60_days: prediction.cashFlow60Days,
      cash_flow_90_days: prediction.cashFlow90Days,
      selected_model: prediction.selectedModel,
      mae: prediction.mae,
      confidence_level: prediction.confidenceLevel,
      risk_level: prediction.riskLevel,
      explanation: prediction.explanation,
    })
    .select("id")
    .single();

  if (predictionError) {
    throw new Error(
      `Eroare la salvarea predictiei AI: ${predictionError.message}`,
    );
  }

  return {
    trainingRunId: trainingRun.id,
    predictionResultId: predictionResult.id,
  };
}

export async function getAiTrainingRuns() {
  const { data, error } = await supabase
    .from("ai_model_training_runs")
    .select("*")
    .eq("company_id", DEMO_COMPANY_ID)
    .order("trained_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Eroare la citirea antrenarilor AI: ${error.message}`);
  }

  return (data ?? []) as AiTrainingRun[];
}

export async function getPredictionResults() {
  const { data, error } = await supabase
    .from("prediction_results")
    .select("*")
    .eq("company_id", DEMO_COMPANY_ID)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Eroare la citirea predictiilor AI: ${error.message}`);
  }

  return (data ?? []) as SavedPredictionResult[];
}

export async function updatePredictionWithActuals({
  predictionId,
  actualRevenue,
  actualExpenses,
  actualProfit,
  actualCashFlow,
}: {
  predictionId: string;
  actualRevenue: number;
  actualExpenses: number;
  actualProfit: number;
  actualCashFlow: number;
}) {
  const { data: existingPrediction, error: readError } = await supabase
    .from("prediction_results")
    .select("predicted_profit")
    .eq("id", predictionId)
    .single();

  if (readError) {
    throw new Error(`Eroare la citirea predictiei: ${readError.message}`);
  }

  const predictedProfit = Number(existingPrediction.predicted_profit ?? 0);
  const actualError = Math.abs(actualProfit - predictedProfit);

  const { error: updateError } = await supabase
    .from("prediction_results")
    .update({
      actual_revenue: actualRevenue,
      actual_expenses: actualExpenses,
      actual_profit: actualProfit,
      actual_cash_flow: actualCashFlow,
      actual_error: actualError,
    })
    .eq("id", predictionId);

  if (updateError) {
    throw new Error(`Eroare la actualizarea predictiei: ${updateError.message}`);
  }
}

async function getMonthlyActualsFromInvoices() {
  const { data: invoicesData, error } = await supabase
    .from("invoices")
    .select(`
      id,
      issue_date,
      created_at,
      payable_amount,
      tax_amount,
      suppliers (
        name,
        cui
      ),
      customers (
        name,
        cui
      )
    `)
    .eq("company_id", DEMO_COMPANY_ID);

  if (error) {
    throw new Error(`Eroare la citirea facturilor reale: ${error.message}`);
  }

  const actualsMap = new Map<string, MonthlyActuals>();

  (invoicesData ?? []).forEach((invoice) => {
    const monthKey = getMonthKey(invoice.issue_date ?? invoice.created_at);
    const monthLabel = getMonthLabel(monthKey);

    const current = actualsMap.get(monthLabel) ?? {
      monthLabel,
      revenue: 0,
      expenses: 0,
      profit: 0,
      cashFlow: 0,
    };

    const supplier = getRelationParty(invoice.suppliers as RelationParty);
    const customer = getRelationParty(invoice.customers as RelationParty);

    const supplierCui = normalizeCui(supplier?.cui);
    const customerCui = normalizeCui(customer?.cui);

    const value = toNumber(invoice.payable_amount);
    const vat = toNumber(invoice.tax_amount);

    if (supplierCui === DEMO_COMPANY_CUI) {
      current.revenue += value;
    } else if (customerCui === DEMO_COMPANY_CUI) {
      current.expenses += value;
    } else {
      current.expenses += value;
    }

    current.profit = current.revenue - current.expenses;
    current.cashFlow = current.profit - vat;

    actualsMap.set(monthLabel, current);
  });

  return actualsMap;
}

export async function evaluateSavedPredictions() {
  const actualsMap = await getMonthlyActualsFromInvoices();

  const { data: pendingPredictions, error: predictionsError } = await supabase
    .from("prediction_results")
    .select("*")
    .eq("company_id", DEMO_COMPANY_ID)
    .is("actual_error", null)
    .order("created_at", { ascending: true });

  if (predictionsError) {
    throw new Error(
      `Eroare la citirea predictiilor in asteptare: ${predictionsError.message}`,
    );
  }

  let evaluatedCount = 0;
  let skippedCount = 0;

  for (const prediction of pendingPredictions ?? []) {
    const actuals = actualsMap.get(prediction.predicted_period);

    if (!actuals) {
      skippedCount += 1;
      continue;
    }

    const predictedProfit = Number(prediction.predicted_profit ?? 0);
    const actualError = Math.abs(actuals.profit - predictedProfit);

    const { error: updateError } = await supabase
      .from("prediction_results")
      .update({
        actual_revenue: actuals.revenue,
        actual_expenses: actuals.expenses,
        actual_profit: actuals.profit,
        actual_cash_flow: actuals.cashFlow,
        actual_error: actualError,
      })
      .eq("id", prediction.id);

    if (updateError) {
      throw new Error(
        `Eroare la evaluarea predictiei ${prediction.id}: ${updateError.message}`,
      );
    }

    evaluatedCount += 1;
  }

  return {
    evaluatedCount,
    skippedCount,
  };
}