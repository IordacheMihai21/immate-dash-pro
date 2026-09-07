import type { DocumentAiFieldKey } from "./documentAiService.ts";
import {
  isInvalidPartyCandidate,
  looksLikeNonInvoiceIdentifier,
  normalizeInvoiceNumber,
  normalizeTaxIdentifier,
} from "./invoiceCandidateEngine.ts";

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
const TAX_ID_FIELDS = new Set<DocumentAiFieldKey>(["supplierCui", "customerCui"]);
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

  reconcileTaxIdPair({
    fields,
    sources,
    confidences,
    candidateFields,
    candidateConfidences,
    layoutFields,
    layoutConfidences,
  });

  return { fields, sources, confidences };
}

function reconcileTaxIdPair({
  fields,
  sources,
  confidences,
  candidateFields,
  candidateConfidences,
  layoutFields,
  layoutConfidences,
}: {
  fields: Record<DocumentAiFieldKey, string>;
  sources: Record<DocumentAiFieldKey, HybridFieldSource>;
  confidences: Record<DocumentAiFieldKey, number>;
  candidateFields: Partial<Record<DocumentAiFieldKey, unknown>>;
  candidateConfidences: Partial<Record<DocumentAiFieldKey, number>>;
  layoutFields: Partial<Record<DocumentAiFieldKey, unknown>>;
  layoutConfidences: Partial<Record<DocumentAiFieldKey, number>>;
}) {
  type Evidence = {
    value: string;
    digits: string;
    role: "supplier" | "customer";
    source: "candidate_engine" | "layoutxlm";
    confidence: number;
  };

  const evidence: Evidence[] = [];

  const pushEvidence = (
    raw: unknown,
    role: "supplier" | "customer",
    source: "candidate_engine" | "layoutxlm",
    confidence: number | undefined,
  ) => {
    const value = normalizeTaxIdentifier(stringify(raw));
    if (!value) return;

    evidence.push({
      value,
      digits: value.replace(/^RO(?=\d)/, ""),
      role,
      source,
      confidence: clampConfidence(confidence, 0),
    });
  };

  pushEvidence(
    candidateFields.supplierCui,
    "supplier",
    "candidate_engine",
    candidateConfidences.supplierCui,
  );
  pushEvidence(
    candidateFields.customerCui,
    "customer",
    "candidate_engine",
    candidateConfidences.customerCui,
  );
  pushEvidence(layoutFields.supplierCui, "supplier", "layoutxlm", layoutConfidences.supplierCui);
  pushEvidence(layoutFields.customerCui, "customer", "layoutxlm", layoutConfidences.customerCui);

  if (!evidence.length) return;

  // Canonical representation for each underlying fiscal number:
  // if ANY extractor actually observed RO, retain it everywhere for that
  // same digit sequence. Never fabricate RO when no evidence contains it.
  const canonical = new Map<string, string>();
  for (const item of evidence) {
    const existing = canonical.get(item.digits);
    if (!existing || (!existing.startsWith("RO") && item.value.startsWith("RO"))) {
      canonical.set(item.digits, item.value);
    }
  }

  const roleScore = (digits: string, role: "supplier" | "customer") => {
    let score = 0;

    for (const item of evidence) {
      if (item.digits !== digits) continue;

      const sameRole = item.role === role;

      // LayoutXLM is particularly useful for semantic role assignment,
      // while the candidate engine contributes independent textual evidence.
      const sourceWeight = item.source === "layoutxlm" ? 1.06 : 0.94;

      score += (sameRole ? 1 : -0.34) * sourceWeight * Math.max(0.35, item.confidence);
    }

    return score;
  };

  const ids = [...canonical.keys()];
  if (!ids.length) return;

  let bestSupplier = "";
  let bestCustomer = "";
  let bestScore = -Infinity;

  // Joint assignment prevents independent supplier/customer decisions from
  // selecting the same entity or swapping two otherwise correctly detected IDs.
  for (const supplierDigits of ids) {
    const customerOptions = ids.length > 1 ? ids.filter((id) => id !== supplierDigits) : [""];

    for (const customerDigits of customerOptions) {
      const score =
        roleScore(supplierDigits, "supplier") +
        (customerDigits ? roleScore(customerDigits, "customer") : 0);

      if (score > bestScore) {
        bestScore = score;
        bestSupplier = supplierDigits;
        bestCustomer = customerDigits;
      }
    }
  }

  const currentSupplier = normalizeTaxIdentifier(fields.supplierCui);
  const currentCustomer = normalizeTaxIdentifier(fields.customerCui);

  const supplierValue = bestSupplier ? (canonical.get(bestSupplier) ?? "") : "";
  const customerValue = bestCustomer ? (canonical.get(bestCustomer) ?? "") : "";

  // Require meaningful joint evidence before overriding an already-populated
  // value; missing values can be filled more readily.
  if (
    supplierValue &&
    (!currentSupplier ||
      currentSupplier.replace(/^RO(?=\d)/, "") === bestSupplier ||
      bestScore >= 0.9)
  ) {
    fields.supplierCui = supplierValue;

    const supporting = evidence
      .filter((item) => item.digits === bestSupplier && item.role === "supplier")
      .sort((a, b) => b.confidence - a.confidence)[0];

    sources.supplierCui = supporting?.source ?? sources.supplierCui;
    confidences.supplierCui = Math.max(
      confidences.supplierCui ?? 0,
      supporting?.confidence ?? 0.72,
    );
  }

  if (
    customerValue &&
    (!currentCustomer ||
      currentCustomer.replace(/^RO(?=\d)/, "") === bestCustomer ||
      bestScore >= 0.9)
  ) {
    fields.customerCui = customerValue;

    const supporting = evidence
      .filter((item) => item.digits === bestCustomer && item.role === "customer")
      .sort((a, b) => b.confidence - a.confidence)[0];

    sources.customerCui = supporting?.source ?? sources.customerCui;
    confidences.customerCui = Math.max(
      confidences.customerCui ?? 0,
      supporting?.confidence ?? 0.72,
    );
  }

  // Final canonicalization when supplier/customer already have the right
  // digits but one side dropped an explicitly observed RO prefix.
  for (const field of ["supplierCui", "customerCui"] as const) {
    const normalized = normalizeTaxIdentifier(fields[field]);
    if (!normalized) continue;

    const digits = normalized.replace(/^RO(?=\d)/, "");
    const richer = canonical.get(digits);
    if (richer?.startsWith("RO")) fields[field] = richer;
  }
}

function chooseFieldValue(
  field: DocumentAiFieldKey,
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  // Dispatched before the generic agreement shortcut below: that shortcut
  // would otherwise let two sides that happen to agree on a CUI/date/
  // phone/IBAN-shaped value through unchallenged (it has no concept of
  // "this looks like the wrong kind of identifier"), whereas
  // chooseInvoiceNumber's own agreement fast-path applies that guard too.
  if (field === "invoiceNumber") {
    return chooseInvoiceNumber(candidate, candidateConfidence, layout, layoutConfidence);
  }

  if (field === "totalAmount") {
    return chooseTotalAmount(candidate, candidateConfidence, layout, layoutConfidence);
  }

  if (valuesEquivalent(field, candidate, layout) && candidate) {
    return selected(candidate, "candidate_engine", Math.max(candidateConfidence, layoutConfidence));
  }

  if (AMOUNT_FIELDS.has(field)) {
    return chooseAmount(candidate, candidateConfidence, layout, layoutConfidence);
  }
  if (PARTY_FIELDS.has(field)) {
    return chooseParty(field, candidate, candidateConfidence, layout, layoutConfidence);
  }
  if (TAX_ID_FIELDS.has(field)) {
    return chooseTaxId(candidate, candidateConfidence, layout, layoutConfidence);
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

// Dedicated (not the shared chooseAmount) because the grand total is the
// single highest-value, highest-risk amount field: a real invoice page
// almost always has several other numbers that look just as plausible
// (subtotal, VAT, individual line items) and the wrong pick is much more
// costly here than for subtotal/vatAmount.
function chooseTotalAmount(
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  const normalizedCandidate = normalizeAmount(candidate);
  const normalizedLayout = normalizeAmount(layout);

  // Model + heuristic agreement: the candidate engine's text/label-based
  // extraction and LayoutXLM's independent, layout-aware token
  // classification landing on the exact same number (after normalization)
  // is strong evidence on its own, even when neither side alone cleared
  // its normal confidence bar.
  if (normalizedCandidate && normalizedCandidate === normalizedLayout) {
    return selected(
      normalizedCandidate,
      "candidate_engine",
      Math.max(candidateConfidence, layoutConfidence, 0.82),
    );
  }

  return chooseAmount(candidate, candidateConfidence, layout, layoutConfidence);
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

// Both sides are normalized before comparison so the OCR-noisy raw candidate
// (e.g. "R027916027", "C.I.LF.R0O6724860") never wins just because it looked
// "plausible enough" -- the old isValidGeneralField check for these fields
// only required 6-24 alnum chars with a digit, which almost anything passed.
function chooseTaxId(
  candidate: string,
  candidateConfidence: number,
  layout: string,
  layoutConfidence: number,
) {
  const normalizedCandidate = normalizeTaxIdentifier(candidate);
  const normalizedLayout = normalizeTaxIdentifier(layout);

  if (normalizedCandidate && normalizedCandidate === normalizedLayout) {
    return selected(
      normalizedCandidate,
      "candidate_engine",
      Math.max(candidateConfidence, layoutConfidence),
    );
  }

  // If both extractors agree on the fiscal number itself but only one
  // retained the explicit Romanian RO prefix, keep the prefixed form.
  // This uses evidence from the document rather than inventing RO for
  // every unprefixed CUI.
  if (normalizedCandidate && normalizedLayout) {
    const candidateDigits = normalizedCandidate.replace(/^RO(?=\d)/, "");
    const layoutDigits = normalizedLayout.replace(/^RO(?=\d)/, "");

    if (candidateDigits === layoutDigits) {
      const preferred = normalizedCandidate.startsWith("RO")
        ? normalizedCandidate
        : normalizedLayout.startsWith("RO")
          ? normalizedLayout
          : normalizedCandidate;

      return selected(
        preferred,
        normalizedCandidate.startsWith("RO") ? "candidate_engine" : "layoutxlm",
        Math.max(candidateConfidence, layoutConfidence),
      );
    }
    return candidateConfidence >= layoutConfidence
      ? selected(normalizedCandidate, "candidate_engine", candidateConfidence)
      : selected(normalizedLayout, "layoutxlm", layoutConfidence);
  }
  if (normalizedCandidate) {
    return selected(normalizedCandidate, "candidate_engine", candidateConfidence);
  }
  if (normalizedLayout) {
    return selected(normalizedLayout, "layoutxlm", layoutConfidence);
  }
  return missing();
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
  // Strongest signal available: the candidate engine's regex extraction
  // and LayoutXLM's independent token-classification agree on the exact
  // same value. Neither side has to be individually confident for this to
  // be trustworthy -- agreement between two independent methods is itself
  // the evidence.
  const normalizedCandidate = normalizeInvoiceNumber(candidate);
  const normalizedLayout = normalizeInvoiceNumber(layout);
  if (
    normalizedCandidate &&
    normalizedCandidate === normalizedLayout &&
    !looksLikeNonInvoiceIdentifier(candidate)
  ) {
    return selected(
      normalizeInvoiceNumber(candidate, false),
      "candidate_engine",
      Math.max(candidateConfidence, layoutConfidence, 0.8),
    );
  }

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
  return candidate && !looksLikeNonInvoiceIdentifier(candidate)
    ? selected(candidate, "candidate_engine", candidateConfidence)
    : missing();
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
  // Applies regardless of source (candidate engine or LayoutXLM): a value
  // that's shaped like a date, CUI, IBAN, or phone number is essentially
  // never actually the invoice number, even if it scored well on the
  // generic checks below.
  if (looksLikeNonInvoiceIdentifier(value)) return 0;

  let score = 1;
  if (/^[A-Z0-9][A-Z0-9./_-]+$/i.test(normalized)) score += 2;
  // Alphanumeric series+number structure (e.g. "MH2639744", "TSR-CL/14134")
  // is the dominant real-world shape -- weight it more than a pure-digit run.
  if (/[A-Z]/i.test(normalized) && /\d/.test(normalized)) score += 2;
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
  // Negative amounts are legitimate on credit notes/adjustments (a real
  // Romanian invoice can print "Total de plata -41,04") -- this used to
  // reject any negative value outright, silently falling back to the raw,
  // un-normalized candidate string further up the merge whenever that
  // happened.
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
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
  // supplierCui/customerCui never reach here -- chooseFieldValue routes them
  // to chooseTaxId, which normalizes with normalizeTaxIdentifier instead.
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
