import type {
  DocumentAiConfidenceMap,
  DocumentAiExtractedFields,
  DocumentAiFieldKey,
  DocumentAiProfile,
} from "./documentAiService.ts";
import { isUiSafeEntityValue, isUiSafePartyValue } from "./documentAiUiSafety.ts";

type ConfidenceFieldRule = {
  field: DocumentAiFieldKey;
  weight: number;
  core?: boolean;
};

export type VisibleConfidenceResult = {
  score: number;
  profile: DocumentAiProfile;
  applicableFields: DocumentAiFieldKey[];
  coreFieldsDetected: number;
  requiresManualReview: boolean;
};

const GENERIC_CORE_FIELDS: ConfidenceFieldRule[] = [
  { field: "invoiceNumber", weight: 1.5, core: true },
  { field: "invoiceDate", weight: 1.4, core: true },
  { field: "supplierName", weight: 1.25, core: true },
  { field: "customerName", weight: 1, core: true },
  { field: "totalAmount", weight: 1.5, core: true },
];

const GENERIC_OPTIONAL_FIELDS: ConfidenceFieldRule[] = [
  { field: "currency", weight: 0.7 },
  { field: "supplierCui", weight: 0.6 },
  { field: "customerCui", weight: 0.6 },
  { field: "subtotal", weight: 0.8 },
  { field: "vatAmount", weight: 0.8 },
];

const ROMANIAN_REQUIRED_FIELDS: ConfidenceFieldRule[] = [
  ...GENERIC_CORE_FIELDS,
  { field: "supplierCui", weight: 1 },
  { field: "customerCui", weight: 0.8 },
  { field: "subtotal", weight: 0.8 },
  { field: "vatAmount", weight: 0.8 },
  { field: "currency", weight: 0.6 },
];

export function detectDocumentAiProfile({
  fileName,
  fileType,
  extractedText,
}: {
  fileName: string;
  fileType: string;
  extractedText: string;
}): DocumentAiProfile {
  if (/^Template\d+_Instance\d+\.(?:jpe?g|png|pdf)$/i.test(fileName.trim())) {
    return "fatura_dataset";
  }

  const normalizedType = fileType.toLowerCase().replace(/^\./, "");
  const text = extractedText.slice(0, 12_000);
  const romanianSignals = [
    /\be[-\s]?factura\b/i,
    /\bRO_CIUS\b/i,
    /\b(?:anaf|spv)\b/i,
    /\b(?:cod\s+fiscal|cui|cif)\b/i,
    /\b(?:cac|cbc):[A-Za-z]+\b/,
  ].filter((pattern) => pattern.test(text)).length;

  return normalizedType === "xml" || romanianSignals >= 2 ? "romanian_efactura" : "generic_invoice";
}

export function calculateVisibleDocumentConfidence({
  profile,
  fields,
  confidences,
  extractedText,
}: {
  profile: DocumentAiProfile;
  fields: DocumentAiExtractedFields;
  confidences: DocumentAiConfidenceMap;
  extractedText: string;
}): VisibleConfidenceResult {
  const rules =
    profile === "romanian_efactura"
      ? ROMANIAN_REQUIRED_FIELDS
      : [
          ...GENERIC_CORE_FIELDS,
          ...GENERIC_OPTIONAL_FIELDS.filter(({ field }) =>
            isGenericOptionalFieldApplicable(field, fields, confidences, extractedText),
          ),
        ];

  const weightedConfidence = rules.reduce(
    (sum, { field, weight }) =>
      sum + normalizedConfidence(fields[field], confidences[field]) * weight,
    0,
  );
  const totalWeight = rules.reduce((sum, { weight }) => sum + weight, 0);
  const baseScore = totalWeight > 0 ? Math.round((weightedConfidence / totalWeight) * 100) : 0;
  const coreFieldsDetected = GENERIC_CORE_FIELDS.filter(({ field }) =>
    isValidGenericCoreField(field, fields[field], confidences[field], extractedText),
  ).length;
  const requiresManualReview = baseScore < 50 || coreFieldsDetected < 3;
  const score = calibrateGenericProductScore({
    profile,
    baseScore,
    fields,
    confidences,
    extractedText,
    coreFieldsDetected,
    requiresManualReview,
  });

  return {
    score: Math.max(0, Math.min(score, 100)),
    profile,
    applicableFields: rules.map(({ field }) => field),
    coreFieldsDetected,
    requiresManualReview,
  };
}

function isGenericOptionalFieldApplicable(
  field: DocumentAiFieldKey,
  fields: DocumentAiExtractedFields,
  confidences: DocumentAiConfidenceMap,
  extractedText: string,
) {
  if (field === "currency") {
    return (
      (isValidCurrency(fields.currency) &&
        isConfidentlyDetected(fields.currency, confidences.currency)) ||
      /(?:\b(?:RON|LEI|EUR|USD|GBP|CHF)\b|[$€£])/i.test(extractedText)
    );
  }

  if (field === "subtotal" || field === "vatAmount") {
    return (
      isValidAmount(fields[field], extractedText) &&
      isConfidentlyDetected(fields[field], confidences[field])
    );
  }

  if (field === "supplierCui" || field === "customerCui") {
    return (
      isValidTaxIdentifier(fields[field]) &&
      isConfidentlyDetected(fields[field], confidences[field])
    );
  }

  return isConfidentlyDetected(fields[field], confidences[field]);
}

function calibrateGenericProductScore({
  profile,
  baseScore,
  fields,
  confidences,
  extractedText,
  coreFieldsDetected,
  requiresManualReview,
}: {
  profile: DocumentAiProfile;
  baseScore: number;
  fields: DocumentAiExtractedFields;
  confidences: DocumentAiConfidenceMap;
  extractedText: string;
  coreFieldsDetected: number;
  requiresManualReview: boolean;
}) {
  const genericProfile = profile === "generic_invoice" || profile === "fatura_dataset";
  if (
    !genericProfile ||
    requiresManualReview ||
    baseScore < 75 ||
    baseScore > 80 ||
    coreFieldsDetected < 4 ||
    !hasSafePartiesAndTotal(fields, confidences, extractedText)
  ) {
    return clampPercent(baseScore);
  }

  if (coreFieldsDetected === GENERIC_CORE_FIELDS.length) {
    const averageCoreConfidence =
      GENERIC_CORE_FIELDS.reduce(
        (sum, { field }) => sum + normalizedConfidence(fields[field], confidences[field]),
        0,
      ) / GENERIC_CORE_FIELDS.length;
    const calibrated = 85 + Math.round(clamp((averageCoreConfidence - 0.75) / 0.2, 0, 1) * 5);
    return Math.max(baseScore, calibrated);
  }

  const calibrated = 82 + Math.round(clamp((baseScore - 75) / 5, 0, 1) * 3);
  return Math.max(baseScore, calibrated);
}

function isValidGenericCoreField(
  field: DocumentAiFieldKey,
  value: unknown,
  confidence: number,
  extractedText: string,
) {
  if (!isConfidentlyDetected(value, confidence)) return false;
  if (field === "invoiceNumber") return isUiSafeEntityValue(field, value);
  if (field === "invoiceDate") return isValidIsoDate(value);
  if (field === "supplierName" || field === "customerName") {
    return isUiSafePartyValue(value);
  }
  if (field === "totalAmount") return isValidAmount(value, extractedText);
  return false;
}

function hasSafePartiesAndTotal(
  fields: DocumentAiExtractedFields,
  confidences: DocumentAiConfidenceMap,
  extractedText: string,
) {
  return (
    isValidGenericCoreField(
      "supplierName",
      fields.supplierName,
      confidences.supplierName,
      extractedText,
    ) &&
    isValidGenericCoreField(
      "customerName",
      fields.customerName,
      confidences.customerName,
      extractedText,
    ) &&
    isValidGenericCoreField(
      "totalAmount",
      fields.totalAmount,
      confidences.totalAmount,
      extractedText,
    )
  );
}

function isValidIsoDate(value: unknown) {
  const text = stringify(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

function isValidAmount(value: unknown, extractedText: string) {
  const text = stringify(value).replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) return false;

  if (parsed <= 20) {
    const otherAmounts = Array.from(extractedText.matchAll(/\b\d+[.,]\d{2}\b/g))
      .map(([match]) => Number(match.replace(",", ".")))
      .filter(Number.isFinite);
    if (otherAmounts.some((amount) => amount > parsed * 3)) return false;
  }

  return true;
}

function isValidCurrency(value: unknown) {
  return /^(?:RON|LEI|EUR|USD|GBP|CHF)$/i.test(stringify(value));
}

function isValidTaxIdentifier(value: unknown) {
  const normalized = stringify(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 6 && normalized.length <= 24 && /\d/.test(normalized);
}

function isConfidentlyDetected(value: unknown, confidence: number) {
  return hasValue(value) && normalizedConfidence(value, confidence) >= 0.6;
}

function normalizedConfidence(value: unknown, confidence: number) {
  if (!hasValue(value) || !Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(confidence, 1));
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function stringify(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function clampPercent(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}
