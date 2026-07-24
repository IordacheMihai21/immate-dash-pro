import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { MonthlyFinancialPoint } from "./predictionService";

type RawDatasetRow = Record<string, unknown>;

export type ClientDatasetParseResult = {
  datasetName: string;
  rowCount: number;
  validRows: number;
  monthlyPoints: MonthlyFinancialPoint[];
  monthlyChartData: {
    month: string;
    monthKey: string;
    revenue: number;
    invoiceCount: number;
  }[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "").replace(/-/g, "");
}

function findValue(row: RawDatasetRow, possibleKeys: string[]) {
  const normalizedMap = new Map<string, unknown>();

  Object.entries(row).forEach(([key, value]) => {
    normalizedMap.set(normalizeKey(key), value);
  });

  for (const key of possibleKeys) {
    const value = normalizedMap.get(normalizeKey(key));

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function getMonthKey(value: unknown): string | null {
  if (!value) {
    return null;
  }

  let date: Date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  } else {
    date = new Date(String(value));
  }

  if (Number.isNaN(date.getTime())) {
    return null;
  }

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

function isCancelledInvoice(invoiceNo: unknown) {
  if (!invoiceNo) {
    return false;
  }

  return String(invoiceNo).trim().toLowerCase().startsWith("c");
}

function addRowToMonthlyMap(row: RawDatasetRow, monthlyMap: Map<string, MonthlyFinancialPoint>) {
  const invoiceNo = findValue(row, [
    "InvoiceNo",
    "Invoice",
    "invoice_no",
    "invoice",
    "Factura",
    "NumarFactura",
  ]);

  const invoiceDate = findValue(row, ["InvoiceDate", "Date", "Data", "IssueDate", "DataFactura"]);

  const quantityValue = findValue(row, ["Quantity", "Cantitate", "Qty", "quantity"]);

  const unitPriceValue = findValue(row, ["UnitPrice", "Price", "Pret", "PretUnitar", "unit_price"]);

  const totalValue = findValue(row, ["Total", "Amount", "LineTotal", "Valoare", "TotalFactura"]);

  if (isCancelledInvoice(invoiceNo)) {
    return false;
  }

  const monthKey = getMonthKey(invoiceDate);

  if (!monthKey) {
    return false;
  }

  const quantity = toNumber(quantityValue);
  const unitPrice = toNumber(unitPriceValue);
  const explicitTotal = toNumber(totalValue);

  const revenue = explicitTotal > 0 ? explicitTotal : quantity * unitPrice;

  if (!Number.isFinite(revenue) || revenue <= 0) {
    return false;
  }

  const current = monthlyMap.get(monthKey) ?? {
    monthKey,
    revenue: 0,
    expenses: 0,
    vat: 0,
    invoiceCount: 0,
  };

  current.revenue += revenue;
  current.vat += revenue * 0.19;
  current.invoiceCount += 1;

  monthlyMap.set(monthKey, current);

  return true;
}

function buildResult({
  file,
  rowCount,
  validRows,
  monthlyMap,
}: {
  file: File;
  rowCount: number;
  validRows: number;
  monthlyMap: Map<string, MonthlyFinancialPoint>;
}): ClientDatasetParseResult {
  const monthlyPoints = Array.from(monthlyMap.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((point) => ({
      ...point,
      revenue: Number(point.revenue.toFixed(2)),
      expenses: Number(point.expenses.toFixed(2)),
      vat: Number(point.vat.toFixed(2)),
    }));

  if (monthlyPoints.length === 0) {
    throw new Error(
      "Nu am putut extrage date financiare valide. Fisierul trebuie sa contina coloane de tip InvoiceDate, Quantity si UnitPrice/Price sau Total.",
    );
  }

  return {
    datasetName: file.name,
    rowCount,
    validRows,
    monthlyPoints,
    monthlyChartData: monthlyPoints.map((point) => ({
      month: getMonthLabel(point.monthKey),
      monthKey: point.monthKey,
      revenue: point.revenue,
      invoiceCount: point.invoiceCount,
    })),
  };
}

function parseCsv(file: File): Promise<ClientDatasetParseResult> {
  return new Promise((resolve, reject) => {
    const monthlyMap = new Map<string, MonthlyFinancialPoint>();
    let rowCount = 0;
    let validRows = 0;

    Papa.parse<RawDatasetRow>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      worker: true,
      step: (result) => {
        rowCount += 1;

        if (addRowToMonthlyMap(result.data, monthlyMap)) {
          validRows += 1;
        }
      },
      complete: () => {
        try {
          resolve(
            buildResult({
              file,
              rowCount,
              validRows,
              monthlyMap,
            }),
          );
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

async function parseXlsx(file: File): Promise<ClientDatasetParseResult> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  const monthlyMap = new Map<string, MonthlyFinancialPoint>();
  let rowCount = 0;
  let validRows = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet["!ref"]) {
      return;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headers: string[] = [];

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({
        r: range.s.r,
        c: col,
      });

      const value = sheet[cellAddress]?.v;
      headers[col] = value ? String(value) : "";
    }

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
      const row: RawDatasetRow = {};

      for (let col = range.s.c; col <= range.e.c; col++) {
        const header = headers[col];

        if (!header) {
          continue;
        }

        const cellAddress = XLSX.utils.encode_cell({
          r: rowIndex,
          c: col,
        });

        row[header] = sheet[cellAddress]?.v ?? null;
      }

      rowCount += 1;

      if (addRowToMonthlyMap(row, monthlyMap)) {
        validRows += 1;
      }
    }
  });

  return buildResult({
    file,
    rowCount,
    validRows,
    monthlyMap,
  });
}

export async function parseClientDataset(file: File): Promise<ClientDatasetParseResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCsv(file);
  }

  if (extension === "xlsx" || extension === "xls") {
    return parseXlsx(file);
  }

  throw new Error("Format neacceptat. Incarca un fisier CSV, XLS sau XLSX.");
}
