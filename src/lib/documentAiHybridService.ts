import type {
  DocumentAiAnalysis,
  DocumentAiExtractedFields,
  DocumentAiFieldKey,
} from "./documentAiService.ts";
import { mergeLayoutXlmWithCandidateEngine } from "./layoutAiHybridMerge.ts";
import { analyzeLayoutWithBackend, checkLayoutAiHealth } from "./layoutAiService.ts";
import { getManualReviewMessage, sanitizeUiSafePartyValue } from "./documentAiUiSafety.ts";
import {
  calculateVisibleDocumentConfidence,
  detectDocumentAiProfile,
} from "./documentAiVisibleConfidence.ts";

export {
  getManualReviewMessage,
  isUiSafeEntityValue,
  isUiSafePartyValue,
} from "./documentAiUiSafety.ts";

const FIELD_KEYS: DocumentAiFieldKey[] = [
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

const PARTY_FIELDS = new Set<DocumentAiFieldKey>(["supplierName", "customerName"]);

export async function finalizeDocumentAiWithHybrid(
  file: File,
  candidateAnalysis: DocumentAiAnalysis,
): Promise<DocumentAiAnalysis> {
  const sanitizedCandidate = applyVisibleConfidence(
    sanitizeAnalysis(candidateAnalysis, "candidate_engine_baseline"),
  );

  try {
    const health = await checkLayoutAiHealth();
    if (health.fine_tuned_model_used !== true || health.model_inference_available !== true) {
      return sanitizedCandidate;
    }

    const candidateFields = fieldsToStrings(sanitizedCandidate.fields);
    const backendResult = await analyzeLayoutWithBackend({
      file,
      ocrText: sanitizedCandidate.extractedText,
      ocrWords: sanitizedCandidate.ocrWords,
      documentAiFields: candidateFields,
    });
    const layoutConfidences = FIELD_KEYS.reduce(
      (result, field) => {
        result[field] = backendResult.field_details[field]?.confidence ?? 0;
        return result;
      },
      {} as Partial<Record<DocumentAiFieldKey, number>>,
    );
    const layoutMethods = FIELD_KEYS.reduce(
      (result, field) => {
        result[field] = backendResult.field_details[field]?.method ?? "";
        return result;
      },
      {} as Partial<Record<DocumentAiFieldKey, string>>,
    );
    const hybrid = mergeLayoutXlmWithCandidateEngine({
      candidateFields,
      candidateConfidences: sanitizedCandidate.confidences,
      layoutFields: backendResult.fields,
      layoutConfidences,
      layoutMethods,
    });

    return applyVisibleConfidence(
      applyHybridResult(sanitizedCandidate, hybrid.fields, hybrid.confidences),
    );
  } catch {
    return sanitizedCandidate;
  }
}

function sanitizeAnalysis(
  analysis: DocumentAiAnalysis,
  inferenceMode: NonNullable<DocumentAiAnalysis["inferenceMode"]>,
) {
  const fields = { ...analysis.fields };
  const confidences = { ...analysis.confidences };
  const fieldDetails = { ...analysis.fieldDetails };
  let removedInvalidParty = false;

  for (const field of FIELD_KEYS) {
    const original = fields[field];
    const sanitized = PARTY_FIELDS.has(field)
      ? sanitizeUiSafePartyValue(field, original)
      : stringify(original);
    if (PARTY_FIELDS.has(field) && stringify(original) && !sanitized) {
      removedInvalidParty = true;
      fields[field] = "";
      confidences[field] = 0;
      fieldDetails[field] = {
        ...fieldDetails[field],
        value: "",
        normalizedValue: "",
        confidence: 0,
        warning:
          "Valoarea a fost eliminată deoarece reprezintă o etichetă sau o regiune zgomotoasă.",
      };
    } else if (PARTY_FIELDS.has(field) && sanitized !== stringify(original)) {
      fields[field] = sanitized;
      confidences[field] = Math.min(confidences[field], 0.59);
      fieldDetails[field] = {
        ...fieldDetails[field],
        value: sanitized,
        normalizedValue: sanitized,
        confidence: confidences[field],
        warning: "Regiunea a fost curățată și necesită confirmare.",
      };
    }
  }

  const warnings = unique([
    ...analysis.warnings,
    ...(removedInvalidParty
      ? ["Entitățile de tip furnizor/client provenite din etichete au fost eliminate."]
      : []),
  ]);

  return {
    ...analysis,
    fields,
    confidences,
    fieldDetails,
    warnings,
    inferenceMode,
    uiPipelineVersion: 4,
  };
}

function applyHybridResult(
  analysis: DocumentAiAnalysis,
  hybridFields: Partial<Record<DocumentAiFieldKey, unknown>>,
  hybridConfidences: Partial<Record<DocumentAiFieldKey, number>>,
) {
  const next = sanitizeAnalysis(analysis, "hybrid_layoutxlm_candidate_engine");
  const fields = { ...next.fields };
  const confidences = { ...next.confidences };
  const fieldDetails = { ...next.fieldDetails };

  for (const field of FIELD_KEYS) {
    const rawValue = stringify(hybridFields[field]);
    const value = PARTY_FIELDS.has(field) ? sanitizeUiSafePartyValue(field, rawValue) : rawValue;
    const wasCleaned = PARTY_FIELDS.has(field) && value !== rawValue;
    const rawConfidence = Math.max(0, Math.min(hybridConfidences[field] ?? 0, 1));
    const confidence = wasCleaned ? Math.min(rawConfidence, 0.59) : rawConfidence;
    fields[field] = value;
    confidences[field] = value ? confidence : 0;
    fieldDetails[field] = {
      ...fieldDetails[field],
      value,
      normalizedValue: value,
      confidence: value ? confidence : 0,
      method: "Hybrid LayoutXLM + candidate engine",
      warning: !value
        ? fieldDetails[field].warning
        : confidence < 0.6
          ? "Încredere redusă; necesită verificare manuală."
          : undefined,
    };
  }

  return {
    ...next,
    fields,
    confidences,
    fieldDetails,
    warnings: next.warnings,
    inferenceMode: "hybrid_layoutxlm_candidate_engine" as const,
  };
}

function applyVisibleConfidence(analysis: DocumentAiAnalysis): DocumentAiAnalysis {
  const profile = detectDocumentAiProfile(analysis);
  const visible = calculateVisibleDocumentConfidence({
    profile,
    fields: analysis.fields,
    confidences: analysis.confidences,
    extractedText: analysis.extractedText,
  });
  const warnings = analysis.warnings.filter((warning) => warning !== getManualReviewMessage());

  return {
    ...analysis,
    visibleOverallConfidence: visible.score,
    documentProfile: visible.profile,
    applicableConfidenceFields: visible.applicableFields,
    coreFieldsDetected: visible.coreFieldsDetected,
    warnings: unique([
      ...warnings,
      ...(visible.requiresManualReview ? [getManualReviewMessage()] : []),
    ]),
    uiPipelineVersion: 4,
  };
}

function fieldsToStrings(fields: DocumentAiExtractedFields) {
  return FIELD_KEYS.reduce(
    (result, field) => {
      result[field] = stringify(fields[field]);
      return result;
    },
    {} as Record<DocumentAiFieldKey, string>,
  );
}

function stringify(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
