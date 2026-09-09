// Phase 3, item 1: real LayoutXLM entity proposals as v3's PRIMARY candidate
// source, replacing v2's regex candidates as the default -- not merged with
// equal weight, but used exclusively for any field the model actually
// predicted something for. Regex candidates (from v2v3Bridge.ts's existing
// bridge to invoiceCandidateEngine.ts) are consulted ONLY as a fallback for
// fields LayoutXLM proposed nothing for at all -- see buildFieldCandidatePool
// below. This is a structural choice, not a scoring nuance: "instead of
// relying on v2 regex candidates" (the user's phrasing) means regex stops
// being a competing signal and becomes a safety net.
//
// Calls the REAL backend (document-ai-backend's /analyze-layout, the same
// fine-tuned LayoutXLM model already in production) over HTTP -- this file
// makes no local model calls and needs no Python/torch dependency itself.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { EntityCandidate, PartyFieldName } from "./types.ts";

export type LayoutAiToken = {
  text: string;
  label: string | null;
  confidence: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null; // normalized 0-1000, NOT pixels -- see convertSpanBBoxToPixels
};

export type AnalyzeLayoutResponse = {
  status: "ok" | "unavailable";
  runtime_mode: string;
  fine_tuned_model_used: boolean;
  model_inference_executed: boolean;
  fields: Record<string, string>;
  tokens: LayoutAiToken[];
  technical: { ocr_confidence: number | null; model_confidence: number | null };
};

export async function callAnalyzeLayout(
  imagePath: string,
  backendUrl: string,
): Promise<AnalyzeLayoutResponse> {
  const imageBytes = await readFile(imagePath);
  const form = new FormData();
  form.append("file", new Blob([imageBytes], { type: "image/jpeg" }), basename(imagePath));

  const response = await fetch(`${backendUrl}/analyze-layout`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`/analyze-layout HTTP ${response.status} for ${basename(imagePath)}`);
  }
  return (await response.json()) as AnalyzeLayoutResponse;
}

// The fine-tuned model's flat label vocabulary (document-ai-backend/datasets/
// immapp_label_map.json) mapped onto v3's field names. Two labels
// (SELLER_TAX_ID / BUYER_TAX_ID) map to "taxId" -- which one it becomes
// depends on which PARTY role the caller is resolving for, exactly like
// v2v3Bridge.ts's supplierCui/customerCui split; see groupTokensIntoSpans's
// caller in run_benchmark_real.ts for the role assignment.
const PARTY_LABEL_TO_FIELD: Record<string, PartyFieldName> = {
  SELLER_NAME: "name",
  BUYER_NAME: "name",
  SELLER_TAX_ID: "taxId",
  BUYER_TAX_ID: "taxId",
};

export type MetadataFieldKey = "invoiceNumber" | "invoiceDate" | "dueDate" | "currency";
const METADATA_LABEL_TO_FIELD: Record<string, MetadataFieldKey> = {
  INVOICE_NUMBER: "invoiceNumber",
  INVOICE_DATE: "invoiceDate",
  DUE_DATE: "dueDate",
  CURRENCY: "currency",
};

export type AmountFieldKey = "subtotal" | "vatAmount" | "totalAmount";
const AMOUNT_LABEL_TO_FIELD: Record<string, AmountFieldKey> = {
  SUBTOTAL: "subtotal",
  VAT: "vatAmount",
  TOTAL: "totalAmount",
};

export type EntitySpan = {
  label: string;
  text: string;
  // Mean per-token confidence across the span -- the model's own
  // uncertainty, not adjusted for span length or structural plausibility
  // (that adjustment is regionResolver's job, not this bridge's).
  modelConfidence: number;
  // Bbox in NORMALIZED 0-1000 space, as the backend returns it -- callers
  // must run convertSpanBBoxToPixels before using it in region-dominance
  // gating, which expects real pixel coordinates (see types.ts's BBox
  // comment: matches src/lib/layoutLines.ts's OcrWord bbox shape exactly).
  normalizedBBox: { x: number; y: number; width: number; height: number };
};

// Groups consecutive same-label tokens (in the order the backend already
// returns them -- original word order) into entity spans. Two tokens
// labeled e.g. SELLER_NAME back-to-back become ONE span "WAYSTAR ROYCO
// SRL", not two separate single-word candidates -- this is what makes a
// span usable as a party name at all, rather than fragments.
export function groupTokensIntoSpans(tokens: LayoutAiToken[]): EntitySpan[] {
  const spans: EntitySpan[] = [];
  let current: { label: string; texts: string[]; confidences: number[]; boxes: NonNullable<LayoutAiToken["bbox"]>[] } | null = null;

  const flush = () => {
    if (!current || current.texts.length === 0) return;
    const xs0 = current.boxes.map((b) => b.x);
    const ys0 = current.boxes.map((b) => b.y);
    const xs1 = current.boxes.map((b) => b.x + b.width);
    const ys1 = current.boxes.map((b) => b.y + b.height);
    spans.push({
      label: current.label,
      text: current.texts.join(" "),
      modelConfidence: current.confidences.reduce((a, b) => a + b, 0) / current.confidences.length,
      normalizedBBox: {
        x: Math.min(...xs0),
        y: Math.min(...ys0),
        width: Math.max(...xs1) - Math.min(...xs0),
        height: Math.max(...ys1) - Math.min(...ys0),
      },
    });
    current = null;
  };

  for (const token of tokens) {
    const label = token.label;
    if (!label || label === "OTHER" || !token.bbox) {
      flush();
      continue;
    }
    if (current && current.label === label) {
      current.texts.push(token.text);
      current.confidences.push(token.confidence ?? 0.5);
      current.boxes.push(token.bbox);
    } else {
      flush();
      current = { label, texts: [token.text], confidences: [token.confidence ?? 0.5], boxes: [token.bbox] };
    }
  }
  flush();

  return spans;
}

export function convertSpanBBoxToPixels(
  normalizedBBox: EntitySpan["normalizedBBox"],
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (normalizedBBox.x / 1000) * imageWidth,
    y: (normalizedBBox.y / 1000) * imageHeight,
    width: (normalizedBBox.width / 1000) * imageWidth,
    height: (normalizedBBox.height / 1000) * imageHeight,
  };
}

function spanToEntityCandidate(span: EntitySpan, imageWidth: number, imageHeight: number): EntityCandidate {
  return {
    value: span.text,
    source: "layoutxlm",
    modelConfidence: span.modelConfidence,
    bbox: convertSpanBBoxToPixels(span.normalizedBBox, imageWidth, imageHeight),
  };
}

export type LayoutXlmCandidates = {
  supplier: { name: EntityCandidate[]; taxId: EntityCandidate[] };
  customer: { name: EntityCandidate[]; taxId: EntityCandidate[] };
  metadata: Record<MetadataFieldKey, EntityCandidate[]>;
  amounts: Record<AmountFieldKey, EntityCandidate[]>;
};

// Only "model_inference_executed === true" responses are used at all --
// the fallback_reason path (model unavailable) never contributes tokens
// with genuine model-predicted labels (main.py's infer_token_label is a
// text-matching heuristic against the ALREADY-heuristically-extracted
// fields, not a real model prediction; using it here would silently
// re-introduce exactly the regex-dependence item 1 asks to remove).
//
// Party role assignment (which SELLER_NAME/BUYER_TAX_ID span belongs to
// which v3 region) is NOT decided here -- this function returns raw
// candidates grouped only by the model's own SELLER_*/BUYER_* labels
// (which the model itself already disambiguates, since it was trained on
// role-specific labels, not generic "party" labels). The caller still runs
// these through regionResolver.ts's region-dominance gate for consistency
// with the rest of the architecture and to catch the rare case where the
// model's own SELLER/BUYER assignment is wrong.
export function extractLayoutXlmCandidates(
  response: AnalyzeLayoutResponse,
  imageWidth: number,
  imageHeight: number,
): LayoutXlmCandidates {
  const empty: LayoutXlmCandidates = {
    supplier: { name: [], taxId: [] },
    customer: { name: [], taxId: [] },
    metadata: { invoiceNumber: [], invoiceDate: [], dueDate: [], currency: [] },
    amounts: { subtotal: [], vatAmount: [], totalAmount: [] },
  };
  if (!response.model_inference_executed) return empty;

  const spans = groupTokensIntoSpans(response.tokens);
  const result = empty;

  for (const span of spans) {
    const candidate = spanToEntityCandidate(span, imageWidth, imageHeight);
    if (span.label === "SELLER_NAME") result.supplier.name.push(candidate);
    else if (span.label === "SELLER_TAX_ID") result.supplier.taxId.push(candidate);
    else if (span.label === "BUYER_NAME") result.customer.name.push(candidate);
    else if (span.label === "BUYER_TAX_ID") result.customer.taxId.push(candidate);
    else if (span.label in METADATA_LABEL_TO_FIELD) {
      result.metadata[METADATA_LABEL_TO_FIELD[span.label]].push(candidate);
    } else if (span.label in AMOUNT_LABEL_TO_FIELD) {
      result.amounts[AMOUNT_LABEL_TO_FIELD[span.label]].push(candidate);
    }
    // IBAN is collected by the model but has no v3 Party field yet
    // (Party.iban exists in types.ts but nothing populates it from
    // LayoutXLM in this phase) -- not silently used for anything else.
  }

  return result;
}

// Structural rule for item 1: LayoutXLM candidates are used EXCLUSIVELY
// when present for a field; regex candidates only fill in when the model
// proposed nothing at all for that field. Not a blended/competing pool --
// a primary-source-with-fallback pool, matching "instead of relying on v2
// regex candidates."
export function buildFieldCandidatePool(
  layoutXlmCandidates: EntityCandidate[],
  regexCandidates: EntityCandidate[],
): EntityCandidate[] {
  return layoutXlmCandidates.length > 0 ? layoutXlmCandidates : regexCandidates;
}
