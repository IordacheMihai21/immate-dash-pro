import type { DocumentAiFieldKey } from "@/lib/documentAiService";

export type LayoutAiStatus = "success" | "fallback" | "unavailable";

export type LayoutAiFields = Record<DocumentAiFieldKey, string>;

export type LayoutAiHealth = {
  status: string;
  service: string;
  model: string;
  layout_model_available: boolean;
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
  status: LayoutAiStatus;
  confidence: number;
  fields: LayoutAiFields;
  tokens: LayoutAiToken[];
  boxes: LayoutAiBox[];
  notes: string[];
};

export type AnalyzeLayoutPayload = {
  file?: File | null;
  ocrText?: string | null;
  documentAiFields?: Partial<Record<DocumentAiFieldKey, unknown>> | null;
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

export async function checkLayoutAiHealth(): Promise<LayoutAiHealth> {
  const endpoint = "/health";
  let response: Response;

  try {
    response = await fetch(`${LAYOUT_AI_BACKEND_URL}${endpoint}`);
  } catch (error) {
    throwLayoutAiRequestError(endpoint, error);
  }

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

  if (payload.documentAiFields) {
    formData.append("document_ai_fields", JSON.stringify(payload.documentAiFields));
  }

  const endpoint = "/analyze-layout";
  let response: Response;

  try {
    response = await fetch(`${LAYOUT_AI_BACKEND_URL}${endpoint}`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throwLayoutAiRequestError(endpoint, error);
  }

  if (!response.ok) {
    throwLayoutAiRequestError(endpoint, new Error(`HTTP ${response.status}`));
  }

  const data = (await response.json()) as Partial<LayoutAiBackendResponse>;

  return {
    model: data.model ?? "LayoutXLM",
    status: data.status ?? "unavailable",
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
    fields: normalizeLayoutFields(data.fields),
    tokens: Array.isArray(data.tokens) ? data.tokens : [],
    boxes: Array.isArray(data.boxes) ? data.boxes : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
  };
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
