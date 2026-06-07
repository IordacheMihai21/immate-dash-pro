import {
  buildAiFinancialForecast,
  type AiFinancialForecast,
  type MonthlyFinancialPoint,
} from "./predictionService";
import {
  parseClientDataset,
  type ClientDatasetParseResult,
} from "./clientDatasetParser";

export type DatasetColumnMap = {
  date?: string;
  quantity?: string;
  price?: string;
  total?: string;
  customer?: string;
  product?: string;
  country?: string;
};

const COLUMN_ALIASES: Record<keyof DatasetColumnMap, string[]> = {
  date: ["date", "invoice date", "transaction date", "invoicedate", "data", "data factura"],
  quantity: ["quantity", "qty", "cantitate"],
  price: ["price", "unit price", "unitprice", "pret", "pret unitar"],
  total: ["total", "revenue", "amount", "valoare", "total factura"],
  customer: ["customer", "client", "client name", "nume client"],
  product: ["product", "description", "stockcode", "produs", "descriere"],
  country: ["country", "tara"],
};

function normalizeColumnName(value: string) {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectDatasetColumns(columns: string[]): DatasetColumnMap {
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeColumnName(column),
  }));

  return Object.entries(COLUMN_ALIASES).reduce<DatasetColumnMap>((result, [field, aliases]) => {
    const match = normalizedColumns.find((column) =>
      aliases.some((alias) => column.normalized === normalizeColumnName(alias)),
    );

    if (match) {
      result[field as keyof DatasetColumnMap] = match.original;
    }

    return result;
  }, {});
}

export function calculateMovingAverageForecast(values: number[], windowSize = 3) {
  if (values.length === 0) {
    return 0;
  }

  const window = values.slice(-windowSize);
  const sum = window.reduce((total, value) => total + value, 0);

  return sum / window.length;
}

export function calculateLinearTrendForecast(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  const count = values.length;
  const xValues = values.map((_, index) => index + 1);
  const sumX = xValues.reduce((total, value) => total + value, 0);
  const sumY = values.reduce((total, value) => total + value, 0);
  const sumXY = xValues.reduce((total, value, index) => total + value * values[index], 0);
  const sumX2 = xValues.reduce((total, value) => total + value * value, 0);
  const denominator = count * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return values[values.length - 1];
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;

  return Math.max(slope * (count + 1) + intercept, 0);
}

export function calculateConfidenceLevel(values: number[]) {
  if (values.length < 3) {
    return "Scazut" as const;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variation =
    average > 0
      ? values.reduce((total, value) => total + Math.abs(value - average), 0) /
        values.length /
        average
      : 1;

  if (values.length >= 8 && variation < 0.25) {
    return "Ridicat" as const;
  }

  if (values.length >= 4 && variation < 0.5) {
    return "Mediu" as const;
  }

  return "Scazut" as const;
}

export function forecastFromOfficialData(
  monthlyPoints: MonthlyFinancialPoint[],
): AiFinancialForecast {
  return buildAiFinancialForecast(monthlyPoints);
}

export async function analyzeSimulationDataset(file: File): Promise<{
  dataset: ClientDatasetParseResult;
  prediction: AiFinancialForecast;
}> {
  const dataset = await parseClientDataset(file);
  const prediction = buildAiFinancialForecast(dataset.monthlyPoints);

  return {
    dataset,
    prediction,
  };
}
