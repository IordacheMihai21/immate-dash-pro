import type {
  DocumentAiAnalysis,
  DocumentAiExtractedFields,
  DocumentAiFieldKey,
} from "./documentAiService.ts";
import { buildLayoutLines, type OcrWord } from "./layoutLines.ts";
import { mergeLayoutXlmWithCandidateEngine } from "./layoutAiHybridMerge.ts";
import {
  analyzeLayoutWithBackend,
  checkLayoutAiHealth,
  type LayoutAiBackendResponse,
} from "./layoutAiService.ts";
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
  const hasCandidateSignal = hasUsableExtraction(sanitizedCandidate);

  try {
    const health = await checkLayoutAiHealth();
    if (health.fine_tuned_model_used !== true || health.model_inference_available !== true) {
      if (!hasCandidateSignal) {
        throw new Error(
          "OCR-ul din browser nu a extras text, iar backend-ul LayoutXLM fine-tuned nu este disponibil.",
        );
      }
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
    const hydratedAnalysis = hydrateAnalysisFromBackendOcr(sanitizedCandidate, backendResult);

    return applyVisibleConfidence(
      applyHybridResult(hydratedAnalysis, hybrid.fields, hybrid.confidences),
    );
  } catch (error) {
    if (!hasCandidateSignal) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "OCR-ul nu a extras text, iar validarea LayoutXLM nu a putut fi executata.",
        { cause: error },
      );
    }
    return sanitizedCandidate;
  }
}

function hasUsableExtraction(analysis: DocumentAiAnalysis) {
  return (
    analysis.extractedText.trim().length > 0 ||
    Object.values(analysis.fields).some((value) => stringify(value).trim().length > 0)
  );
}

function hydrateAnalysisFromBackendOcr(
  analysis: DocumentAiAnalysis,
  backendResult: LayoutAiBackendResponse,
): DocumentAiAnalysis {
  if (analysis.extractedText.trim() || backendResult.technical.ocr_source !== "backend_tesseract") {
    return analysis;
  }

  const words = backendResult.tokens.flatMap((token): OcrWord[] => {
    const text = stringify(token.text);
    if (!text) return [];
    return [
      {
        text,
        confidence:
          typeof token.confidence === "number"
            ? Math.max(0, Math.min(token.confidence, 1))
            : undefined,
        bbox: token.bbox ?? undefined,
      },
    ];
  });
  const layoutLines = buildLayoutLines(words, "");
  const extractedText = layoutLines.length
    ? layoutLines.map((line) => line.text).join("\n")
    : words.map((word) => word.text).join(" ");
  const ocrConfidence = Math.max(0, Math.min(backendResult.technical.ocr_confidence ?? 0, 1));
  const usefulWordCount = countUsefulWords(extractedText);
  const invoiceKeywordCount = countInvoiceKeywords(extractedText);
  const wordCount = backendResult.technical.words_count || words.length;
  const wordsWithPosition =
    backendResult.technical.boxes_count || words.filter((word) => word.bbox).length;

  return {
    ...analysis,
    extractedText,
    ocrConfidence,
    ocrWords: words,
    layout: {
      wordCount,
      wordsWithPosition,
      averageWordConfidence: ocrConfidence,
      detectedLines: layoutLines.length,
      hasLayoutData: wordsWithPosition > 0,
    },
    ocrDetails: {
      selectedVariant: "backend-tesseract",
      selectedLabel: "Backend Tesseract OCR",
      confidence: ocrConfidence,
      wordCount,
      usefulWordCount,
      invoiceKeywordCount,
      score: Math.max(
        0,
        Math.min(
          1,
          ocrConfidence * 0.5 +
            Math.min(usefulWordCount / 250, 1) * 0.25 +
            Math.min(invoiceKeywordCount / 8, 1) * 0.25,
        ),
      ),
      preprocessingApplied: true,
      attempts: [
        {
          variant: "backend-tesseract",
          label: "Backend Tesseract OCR",
          confidence: ocrConfidence,
          wordCount,
          usefulWordCount,
          invoiceKeywordCount,
          score: Math.max(0, Math.min(ocrConfidence, 1)),
          selected: true,
        },
        ...(analysis.ocrDetails?.attempts ?? []),
      ],
    },
    warnings: unique([
      ...analysis.warnings.filter((warning) => !/nu s-a putut extrage text/i.test(warning)),
      "OCR-ul browser a eșuat; analiza a continuat cu OCR Tesseract în backend.",
    ]),
  };
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
      // Threshold set from real calibration data (100-doc Romanian invoice
      // benchmark, see scripts/document-ai-evaluate.ts's calibration
      // report): fields the merge reports at 0.6-0.79 confidence were only
      // 42% actually correct -- barely better than the sub-0.6 bucket, and
      // nowhere close to a "you can trust this" signal. 0.8+ was 93%
      // correct. The gate has to sit where the data says it's reliable,
      // not at a number that merely looks reassuring.
      warning: !value
        ? fieldDetails[field].warning
        : confidence < 0.8
          ? "Încredere redusă; necesită verificare manuală."
          : undefined,
    };
  }

  return {
    ...next,
    fields,
    confidences,
    fieldDetails,
    warnings: next.warnings.filter((warning) => !isResolvedWarning(warning, fields, next.layout)),
    inferenceMode: "hybrid_layoutxlm_candidate_engine" as const,
  };
}

function isResolvedWarning(
  warning: string,
  fields: DocumentAiExtractedFields,
  layout: DocumentAiAnalysis["layout"],
) {
  const normalized = removeDiacritics(warning).toLowerCase();
  if (layout.hasLayoutData && /pozitiile cuvintelor nu sunt disponibile/.test(normalized)) {
    return true;
  }

  const labels: Partial<Record<DocumentAiFieldKey, string[]>> = {
    invoiceNumber: ["numar factura", "număr factura", "număr factură"],
    invoiceDate: ["data factura", "data facturii"],
    supplierName: ["furnizor"],
    customerName: ["client"],
    totalAmount: ["total de plata", "total de plată"],
  };

  return Object.entries(labels).some(([field, fieldLabels]) => {
    if (!stringify(fields[field as DocumentAiFieldKey])) return false;
    return fieldLabels.some((label) => normalized.startsWith(`${removeDiacritics(label)}:`));
  });
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

function countUsefulWords(text: string) {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length >= 2 && /[\p{L}\p{N}]/u.test(word)).length;
}

function countInvoiceKeywords(text: string) {
  const normalizedText = removeDiacritics(text).toLowerCase();
  return ["invoice", "factura", "total", "tax", "vat", "tva", "subtotal", "cui"].filter((keyword) =>
    new RegExp(`\\b${keyword}\\b`, "i").test(normalizedText),
  ).length;
}

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stringify(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
