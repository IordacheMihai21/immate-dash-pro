import { getActiveCompanyId } from "@/lib/companyService";
import { supabase } from "@/lib/supabaseClient";
import type {
  DocumentAiAnalysis,
  DocumentAiExtractionMethod,
  DocumentAiFieldKey,
  OcrWord,
} from "@/lib/documentAiService";

export type DocumentAiCorrection = {
  documentId: string;
  fileName: string;
  fieldName: DocumentAiFieldKey;
  previousPredictedValue: string;
  correctedValue: string;
  createdAt: string;
  ocrText: string;
  ocrWords: OcrWord[];
  metadata: {
    previousMethod: DocumentAiExtractionMethod;
    previousConfidence: number;
    sourceText?: string;
    correctionMethod: "User verified";
  };
};

type DocumentAiCorrectionRow = {
  document_id: string;
  file_name: string;
  field_name: DocumentAiFieldKey;
  previous_predicted_value: string;
  corrected_value: string;
  created_at: string;
  ocr_text: string | null;
  ocr_words: OcrWord[] | null;
  previous_method: DocumentAiExtractionMethod | null;
  previous_confidence: number | null;
  source_text: string | null;
};

function isMissingCorrectionsSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";

  return (
    code === "42P01" ||
    ["PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    (message.includes("document_ai_corrections") && message.includes("does not exist")) ||
    (message.includes("document_ai_corrections") && message.includes("schema cache"))
  );
}

function fromRow(row: DocumentAiCorrectionRow): DocumentAiCorrection {
  return {
    documentId: row.document_id,
    fileName: row.file_name,
    fieldName: row.field_name,
    previousPredictedValue: row.previous_predicted_value,
    correctedValue: row.corrected_value,
    createdAt: row.created_at,
    ocrText: row.ocr_text ?? "",
    ocrWords: row.ocr_words ?? [],
    metadata: {
      previousMethod: row.previous_method ?? "OCR",
      previousConfidence: row.previous_confidence ?? 0,
      sourceText: row.source_text ?? undefined,
      correctionMethod: "User verified",
    },
  };
}

export async function recordDocumentAiCorrection({
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

  if (previous === corrected) return null;

  const detail = analysis.fieldDetails[fieldName];

  try {
    const companyId = await getActiveCompanyId();
    const { error } = await supabase.from("document_ai_corrections").upsert(
      {
        company_id: companyId,
        document_id: analysis.fileName,
        file_name: analysis.fileName,
        field_name: fieldName,
        previous_predicted_value: previous,
        corrected_value: corrected,
        ocr_text: analysis.extractedText,
        ocr_words: analysis.ocrWords,
        previous_method: detail.method,
        previous_confidence: detail.confidence,
        source_text: detail.sourceText ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "company_id,document_id,field_name,corrected_value" },
    );

    if (error && !isMissingCorrectionsSchema(error)) {
      throw error;
    }
  } catch (error) {
    console.warn("Document AI correction could not be saved", error);
  }
}

export async function readDocumentAiCorrections(): Promise<DocumentAiCorrection[]> {
  try {
    const companyId = await getActiveCompanyId();
    const { data, error } = await supabase
      .from("document_ai_corrections")
      .select(
        "document_id, file_name, field_name, previous_predicted_value, corrected_value, created_at, ocr_text, ocr_words, previous_method, previous_confidence, source_text",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingCorrectionsSchema(error)) return [];
      throw error;
    }

    return ((data ?? []) as DocumentAiCorrectionRow[]).map(fromRow);
  } catch (error) {
    console.warn("Document AI corrections could not be read", error);
    return [];
  }
}

export function exportDocumentAiCorrectionsJsonl(corrections: DocumentAiCorrection[]) {
  return corrections.map((correction) => JSON.stringify(correction)).join("\n");
}
