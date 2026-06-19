import type {
  DocumentAiAnalysis,
  DocumentAiExtractionMethod,
  DocumentAiFieldKey,
  OcrWord,
} from "@/lib/documentAiService";

const STORAGE_KEY = "immapp:document-ai:training-corrections";
const MAX_CORRECTIONS = 250;

export type DocumentAiCorrection = {
  documentId: string;
  fileName: string;
  fieldName: DocumentAiFieldKey;
  previousPredictedValue: string;
  correctedValue: string;
  timestamp: string;
  ocrText: string;
  ocrWords: OcrWord[];
  metadata: {
    previousMethod: DocumentAiExtractionMethod;
    previousConfidence: number;
    sourceText?: string;
    correctionMethod: "User verified";
  };
};

export function recordDocumentAiCorrection({
  analysis,
  fieldName,
  previousPredictedValue,
  correctedValue,
}: {
  analysis: DocumentAiAnalysis;
  fieldName: DocumentAiFieldKey;
  previousPredictedValue: string;
  correctedValue: string;
}) {
  const previous = previousPredictedValue.trim();
  const corrected = correctedValue.trim();
  if (previous === corrected || typeof window === "undefined") return null;
  const detail = analysis.fieldDetails[fieldName];
  const correction: DocumentAiCorrection = {
    documentId: analysis.fileName,
    fileName: analysis.fileName,
    fieldName,
    previousPredictedValue: previous,
    correctedValue: corrected,
    timestamp: new Date().toISOString(),
    ocrText: analysis.extractedText,
    ocrWords: analysis.ocrWords,
    metadata: {
      previousMethod: detail.method,
      previousConfidence: detail.confidence,
      sourceText: detail.sourceText,
      correctionMethod: "User verified",
    },
  };
  const existing = readDocumentAiCorrections().filter(
    (item) =>
      !(
        item.documentId === correction.documentId &&
        item.fieldName === correction.fieldName &&
        item.correctedValue === correction.correctedValue
      ),
  );
  const next = [...existing, correction].slice(-MAX_CORRECTIONS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("immapp:document-ai-correction-recorded"));
  } catch (error) {
    console.warn("Document AI correction could not be stored", error);
  }
  return correction;
}

export function readDocumentAiCorrections(): DocumentAiCorrection[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as DocumentAiCorrection[]) : [];
  } catch {
    return [];
  }
}

export function exportDocumentAiCorrectionsJsonl(corrections = readDocumentAiCorrections()) {
  return corrections.map((correction) => JSON.stringify(correction)).join("\n");
}

export function clearDocumentAiCorrections() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
