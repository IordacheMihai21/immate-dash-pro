export const DOCUMENT_AI_EVALUATION_FIELDS = [
  "invoiceNumber",
  "invoiceDate",
  "supplierName",
  "supplierCui",
  "customerName",
  "customerCui",
  "subtotal",
  "vatAmount",
  "totalAmount",
  "currency",
] as const;

export type DocumentAiEvaluationField = (typeof DOCUMENT_AI_EVALUATION_FIELDS)[number];

export type DocumentAiEvaluationFields = Partial<
  Record<DocumentAiEvaluationField, string | number | null | undefined>
>;

export type FieldComparison = {
  field: DocumentAiEvaluationField;
  predicted: string;
  expected: string;
  correct: boolean;
  strictCorrect: boolean;
  evaluated: boolean;
  missing: boolean;
  incorrect: boolean;
};

export type DocumentEvaluationResult = {
  documentId: string;
  exactMatch: boolean;
  strictExactMatch: boolean;
  normalizedExactMatch: boolean;
  fieldAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  correctFields: number;
  missingFields: number;
  incorrectFields: number;
  totalFields: number;
  fields: FieldComparison[];
};

export type BatchEvaluationItem = {
  documentId?: string;
  predicted: DocumentAiEvaluationFields;
  expected: DocumentAiEvaluationFields;
};

export type BatchEvaluationResult = {
  documentsEvaluated: number;
  exactMatchRate: number;
  strictExactMatchRate: number;
  normalizedExactMatchRate: number;
  fieldAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  correctFields: number;
  missingFields: number;
  incorrectFields: number;
  totalFields: number;
  documents: DocumentEvaluationResult[];
  fieldMetrics: Array<{
    field: DocumentAiEvaluationField;
    accuracy: number;
    correct: number;
    missing: number;
    incorrect: number;
    total: number;
  }>;
};

type AnnotationEntry = {
  key: string;
  text: string;
};

const FIELD_KEYS = new Set<string>(DOCUMENT_AI_EVALUATION_FIELDS);

export function hasEvaluationFields(fields: DocumentAiEvaluationFields) {
  return DOCUMENT_AI_EVALUATION_FIELDS.some((field) => {
    const value = fields[field];

    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

export function parseFaturaAnnotationToExpected(annotation: unknown): DocumentAiEvaluationFields {
  if (isRecord(annotation) && hasDirectEvaluationKeys(annotation)) {
    return toEvaluationFields(annotation);
  }

  const entries = collectAnnotationEntries(annotation);
  const numberText = findAnnotationText(
    entries,
    (key) => key === "NUMBER" || key === "INVOICENUMBER",
  );
  const dateText = findAnnotationText(entries, (key) => key === "DATE" || key === "INVOICEDATE");
  const sellerText = findAnnotationText(entries, (key) =>
    ["SELLERNAME", "SUPPLIERNAME", "VENDORNAME"].includes(key),
  );
  const gstinText = findAnnotationText(entries, (key) =>
    ["GSTIN", "GSTINSELLER", "SUPPLIERCUI", "SUPPLIERTAXID", "VATID", "TAXID"].includes(key),
  );
  const buyerText = findAnnotationText(entries, (key) =>
    ["BUYER", "BUYERNAME", "CUSTOMER", "CUSTOMERNAME"].includes(key),
  );
  const subtotalText = findAnnotationText(entries, (key) =>
    ["SUBTOTAL", "SUBTOTALAMOUNT", "SUBTOTALVALUE", "NETAMOUNT"].includes(key),
  );
  const vatText = findAnnotationText(
    entries,
    (key) =>
      /^(GST|VAT|TAX|TVA)/.test(key) &&
      !/^(GSTIN|VATID|VATCODE|TAXID)/.test(key) &&
      !key.includes("TOTAL"),
  );
  const totalText = findAnnotationText(entries, (key) =>
    ["TOTAL", "GRANDTOTAL", "AMOUNTDUE", "PAYABLEAMOUNT"].includes(key),
  );
  const currency =
    extractCurrency(totalText) ?? extractCurrency(subtotalText) ?? extractCurrency(vatText) ?? "";

  return {
    invoiceNumber: extractInvoiceNumber(numberText),
    invoiceDate: extractIsoDate(dateText),
    supplierName: cleanupAnnotationLabel(sellerText),
    supplierCui: extractTaxIdentifier(gstinText),
    customerName: extractBuyerName(buyerText),
    customerCui: "",
    subtotal: formatAnnotationAmount(extractAmount(subtotalText)),
    vatAmount: formatAnnotationAmount(extractAmount(vatText)),
    totalAmount: formatAnnotationAmount(extractAmount(totalText)),
    currency,
  };
}

export function normalizeValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const rawValue = stripFieldLabel(String(value).trim());
  const dateValue = parseComparableDate(rawValue);

  if (dateValue) {
    return dateValue;
  }

  const numericValue = parseComparableNumber(rawValue);

  if (numericValue !== null) {
    return numericValue.toFixed(2);
  }

  return rawValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bRO(?=\d)/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function compareField(
  predicted: unknown,
  expected: unknown,
  field: DocumentAiEvaluationField,
): FieldComparison {
  const normalizedPredicted = normalizeValue(predicted);
  const normalizedExpected = normalizeValue(expected);
  const rawPredicted =
    predicted === null || predicted === undefined ? "" : String(predicted).trim();
  const rawExpected = expected === null || expected === undefined ? "" : String(expected).trim();
  const evaluated = Boolean(normalizedExpected);
  const missing = Boolean(normalizedExpected) && !normalizedPredicted;
  const correct = Boolean(normalizedExpected) && normalizedPredicted === normalizedExpected;
  const strictCorrect = evaluated && rawPredicted === rawExpected;
  const incorrect = Boolean(normalizedExpected) && Boolean(normalizedPredicted) && !correct;

  return {
    field,
    predicted: predicted === null || predicted === undefined ? "" : String(predicted),
    expected: expected === null || expected === undefined ? "" : String(expected),
    correct,
    strictCorrect,
    evaluated,
    missing,
    incorrect,
  };
}

export function calculatePrecisionRecallF1({
  correct,
  missing,
  incorrect,
}: {
  correct: number;
  missing: number;
  incorrect: number;
}) {
  const precisionDenominator = correct + incorrect;
  const recallDenominator = correct + missing + incorrect;
  const precision = precisionDenominator > 0 ? correct / precisionDenominator : 0;
  const recall = recallDenominator > 0 ? correct / recallDenominator : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1Score,
  };
}

export function evaluateDocument(
  predictedFields: DocumentAiEvaluationFields,
  groundTruthFields: DocumentAiEvaluationFields,
  documentId = "Document curent",
): DocumentEvaluationResult {
  const fields = DOCUMENT_AI_EVALUATION_FIELDS.map((field) =>
    compareField(predictedFields[field], groundTruthFields[field], field),
  );
  const correctFields = fields.filter((field) => field.correct).length;
  const missingFields = fields.filter((field) => field.missing).length;
  const incorrectFields = fields.filter((field) => field.incorrect).length;
  const totalFields = fields.filter((field) => normalizeValue(field.expected)).length;
  const fieldAccuracy = totalFields > 0 ? correctFields / totalFields : 0;
  const evaluatedFields = fields.filter((field) => field.evaluated);
  const strictExactMatch =
    evaluatedFields.length > 0 && evaluatedFields.every((field) => field.strictCorrect);
  const normalizedExactMatch =
    evaluatedFields.length > 0 && evaluatedFields.every((field) => field.correct);
  const exactMatch = normalizedExactMatch;
  const { precision, recall, f1Score } = calculatePrecisionRecallF1({
    correct: correctFields,
    missing: missingFields,
    incorrect: incorrectFields,
  });

  return {
    documentId,
    exactMatch,
    strictExactMatch,
    normalizedExactMatch,
    fieldAccuracy,
    precision,
    recall,
    f1Score,
    correctFields,
    missingFields,
    incorrectFields,
    totalFields,
    fields,
  };
}

export function evaluateBatch(items: BatchEvaluationItem[]): BatchEvaluationResult {
  const documents = items.map((item, index) =>
    evaluateDocument(item.predicted, item.expected, item.documentId ?? `Document ${index + 1}`),
  );
  const correctFields = documents.reduce((sum, item) => sum + item.correctFields, 0);
  const missingFields = documents.reduce((sum, item) => sum + item.missingFields, 0);
  const incorrectFields = documents.reduce((sum, item) => sum + item.incorrectFields, 0);
  const totalFields = documents.reduce((sum, item) => sum + item.totalFields, 0);
  const { precision, recall, f1Score } = calculatePrecisionRecallF1({
    correct: correctFields,
    missing: missingFields,
    incorrect: incorrectFields,
  });

  return {
    documentsEvaluated: documents.length,
    strictExactMatchRate:
      documents.length > 0
        ? documents.filter((document) => document.strictExactMatch).length / documents.length
        : 0,
    normalizedExactMatchRate:
      documents.length > 0
        ? documents.filter((document) => document.normalizedExactMatch).length / documents.length
        : 0,
    exactMatchRate:
      documents.length > 0
        ? documents.filter((document) => document.normalizedExactMatch).length / documents.length
        : 0,
    fieldAccuracy: totalFields > 0 ? correctFields / totalFields : 0,
    precision,
    recall,
    f1Score,
    correctFields,
    missingFields,
    incorrectFields,
    totalFields,
    documents,
    fieldMetrics: DOCUMENT_AI_EVALUATION_FIELDS.map((field) => {
      const comparisons = documents.map((document) =>
        document.fields.find((comparison) => comparison.field === field),
      );
      const total = comparisons.filter((comparison) => normalizeValue(comparison?.expected)).length;
      const correct = comparisons.filter((comparison) => comparison?.correct).length;
      const missing = comparisons.filter((comparison) => comparison?.missing).length;
      const incorrect = comparisons.filter((comparison) => comparison?.incorrect).length;

      return {
        field,
        accuracy: total > 0 ? correct / total : 0,
        correct,
        missing,
        incorrect,
        total,
      };
    }),
  };
}

function collectAnnotationEntries(value: unknown, parentKey = ""): AnnotationEntry[] {
  if (!isRecord(value)) {
    return [];
  }

  const directText = value.text;
  const entries: AnnotationEntry[] = [];

  if (
    parentKey &&
    (typeof directText === "string" ||
      typeof directText === "number" ||
      typeof directText === "boolean")
  ) {
    entries.push({
      key: parentKey,
      text: String(directText),
    });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "text") {
      return;
    }

    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      entries.push({
        key,
        text: String(child),
      });
      return;
    }

    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        entries.push(...collectAnnotationEntries(item, `${key}.${index}`));
      });
      return;
    }

    entries.push(...collectAnnotationEntries(child, key));
  });

  return entries;
}

function findAnnotationText(
  entries: AnnotationEntry[],
  matcher: (normalizedKey: string, rawKey: string) => boolean,
) {
  return entries.find((entry) => matcher(normalizeAnnotationKey(entry.key), entry.key))?.text ?? "";
}

function normalizeAnnotationKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function extractInvoiceNumber(value: string) {
  return cleanupAnnotationLabel(value)
    .replace(/^(?:INVOICE\s*(?:#|NO\.?|NUMBER|ID)?|NUMBER|ID)\s*[:#-]?\s*/i, "")
    .trim();
}

function extractIsoDate(value: string) {
  const match = cleanupAnnotationLabel(value).match(
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/i,
  );

  return match?.[1] ? normalizeDateToIso(match[1]) : "";
}

function extractTaxIdentifier(value: string) {
  return cleanupAnnotationLabel(value)
    .replace(
      /^(GSTIN|VAT\s*(?:ID|CODE|NO\.?|NUMBER)?|TAX\s*(?:ID|NO\.?|NUMBER)?|CUI|CIF)\s*[:#-]?\s*/i,
      "",
    )
    .replace(/\s+/g, "")
    .trim();
}

function extractBuyerName(value: string) {
  return (
    cleanupAnnotationLabel(value)
      .split(/\r?\n/)
      .map((line) =>
        line.replace(/^(BUYER|CUSTOMER|CLIENT|BILL\s+TO|SOLD\s+TO)\s*[:#-]?\s*/i, "").trim(),
      )
      .find(Boolean) ?? ""
  );
}

function cleanupAnnotationLabel(value: string | undefined) {
  return String(value ?? "").trim();
}

function extractAmount(value: string) {
  const text = cleanupAnnotationLabel(value).replace(/\b(RON|LEI|EUR|USD|GBP)\b/gi, "");
  const matches = Array.from(text.matchAll(/-?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:[,.]\d{1,2})?/g))
    .map((match) => parseComparableNumber(match[0]))
    .filter((amount): amount is number => amount !== null);

  return matches[matches.length - 1] ?? null;
}

function formatAnnotationAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function extractCurrency(value: string) {
  const text = cleanupAnnotationLabel(value);
  const code = text.match(/\b(RON|LEI|LEU|EUR|USD|GBP)\b/i)?.[1]?.toUpperCase();

  if (code) {
    return code === "LEI" || code === "LEU" ? "RON" : code;
  }
  if (text.includes("$")) return "USD";
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  return "";
}

function hasDirectEvaluationKeys(value: Record<string, unknown>) {
  return Object.keys(value).some((key) => FIELD_KEYS.has(key));
}

function toEvaluationFields(value: Record<string, unknown>): DocumentAiEvaluationFields {
  return DOCUMENT_AI_EVALUATION_FIELDS.reduce((acc, field) => {
    acc[field] = value[field] as string | number | null | undefined;

    return acc;
  }, {} as DocumentAiEvaluationFields);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseComparableNumber(value: string) {
  const numericText = value.replace(/\b(RON|LEI|EUR|USD|GBP)\b/gi, "").trim();

  if (!/^-?\d[\d\s.,]*$/.test(numericText)) {
    return null;
  }

  const compact = numericText.replace(/\s+/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const normalized =
    decimalSeparator === ","
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateToIso(value: string) {
  const compact = normalizeDateForComparison(value);

  return compact ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : "";
}

function stripFieldLabel(value: string) {
  return value
    .replace(
      /^(buyer|client|customer|bill\s+to|sold\s+to|supplier|seller|vendor|furnizor|beneficiar|cumparator|cumpărător)\s*[:#-]?\s*/i,
      "",
    )
    .trim();
}

function parseComparableDate(value: string) {
  const match = value.match(
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/i,
  );

  if (!match?.[1]) {
    return null;
  }

  const normalized = normalizeDateForComparison(match[1]);

  return normalized || null;
}

function normalizeDateForComparison(value: string) {
  const parts = value
    .replace(/[./\s]/g, "-")
    .split("-")
    .filter(Boolean);

  if (parts[0]?.length === 4) {
    const [year, month, day] = parts;
    const normalizedMonth = normalizeMonthForComparison(month);

    return isValidDateParts(year, normalizedMonth, day)
      ? `${year}${padDatePart(normalizedMonth)}${padDatePart(day)}`
      : "";
  }

  const [day, month, yearPart] = parts;
  const year = yearPart?.length === 2 ? `20${yearPart}` : yearPart;
  const normalizedMonth = normalizeMonthForComparison(month);

  return isValidDateParts(year, normalizedMonth, day)
    ? `${year}${padDatePart(normalizedMonth)}${padDatePart(day)}`
    : "";
}

function normalizeMonthForComparison(value: string | undefined) {
  if (!value) {
    return "";
  }

  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const normalized = value.slice(0, 4).toLowerCase();
  const shortMonth = value.slice(0, 3).toLowerCase();

  return monthMap[normalized] ?? monthMap[shortMonth] ?? value;
}

function isValidDateParts(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  return (
    Number.isInteger(numericYear) &&
    Number.isInteger(numericMonth) &&
    Number.isInteger(numericDay) &&
    numericYear >= 1900 &&
    numericYear <= 2100 &&
    numericMonth >= 1 &&
    numericMonth <= 12 &&
    numericDay >= 1 &&
    numericDay <= 31
  );
}

function padDatePart(value: string | undefined) {
  return String(value ?? "1").padStart(2, "0");
}
