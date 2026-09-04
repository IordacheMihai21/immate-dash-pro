import { readDocumentAiCorrections } from "@/lib/documentAiCorrectionService";
import { supabase } from "@/lib/supabaseClient";

export type FieldConfidenceStat = {
  fieldType: string;
  averageConfidence: number;
  count: number;
  belowThresholdCount: number;
};

export type DocumentAiMonitoringSummary = {
  totalFields: number;
  averageConfidence: number;
  autoAcceptRate: number;
  needsReviewCount: number;
  fieldStats: FieldConfidenceStat[];
  correctionsCount: number;
  correctionsByField: { fieldName: string; count: number }[];
  // Real-world implied accuracy: (fields extracted - fields a user later
  // corrected) / fields extracted. Unlike autoAcceptRate (which just
  // reflects the model's own confidence score), this is grounded in an
  // actual outcome -- whether a human changed the value afterwards.
  // Undercounts true accuracy slightly, since a field the user never
  // reviewed can't have been corrected either way; treat it as a floor,
  // not a ceiling.
  impliedAccuracyRate: number | null;
};

const MAX_ENTITIES = 5000;

export async function getDocumentAiMonitoringSummary(
  threshold: number,
): Promise<DocumentAiMonitoringSummary> {
  const [{ data, error }, corrections] = await Promise.all([
    supabase
      .from("extracted_entities")
      .select("entity_type, confidence")
      .eq("extraction_method", "document_ai")
      .limit(MAX_ENTITIES),
    readDocumentAiCorrections(),
  ]);

  if (error) {
    throw new Error(`Statisticile de incredere nu au putut fi citite: ${error.message}`);
  }

  const rows = data ?? [];
  const byField = new Map<string, { sum: number; count: number; belowThreshold: number }>();
  let totalConfidence = 0;
  let needsReviewCount = 0;

  for (const row of rows) {
    const confidence = Number(row.confidence ?? 0);
    const fieldType = row.entity_type ?? "necunoscut";
    const bucket = byField.get(fieldType) ?? { sum: 0, count: 0, belowThreshold: 0 };

    bucket.sum += confidence;
    bucket.count += 1;
    if (confidence < threshold) {
      bucket.belowThreshold += 1;
    }
    byField.set(fieldType, bucket);

    totalConfidence += confidence;
    if (confidence < threshold) {
      needsReviewCount += 1;
    }
  }

  const fieldStats: FieldConfidenceStat[] = Array.from(byField.entries())
    .map(([fieldType, bucket]) => ({
      fieldType,
      averageConfidence: bucket.count > 0 ? bucket.sum / bucket.count : 0,
      count: bucket.count,
      belowThresholdCount: bucket.belowThreshold,
    }))
    .sort((a, b) => a.averageConfidence - b.averageConfidence);

  const correctionsByFieldMap = new Map<string, number>();
  for (const correction of corrections) {
    correctionsByFieldMap.set(
      correction.fieldName,
      (correctionsByFieldMap.get(correction.fieldName) ?? 0) + 1,
    );
  }

  return {
    totalFields: rows.length,
    averageConfidence: rows.length > 0 ? totalConfidence / rows.length : 0,
    autoAcceptRate: rows.length > 0 ? (rows.length - needsReviewCount) / rows.length : 0,
    needsReviewCount,
    fieldStats,
    correctionsCount: corrections.length,
    correctionsByField: Array.from(correctionsByFieldMap.entries())
      .map(([fieldName, count]) => ({ fieldName, count }))
      .sort((a, b) => b.count - a.count),
    impliedAccuracyRate:
      rows.length > 0
        ? Math.max(0, Math.min(1, (rows.length - corrections.length) / rows.length))
        : null,
  };
}
