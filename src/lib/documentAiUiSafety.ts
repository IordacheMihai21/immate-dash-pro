import type { DocumentAiFieldKey } from "./documentAiService.ts";

const PARTY_FIELDS = new Set<DocumentAiFieldKey>(["supplierName", "customerName"]);
const PARTY_LABEL_PATTERN =
  /\b(?:invoice\s*(?:id|number|no\.?|#)?|po\s*number|bill[\s_-]*to|ship\s*to|date|total|tva|tax)\b/i;
const MANUAL_REVIEW_MESSAGE =
  "Documentul necesită verificare manuală. Sistemul a extras parțial datele, dar unele câmpuri au încredere redusă.";

export function sanitizeUiSafePartyValue(field: DocumentAiFieldKey, value: unknown) {
  if (!PARTY_FIELDS.has(field)) return stringify(value);
  const raw = stringify(value);
  if (!raw || PARTY_LABEL_PATTERN.test(raw)) return "";

  const candidates = raw
    .split(/\r?\n|\s{2,}|[|;]/)
    .map((part) => part.trim().replace(/^[\s:,-]+|[\s:,-]+$/g, ""))
    .filter(Boolean)
    .filter((part) => !PARTY_LABEL_PATTERN.test(part))
    .filter((part) => !/\b(?:tel|phone|email|site|https?|www\.)\b/i.test(part))
    .filter((part) => !/\b\d{3,}\b/.test(part));

  const best =
    candidates
      .map((candidate) => ({ candidate, score: partyLineScore(candidate) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)[0]?.candidate ?? "";

  return field === "customerName" ? trimConcatenatedPeople(best) : best;
}

export function isUiSafePartyValue(value: unknown) {
  const text = stringify(value);
  return Boolean(text && !PARTY_LABEL_PATTERN.test(text) && partyLineScore(text) > 0);
}

export function isUiSafeEntityValue(field: DocumentAiFieldKey, value: unknown) {
  const text = stringify(value);
  if (!text) return false;
  if (PARTY_FIELDS.has(field)) return isUiSafePartyValue(text);
  if (field === "invoiceNumber") {
    return /\d/.test(text) && !PARTY_LABEL_PATTERN.test(text) && text.length >= 3;
  }
  return true;
}

export function getManualReviewMessage() {
  return MANUAL_REVIEW_MESSAGE;
}

function partyLineScore(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!value || words.length === 0 || words.length > 8 || value.length > 80) return 0;
  if (PARTY_LABEL_PATTERN.test(value) || /\b\d{3,}\b/.test(value)) return 0;
  let score = 1;
  if (/\b(?:srl|sa|inc|llc|ltd|plc|group|company|corp|gmbh)\b/i.test(value)) score += 3;
  if (/^[A-ZÀ-Ž][\p{L}'&., -]+$/u.test(value)) score += 1;
  if (words.length >= 2 && words.length <= 5) score += 2;
  return score;
}

function trimConcatenatedPeople(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  const allLookLikeNames = words.every((word) => /^[A-ZÀ-Ž][\p{L}'-]+$/u.test(word));
  const hasCompanySuffix = /\b(?:srl|sa|inc|llc|ltd|plc|group|company|corp|gmbh)\b/i.test(value);
  if (words.length === 4 && allLookLikeNames && !hasCompanySuffix) {
    return words.slice(0, 2).join(" ");
  }
  return value;
}

function stringify(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
