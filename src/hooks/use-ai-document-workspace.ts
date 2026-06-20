import { useCallback, useEffect, useState } from "react";
import {
  toDocumentAiEditableFields,
  type DocumentAiEditableFields,
} from "@/components/document-ai-upload";
import type { DocumentAiAnalysis, DocumentAiFieldKey } from "@/lib/documentAiService";
import {
  hasEvaluationFields,
  parseFaturaAnnotationToExpected,
  type BatchEvaluationResult,
  type DocumentAiEvaluationFields,
} from "@/lib/documentAiEvaluationService";
import type { LayoutAiFieldDetail, LayoutAiFields } from "@/lib/layoutAiService";

const DOCUMENT_AI_ANALYSIS_KEY = "immapp:document-ai:last-analysis";
const DOCUMENT_AI_FILE_NAME_KEY = "immapp:document-ai:last-file-name";
const DOCUMENT_AI_FIELDS_KEY = "immapp:document-ai:last-fields";
const DOCUMENT_AI_VERIFIED_FIELDS_KEY = "immapp:document-ai:last-verified-fields";
const DOCUMENT_AI_PREDICTED_TEXT_KEY = "immapp:document-ai:last-predicted-text";
const FATURA_ANNOTATION_KEY = "immapp:document-ai:last-fatura-annotation";
const FATURA_EXPECTED_KEY = "immapp:document-ai:last-fatura-expected";
const EVALUATION_KEY = "immapp:document-ai:last-evaluation";
const DOCUMENT_AI_UI_PIPELINE_VERSION = 4;
const DOCUMENT_AI_FIELD_KEYS: DocumentAiFieldKey[] = [
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

export function useAiDocumentWorkspace() {
  const [analysis, setAnalysis] = useState<DocumentAiAnalysis | null>(null);
  const [fields, setFields] = useState<DocumentAiEditableFields | null>(null);
  const [verifiedFields, setVerifiedFields] = useState<DocumentAiFieldKey[]>([]);
  const [predictedText, setPredictedText] = useState("");
  const [annotationText, setAnnotationText] = useState("");
  const [expectedFields, setExpectedFields] = useState<DocumentAiEvaluationFields | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<BatchEvaluationResult | null>(null);

  const handleAnalysisChange = useCallback((nextAnalysis: DocumentAiAnalysis | null) => {
    setAnalysis(nextAnalysis);

    if (!nextAnalysis) {
      removeStorageKeys([DOCUMENT_AI_ANALYSIS_KEY, DOCUMENT_AI_FILE_NAME_KEY]);
      return;
    }

    const nextPredictedText = JSON.stringify(nextAnalysis.fields, null, 2);
    setPredictedText(nextPredictedText);
    writeStoredJson(DOCUMENT_AI_ANALYSIS_KEY, nextAnalysis);
    writeStoredText(DOCUMENT_AI_FILE_NAME_KEY, nextAnalysis.fileName);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, nextPredictedText);
  }, []);

  const handleFieldsChange = useCallback((nextFields: DocumentAiEditableFields | null) => {
    setFields(nextFields);

    if (!nextFields) {
      removeStorageKeys([DOCUMENT_AI_FIELDS_KEY]);
      return;
    }

    const nextPredictedText = JSON.stringify(nextFields, null, 2);
    setPredictedText(nextPredictedText);
    writeStoredJson(DOCUMENT_AI_FIELDS_KEY, nextFields);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, nextPredictedText);
  }, []);

  const handleVerifiedFieldsChange = useCallback((nextFields: DocumentAiFieldKey[]) => {
    const uniqueFields = Array.from(new Set(nextFields));
    setVerifiedFields(uniqueFields);
    writeStoredJson(DOCUMENT_AI_VERIFIED_FIELDS_KEY, uniqueFields);
  }, []);

  const handlePreparedAnalysis = useCallback(
    (nextAnalysis: DocumentAiAnalysis, nextFields: LayoutAiFields) => {
      handleAnalysisChange(nextAnalysis);
      handleFieldsChange(nextFields);
      handleVerifiedFieldsChange([]);
    },
    [handleAnalysisChange, handleFieldsChange, handleVerifiedFieldsChange],
  );

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setFields(null);
    setVerifiedFields([]);
    setPredictedText("");
    removeStorageKeys([
      DOCUMENT_AI_ANALYSIS_KEY,
      DOCUMENT_AI_FILE_NAME_KEY,
      DOCUMENT_AI_FIELDS_KEY,
      DOCUMENT_AI_VERIFIED_FIELDS_KEY,
      DOCUMENT_AI_PREDICTED_TEXT_KEY,
    ]);
  }, []);

  const handlePredictedTextChange = useCallback((value: string) => {
    setPredictedText(value);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, value);
  }, []);

  const handleAnnotationChange = useCallback((value: string) => {
    setAnnotationText(value);

    if (!value.trim()) {
      removeStorageKeys([FATURA_ANNOTATION_KEY]);
      return;
    }

    writeStoredText(FATURA_ANNOTATION_KEY, value);
  }, []);

  const handleExpectedFieldsChange = useCallback(
    (nextFields: DocumentAiEvaluationFields | null) => {
      setExpectedFields(nextFields);

      if (!nextFields) {
        removeStorageKeys([FATURA_EXPECTED_KEY]);
        return;
      }

      writeStoredJson(FATURA_EXPECTED_KEY, nextFields);
    },
    [],
  );

  const handleEvaluationResultChange = useCallback((result: BatchEvaluationResult | null) => {
    setEvaluationResult(result);

    if (!result) {
      removeStorageKeys([EVALUATION_KEY]);
      return;
    }

    writeStoredJson(EVALUATION_KEY, result);
  }, []);

  const clearAnnotation = useCallback(() => {
    setAnnotationText("");
    setExpectedFields(null);
    setEvaluationResult(null);
    removeStorageKeys([FATURA_ANNOTATION_KEY, FATURA_EXPECTED_KEY, EVALUATION_KEY]);
  }, []);

  const handleApplyLayoutFields = useCallback(
    (
      layoutFields: LayoutAiFields,
      layoutDetails?: Record<DocumentAiFieldKey, LayoutAiFieldDetail>,
    ) => {
      const currentFields =
        fields ??
        (analysis ? toDocumentAiEditableFields(analysis.fields) : createEmptyDocumentAiFields());
      const verifiedSet = new Set(verifiedFields);
      const nextFields = DOCUMENT_AI_FIELD_KEYS.reduce(
        (acc, field) => {
          const proposedValue = layoutFields[field]?.trim();

          if (proposedValue && !verifiedSet.has(field)) {
            acc[field] = proposedValue;
          }

          return acc;
        },
        { ...currentFields },
      );

      if (analysis) {
        const nextAnalysis = DOCUMENT_AI_FIELD_KEYS.reduce(
          (next, field) => {
            const proposedValue = layoutFields[field]?.trim();
            const detail = layoutDetails?.[field];
            if (!proposedValue || verifiedSet.has(field) || !detail) return next;
            next.fields[field] = proposedValue;
            next.confidences[field] = detail.confidence;
            next.fieldDetails[field] = {
              value: proposedValue,
              normalizedValue: proposedValue,
              confidence: detail.confidence,
              method: "Layout heuristic",
              sourceText: detail.sourceText ?? undefined,
              warning: detail.warning ?? undefined,
            };
            return next;
          },
          {
            ...analysis,
            fields: { ...analysis.fields },
            confidences: { ...analysis.confidences },
            fieldDetails: { ...analysis.fieldDetails },
          },
        );
        handleAnalysisChange(nextAnalysis);
      }
      handleFieldsChange(nextFields);
    },
    [analysis, fields, handleAnalysisChange, handleFieldsChange, verifiedFields],
  );

  useEffect(() => {
    const storedAnalysis = readStoredJson<DocumentAiAnalysis>(DOCUMENT_AI_ANALYSIS_KEY);
    const storedFields = readStoredJson<DocumentAiEditableFields>(DOCUMENT_AI_FIELDS_KEY);
    const storedVerifiedFields = readStoredJson<DocumentAiFieldKey[]>(
      DOCUMENT_AI_VERIFIED_FIELDS_KEY,
    );
    const storedPredictedText = readStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY);
    const storedAnnotation = readStoredText(FATURA_ANNOTATION_KEY);
    const storedExpected = readStoredJson<DocumentAiEvaluationFields>(FATURA_EXPECTED_KEY);
    const storedEvaluation = readStoredJson<BatchEvaluationResult>(EVALUATION_KEY);

    const storedAnalysisIsCurrent =
      storedAnalysis?.uiPipelineVersion === DOCUMENT_AI_UI_PIPELINE_VERSION;

    if (storedAnalysis && storedAnalysisIsCurrent) {
      setAnalysis(storedAnalysis);
      setFields(storedFields ?? toDocumentAiEditableFields(storedAnalysis.fields));
    } else if (!storedAnalysis && storedFields) {
      setFields(storedFields);
    } else if (storedAnalysis && !storedAnalysisIsCurrent) {
      removeStorageKeys([
        DOCUMENT_AI_ANALYSIS_KEY,
        DOCUMENT_AI_FILE_NAME_KEY,
        DOCUMENT_AI_FIELDS_KEY,
        DOCUMENT_AI_VERIFIED_FIELDS_KEY,
        DOCUMENT_AI_PREDICTED_TEXT_KEY,
      ]);
      setAnalysis(null);
      setFields(null);
      setVerifiedFields([]);
      setPredictedText("");
    }

    if (Array.isArray(storedVerifiedFields)) {
      setVerifiedFields(storedVerifiedFields);
    }

    if (storedPredictedText && (!storedAnalysis || storedAnalysisIsCurrent)) {
      setPredictedText(storedPredictedText);
    }

    if (storedAnnotation) {
      setAnnotationText(storedAnnotation);
    }

    if (storedExpected && hasEvaluationFields(storedExpected)) {
      setExpectedFields(storedExpected);
    } else if (storedAnnotation) {
      const parsed = parseStoredExpectedFields(storedAnnotation);

      if (parsed) {
        setExpectedFields(parsed);
        writeStoredJson(FATURA_EXPECTED_KEY, parsed);
      }
    }

    if (storedEvaluation) {
      setEvaluationResult(storedEvaluation);
    }
  }, []);

  return {
    analysis,
    fields,
    verifiedFields,
    predictedText,
    annotationText,
    expectedFields,
    evaluationResult,
    handleAnalysisChange,
    handleFieldsChange,
    handleVerifiedFieldsChange,
    handlePreparedAnalysis,
    clearAnalysis,
    handlePredictedTextChange,
    handleAnnotationChange,
    handleExpectedFieldsChange,
    handleEvaluationResultChange,
    clearAnnotation,
    handleApplyLayoutFields,
  };
}

function createEmptyDocumentAiFields(): DocumentAiEditableFields {
  return DOCUMENT_AI_FIELD_KEYS.reduce(
    (acc, field) => ({
      ...acc,
      [field]: "",
    }),
    {} as DocumentAiEditableFields,
  );
}

function readStoredText(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStoredText(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function readStoredJson<T>(key: string): T | null {
  const value = readStoredText(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  writeStoredText(key, JSON.stringify(value));
}

function removeStorageKeys(keys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function parseStoredExpectedFields(value: string): DocumentAiEvaluationFields | null {
  try {
    const parsed = parseFaturaAnnotationToExpected(JSON.parse(value));

    return hasEvaluationFields(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
