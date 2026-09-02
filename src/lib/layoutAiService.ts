import type { DocumentAiFieldKey, OcrWord } from "@/lib/documentAiService";
import {
  cleanPartyName,
  isInvalidPartyCandidate,
  normalizeInvoiceNumber,
} from "@/lib/invoiceCandidateEngine";
import { supabase } from "@/lib/supabaseClient";

const fieldKeys: DocumentAiFieldKey[] = [
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
];

const monthNames: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type LayoutAiStatus = "ok" | "success" | "fallback" | "unavailable";
export type LayoutAiRuntimeMode =
  | "full_layoutxlm"
  | "layoutxlm_backbone"
  | "fallback_layout_aware"
  | "unavailable";

export type LayoutAiFields = Record<DocumentAiFieldKey, string>;
export type LayoutAiComparisonStatus = "confirmed" | "proposal" | "review" | "missing";

export type LayoutAiFieldDetail = {
  value: string;
  confidence: number;
  method: string;
  sourceText?: string | null;
  warning?: string | null;
};

export type LayoutAiHealth = {
  status: string;
  service: string;
  model: string;
  model_id: string;
  runtime_mode: LayoutAiRuntimeMode;
  layout_model_available: boolean;
  model_inference_available: boolean;
  fine_tuned_model_available?: boolean;
  fine_tuned_model_used?: boolean;
  fine_tuned_model_path?: string;
  layoutxlm_training_ready?: boolean;
  fallback_available: boolean;
  fallback_reason?: string | null;
  device: string;
  notes: string[];
};

export type LayoutAiToken = {
  text: string;
  label?: string | null;
  confidence?: number | null;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type LayoutAiBox = {
  text?: string;
  label?: string | null;
  confidence?: number | null;
  box?: number[];
};

export type LayoutAiBackendResponse = {
  model: string;
  model_id: string;
  status: LayoutAiStatus;
  runtime_mode: LayoutAiRuntimeMode;
  layout_model_available: boolean;
  model_inference_executed: boolean;
  fine_tuned_model_available: boolean;
  fine_tuned_model_used: boolean;
  fine_tuned_model_path?: string | null;
  layoutxlm_training_ready: boolean;
  field_extraction_method: string;
  fallback_reason?: string | null;
  confidence: number;
  fields: LayoutAiFields;
  field_details: Record<DocumentAiFieldKey, LayoutAiFieldDetail>;
  comparison: Record<string, unknown>;
  tokens: LayoutAiToken[];
  boxes: LayoutAiBox[];
  notes: string[];
  technical: {
    device: string;
    tokens_count: number;
    words_count: number;
    boxes_count: number;
    model_confidence?: number | null;
  };
};

export type AnalyzeLayoutPayload = {
  file?: File | null;
  ocrText?: string | null;
  ocrWords?: OcrWord[] | null;
  documentAiFields?: Partial<Record<DocumentAiFieldKey, unknown>> | null;
  verifiedFields?: DocumentAiFieldKey[] | null;
};

export function getLayoutAiBackendUrl() {
  const configuredUrl = import.meta.env.VITE_DOCUMENT_AI_BACKEND_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  const hostname = window.location.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  return `http://${hostname}:8000`;
}

const LAYOUT_AI_BACKEND_URL = getLayoutAiBackendUrl();
const HEALTH_TIMEOUT_MS = 10_000;
const ANALYZE_TIMEOUT_MS = 60_000;

export async function checkLayoutAiHealth(): Promise<LayoutAiHealth> {
  const endpoint = "/health";
  const response = await fetchLayoutAi(endpoint, undefined, HEALTH_TIMEOUT_MS);

  if (!response.ok) {
    throwLayoutAiRequestError(endpoint, new Error(`HTTP ${response.status}`));
  }

  return (await response.json()) as LayoutAiHealth;
}

export async function analyzeLayoutWithBackend(
  payload: AnalyzeLayoutPayload,
): Promise<LayoutAiBackendResponse> {
  const formData = new FormData();

  if (payload.file) {
    formData.append("file", payload.file);
  }

  if (payload.ocrText?.trim()) {
    formData.append("ocr_text", payload.ocrText);
  }

  if (payload.ocrWords?.length) {
    formData.append("ocr_words", JSON.stringify(payload.ocrWords));
  }

  if (payload.documentAiFields) {
    formData.append("document_ai_fields", JSON.stringify(payload.documentAiFields));
  }

  if (payload.verifiedFields?.length) {
    formData.append("verified_fields", JSON.stringify(payload.verifiedFields));
  }

  const endpoint = "/analyze-layout";
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetchLayoutAi(
    endpoint,
    {
      method: "POST",
      body: formData,
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    },
    ANALYZE_TIMEOUT_MS,
  );

  if (!response.ok) {
    throwLayoutAiRequestError(endpoint, new Error(`HTTP ${response.status}`));
  }

  const data = (await response.json()) as Partial<LayoutAiBackendResponse>;

  return {
    model: data.model ?? "LayoutXLM",
    model_id: data.model_id ?? "microsoft/layoutxlm-base",
    status: data.status ?? "unavailable",
    runtime_mode: normalizeRuntimeMode(data.runtime_mode),
    layout_model_available: Boolean(data.layout_model_available),
    model_inference_executed: Boolean(data.model_inference_executed),
    fine_tuned_model_available: Boolean(data.fine_tuned_model_available),
    fine_tuned_model_used: Boolean(data.fine_tuned_model_used),
    fine_tuned_model_path: data.fine_tuned_model_path ?? null,
    layoutxlm_training_ready: Boolean(data.layoutxlm_training_ready),
    field_extraction_method: data.field_extraction_method ?? "Fallback layout-aware extraction",
    fallback_reason: data.fallback_reason ?? null,
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
    fields: normalizeLayoutFields(data.fields),
    field_details: normalizeFieldDetails(data.field_details),
    comparison: normalizeObject(data.comparison),
    tokens: Array.isArray(data.tokens) ? data.tokens : [],
    boxes: Array.isArray(data.boxes) ? data.boxes : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    technical: normalizeTechnical(data.technical),
  };
}

export function compareLayoutFieldValues(
  field: DocumentAiFieldKey,
  proposedValue: unknown,
  currentValue: unknown,
): {
  status: LayoutAiComparisonStatus;
  equivalent: boolean;
  formatDifference: boolean;
} {
  const proposed = stringifyField(proposedValue).trim();
  const current = stringifyField(currentValue).trim();

  if (!proposed && !current) {
    return { status: "missing", equivalent: true, formatDifference: false };
  }

  if (proposed && !current) {
    return {
      status: isLayoutFieldSemanticallyValid(field, proposed) ? "proposal" : "review",
      equivalent: false,
      formatDifference: false,
    };
  }

  if (!proposed && current) {
    return { status: "missing", equivalent: false, formatDifference: false };
  }

  const equivalent = areLayoutFieldValuesEquivalent(field, proposed, current);
  const semanticallyValid =
    isLayoutFieldSemanticallyValid(field, proposed) &&
    isLayoutFieldSemanticallyValid(field, current);
  return {
    status: equivalent && semanticallyValid ? "confirmed" : "review",
    equivalent,
    formatDifference: equivalent && normalizePlainText(proposed) !== normalizePlainText(current),
  };
}

export function isLayoutFieldSemanticallyValid(field: DocumentAiFieldKey, value: unknown) {
  const text = stringifyField(value).trim();
  if (!text) return false;
  if (field === "supplierName" || field === "customerName") {
    return !isInvalidPartyCandidate(text);
  }
  if (field === "invoiceNumber") {
    return /\d/.test(text) && Boolean(normalizeInvoiceNumber(text));
  }
  if (field === "invoiceDate") return normalizeDateValue(text) !== null;
  if (field === "subtotal" || field === "vatAmount" || field === "totalAmount") {
    return normalizeAmountValue(text) !== null;
  }
  if (field === "currency") {
    return ["RON", "EUR", "USD", "GBP"].includes(normalizeCurrencyValue(text));
  }
  return true;
}

export function isCleanerLayoutProposal(
  field: DocumentAiFieldKey,
  proposedValue: unknown,
  currentValue: unknown,
) {
  const proposed = stringifyField(proposedValue).trim();
  const current = stringifyField(currentValue).trim();
  if (!isLayoutFieldSemanticallyValid(field, proposed)) return false;
  if (!current || !isLayoutFieldSemanticallyValid(field, current)) return true;
  if (field === "supplierName" || field === "customerName") {
    const cleanedCurrent = cleanPartyName(current);
    return (
      normalizePlainText(cleanedCurrent) === normalizePlainText(proposed) &&
      proposed.length < current.length
    );
  }
  return false;
}

export function areLayoutFieldValuesEquivalent(
  field: DocumentAiFieldKey,
  leftValue: unknown,
  rightValue: unknown,
) {
  const left = stringifyField(leftValue).trim();
  const right = stringifyField(rightValue).trim();

  if (!left || !right) {
    return left === right;
  }

  if (field === "invoiceDate") {
    const leftDate = normalizeDateValue(left);
    const rightDate = normalizeDateValue(right);
    return Boolean(leftDate && rightDate && leftDate === rightDate);
  }

  if (field === "subtotal" || field === "vatAmount" || field === "totalAmount") {
    const leftAmount = normalizeAmountValue(left);
    const rightAmount = normalizeAmountValue(right);
    return (
      leftAmount !== null && rightAmount !== null && Math.abs(leftAmount - rightAmount) <= 0.01
    );
  }

  if (field === "currency") {
    return normalizeCurrencyValue(left) === normalizeCurrencyValue(right);
  }

  if (field === "supplierCui" || field === "customerCui") {
    return normalizeCuiValue(left) === normalizeCuiValue(right);
  }

  if (field === "invoiceNumber") {
    return normalizeIdentifier(left) === normalizeIdentifier(right);
  }

  return normalizePlainText(left) === normalizePlainText(right);
}

export function normalizeDateValue(value: unknown): string | null {
  const text = stringifyField(value).trim();
  if (!text) {
    return null;
  }

  const isoMatch = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const numericMatch = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (numericMatch) {
    const year = normalizeYear(Number(numericMatch[3]));
    return toIsoDate(year, Number(numericMatch[2]), Number(numericMatch[1]));
  }

  const monthMatch = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})\b/i);
  if (monthMatch) {
    const month = monthNames[monthMatch[2].slice(0, 3).toLowerCase()];
    if (month) {
      return toIsoDate(normalizeYear(Number(monthMatch[3])), month, Number(monthMatch[1]));
    }
  }

  return null;
}

export function normalizeAmountValue(value: unknown): number | null {
  let text = stringifyField(value)
    .toUpperCase()
    .replace(/\b(RON|LEI|EUR|USD|GBP)\b/g, "")
    .replace(/[€$£]/g, "")
    .replace(/[\s'’]/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!text) {
    return null;
  }

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : lastDot >= 0 ? "." : "";

  if (decimalSeparator) {
    const separatorIndex = text.lastIndexOf(decimalSeparator);
    const decimals = text.slice(separatorIndex + 1);
    const integer = text.slice(0, separatorIndex).replace(/[.,]/g, "");
    text = decimals.length <= 2 ? `${integer}.${decimals}` : `${integer}${decimals}`;
  } else {
    text = text.replace(/[.,]/g, "");
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCurrencyValue(value: unknown) {
  const normalized = stringifyField(value).trim().toUpperCase();
  return normalized === "LEI" || normalized === "LEU" ? "RON" : normalized;
}

export function normalizeCuiValue(value: unknown) {
  return stringifyField(value)
    .toUpperCase()
    .replace(/^\s*(CUI|CIF|VAT(?:\s+(?:ID|CODE))?)\s*[:#-]?\s*/i, "")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^RO(?=\d)/, "");
}

function normalizeFieldDetails(value: unknown): Record<DocumentAiFieldKey, LayoutAiFieldDetail> {
  const source = normalizeObject(value) as Partial<Record<DocumentAiFieldKey, unknown>>;
  return fieldKeys.reduce(
    (details, field) => {
      const raw = normalizeObject(source[field]);
      details[field] = {
        value: stringifyField(raw.value),
        confidence: clampConfidence(raw.confidence),
        method: stringifyField(raw.method) || "OCR + layout heuristic",
        sourceText: stringifyField(raw.sourceText) || null,
        warning: stringifyField(raw.warning) || null,
      };
      return details;
    },
    {} as Record<DocumentAiFieldKey, LayoutAiFieldDetail>,
  );
}

function clampConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(number, 1)) : 0;
}

function normalizeRuntimeMode(value: unknown): LayoutAiRuntimeMode {
  if (
    value === "full_layoutxlm" ||
    value === "layoutxlm_backbone" ||
    value === "fallback_layout_aware" ||
    value === "unavailable"
  ) {
    return value;
  }

  return "fallback_layout_aware";
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeTechnical(value: unknown): LayoutAiBackendResponse["technical"] {
  const source = normalizeObject(value);
  return {
    device: stringifyField(source.device) || "cpu",
    tokens_count: toFiniteNumber(source.tokens_count),
    words_count: toFiniteNumber(source.words_count),
    boxes_count: toFiniteNumber(source.boxes_count),
    model_confidence: typeof source.model_confidence === "number" ? source.model_confidence : null,
  };
}

function toFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeLayoutFields(fields: unknown): LayoutAiFields {
  const source =
    fields && typeof fields === "object" && !Array.isArray(fields)
      ? (fields as Partial<Record<DocumentAiFieldKey, unknown>>)
      : {};

  return {
    invoiceNumber: stringifyField(source.invoiceNumber),
    invoiceDate: stringifyField(source.invoiceDate),
    supplierName: stringifyField(source.supplierName),
    supplierCui: stringifyField(source.supplierCui),
    customerName: stringifyField(source.customerName),
    customerCui: stringifyField(source.customerCui),
    subtotal: stringifyField(source.subtotal),
    vatAmount: stringifyField(source.vatAmount),
    totalAmount: stringifyField(source.totalAmount),
    currency: stringifyField(source.currency),
  };
}

function stringifyField(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeYear(year: number) {
  return year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
}

function toIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePlainText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function fetchLayoutAi(endpoint: string, init: RequestInit | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(`${LAYOUT_AI_BACKEND_URL}${endpoint}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const requestError = didTimeout
      ? new Error(
          "Cererea către modulul Layout AI a expirat. Verifică dacă backend-ul FastAPI rulează pe portul 8000.",
        )
      : error;

    throwLayoutAiRequestError(endpoint, requestError);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function throwLayoutAiRequestError(endpoint: string, error: unknown): never {
  console.error("Layout AI backend request failed", {
    backendUrl: LAYOUT_AI_BACKEND_URL,
    endpoint,
    error,
  });

  throw new Error(
    `Layout AI backend request failed. Backend URL: ${LAYOUT_AI_BACKEND_URL}. Details: ${
      error instanceof Error ? error.message : "Unknown error"
    }`,
  );
}
