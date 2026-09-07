export type CandidateFieldKey =
  | "invoiceNumber"
  | "invoiceDate"
  | "supplierName"
  | "supplierCui"
  | "customerName"
  | "customerCui"
  | "subtotal"
  | "vatAmount"
  | "totalAmount"
  | "currency";

export type CandidateValue = string | number | null;
export type CandidateMethod = "OCR" | "Regex" | "Layout heuristic";

export type CandidateLine = {
  text: string;
  confidence?: number;
  bbox?: { x: number; y: number; width: number; height: number };
};

export type FieldCandidate = {
  field: CandidateFieldKey;
  value: Exclude<CandidateValue, null>;
  normalizedValue: string | number;
  confidence: number;
  method: CandidateMethod;
  sourceText: string;
  lineIndex: number;
  score: number;
  warning?: string;
  reasons?: string[];
};

export type CandidateFieldResult = {
  value: CandidateValue;
  normalizedValue: string | number | null;
  confidence: number;
  method: CandidateMethod;
  sourceText?: string;
  warning?: string;
  alternatives: FieldCandidate[];
};

export type CandidateExtractionResult = {
  fields: Record<CandidateFieldKey, CandidateFieldResult>;
  consistencyScore: number;
  warnings: string[];
};

type CandidateContext = {
  text: string;
  lines: CandidateLine[];
  ocrConfidence: number;
};

const FIELD_KEYS: CandidateFieldKey[] = [
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

const DATE_PATTERN =
  /\b(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ian|febr|mart|apr|mai|iun|iul|aug|sept|oct|noi|nov|dec)[a-zăâîșşțţ]*[-\s]\d{2,4})\b/giu;

const PARTY_LABELS = {
  supplier: /\b(?:seller|supplier|vendor|furnizor|v[aâ]nz[aă]tor|emitent|from)\b/i,
  customer:
    /\b(?:buyer|bill[\s_-]*to|sold[\s_-]*to|customer|client|cump[aă]r[aă]tor|beneficiar)\b/i,
};

const PARTY_STOP_PATTERN =
  /\b(?:ship[\s_-]*to|invoice\s*(?:number|no\.?|#|id)|commercial\s+invoice|tax\s+invoice|description|unit\s+price|quantity|qty|amount|subtotal|total)\b/i;

const PARTY_INVALID_TERMS = [
  "commercial invoice",
  "tax invoice",
  "invoice",
  "address",
  "email",
  "site",
  "website",
  "www.",
  "http",
  "tel",
  "phone",
  "ship to",
  "ship_to",
  "bill to",
  "bill_to",
  "buyer",
  "customer",
  "client",
  "description",
  "unit price",
  "amount",
  "quantity",
  "qty",
  "total",
  "subtotal",
  "payment",
  "bank",
  "iban",
  "swift",
  "invoice id",
  "invoice number",
  "invoice #",
];

// The bare-integer branch requires >=2 digits (\d{2,}, not \d+): a lone
// digit with no decimal, no thousands grouping, and no currency symbol is
// essentially always table noise on a real invoice -- a column index like
// "(6)" in a header such as "Total de plati (col. 5 +col. 6):", a quantity,
// a page number -- never a genuine amount. Confirmed against real OCR
// output: this exact pattern produced fabricated totals like "6.00",
// "1.00", "2.00", "3.00" on documents whose real total was a completely
// different, correctly-formatted number elsewhere on the page. Decimal
// amounts (e.g. "9.50") are unaffected -- they match the middle branch,
// which requires the decimal suffix rather than treating it as optional.
const AMOUNT_PATTERN =
  /(?:[$€£]\s*)?-?(?:\d{1,3}(?:[\s.,']\d{3})+(?:[,.]\d{1,2})?|\d+[,.]\d{1,2}|\d{2,})(?:\s*(?:RON|LEI|EUR|USD|GBP))?/gi;

export function extractInvoiceCandidates({
  text,
  lines,
  ocrConfidence = 0.65,
}: {
  text: string;
  lines?: CandidateLine[];
  ocrConfidence?: number;
}): CandidateExtractionResult {
  const context = createContext(text, lines, ocrConfidence);
  const candidates: Record<CandidateFieldKey, FieldCandidate[]> = {
    invoiceNumber: extractInvoiceNumberCandidates(context),
    invoiceDate: extractDateCandidates(context),
    supplierName: extractSupplierCandidates(context),
    supplierCui: extractTaxIdentifierCandidates(context, "supplierCui"),
    customerName: extractCustomerCandidates(context),
    customerCui: extractTaxIdentifierCandidates(context, "customerCui"),
    subtotal: extractAmountCandidates(context, "subtotal"),
    vatAmount: extractAmountCandidates(context, "vatAmount"),
    totalAmount: extractAmountCandidates(context, "totalAmount"),
    currency: extractCurrencyCandidates(context),
  };

  const selected = FIELD_KEYS.reduce(
    (result, field) => {
      result[field] = selectBestCandidate(field, candidates[field], context);
      return result;
    },
    {} as Record<CandidateFieldKey, CandidateFieldResult>,
  );

  improveAmountConsistency(selected, candidates, context);
  repairLostAmountSeparators(selected);
  return validateExtractedInvoiceFields(selected, context);
}

export function extractInvoiceNumberCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  const labeledPattern =
    /(?:invoice\s*(?:number|no\.?|#|id)|nr\.?\s*(?:factur[aă]|factura)|num[aă]r(?:ul)?\s+facturii|factur[aă]\s*(?:nr\.?|num[aă]r)?|seria\s+(?:si|și|şi)\s+num[aă]rul\s+facturii)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{1,40})/i;

  context.lines.forEach((line, index) => {
    const match = line.text.match(labeledPattern);
    if (match?.[1]) {
      addCandidate(candidates, {
        field: "invoiceNumber",
        value: normalizeInvoiceNumber(match[1], false),
        normalizedValue: normalizeInvoiceNumber(match[1]),
        sourceText: line.text,
        lineIndex: index,
        score: 0.9 + lineConfidenceBonus(line) + topRegionBonus(index, context.lines.length, 0.06),
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Etichetă explicită pentru numărul facturii"],
      });
    }

    const leadingNrMatch = line.text.match(/^\s*Nr\.?\s*[:#-]?\s*(\d{2,8}\/(?:19|20)\d{2})\b/i);

    if (leadingNrMatch?.[1]) {
      addCandidate(candidates, {
        field: "invoiceNumber",
        value: normalizeInvoiceNumber(leadingNrMatch[1], false),
        normalizedValue: normalizeInvoiceNumber(leadingNrMatch[1]),
        sourceText: line.text,
        lineIndex: index,
        score: 0.92 + lineConfidenceBonus(line) + topRegionBonus(index, context.lines.length, 0.06),
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Număr de factură prefixat cu Nr. la începutul liniei"],
      });
    }

    for (const standalone of line.text.matchAll(
      /\b(INV(?=[A-Z0-9./_-]*\d)[A-Z0-9./_-]{3,40})\b/gi,
    )) {
      addCandidate(candidates, {
        field: "invoiceNumber",
        value: normalizeInvoiceNumber(standalone[1], false),
        normalizedValue: normalizeInvoiceNumber(standalone[1]),
        sourceText: line.text,
        lineIndex: index,
        score: 0.72 + topRegionBonus(index, context.lines.length, 0.08),
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Identificator INV independent"],
      });
    }

    const standaloneNumberYearLineIsNoisy =
      /\b(?:data|date|due|scaden[tț][aă]?|total|subtotal|tva|vat|amount|sum[aă])\b/i.test(
        line.text,
      );

    if (!standaloneNumberYearLineIsNoisy) {
      for (const standalone of line.text.matchAll(/(?<!\d\/)\b(\d{2,8}\/(?:19|20)\d{2})\b/g)) {
        addCandidate(candidates, {
          field: "invoiceNumber",
          value: normalizeInvoiceNumber(standalone[1], false),
          normalizedValue: normalizeInvoiceNumber(standalone[1]),
          sourceText: line.text,
          lineIndex: index,
          score: 0.74 + topRegionBonus(index, context.lines.length, 0.1),
          method: line.bbox ? "Layout heuristic" : "Regex",
          reasons: ["Număr de factură independent în format număr/an"],
        });
      }
    }
  });

  return rankCandidates(candidates, context);
}

export function extractDateCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  const allDates: Array<{ raw: string; line: CandidateLine; index: number }> = [];

  context.lines.forEach((line, index) => {
    for (const match of line.text.matchAll(DATE_PATTERN)) {
      allDates.push({ raw: match[1], line, index });
    }
  });

  allDates.forEach(({ raw, line, index }) => {
    const normalized = normalizeDate(raw);
    if (!normalized) return;

    const matchIndex = line.text.indexOf(raw);
    const localStart = Math.max(0, matchIndex - 55);
    const localContext = normalizeText(line.text.slice(localStart, matchIndex));

    const invoiceLabel = /\b(invoice\s+date|issue\s+date|data\s+facturii|data\s+emiterii)\b/i.test(
      localContext,
    );
    const genericLabel = /\b(date|data)\b/i.test(localContext);
    const dueDate = /\b(due\s+date|payment\s+due|data\s+scadent|scaden)/i.test(localContext);

    let score = allDates.length === 1 ? 0.68 : 0.57;
    if (invoiceLabel) score += 0.3;
    else if (genericLabel) score += 0.08;
    if (dueDate) score -= 0.45;
    score += topRegionBonus(index, context.lines.length, 0.05);

    addCandidate(candidates, {
      field: "invoiceDate",
      value: normalized,
      normalizedValue: normalized,
      sourceText: line.text,
      lineIndex: index,
      score,
      method: line.bbox ? "Layout heuristic" : "Regex",
      warning: dueDate ? "Data pare a fi termenul de plată." : undefined,
      reasons: invoiceLabel ? ["Dată lângă eticheta facturii"] : ["Dată validă în document"],
    });
  });

  return rankCandidates(candidates, context);
}

export function extractSupplierCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  addLabeledPartyCandidates(candidates, context, "supplierName", PARTY_LABELS.supplier);

  const customerBlockIndex = context.lines.findIndex((line) =>
    PARTY_LABELS.customer.test(line.text),
  );
  const searchLimit = Math.min(
    context.lines.length,
    customerBlockIndex > 0 ? customerBlockIndex : 14,
    14,
  );
  for (let index = 0; index < searchLimit; index += 1) {
    const line = context.lines[index];
    const cleaned = cleanPartyName(line.text);
    if (isInvalidPartyCandidate(cleaned)) continue;

    const nextLines = context.lines
      .slice(index + 1, index + 6)
      .map((item) => normalizeText(item.text));
    const beforeContact = nextLines.some((value) =>
      /\b(address|email|site|website|tel|phone|gstin|vat\s*(?:id|code)|tax\s+id|cui|cif)\b/i.test(
        value,
      ),
    );
    const companyLike = isCompanyLike(cleaned);
    let score = 0.47 + topRegionBonus(index, context.lines.length, 0.16);
    if (beforeContact) score += 0.16;
    if (companyLike) score += 0.13;

    addCandidate(candidates, {
      field: "supplierName",
      value: cleaned,
      normalizedValue: normalizePartyName(cleaned),
      sourceText: line.text,
      lineIndex: index,
      score,
      method: line.bbox ? "Layout heuristic" : "OCR",
      reasons: [companyLike ? "Nume de companie în zona de antet" : "Nume în blocul superior"],
    });
  }

  return rankCandidates(candidates, context);
}

export function extractCustomerCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  addLabeledPartyCandidates(candidates, context, "customerName", PARTY_LABELS.customer);

  return rankCandidates(candidates, context);
}

export function extractCurrencyCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  const counts = new Map<string, number>();

  context.lines.forEach((line, index) => {
    const normalizedLine = line.text.toUpperCase();
    const currencies: Array<{ raw: string; value: string }> = [];
    for (const match of normalizedLine.matchAll(/\b(USD|EUR|RON|LEI|LEU|GBP)\b/g)) {
      currencies.push({ raw: match[0], value: normalizeCurrency(match[1]) });
    }
    for (const match of line.text.matchAll(/[$€£§]/g)) {
      if (match[0] === "§" && !/\d[.,]\d{2}\s*§/.test(line.text)) continue;
      currencies.push({ raw: match[0], value: normalizeCurrency(match[0]) });
    }

    currencies.forEach(({ raw, value }) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      const nearAmount = /\b(total|amount\s*due|sub[\s_]*total|vat|gst|tax|tva)\b/i.test(line.text);
      addCandidate(candidates, {
        field: "currency",
        value,
        normalizedValue: value,
        sourceText: line.text,
        lineIndex: index,
        score: 0.64 + (nearAmount ? 0.22 : 0) + (/[€$£§]/.test(raw) ? 0.05 : 0),
        method: line.bbox ? "Layout heuristic" : "OCR",
        reasons: [nearAmount ? "Monedă lângă totaluri" : "Simbol sau cod monetar explicit"],
      });
    });
  });

  candidates.forEach((candidate) => {
    candidate.score += Math.min((counts.get(String(candidate.normalizedValue)) ?? 0) * 0.025, 0.12);
  });
  return rankCandidates(candidates, context);
}

export function extractAmountCandidates(
  context: CandidateContext,
  field: "subtotal" | "vatAmount" | "totalAmount",
) {
  const candidates: FieldCandidate[] = [];
  const labels = {
    subtotal:
      /\b(sub[\s_]*total|net\s+amount|tax\s+exclusive|valoare\s+f[aă]r[aă]\s+tva|baza\s+f[aă]r[aă]\s+tva)\b/i,
    vatAmount: /\b(vat\s+amount|tax\s+amount|gst|vat|tva|tax)\b/i,
    totalAmount:
      /\b(amount[\s_]*due|total\s+due|balance\s+due|grand\s+total|total\s+de\s+plat[aă]|total)\b/i,
  };

  context.lines.forEach((line, index) => {
    if (!labels[field].test(line.text)) return;
    const normalizedLine = normalizeText(line.text);
    if (
      field === "vatAmount" &&
      /\b(gstin|vat\s+(?:id|code|no)|tax\s+id)\b/i.test(normalizedLine)
    ) {
      return;
    }
    if (field === "totalAmount" && /\b(sub[\s_]*total|vat|gst|tax|tva)\b/i.test(normalizedLine)) {
      return;
    }

    const amounts = extractMonetaryTokens(line.text);
    amounts.forEach((amount, amountIndex) => {
      let score = 0.68 + lowerRegionBonus(index, context.lines.length, 0.1);
      if (
        field === "totalAmount" &&
        /\b(amount[\s_]*due|grand\s+total|total\s+due|balance\s+due|total\s+de\s+plat[aă])\b/i.test(
          normalizedLine,
        )
      ) {
        score += 0.2;
      }
      if (
        field === "subtotal" &&
        /\b(sub[\s_]*total|net\s+amount|tax\s+exclusive)\b/i.test(normalizedLine)
      ) {
        score += 0.16;
      }
      if (
        field === "vatAmount" &&
        /\b(vat\s+amount|tax\s+amount|gst|tva)\b/i.test(normalizedLine)
      ) {
        score += 0.14;
      }
      if (amountIndex === amounts.length - 1) score += 0.04;

      addCandidate(candidates, {
        field,
        value: amount,
        normalizedValue: amount,
        sourceText: line.text,
        lineIndex: index,
        score,
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Valoare monetară lângă eticheta câmpului"],
      });
    });
  });

  return rankCandidates(candidates, context);
}

export function scoreCandidate(candidate: FieldCandidate, context: CandidateContext) {
  const line = context.lines[candidate.lineIndex];
  const ocrQuality = line?.confidence ?? context.ocrConfidence;
  const score = candidate.score * 0.88 + clamp(ocrQuality, 0.35, 1) * 0.12;
  return clamp(score, 0, 0.98);
}

export function selectBestCandidate(
  field: CandidateFieldKey,
  candidates: FieldCandidate[],
  context: CandidateContext,
): CandidateFieldResult {
  const ranked = rankCandidates(candidates, context).filter((candidate) =>
    isCandidateSemanticallyValid(field, candidate),
  );
  const best = ranked[0];
  if (!best) {
    return {
      value: null,
      normalizedValue: null,
      confidence: 0,
      method: "Regex",
      warning: "Câmp nedetectat.",
      alternatives: [],
    };
  }

  return {
    value: best.value,
    normalizedValue: best.normalizedValue,
    confidence: best.confidence,
    method: best.method,
    sourceText: best.sourceText,
    warning: best.warning ?? (best.confidence < 0.62 ? "Necesită verificare." : undefined),
    alternatives: ranked.slice(1, 5),
  };
}

export function cleanPartyName(value: string) {
  let cleaned = value
    .replace(
      /^\s*(?:seller|supplier|vendor|furnizor|v[aâ]nz[aă]tor|emitent|from|buyer|bill[\s_-]*to|sold[\s_-]*to|customer|client|cump[aă]r[aă]tor|beneficiar)\s*[:#-]?\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  const stopMatch = cleaned.match(PARTY_STOP_PATTERN);
  if (stopMatch?.index && stopMatch.index > 1) {
    cleaned = cleaned.slice(0, stopMatch.index).trim();
  }
  return cleaned.replace(/^[|:;,\-\s]+|[|:;,\-\s]+$/g, "").slice(0, 100);
}

export function isInvalidPartyCandidate(value: string) {
  const cleaned = cleanPartyName(value);
  const normalized = normalizeText(cleaned);
  if (cleaned.length < 3 || cleaned.length > 100 || !/[A-Za-zÀ-ž]/.test(cleaned)) return true;
  if (/^(?:commercial\s+invoice|tax\s+invoice|invoice)$/i.test(normalized)) return true;
  if (/https?:\/\/|www\.|\S+@\S+\.\S+/.test(cleaned)) return true;
  if (/^\s*(?:address|tel|phone|email|site|website)\s*:/i.test(cleaned)) return true;
  if (
    /^\s*(?:invoice\s+)?date\s*:/i.test(cleaned) ||
    /\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})\b/i.test(
      cleaned,
    )
  )
    return true;
  if (/\b\d{5,}\b/.test(cleaned)) return true;
  if (
    PARTY_INVALID_TERMS.some((term) => normalized === term || normalized.startsWith(`${term}:`))
  ) {
    return true;
  }
  const visible = cleaned.replace(/\s/g, "");
  const alphaNumeric = visible.replace(/[^\p{L}\p{N}]/gu, "").length;
  return visible.length === 0 || alphaNumeric / visible.length < 0.62;
}

export function normalizeInvoiceNumber(value: string, comparisonOnly = true) {
  const cleaned = value.replace(/^[#:\s]+|[.,;:\s]+$/g, "").slice(0, 50);
  return comparisonOnly ? cleaned.toUpperCase().replace(/[^A-Z0-9]/g, "") : cleaned;
}

// Mirrors document-ai-backend/main.py's normalize_tax_identifier exactly --
// keep the two in sync. Without this TS-side equivalent, the hybrid merge's
// loose CUI validity check (any 6-24 char alnum string with a digit) let
// unnormalized, OCR-noisy candidates like "C.I.LF.R0O6724860" or
// "R027916027" win over the backend's already-clean "RO6724860" /
// "RO27916027", even though the backend was doing the right thing.
export function normalizeTaxIdentifier(value: string): string {
  if (!value) return "";

  const normalized = value.toUpperCase().trim();
  let compact = normalized.replace(/[^A-Z0-9]/g, "");
  compact = compact.replace(/^(?:CUI|CIF|CLF|CODFISCAL|CODTVA|VATID|VATCODE|TAXID)+/, "");

  let prefix = "";
  let tail = compact;
  if (compact.startsWith("RO")) {
    prefix = "RO";
    tail = compact.slice(2);
  } else if (compact.startsWith("R0O") || compact.startsWith("R00")) {
    prefix = "RO";
    tail = compact.slice(3);
  } else if (compact.startsWith("R0") && /^\d+$/.test(compact.slice(2))) {
    prefix = "RO";
    tail = compact.slice(2);
  }

  if (prefix) {
    tail = tail.replace(/O/g, "0");
  }

  if (!/^\d+$/.test(tail)) return "";
  if (tail.length < 5 || tail.length > 12) return "";

  return prefix + tail;
}

export function normalizeDate(value: string) {
  const cleaned = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = cleaned.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = normalizeYear(Number(match[3]));
    } else {
      const monthMatch = cleaned.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/i);
      if (!monthMatch) return "";
      const monthNames: Record<string, number> = {
        jan: 1,
        january: 1,
        ian: 1,
        ianuarie: 1,

        feb: 2,
        february: 2,
        februarie: 2,

        mar: 3,
        march: 3,
        martie: 3,

        apr: 4,
        april: 4,
        aprilie: 4,

        may: 5,
        mai: 5,

        jun: 6,
        june: 6,
        iun: 6,
        iunie: 6,

        jul: 7,
        july: 7,
        iul: 7,
        iulie: 7,

        aug: 8,
        august: 8,

        sep: 9,
        sept: 9,
        september: 9,
        septembrie: 9,

        oct: 10,
        october: 10,
        octombrie: 10,

        nov: 11,
        november: 11,
        noi: 11,
        noiembrie: 11,

        dec: 12,
        december: 12,
        decembrie: 12,
      };
      day = Number(monthMatch[1]);
      const monthToken = monthMatch[2].toLowerCase();
      month = monthNames[monthToken] ?? monthNames[monthToken.slice(0, 3)] ?? 0;
      year = normalizeYear(Number(monthMatch[3]));
    }
  }
  if (!isValidDate(year, month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeAmount(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let cleaned = value
    .toUpperCase()
    .replace(/\b(RON|LEI|LEU|EUR|USD|GBP)\b/g, "")
    .replace(/[$€£\s'’]/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!cleaned || /^-?[.,]?$/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const separatorIndex = Math.max(comma, dot);
  if (separatorIndex >= 0) {
    const decimals = cleaned.slice(separatorIndex + 1);
    const integer = cleaned.slice(0, separatorIndex).replace(/[.,]/g, "");
    cleaned = decimals.length <= 2 ? `${integer}.${decimals}` : `${integer}${decimals}`;
  }
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "$" || normalized === "USD") return "USD";
  if (normalized === "§") return "USD";
  if (normalized === "€" || normalized === "EUR") return "EUR";
  if (normalized === "£" || normalized === "GBP") return "GBP";
  if (["RON", "LEI", "LEU"].includes(normalized)) return "RON";
  return normalized;
}

export function validateExtractedInvoiceFields(
  fields: Record<CandidateFieldKey, CandidateFieldResult>,
  context: CandidateContext,
): CandidateExtractionResult {
  const warnings: string[] = [];
  let consistencyScore = 0.7;
  const subtotal = asNumber(fields.subtotal.normalizedValue);
  const tax = asNumber(fields.vatAmount.normalizedValue);
  const total = asNumber(fields.totalAmount.normalizedValue);

  if (subtotal !== null && tax !== null && total !== null) {
    const tolerance = Math.max(0.02, Math.abs(total) * 0.015);
    const consistent = Math.abs(subtotal + tax - total) <= tolerance;
    consistencyScore = consistent ? 1 : 0.35;
    if (consistent) {
      for (const field of ["subtotal", "vatAmount", "totalAmount"] as const) {
        fields[field].confidence = clamp(fields[field].confidence + 0.05, 0, 0.98);
      }
    } else {
      warnings.push("Subtotalul, taxele și totalul necesită verificare.");
      for (const field of ["subtotal", "vatAmount", "totalAmount"] as const) {
        fields[field].confidence = clamp(fields[field].confidence - 0.14, 0, 0.98);
        fields[field].warning = "Valoarea nu este consistentă cu totalurile documentului.";
      }
    }
  }

  for (const field of ["supplierName", "customerName"] as const) {
    if (typeof fields[field].value === "string" && isInvalidPartyCandidate(fields[field].value)) {
      fields[field] = emptyResult("Numele identificat nu este semantic valid.");
      warnings.push(`${field === "supplierName" ? "Furnizorul" : "Clientul"} necesită verificare.`);
    }
  }
  if (!fields.currency.value)
    warnings.push("Moneda nu a fost identificată cu suficientă certitudine.");
  if (!fields.invoiceNumber.value) warnings.push("Numărul facturii lipsește.");

  return { fields, consistencyScore, warnings: Array.from(new Set(warnings)) };
}

export function calculateDocumentConfidence({
  fields,
  ocrConfidence,
  consistencyScore,
}: {
  fields: Record<CandidateFieldKey, Pick<CandidateFieldResult, "value" | "confidence" | "warning">>;
  ocrConfidence: number;
  consistencyScore: number;
}) {
  const weights: Record<CandidateFieldKey, number> = {
    invoiceNumber: 0.13,
    invoiceDate: 0.1,
    supplierName: 0.13,
    supplierCui: 0.06,
    customerName: 0.11,
    customerCui: 0.04,
    subtotal: 0.1,
    vatAmount: 0.08,
    totalAmount: 0.13,
    currency: 0.07,
  };
  let score = 0;
  let missingPenalty = 0;
  let suspiciousPenalty = 0;
  FIELD_KEYS.forEach((field) => {
    const detail = fields[field];
    const weight = weights[field];
    if (detail.value === null || detail.value === "") missingPenalty += weight * 0.55;
    else score += detail.confidence * weight;
    if (detail.warning && detail.value !== null && detail.value !== "")
      suspiciousPenalty += weight * 0.18;
  });
  score += clamp(ocrConfidence, 0, 1) * 0.03;
  score += clamp(consistencyScore, 0, 1) * 0.02;
  return Math.round(clamp(score - missingPenalty - suspiciousPenalty, 0, 0.99) * 100);
}

function createContext(text: string, lines: CandidateLine[] | undefined, ocrConfidence: number) {
  const normalizedLines = (
    lines?.length ? lines : text.split(/\r?\n/).map((line) => ({ text: line }))
  )
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text);
  return { text, lines: normalizedLines, ocrConfidence: clamp(ocrConfidence, 0, 1) };
}

function addLabeledPartyCandidates(
  candidates: FieldCandidate[],
  context: CandidateContext,
  field: "supplierName" | "customerName",
  labelPattern: RegExp,
) {
  context.lines.forEach((line, index) => {
    if (!labelPattern.test(line.text)) return;
    const inline = cleanPartyName(line.text);
    const options = [
      { value: inline, source: line.text, lineIndex: index, inline: true },
      ...context.lines.slice(index + 1, index + 4).map((next, offset) => ({
        value: cleanPartyName(next.text),
        source: next.text,
        lineIndex: index + offset + 1,
        inline: false,
      })),
    ];
    options.forEach((option) => {
      if (isInvalidPartyCandidate(option.value)) return;
      addCandidate(candidates, {
        field,
        value: option.value,
        normalizedValue: normalizePartyName(option.value),
        sourceText: option.source,
        lineIndex: option.lineIndex,
        score: 0.82 + (option.inline ? 0.1 : 0.03) + (isCompanyLike(option.value) ? 0.04 : 0),
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Nume în bloc etichetat explicit"],
      });
    });
  });
}

function extractTaxIdentifierCandidates(
  context: CandidateContext,
  field: "supplierCui" | "customerCui",
) {
  const found: FieldCandidate[] = [];
  context.lines.forEach((line, index) => {
    // Value charset tolerates embedded spaces/dots/dashes (not just a
    // leading "RO ") so OCR word-splitting mid tax-ID (e.g. "24041 105"
    // from two separate OCR boxes) isn't truncated at the space before
    // normalizeTaxIdentifier gets a chance to compact it back together.
    //
    // CUI/CIF/CLF each get \.? between every letter because real scanned
    // Romanian invoices routinely OCR the abbreviation with a period after
    // each letter ("C.I.F.", "C.U.I.", "C.LF." when I is misread as L) --
    // without this, the label never matches at all and extraction silently
    // falls back to whatever (often RO-prefix-less) proposal the model
    // produced instead. Confirmed against real OCR output, not a guess:
    // e.g. "C.LF.: RO 14600820" was previously invisible to this regex.
    for (const match of line.text.matchAll(
      /\b(?:GSTIN|C\.?\s*U\.?\s*I\.?|C\.?\s*I\.?\s*F\.?|C\.?\s*L\.?\s*F\.?|COD\s+FISCAL|COD\s+TVA|VAT\s*(?:ID|CODE|NO\.?|NUMBER)|TAX\s*(?:ID|NO\.?|NUMBER))\s*[:#;.-]?\s*([A-Z0-9][A-Z0-9 .:/_-]{4,30})/gi,
    )) {
      const value = normalizeTaxIdentifier(match[1]);
      if (!value) continue;
      addCandidate(found, {
        field,
        value,
        normalizedValue: value.replace(/^RO(?=\d)/, ""),
        sourceText: line.text,
        lineIndex: index,
        score:
          0.78 + (field === "supplierCui" ? topRegionBonus(index, context.lines.length, 0.08) : 0),
        method: line.bbox ? "Layout heuristic" : "Regex",
      });
    }
  });
  const ranked = rankCandidates(found, context);
  if (field === "customerCui" && ranked.length > 1) return ranked.slice(1);
  return field === "customerCui" ? [] : ranked;
}

function improveAmountConsistency(
  fields: Record<CandidateFieldKey, CandidateFieldResult>,
  candidates: Record<CandidateFieldKey, FieldCandidate[]>,
  context: CandidateContext,
) {
  const subtotals = candidates.subtotal.slice(0, 5);
  const taxes = candidates.vatAmount.slice(0, 5);
  const totals = candidates.totalAmount.slice(0, 5);
  let best:
    | { subtotal: FieldCandidate; tax: FieldCandidate; total: FieldCandidate; score: number }
    | undefined;
  for (const subtotal of subtotals) {
    for (const tax of taxes) {
      for (const total of totals) {
        const expected = Number(subtotal.normalizedValue) + Number(tax.normalizedValue);
        const actual = Number(total.normalizedValue);
        const tolerance = Math.max(0.02, Math.abs(actual) * 0.015);
        if (Math.abs(expected - actual) > tolerance) continue;
        const score = subtotal.score + tax.score + total.score + 0.38;
        if (!best || score > best.score) best = { subtotal, tax, total, score };
      }
    }
  }
  if (!best) return;
  fields.subtotal = resultFromCandidate(best.subtotal, candidates.subtotal, context);
  fields.vatAmount = resultFromCandidate(best.tax, candidates.vatAmount, context);
  fields.totalAmount = resultFromCandidate(best.total, candidates.totalAmount, context);
}

function repairLostAmountSeparators(fields: Record<CandidateFieldKey, CandidateFieldResult>) {
  const subtotal = asNumber(fields.subtotal.normalizedValue);
  if (subtotal === null || subtotal <= 0) return;

  for (const field of ["totalAmount", "subtotal", "vatAmount"] as const) {
    const result = fields[field];
    const value = asNumber(result.normalizedValue);
    if (value === null || !Number.isInteger(value) || value < 100_000) continue;
    const repaired = [Math.round((value / 100) * 100) / 100, Math.trunc(value / 10) / 100]
      .filter((candidate) => candidate >= subtotal * 0.72 && candidate <= subtotal * 1.55)
      .sort((left, right) => Math.abs(left - subtotal) - Math.abs(right - subtotal))[0];
    if (repaired === undefined) continue;
    result.value = repaired;
    result.normalizedValue = repaired;
    result.confidence = clamp(result.confidence - 0.06, 0, 0.98);
    result.method = "Layout heuristic";
    result.warning = "Separatorul zecimal a fost reconstruit din contextul totalurilor.";
  }
}

function resultFromCandidate(
  candidate: FieldCandidate,
  alternatives: FieldCandidate[],
  context: CandidateContext,
): CandidateFieldResult {
  return {
    value: candidate.value,
    normalizedValue: candidate.normalizedValue,
    confidence: clamp(scoreCandidate(candidate, context) + 0.04, 0, 0.98),
    method: candidate.method,
    sourceText: candidate.sourceText,
    alternatives: alternatives.filter((item) => item !== candidate).slice(0, 4),
  };
}

function extractMonetaryTokens(text: string) {
  return Array.from(text.matchAll(AMOUNT_PATTERN))
    .filter((match) => {
      const raw = match[0];
      const tail = text.slice((match.index ?? 0) + raw.length, (match.index ?? 0) + raw.length + 2);
      if (tail.includes("%")) return false;
      if (/^\d{4}$/.test(raw.trim())) return false;
      if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(raw)) return false;
      return true;
    })
    .map((match) => normalizeAmount(match[0]))
    .filter((value): value is number => value !== null && Math.abs(value) < 1_000_000_000);
}

function addCandidate(candidates: FieldCandidate[], candidate: Omit<FieldCandidate, "confidence">) {
  if (candidate.value === "" || candidate.normalizedValue === "") return;
  const key = `${candidate.field}:${String(candidate.normalizedValue)}`;
  const existing = candidates.find(
    (item) => `${item.field}:${String(item.normalizedValue)}` === key,
  );
  const complete: FieldCandidate = { ...candidate, confidence: 0 };
  if (!existing) candidates.push(complete);
  else if (candidate.score > existing.score) Object.assign(existing, complete);
}

function rankCandidates(candidates: FieldCandidate[], context: CandidateContext) {
  return candidates
    .map((candidate) => ({ ...candidate, confidence: scoreCandidate(candidate, context) }))
    .sort((left, right) => right.confidence - left.confidence);
}

function isCandidateSemanticallyValid(field: CandidateFieldKey, candidate: FieldCandidate) {
  if (field === "supplierName" || field === "customerName") {
    return !isInvalidPartyCandidate(String(candidate.value));
  }
  if (field === "invoiceNumber") {
    const value = String(candidate.value);
    return /\d/.test(value) && !/^(?:invoice|commercial invoice|tax invoice)$/i.test(value);
  }
  if (["subtotal", "vatAmount", "totalAmount"].includes(field)) {
    return (
      typeof candidate.normalizedValue === "number" && Number.isFinite(candidate.normalizedValue)
    );
  }
  return true;
}

function isCompanyLike(value: string) {
  return /\b(?:inc\.?|llc|ltd\.?|limited|corp\.?|corporation|company|co\.?|sons|group|srl|s\.r\.l\.?|sa|s\.a\.?|gmbh|plc)\b/i.test(
    value,
  );
}

function normalizePartyName(value: string) {
  return normalizeText(cleanPartyName(value)).replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function topRegionBonus(index: number, count: number, maximum: number) {
  if (count <= 1) return maximum;
  return Math.max(0, 1 - index / Math.max(count * 0.35, 1)) * maximum;
}

function lowerRegionBonus(index: number, count: number, maximum: number) {
  if (count <= 1) return 0;
  return Math.max(0, index / (count - 1)) * maximum;
}

function lineConfidenceBonus(line: CandidateLine) {
  return typeof line.confidence === "number" ? clamp(line.confidence - 0.55, 0, 0.08) : 0;
}

function normalizeYear(year: number) {
  return year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
}

function isValidDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function asNumber(value: string | number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyResult(warning: string): CandidateFieldResult {
  return {
    value: null,
    normalizedValue: null,
    confidence: 0,
    method: "Regex",
    warning,
    alternatives: [],
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
