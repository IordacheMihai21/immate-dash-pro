import type { DocumentAiFieldKey } from "./documentAiService.ts";
import { isInvalidPartyCandidate, normalizeInvoiceNumber } from "./invoiceCandidateEngine.ts";

export type HybridFieldSource = "candidate_engine" | "layoutxlm" | "missing";

export type HybridMergeResult = {
  fields: Record<DocumentAiFieldKey, string>;
  sources: Record<DocumentAiFieldKey, HybridFieldSource>;
  confidences: Record<DocumentAiFieldKey, number>;
};

type HybridMergeInput = {
  candidateFields: Partial<Record<DocumentAiFieldKey, unknown>>;
  candidateConfidences?: Partial<Record<DocumentAiFieldKey, number>>;
  layoutFields: Partial<Record<DocumentAiFieldKey, unknown>>;
  layoutConfidences?: Partial<Record<DocumentAiFieldKey, number>>;
  layoutMethods?: Partial<Record<DocumentAiFieldKey, string>>;
};

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

const AMOUNT_FIELDS = new Set<DocumentAiFieldKey>(["subtotal", "vatAmount", "totalAmount"]);
const PARTY_FIELDS = new Set<DocumentAiFieldKey>(["supplierName", "customerName"]);
const PARTY_NOISE_PATTERN =
  /\b(?:invoice(?:\s*(?:number|no\.?|#))?|po\s*number|bill[\s_-]*to|ship[\s_-]*to|subtotal|total|amount|description|quantity|contact\s+us|email|phone|address|bank|swift|iban)\b/i;

export function mergeLayoutXlmWithCandidateEngine({
  candidateFields,
  candidateConfidences = {},
  layoutFields,
  layoutConfidences = {},
  layoutMethods = {},
}: HybridMergeInput): HybridMergeResult {
  const fields = {} as Record<DocumentAiFieldKey, string>;
  const sources = {} as Record<DocumentAiFieldKey, HybridFieldSource>;
  const confidences = {} as Record<DocumentAiFieldKey, number>;

  for (const field of FIELD_KEYS) {
    const candidate = stringify(candidateFields[field]);
    const layout = stringify(layoutFields[field]);
    const candidateConfidence = clampConfidence(candidateConfidences[field], candidate ? 0.72 : 0);
    const hasFineTunedSignal = /fine-tuned\s+layoutxlm/i.test(layoutMethods[field] ?? "");
    const layoutConfidence = hasFineTunedSignal
      ? clampConfidence(layoutConfidences[field], layout ? 0.6 : 0)
      : 0;
    const choice = chooseFieldValue(
      field,
      candidate,
      candidateConfidence,
      layout,
      layoutConfidence,
    );
    fields[field] = choice.value;
    sources[field] = choice.source;
    confidences[field] = choice.confidence;
  }

  return { fields, sources, confidences };
}

function chooseFieldValue(
  field: DocumentAiFieldKey,
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  if (valuesEquivalent(field, candidate, layout) && candidate) {
    return selected(candidate, "candidate_engine", Math.max(candidateConfidence, layoutConfidence));
  }

  if (AMOUNT_FIELDS.has(field)) {
    return chooseAmount(candidate, candidateConfidence, layout, layoutConfidence);
  }
  if (PARTY_FIELDS.has(field)) {
    return chooseParty(field, candidate, candidateConfidence, layout, layoutConfidence);
  }
  if (field === "invoiceNumber") {
    return chooseInvoiceNumber(candidate, candidateConfidence, layout, layoutConfidence);
  }
  if (field === "currency") {
    const candidateCurrency = normalizeCurrency(candidate);
    const layoutCurrency = normalizeCurrency(layout);
    if (candidateCurrency)
      return selected(candidateCurrency, "candidate_engine", candidateConfidence);
    if (layoutCurrency && layoutConfidence >= 0.68) {
      return selected(layoutCurrency, "layoutxlm", layoutConfidence);
    }
    return missing();
  }

  if (isValidGeneralField(field, candidate)) {
    return selected(candidate, "candidate_engine", candidateConfidence);
  }
  if (isValidGeneralField(field, layout) && layoutConfidence >= 0.7) {
    return selected(layout, "layoutxlm", layoutConfidence);
  }
  return candidate ? selected(candidate, "candidate_engine", candidateConfidence) : missing();
}

function chooseAmount(
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  const normalizedCandidate = normalizeAmount(candidate);
  const normalizedLayout = normalizeAmount(layout);

  if (normalizedCandidate) {
    if (!normalizedLayout || isSuspiciousLayoutAmount(layout)) {
      return selected(normalizedCandidate, "candidate_engine", candidateConfidence);
    }
    if (candidateConfidence >= 0.55 || layoutConfidence < candidateConfidence + 0.2) {
      return selected(normalizedCandidate, "candidate_engine", candidateConfidence);
    }
    if (layoutConfidence >= 0.88) {
      return selected(normalizedLayout, "layoutxlm", layoutConfidence);
    }
    return selected(normalizedCandidate, "candidate_engine", candidateConfidence);
  }

  if (normalizedLayout && !isSuspiciousLayoutAmount(layout) && layoutConfidence >= 0.76) {
    return selected(normalizedLayout, "layoutxlm", layoutConfidence);
  }
  return candidate ? selected(candidate, "candidate_engine", candidateConfidence) : missing();
}

function chooseParty(
  field: DocumentAiFieldKey,
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  const candidateParties = splitLegalEntities(candidate);

  if (candidateParties.length >= 2) {
    const selectedParty =
      field === "supplierName"
        ? candidateParties[0]
        : candidateParties[candidateParties.length - 1];

    return selected(selectedParty, "candidate_engine", candidateConfidence);
  }

  const candidateValid = isCleanParty(candidate);
  const layoutValid = isCleanParty(layout);

  if (candidateValid) {
    return selected(candidate, "candidate_engine", candidateConfidence);
  }

  if (layoutValid && layoutConfidence >= 0.76) {
    return selected(layout, "layoutxlm", layoutConfidence);
  }

  return candidate ? selected(candidate, "candidate_engine", candidateConfidence) : missing();
}

function splitLegalEntities(value: string): string[] {
  if (!value) return [];

  const suffixPattern =
    /\b(?:S\.?R\.?L\.?|S\.?A\.?|PFA|SNC|SCS|SRL-D|LLC|LTD\.?|LIMITED|INC\.?|CORP\.?|GMBH|PLC)\b/gi;

  const matches = [...value.matchAll(suffixPattern)];

  if (matches.length < 2) return [value.trim()];

  const parts: string[] = [];
  let start = 0;

  for (const match of matches) {
    const matchStart = match.index ?? 0;
    const end = matchStart + match[0].length;

    const part = value
      .slice(start, end)
      .trim()
      .replace(/^[\s:;,#-]+|[\s:;,#-]+$/g, "");

    if (part) parts.push(part);

    start = end;
  }

  return parts;
}

function chooseInvoiceNumber(
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  const candidateScore = invoiceNumberScore(candidate);
  const layoutScore = invoiceNumberScore(layout);
  if (candidateScore >= 3 && (candidateScore >= layoutScore || candidateConfidence >= 0.55)) {
    return selected(
      normalizeInvoiceNumber(candidate, false),
      "candidate_engine",
      candidateConfidence,
    );
  }
  if (layoutScore >= 4 && layoutScore >= candidateScore + 1 && layoutConfidence >= 0.72) {
    return selected(normalizeInvoiceNumber(layout, false), "layoutxlm", layoutConfidence);
  }
  return candidate ? selected(candidate, "candidate_engine", candidateConfidence) : missing();
}

function isCleanParty(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return Boolean(
    value &&
    words.length >= 1 &&
    words.length <= 8 &&
    value.length <= 80 &&
    !PARTY_NOISE_PATTERN.test(value) &&
    !/\b\d{3,}\b/.test(value) &&
    !isInvalidPartyCandidate(value),
  );
}

function invoiceNumberScore(value: string) {
  const normalized = normalizeInvoiceNumber(value);
  if (!normalized || !/\d/.test(normalized) || normalized.length < 3 || normalized.length > 40) {
    return 0;
  }
  let score = 1;
  if (/^[A-Z0-9][A-Z0-9./_-]+$/i.test(normalized)) score += 2;
  if (/[A-Z]/i.test(normalized) && /\d/.test(normalized)) score += 1;
  if (/^(?:INV|FACT|FCT)/i.test(normalized)) score += 1;
  if (/^(?:INVOICE|NUMBER|NO)$/i.test(normalized) || /^\d{1,2}$/.test(normalized)) score -= 3;
  return score;
}

function normalizeAmount(value: string) {
  if (!value || /[A-DF-QS-Z]/i.test(value.replace(/RON|LEI|EUR|USD|GBP/gi, ""))) return "";
  let numeric = value
    .replace(/RON|LEI|EUR|USD|GBP/gi, "")
    .replace(/[$€£\s']/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!numeric || !/\d/.test(numeric)) return "";

  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  if (separator >= 0) {
    const decimals = numeric.length - separator - 1;
    if (decimals === 1 || decimals === 2) {
      numeric = `${numeric.slice(0, separator).replace(/[.,]/g, "")}.${numeric.slice(separator + 1)}`;
    } else {
      numeric = numeric.replace(/[.,]/g, "");
    }
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : "";
}

function isSuspiciousLayoutAmount(value: string) {
  const plain = value.replace(/RON|LEI|EUR|USD|GBP|[$€£\s']/gi, "");
  if (!/[.,]\d{1,2}$/.test(plain)) return true;
  return (
    /\d{1,3}(?:[.,]\d{3}){2,}[.,]\d{1,2}$/.test(plain) && !/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(plain)
  );
}

function valuesEquivalent(field: DocumentAiFieldKey, left: string, right: string) {
  if (!left || !right) return false;
  if (AMOUNT_FIELDS.has(field)) return normalizeAmount(left) === normalizeAmount(right);
  if (field === "invoiceNumber") {
    return normalizeInvoiceNumber(left) === normalizeInvoiceNumber(right);
  }
  if (field === "currency") return normalizeCurrency(left) === normalizeCurrency(right);
  return normalizeText(left) === normalizeText(right);
}

function isValidGeneralField(field: DocumentAiFieldKey, value: string) {
  if (!value) return false;
  if (field === "invoiceDate") {
    const match = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!match) return false;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(match[0]);
  }
  if (field === "supplierCui" || field === "customerCui") {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return normalized.length >= 6 && normalized.length <= 24 && /\d/.test(normalized);
  }
  return true;
}

function normalizeCurrency(value: string) {
  const match = value.toUpperCase().match(/\b(RON|LEI|EUR|USD|GBP)\b/);
  return match?.[1] === "LEI" ? "RON" : (match?.[1] ?? "");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function selected(
  value: string,
  source: Exclude<HybridFieldSource, "missing">,
  confidence: number,
) {
  return { value, source, confidence };
}

function missing() {
  return { value: "", source: "missing" as const, confidence: 0 };
}

function stringify(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function clampConfidence(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(Number(value), 1)) : fallback;
}
