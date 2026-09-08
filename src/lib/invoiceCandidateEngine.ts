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
  words?: Array<{
    text: string;
    confidence?: number;
    bbox?: { x: number; y: number; width: number; height: number };
  }>;
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

type MonetaryToken = {
  raw: string;
  value: number;
  index: number;
  endIndex: number;
  hasCurrency: boolean;
  hasDecimal: boolean;
  hasThousandsSeparator: boolean;
};

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

// A candidate line that mentions one of these almost certainly isn't
// stating the invoice number, even if a number-shaped token also appears
// on it -- guards the broad/unlabeled patterns below (the tightly-labeled
// ones don't need this, their label is already strong enough evidence).
// The legea/art./alin./omfp/hg/ordin group specifically guards against
// Romanian legal citations like "conform art. 319 alin. 29 din legea
// 227/2015" (a real, extremely common invoice-footer reference to the
// Fiscal Code) -- "227/2015" matches the bare NNN/YYYY shape below by pure
// coincidence, confirmed against real OCR output where it repeated
// identically across many unrelated documents.
const NON_INVOICE_NUMBER_CONTEXT_PATTERN =
  /\b(?:data|date|due|scaden[tț][aă]?|total|subtotal|tva|vat|amount|sum[aă]|comand[aă]|comenzii|contract|aviz|referin[tţ][aă]|order\s*(?:no\.?|number|#)?|po\s*number|purchase\s*order|tracking|awb|iban|cont(?:ul)?\s*bancar|telefon|tel\.?|fax|mobil|lege[aă]?|art\.?|alin\.?|omfp|ordin|h\.?g\.?)\b/i;

// OCR sometimes inserts a stray space mid-number (e.g. "MBSL.202 1232280"
// is really "MBSL.2021232280") -- if the label match is immediately
// followed by whitespace then more bare digits with nothing else between,
// treat it as one continuous value rather than truncating at the space.
function extendAcrossOcrSpace(line: string, matchEnd: number, captured: string): string {
  const tail = line.slice(matchEnd);
  const continuation = tail.match(/^\s+(\d{3,10})\b/);
  return continuation ? captured + continuation[1] : captured;
}

// "Serie <CODE> Nr <digits>" (e.g. "SerieMH Nr 2639744") -- code sits
// between "Serie"/"Seria" and "Nr". The code itself may contain digits and
// a dash (e.g. "TM1-MLS"), not just bare letters -- confirmed against real
// OCR where a letters-only charset let the code fall through unmatched
// entirely, leaving only the (wrong, layout-side) fallback to win.
const SERIE_CODE_THEN_NR_PATTERN =
  /seri[ae]\W{0,3}([A-Z][A-Z0-9-]{1,9})[\W_]{0,6}nr\W{0,3}\.?\s*(\d{2,9})\b/i;
// "Serie/Nr. <CODE> <digits>" (e.g. "Serie /Nr. DUM.TM 3655") -- a
// different, equally common shape where the code follows "Nr." instead,
// sometimes containing one internal dot (company-specific series prefixes
// like "DUM.TM" are common, but this pattern isn't tied to any specific
// company -- it matches the general "code, then digits" structure).
const SERIE_NR_THEN_CODE_PATTERN =
  /seri[ae]\W{0,4}nr\W{0,3}\.?\s*([A-Z]{2,4}\.?[A-Z]{0,4})\s+(\d{2,9})\b/i;

function matchSeriePlusNr(text: string): { value: string } | null {
  const codeThenNr = text.match(SERIE_CODE_THEN_NR_PATTERN);
  if (codeThenNr) return { value: `${codeThenNr[1].toUpperCase()}${codeThenNr[2]}` };
  const nrThenCode = text.match(SERIE_NR_THEN_CODE_PATTERN);
  if (nrThenCode) return { value: `${nrThenCode[1].toUpperCase()}${nrThenCode[2]}` };
  return null;
}

export function extractInvoiceNumberCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];

  // factur\w{0,3} (not factur[aă]) tolerates "facturii" (double-i,
  // extremely common in real OCR: "Numărul facturii"), "facturi", "factură".
  const labeledPattern =
    /(?:invoice\s*(?:number|no\.?|#|id)|nr\.?\s*factur\w{0,3}|num[aă]r(?:ul)?\s+factur\w{0,3}|factur\w{0,3}\s*(?:nr\.?|num[aă]r(?:ul)?)?|seria\s+(?:si|și|şi)\s+num[aă]rul\s+factur\w{0,3})\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{1,40})/i;

  context.lines.forEach((line, index) => {
    const match = line.text.match(labeledPattern);
    if (match?.[1] && typeof match.index === "number") {
      const value = extendAcrossOcrSpace(line.text, match.index + match[0].length, match[1]);
      if (!looksLikeNonInvoiceIdentifier(value)) {
        addCandidate(candidates, {
          field: "invoiceNumber",
          value: normalizeInvoiceNumber(value, false),
          normalizedValue: normalizeInvoiceNumber(value),
          sourceText: line.text,
          lineIndex: index,
          score:
            0.9 + lineConfidenceBonus(line) + topRegionBonus(index, context.lines.length, 0.06),
          method: line.bbox ? "Layout heuristic" : "Regex",
          reasons: ["Etichetă explicită pentru numărul facturii"],
        });
      }
    }

    // OCR/layout often separates an explicit invoice-number label from its
    // value into the next table cell or line. Only use this fallback when the
    // current line clearly contains an invoice-number label but no inline
    // value was extracted above.
    const invoiceNumberLabelOnly =
      /(?:invoice\s*(?:number|no\.?|#|id)|nr\.?\s*factur\w{0,3}|num[aă]r(?:ul)?\s+factur\w{0,3}|seria\s+(?:si|și|şi)\s+num[aă]rul\s+factur\w{0,3})/i.test(
        line.text,
      );

    if (!match?.[1] && invoiceNumberLabelOnly) {
      for (let offset = 1; offset <= 3 && index + offset < context.lines.length; offset += 1) {
        const nextLine = context.lines[index + offset];
        const trimmed = nextLine.text.trim();

        // Stop if we reached another clearly-labelled field rather than the
        // value belonging to this invoice-number label.
        if (
          /\b(?:data|date|scaden|due|cui|cif|vat|tva|iban|subtotal|total|client|customer|buyer|furnizor|supplier|seller)\b/i.test(
            trimmed,
          )
        ) {
          break;
        }

        const adjacent = trimmed.match(/^([A-Z0-9][A-Z0-9./_-]{2,40})$/i);
        if (!adjacent?.[1]) continue;

        const value = adjacent[1];
        if (looksLikeNonInvoiceIdentifier(value)) continue;

        addCandidate(candidates, {
          field: "invoiceNumber",
          value: normalizeInvoiceNumber(value, false),
          normalizedValue: normalizeInvoiceNumber(value),
          sourceText: `${line.text} ${nextLine.text}`,
          lineIndex: index,
          score:
            0.86 -
            offset * 0.04 +
            lineConfidenceBonus(nextLine) +
            topRegionBonus(index, context.lines.length, 0.08),
          method: nextLine.bbox ? "Layout heuristic" : "Regex",
          reasons: ["Valoare pe linie adiacentă unei etichete explicite de număr factură"],
        });

        break;
      }
    }

    // Table-style invoice headers are common on Romanian invoices:
    //   "Serie | Numar | Tip | Data emitere | ..."
    // followed by a data row such as:
    //   "MS EON 10820828951 estimare 31.01.2021 ..."
    //
    // This is structural rather than company-specific: capture one to three
    // alphabetic series fragments followed by a substantial numeric invoice
    // number, then concatenate the series fragments as OCR often separates
    // them into distinct cells/tokens.
    const serieNumberTableHeader = /\bseri\w{0,2}\b.*\bnum\w{0,5}\b/i.test(line.text);

    if (serieNumberTableHeader) {
      for (let offset = 1; offset <= 3 && index + offset < context.lines.length; offset += 1) {
        const dataLine = context.lines[index + offset];

        const tableValue = dataLine.text.match(/(?:^|\s)((?:[A-Z]{1,8}\s+){1,2})(\d{5,20})\b/i);

        if (!tableValue?.[1] || !tableValue?.[2]) continue;

        const series = tableValue[1].replace(/\s+/g, "").toUpperCase();
        const value = `${series}${tableValue[2]}`;

        if (looksLikeNonInvoiceIdentifier(value)) continue;

        addCandidate(candidates, {
          field: "invoiceNumber",
          value: normalizeInvoiceNumber(value, false),
          normalizedValue: normalizeInvoiceNumber(value),
          sourceText: `${line.text} ${dataLine.text}`,
          lineIndex: index,
          score:
            0.94 -
            offset * 0.03 +
            lineConfidenceBonus(dataLine) +
            topRegionBonus(index, context.lines.length, 0.08),
          method: dataLine.bbox ? "Layout heuristic" : "Regex",
          reasons: ["Rând de date sub antetul Serie + Număr"],
        });

        break;
      }
    }

    let serieMatch = matchSeriePlusNr(line.text);
    let serieSourceText = line.text;
    let serieAdjacentLineUsed = false;
    // OCR frequently splits "Serie <CODE>" and "Nr. <digits>" across two
    // separate lines/table cells (confirmed against real OCR: "Serie MH"
    // on one line, "Nr.2639747" on the next). Retry the same two shapes
    // against the current line joined with up to 2 following lines before
    // giving up.
    if (!serieMatch) {
      for (let offset = 1; offset <= 2 && index + offset < context.lines.length; offset += 1) {
        const joined = `${line.text} ${context.lines[index + offset].text}`;
        serieMatch = matchSeriePlusNr(joined);
        if (serieMatch) {
          serieSourceText = joined;
          serieAdjacentLineUsed = true;
          break;
        }
      }
    }
    if (serieMatch) {
      addCandidate(candidates, {
        field: "invoiceNumber",
        value: serieMatch.value,
        normalizedValue: normalizeInvoiceNumber(serieMatch.value),
        sourceText: serieSourceText,
        lineIndex: index,
        score:
          0.88 -
          (serieAdjacentLineUsed ? 0.08 : 0) +
          lineConfidenceBonus(line) +
          topRegionBonus(index, context.lines.length, 0.06),
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: ["Format Serie + Numar de factură"],
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

    if (!NON_INVOICE_NUMBER_CONTEXT_PATTERN.test(line.text)) {
      for (const standalone of line.text.matchAll(
        /\b(INV(?=[A-Z0-9./_-]*\d)[A-Z0-9./_-]{3,40})\b/gi,
      )) {
        if (looksLikeNonInvoiceIdentifier(standalone[1])) continue;
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

function extractTotalAmountCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];

  context.lines.forEach((line, index) => {
    const normalizedLine = normalizeText(line.text);
    const labelStrength = totalLabelStrength(normalizedLine);
    const tokens = extractMonetaryTokenDetails(line.text);

    if (!labelStrength && !shouldConsiderArithmeticTotalLine(context, index, tokens)) return;
    if (isHardNonTotalAmountLine(normalizedLine)) return;

    if (labelStrength) {
      addTotalTokenCandidates(candidates, context, {
        line,
        lineIndex: index,
        tokens,
        labelStrength,
        relation: "same-line",
        anchorLineIndex: index,
      });

      if (labelStrength !== "weak" || tokens.length === 0) {
        addAdjacentTotalCandidates(candidates, context, index, labelStrength);
      }
      addStackedArithmeticTotalCandidates(candidates, context, index, labelStrength);
    }

    addArithmeticTotalCandidates(candidates, context, line, index, tokens, labelStrength);
  });

  return rankCandidates(candidates, context);
}

function addAdjacentTotalCandidates(
  candidates: FieldCandidate[],
  context: CandidateContext,
  labelLineIndex: number,
  labelStrength: "strong" | "current" | "weak",
) {
  const labelLine = normalizeText(context.lines[labelLineIndex]?.text ?? "");
  const barcodeLabel = /\bcod\s+de\s+bare\b/i.test(labelLine);
  const before = barcodeLabel ? 1 : labelStrength === "weak" ? 1 : 8;
  const after = barcodeLabel ? 2 : labelStrength === "weak" ? 3 : 14;

  for (let offset = -before; offset <= after; offset += 1) {
    if (offset === 0) continue;
    const lineIndex = labelLineIndex + offset;
    const line = context.lines[lineIndex];
    if (!line) continue;

    const normalizedLine = normalizeText(line.text);
    if (!isPotentialAdjacentTotalValueLine(normalizedLine)) continue;
    const tokens = extractMonetaryTokenDetails(line.text);
    if (tokens.length === 0) continue;

    addTotalTokenCandidates(candidates, context, {
      line,
      lineIndex,
      tokens,
      labelStrength,
      relation: "adjacent",
      anchorLineIndex: labelLineIndex,
    });
  }
}

function addStackedArithmeticTotalCandidates(
  candidates: FieldCandidate[],
  context: CandidateContext,
  labelLineIndex: number,
  labelStrength: "strong" | "current" | "weak",
) {
  const start = Math.max(0, labelLineIndex - 8);
  const end = Math.min(context.lines.length - 1, labelLineIndex + 14);
  const stack: Array<{ line: CandidateLine; lineIndex: number; token: MonetaryToken }> = [];

  for (let cursor = start; cursor <= end; cursor += 1) {
    const line = context.lines[cursor];
    if (!line) continue;
    const normalizedLine = normalizeText(line.text);
    if (
      TOTAL_NON_MONETARY_CONTEXT_PATTERN.test(normalizedLine) ||
      TOTAL_BALANCE_CONTEXT_PATTERN.test(normalizedLine) ||
      TOTAL_LINE_ITEM_CONTEXT_PATTERN.test(normalizedLine)
    ) {
      continue;
    }
    const arithmeticInputLine = TOTAL_TAX_OR_NET_CONTEXT_PATTERN.test(normalizedLine);
    if (
      !arithmeticInputLine &&
      !isPotentialAdjacentTotalValueLine(normalizedLine) &&
      cursor !== labelLineIndex
    ) {
      continue;
    }

    extractMonetaryTokenDetails(line.text).forEach((token) => {
      if (!isUsableTotalAmountToken(token, line.text)) return;
      if (
        SECONDARY_CURRENCY_CONTEXT_PATTERN.test(line.text) &&
        hasNearbyDomesticCurrency(context, cursor)
      ) {
        return;
      }
      if (!token.hasDecimal && !token.hasCurrency && token.value !== 0) return;
      stack.push({ line, lineIndex: cursor, token });
    });
  }

  const pair = findVatLikeAmountPair(stack.map((item) => item.token));
  if (!pair) return;
  if (pair.tax === 0) return;

  const observed = stack.some((item) => Math.abs(Math.abs(item.token.value) - pair.total) <= 0.01);
  const canUseSynthesizedStack =
    hasNearbyStrongTotalLabel(context, labelLineIndex) &&
    stack.length >= 2 &&
    stack.length <= 4 &&
    stack.every(({ line, lineIndex }) => {
      const normalizedLine = normalizeText(line.text);
      return (
        lineIndex === labelLineIndex ||
        isCompactAmountLine(normalizedLine) ||
        TOTAL_TAX_OR_NET_CONTEXT_PATTERN.test(normalizedLine)
      );
    });
  if (!observed && !canUseSynthesizedStack) return;
  const source = stack
    .filter((item) =>
      [pair.net, pair.tax, pair.total].some(
        (value) => Math.abs(Math.abs(item.token.value) - value) <= 0.01,
      ),
    )
    .map((item) => item.line.text)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .join(" | ");

  let score =
    0.72 + lowerRegionBonus(labelLineIndex, context.lines.length, 0.08) + (observed ? 0.08 : 0);
  if (labelStrength === "current") score += 0.14;
  else if (labelStrength === "strong") score += 0.12;
  else score += 0.08;
  if (!observed && canUseSynthesizedStack) score += 0.12;
  if (hasNearbyTaxTableContext(context, labelLineIndex)) score += 0.04;

  addCandidate(candidates, {
    field: "totalAmount",
    value: pair.total,
    normalizedValue: pair.total,
    sourceText: source || context.lines[labelLineIndex]?.text || "",
    lineIndex: labelLineIndex,
    score,
    method: context.lines[labelLineIndex]?.bbox ? "Layout heuristic" : "Regex",
    reasons: ["Total reconstruit din stivă OCR net + TVA"],
  });
}

function addTotalTokenCandidates(
  candidates: FieldCandidate[],
  context: CandidateContext,
  {
    line,
    lineIndex,
    tokens,
    labelStrength,
    relation,
    anchorLineIndex,
  }: {
    line: CandidateLine;
    lineIndex: number;
    tokens: MonetaryToken[];
    labelStrength: "strong" | "current" | "weak";
    relation: "same-line" | "adjacent";
    anchorLineIndex: number;
  },
) {
  const normalizedLine = normalizeText(line.text);
  const label = findTotalLabelPosition(line.text);
  const localMaximum = Math.max(...tokens.map((token) => Math.abs(token.value)), 0);

  tokens.forEach((token, tokenIndex) => {
    if (!isUsableTotalAmountToken(token, line.text)) return;
    if (
      SECONDARY_CURRENCY_CONTEXT_PATTERN.test(line.text) &&
      hasNearbyDomesticCurrency(context, lineIndex)
    ) {
      return;
    }
    let score =
      0.4 + lowerRegionBonus(lineIndex, context.lines.length, 0.1) + lineConfidenceBonus(line);

    if (labelStrength === "current") score += 0.3;
    else if (labelStrength === "strong") score += 0.24;
    else score += 0.06;

    if (relation === "same-line") {
      if (label && token.index >= label.endIndex) score += 0.08;
      if (label && token.endIndex <= label.index) score -= 0.18;
      if (tokens.length > 1 && labelStrength === "weak") score -= 0.08;
    } else {
      const distance = Math.abs(lineIndex - anchorLineIndex);
      score += 0.14 - Math.min(distance, 10) * 0.02;
      if (lineIndex > anchorLineIndex) score += 0.06;
      if (isCompactAmountLine(line.text)) score += 0.08;
      if (tokens.length > 1 && Math.abs(token.value) === localMaximum) score += 0.06;
      const nearbyLargerAmount = hasNearbyLargerTotalAmount(context, anchorLineIndex, token.value);
      if (nearbyLargerAmount) score -= 0.28;
      else score += 0.03;

      // Real geometric distance as a supplementary signal, when available.
      // Line-index distance (above) is a text-order proxy that can mislead
      // in dense table regions (many rows packed close together) or sparse
      // ones (few rows spanning a lot of vertical space) -- actual pixel
      // distance corrects for that. Small, bounded weight (+/-0.05) so
      // this only matters for otherwise-close calls between the existing,
      // already-tuned signals, never overrides them outright.
      const anchorBbox = context.lines[anchorLineIndex]?.bbox;
      const candidateBbox = line.bbox;
      if (anchorBbox && candidateBbox) {
        const yDelta = Math.abs(candidateBbox.y - anchorBbox.y);
        const referenceHeight = Math.max(anchorBbox.height, candidateBbox.height, 1);
        const rows = yDelta / referenceHeight;
        score += Math.max(-0.05, 0.05 - Math.min(rows, 10) * 0.01);
      }
    }

    if (TOTAL_CURRENT_INVOICE_PATTERN.test(normalizedLine)) score += 0.12;
    if (token.hasCurrency) score += 0.06;
    if (token.hasDecimal) score += 0.04;
    else score -= 0.05;
    if (token.value === 0) score -= 0.16;
    if (isSuspiciousBareGroupedAmount(token)) score -= 0.48;
    if (
      SECONDARY_CURRENCY_CONTEXT_PATTERN.test(line.text) &&
      hasNearbyDomesticCurrency(context, lineIndex)
    ) {
      score -= 0.36;
    }
    if (TOTAL_BALANCE_CONTEXT_PATTERN.test(normalizedLine)) score -= 0.26;
    if (TOTAL_TAX_OR_NET_CONTEXT_PATTERN.test(normalizedLine)) score -= 0.32;
    if (
      TOTAL_LINE_ITEM_CONTEXT_PATTERN.test(normalizedLine) &&
      !TOTAL_WEAK_LABEL_PATTERN.test(normalizedLine)
    ) {
      score -= 0.2;
    }

    const taxPair = findVatLikeAmountPair(tokens);
    if (taxPair) {
      const absoluteValue = Math.abs(token.value);
      const componentPenaltyMultiplier =
        labelStrength === "weak" ? 1 : relation === "adjacent" ? 0.86 : 0.68;
      if (Math.abs(absoluteValue - taxPair.tax) <= 0.01) {
        score -= 0.42 * componentPenaltyMultiplier;
      }
      if (Math.abs(absoluteValue - taxPair.net) <= 0.01) {
        score -= 0.32 * componentPenaltyMultiplier;
      }
      if (Math.abs(absoluteValue - taxPair.total) <= 0.01) score += 0.05;
    }

    addCandidate(candidates, {
      field: "totalAmount",
      value: roundAmount(token.value),
      normalizedValue: roundAmount(token.value),
      sourceText: line.text,
      lineIndex,
      score,
      method: line.bbox ? "Layout heuristic" : "Regex",
      reasons: [
        relation === "adjacent"
          ? "Valoare monetară pe o linie apropiată unui total explicit"
          : "Valoare monetară lângă eticheta de total",
      ],
    });
  });
}

function addArithmeticTotalCandidates(
  candidates: FieldCandidate[],
  context: CandidateContext,
  line: CandidateLine,
  lineIndex: number,
  tokens: MonetaryToken[],
  labelStrength: "strong" | "current" | "weak" | null,
) {
  if (tokens.length < 2) return;
  const pair = findVatLikeAmountPair(tokens);
  if (!pair) return;

  const normalizedLine = normalizeText(line.text);
  const nearbyStrongLabel = hasNearbyStrongTotalLabel(context, lineIndex);
  const hasTotalLabel = Boolean(labelStrength);
  const hasTaxTableContext = hasNearbyTaxTableContext(context, lineIndex);
  if (!hasTotalLabel && TOTAL_LINE_ITEM_CONTEXT_PATTERN.test(normalizedLine)) return;
  if (!hasTotalLabel && !isCompactAmountLine(normalizedLine)) return;
  const canSynthesize = hasTotalLabel || nearbyStrongLabel;

  if (!canSynthesize) return;

  let score =
    0.68 + lowerRegionBonus(lineIndex, context.lines.length, 0.08) + lineConfidenceBonus(line);

  if (labelStrength === "current") score += 0.14;
  else if (labelStrength === "strong") score += 0.12;
  else if (labelStrength === "weak") score += 0.16;
  if (nearbyStrongLabel) score += 0.08;
  if (hasTaxTableContext) score += 0.04;
  if (!hasTotalLabel && hasRepeatedAmountToken(tokens)) score += 0.26;
  if (TOTAL_TAX_OR_NET_CONTEXT_PATTERN.test(normalizedLine)) score -= 0.08;
  if (TOTAL_LINE_ITEM_CONTEXT_PATTERN.test(normalizedLine) && !hasTotalLabel) score -= 0.12;

  addCandidate(candidates, {
    field: "totalAmount",
    value: pair.total,
    normalizedValue: pair.total,
    sourceText: line.text,
    lineIndex,
    score,
    method: line.bbox ? "Layout heuristic" : "Regex",
    reasons: ["Total reconstruit din valoare netă + TVA"],
  });
}

export function extractDateCandidates(context: CandidateContext) {
  const candidates: FieldCandidate[] = [];
  const allDates: Array<{ raw: string; line: CandidateLine; index: number }> = [];

  context.lines.forEach((line, index) => {
    // A line like "Cod de bare pentru sold total la data de 28.01.2021:
    // 220,78 Lei" carries an auxiliary payment-tracking/barcode date (and
    // amount), not the invoice's own date -- confirmed on a real document
    // where this exact line was the source of a wrong invoiceDate (the
    // same line is already excluded from totalAmount for the same reason).
    // Deliberately narrow: unlike totalAmount, dates routinely share a
    // line with their due-date counterpart ("Data: X Scadenta: Y"), so a
    // broader exclusion pattern would risk losing legitimate invoice dates
    // that happen to co-occur with a due-date label on the same line --
    // that disambiguation is already handled precisely, per-date, further
    // below via localContext instead.
    if (/\bcod\s+de\s+bare\b/i.test(line.text)) {
      return;
    }
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

// Lines mentioning one of these are essentially never stating the grand
// total, even when a total-ish label and a monetary-shaped number also
// appear on them -- a discount line, a unit price, a previous balance
// carried forward, an exchange rate, a reference/order number, a CUI, a
// bank account, a phone number. Guards totalAmount specifically (subtotal
// and vatAmount already have their own narrower exclusions).
const NON_TOTAL_CONTEXT_PATTERN =
  /\b(discount|reducere|pret\s*unitar|unit\s*price|cantitate|qty|quantity|achitat|incasat|plat[aă]\s+efectuat[aă]|paid\s+amount|sold\s+anterior|sold\s+precedent|previous\s+balance|old\s+balance|curs\s+valutar|curs\s+de\s+schimb|exchange\s+rate|termen\s+de\s+plat[aă]|modalitate(?:a)?\s+de\s+plat[aă]|comand[aă]|comenzii|contract|aviz|referin[tţ][aă]|cui|cif|cod\s+fiscal|iban|cont(?:ul)?\s*bancar|telefon|tel\.?|fax)\b/i;

const TOTAL_STRONG_LABEL_PATTERN =
  /\b(?:amount[\s_]*due|payable\s+amount|invoice\s+total|current\s+invoice\s+total|total\s+due|balance\s+due|grand\s+total|total\s+general|total\s+payment|total\s+plata|total\s+de\s+plata|tal\s+de\s+plata|de\s+plata|total\s+factur\w*\s+curen\w*)\b/i;
const TOTAL_CURRENT_INVOICE_PATTERN =
  /\b(?:total\s+factur\w*\s+curen\w*|factur\w*\s+curen\w*\s+(?:cu\s+)?tva|cod\s+de\s+bare\s+pentru\s+factur\w*\s+curen\w*|pentru\s+factur\w*\s+curen\w*)\b/i;
const TOTAL_WEAK_LABEL_PATTERN = /\btotal\b/i;
const TOTAL_BALANCE_CONTEXT_PATTERN =
  /\b(?:sold\s+total|soldul?\s+(?:in\s+)?valoare|sold\s+precedent|sold\s+anterior|facturi\s+neachitate|plati\s+in\s+avans|rest\s+plata|old\s+balance|previous\s+balance)\b/i;
const TOTAL_NON_MONETARY_CONTEXT_PATTERN =
  /\b(?:puncte|points|curs(?:ul)?\b|exchange\s+rate|rata\s+\d|unicredit\s*\+|termen\s+de\s+plata|modalitate(?:a)?\s+de\s+plata|plata\s+se\s+va\s+efectua|data\s+scadenta|scadenta|cod\s+client|cod\s+de\s+bare\s+pentru\s+sold|capital\s+social|operator\s+de\s+date|cui|cif|cod\s+fiscal|cod\s+tva|iban|cont(?:ul)?\s*bancar|banca|telefon|tel\.?|fax|buletinul|cartea\s+de\s+identitate|b\.?\s*i\.?\s*\/?\s*c\.?\s*i\.?|seria|serie\s+motor|serie|motor|vin|inmatriculare|referinta|recapitulatie|eliberat|spclep|art\.?|alin\.?|legea|codul\s+fiscal|contract\s+nr|nr\.?\s+contract)\b/i;
const TOTAL_TAX_OR_NET_CONTEXT_PATTERN =
  /\b(?:sub[\s_]*total|total\s+fara|fara\s+tva|tax\s+exclusive|net\s+amount|baza\s+(?:de\s+calcul\s+)?tva|baza\s+de\s+impozitare|total\s+tva|total\s+tax|vat\s+amount|tax\s+amount|valoare\s+tva|valoarea\s+tva|cota\s+tva|tva\s*\(?cota)\b/i;
const TOTAL_LINE_ITEM_CONTEXT_PATTERN =
  /\b(?:pret\s*unitar|unit\s*price|cantitate|qty|quantity|discount|reducere|achitat|incasat|platit|paid\s+amount|produse\s+si\s+servicii|denumirea\s+produselor|serviciu|servicii|produs|produse|description|consultanta|manopera|piese|buc|penalizari|taxa)\b/i;
const SECONDARY_CURRENCY_CONTEXT_PATTERN = /\b(?:HUF|BGN|PLN|CZK|CHF|TRY|UAH|SEK|NOK|DKK)\b/i;

export function extractAmountCandidates(
  context: CandidateContext,
  field: "subtotal" | "vatAmount" | "totalAmount",
) {
  if (field === "totalAmount") return extractTotalAmountCandidates(context);

  const candidates: FieldCandidate[] = [];
  const labels = {
    subtotal:
      /\b(sub[\s_]*total|net\s+amount|tax\s+exclusive|valoare\s+f[aă]r[aă]\s+tva|baza\s+f[aă]r[aă]\s+tva)\b/i,
    vatAmount: /\b(vat\s+amount|tax\s+amount|gst|vat|tva|tax)\b/i,
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
    let amounts = extractMonetaryTokens(line.text);
    let sourceLineIndex = index;
    let sourceLineText = line.text;
    let adjacentLineUsed = false;

    // OCR routinely splits a table's label cell and value cell into
    // separate lines/rows (e.g. "Total de plati (col. 5 +col. 6):" on one
    // line, "RON 1780.02" one or two lines below, sometimes with a blank
    // line in between). When the label's own line carries no amount at
    // all, look a couple of lines ahead before giving up -- but stop at
    // the first line that itself looks like a different field's label, so
    // this doesn't bleed into an adjacent subtotal/VAT row's value.
    if (amounts.length === 0) {
      const otherLabelFields = (Object.keys(labels) as Array<keyof typeof labels>).filter(
        (key) => key !== field,
      );
      for (let offset = 1; offset <= 2 && index + offset < context.lines.length; offset += 1) {
        const nextLine = context.lines[index + offset];
        if (
          labels[field].test(nextLine.text) ||
          otherLabelFields.some((key) => labels[key].test(nextLine.text))
        ) {
          break;
        }
        const nextAmounts = extractMonetaryTokens(nextLine.text);
        if (nextAmounts.length > 0) {
          amounts = nextAmounts;
          sourceLineIndex = index + offset;
          sourceLineText = nextLine.text;
          adjacentLineUsed = true;
          break;
        }
      }
    }

    amounts.forEach((amount, amountIndex) => {
      let score = 0.68 + lowerRegionBonus(index, context.lines.length, 0.1);
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
      if (adjacentLineUsed) score -= 0.08;

      addCandidate(candidates, {
        field,
        value: amount,
        normalizedValue: amount,
        sourceText: sourceLineText,
        lineIndex: sourceLineIndex,
        score,
        method: line.bbox ? "Layout heuristic" : "Regex",
        reasons: [
          adjacentLineUsed
            ? "Valoare monetară pe o linie apropiată etichetei (celulă separată)"
            : "Valoare monetară lângă eticheta câmpului",
        ],
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

// Strong negative signals: a candidate that actually matches one of these
// other identifier shapes is almost always a mis-extraction, not a real
// (if unusual) invoice number -- reject it regardless of which side
// (candidate engine or LayoutXLM) produced it. Used both at extraction
// time here and as a final defense in layoutAiHybridMerge.ts's
// chooseInvoiceNumber/invoiceNumberScore.
export function looksLikeNonInvoiceIdentifier(value: string): boolean {
  const normalized = normalizeInvoiceNumber(value);
  if (!normalized) return false;

  // Date, e.g. "26.11.2021" or "2021-11-26".
  if (normalizeDate(value)) return true;

  // CUI/CIF: "RO" + 5-10 digits and nothing else.
  if (/^RO\d{5,10}$/.test(normalized)) return true;

  // IBAN: 2 letters + 2 check digits + a long alphanumeric block (a
  // Romanian IBAN normalizes to 24 characters; allow a little slack).
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{16,30}$/.test(normalized)) return true;

  // Romanian phone number: 10 bare digits starting with 0, or +40-prefixed.
  if (/^0\d{9}$/.test(normalized) || /^40\d{9}$/.test(normalized)) return true;

  return false;
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

    // Romanian fiscal identifiers are numeric values and should not carry
    // padding zeroes after the RO prefix. OCR occasionally produces
    // RO06724860 for RO6724860.
    tail = tail.replace(/^0+(?=\d)/, "");
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

  const supplierContextPattern =
    /\b(?:supplier|seller|vendor|furnizor|emitent|prestator|societate|sediul\s+central|capital\s+social|nr\.?\s*reg\.?\s*com|registrul\s+comertului)\b/i;

  const customerContextPattern =
    /\b(?:customer|client|buyer|bill[\s_-]*to|cumparator|cumpărător|beneficiar|date\s+client|datele\s+clientului|destinatar)\b/i;

  const hardNoisePattern =
    /\b(?:iban|swift|bic|cont(?:ul)?|telefon|phone|fax|cod\s+bare|barcode|contract|comanda|order)\b/i;

  const addTaxCandidate = (
    rawValue: string,
    sourceText: string,
    lineIndex: number,
    baseScore: number,
    method: "Regex" | "Layout heuristic",
  ) => {
    const value = normalizeTaxIdentifier(rawValue);
    if (!value) return;

    const contextText = sourceText.toLowerCase();
    const supplierCue = supplierContextPattern.test(contextText);
    const customerCue = customerContextPattern.test(contextText);
    const noisy = hardNoisePattern.test(contextText);

    let roleBonus = 0;

    if (field === "supplierCui") {
      if (supplierCue) roleBonus += 0.16;
      if (customerCue) roleBonus -= 0.13;
    } else {
      if (customerCue) roleBonus += 0.16;
      if (supplierCue) roleBonus -= 0.13;
    }

    // Explicit RO evidence is more informative than the same bare digits.
    // We do NOT invent RO when it was never seen.
    const prefixBonus = value.startsWith("RO") ? 0.11 : 0;

    // Fiscal identifiers near an explicit fiscal label remain strong even
    // when their company-role wording is absent.
    const fiscalContextBonus =
      /\b(?:cui|cif|c\.?\s*[ui1l]+\.?\s*f?|cod\s+(?:unic|fiscal|de\s+inregistrare)|tva|vat)\b/i.test(
        contextText,
      )
        ? 0.06
        : 0;

    addCandidate(found, {
      field,
      value,
      // Same underlying Romanian fiscal number should dedupe with/without RO,
      // while candidate.value preserves the richer representation.
      normalizedValue: value.replace(/^RO(?=\d)/, ""),
      sourceText,
      lineIndex,
      score:
        baseScore +
        roleBonus +
        prefixBonus +
        fiscalContextBonus -
        (noisy ? 0.08 : 0) +
        (field === "supplierCui" ? topRegionBonus(lineIndex, context.lines.length, 0.025) : 0),
      method,
      reasons: [
        value.startsWith("RO")
          ? "Identificator fiscal cu prefix RO observat explicit"
          : "Identificator fiscal numeric",
        supplierCue
          ? "Context semantic de furnizor"
          : customerCue
            ? "Context semantic de client"
            : "Context fiscal general",
      ],
    });
  };

  context.lines.forEach((line, index) => {
    const method = line.bbox ? "Layout heuristic" : "Regex";

    // Explicit labels. Tolerates common OCR substitutions:
    // CIF -> C1F / CLF, CUI -> CUL / CULL etc.
    for (const match of line.text.matchAll(
      /\b(?:GSTIN|C\.?\s*U\.?\s*(?:I|1|L|LL)\.?|C\.?\s*(?:I|1|L)\.?\s*F\.?|COD\s+(?:UNIC\s+DE\s+INREG(?:ISTRARE)?|FISCAL|TVA)|COD\s+DE\s+INREGISTRARE\s+IN\s+SCOPURI\s+(?:DE\s+)?TVA|VAT\s*(?:ID|CODE|NO\.?|NUMBER)|TAX\s*(?:ID|NO\.?|NUMBER))\s*[:#;.=|-]?\s*([A-Z0-9][A-Z0-9 .:/_-]{4,30})/gi,
    )) {
      addTaxCandidate(match[1], line.text, index, 0.8, method);
    }

    // OCR sometimes destroys the label but preserves a highly distinctive
    // Romanian RO fiscal identifier. Capture it as document evidence.
    // normalizeTaxIdentifier rejects non-numeric tails, so IBANs do not pass.
    for (const match of line.text.matchAll(/\bR(?:O|0)\s*[0-9O](?:[\s._-]*[0-9O]){4,11}\b/gi)) {
      addTaxCandidate(match[0], line.text, index, 0.68, method);
    }

    // Compact OCR labels such as C1FRO6724860 / CULLRO11071295.
    const compact = line.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const match of compact.matchAll(
      /(?:C1F|CIF|CLF|CUI|CUL|CULL|CODFISCAL|CODTVA)(RO\d{5,12}|\d{5,12})/g,
    )) {
      addTaxCandidate(match[1], line.text, index, 0.76, method);
    }
  });

  const ranked = rankCandidates(found, context);

  // Preserve distinct fiscal entities. Do not allow the same digits in
  // RO-prefixed/unprefixed form to consume multiple ranking slots.
  const distinct: FieldCandidate[] = [];
  const seen = new Set<string>();

  for (const item of ranked) {
    const key = normalizeTaxIdentifier(String(item.value)).replace(/^RO(?=\d)/, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
  }

  if (!distinct.length) return [];

  if (field === "supplierCui") {
    return distinct;
  }

  // Customer selection should not blindly be "the second regex hit".
  // Role-aware scores above normally decide it. If scores are effectively
  // tied, keeping the alternate entity first still provides a useful
  // independent signal for the hybrid joint reconciliation.
  if (distinct.length >= 2 && Math.abs(distinct[0].score - distinct[1].score) < 0.08) {
    return [distinct[1], distinct[0], ...distinct.slice(2)];
  }

  return distinct;
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
  const strongestTotalScore = Math.max(...totals.map((total) => total.score));
  if (best.total.score < strongestTotalScore - 0.02) return;
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

function totalLabelStrength(line: string): "strong" | "current" | "weak" | null {
  if (TOTAL_CURRENT_INVOICE_PATTERN.test(line)) return "current";
  if (TOTAL_STRONG_LABEL_PATTERN.test(line)) return "strong";
  if (TOTAL_WEAK_LABEL_PATTERN.test(line)) return "weak";
  return null;
}

function shouldConsiderArithmeticTotalLine(
  context: CandidateContext,
  index: number,
  tokens: MonetaryToken[],
) {
  if (tokens.length < 2) return false;
  const line = normalizeText(context.lines[index]?.text ?? "");
  if (isHardNonTotalAmountLine(line)) return false;
  return (
    hasNearbyStrongTotalLabel(context, index) &&
    (TOTAL_WEAK_LABEL_PATTERN.test(line) || isCompactAmountLine(line))
  );
}

function isHardNonTotalAmountLine(line: string) {
  if (!line) return false;
  if (TOTAL_CURRENT_INVOICE_PATTERN.test(line) && !/\bfara\s+tva\b/i.test(line)) return false;
  return (
    TOTAL_NON_MONETARY_CONTEXT_PATTERN.test(line) ||
    TOTAL_BALANCE_CONTEXT_PATTERN.test(line) ||
    TOTAL_TAX_OR_NET_CONTEXT_PATTERN.test(line)
  );
}

function isPotentialAdjacentTotalValueLine(line: string) {
  if (!line) return false;
  if (isHardNonTotalAmountLine(line)) return false;
  if (TOTAL_LINE_ITEM_CONTEXT_PATTERN.test(line) && !TOTAL_CURRENT_INVOICE_PATTERN.test(line)) {
    return false;
  }
  const wordCount = line.match(/[a-z0-9]+/gi)?.length ?? 0;
  return (
    isCompactAmountLine(line) ||
    /\b(?:semnatur|expedierea|primire)\b/i.test(line) ||
    (/\b(?:lei|ron|eur|usd|gbp)\b/i.test(line) && wordCount <= 10)
  );
}

function findTotalLabelPosition(text: string) {
  const match =
    text.match(
      /\b(?:amount[\s_]*due|payable\s+amount|invoice\s+total|current\s+invoice\s+total|total\s+due|balance\s+due|grand\s+total|total\s+general|total\s+payment|total\s+plata|total\s+de\s+plat[aă]|tal\s+de\s+plat[aă]|de\s+plat[aă]|total\s+factur[aă]\w*\s+curen\w*|total)\b/i,
    ) ?? text.match(/\bfactur[aă]\w*\s+curen\w*/i);
  if (!match || match.index === undefined) return null;
  return { index: match.index, endIndex: match.index + match[0].length };
}

function isUsableTotalAmountToken(token: MonetaryToken, sourceText: string) {
  if (!Number.isFinite(token.value)) return false;
  if (Math.abs(token.value) >= 1_000_000_000) return false;
  if (isSuspiciousBareGroupedAmount(token)) return false;
  const around = sourceText.slice(Math.max(0, token.index - 20), token.endIndex + 20);
  if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(around)) return false;
  if (/\d{1,2}:\d{2}(?::\d{2})?/.test(around)) return false;
  if (/\b(?:art\.?|alin\.?|legea|codul\s+fiscal|nr\.?\s+contract|cod\s+client)\b/i.test(around)) {
    return false;
  }
  if (!token.hasDecimal && !token.hasCurrency && Math.abs(token.value) < 2) return false;
  return true;
}

function isCompactAmountLine(text: string) {
  const withoutAmounts = text
    .replace(AMOUNT_PATTERN, "")
    .replace(/\b(?:RON|LEI|LEU|EUR|USD|GBP)\b/gi, "")
    .replace(/[|:;,.()\-[\]{}_/\\\s]/g, "");
  return withoutAmounts.length <= 18;
}

function isSuspiciousBareGroupedAmount(token: MonetaryToken) {
  return (
    token.hasThousandsSeparator &&
    !token.hasDecimal &&
    !token.hasCurrency &&
    Math.abs(token.value) >= 50_000
  );
}

function findVatLikeAmountPair(tokens: MonetaryToken[]) {
  const values = Array.from(
    new Set(
      tokens
        .filter((token) => token.hasDecimal || token.value === 0)
        .map((token) => roundAmount(Math.abs(token.value)))
        .filter((value) => Number.isFinite(value) && value >= 0),
    ),
  ).sort((left, right) => right - left);

  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const larger = values[leftIndex];
      const smaller = values[rightIndex];
      if (larger <= 0) continue;
      const ratio = smaller / larger;
      if (smaller !== 0 && (ratio < 0.01 || ratio > 0.3)) continue;
      const observedTotal = values.find(
        (value) => Math.abs(value - roundAmount(larger + smaller)) <= 0.01,
      );
      if (observedTotal !== undefined) return { net: larger, tax: smaller, total: observedTotal };
    }
  }

  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const net = values[leftIndex];
      const tax = values[rightIndex];
      if (net <= 0) continue;
      const ratio = tax / net;
      const looksLikeTax = tax === 0 || (ratio >= 0.01 && ratio <= 0.3);
      if (!looksLikeTax) continue;
      return { net, tax, total: roundAmount(net + tax) };
    }
  }
  return null;
}

function hasNearbyStrongTotalLabel(context: CandidateContext, index: number) {
  const start = Math.max(0, index - 8);
  const end = Math.min(context.lines.length - 1, index + 14);
  for (let cursor = start; cursor <= end; cursor += 1) {
    const line = normalizeText(context.lines[cursor]?.text ?? "");
    if (TOTAL_CURRENT_INVOICE_PATTERN.test(line) || TOTAL_STRONG_LABEL_PATTERN.test(line)) {
      if (!isHardNonTotalAmountLine(line)) return true;
    }
  }
  return false;
}

function hasNearbyLargerTotalAmount(
  context: CandidateContext,
  anchorIndex: number,
  currentValue: number,
) {
  const value = Math.abs(currentValue);
  if (value <= 0) return false;
  const start = Math.max(0, anchorIndex - 8);
  const end = Math.min(context.lines.length - 1, anchorIndex + 14);
  for (let cursor = start; cursor <= end; cursor += 1) {
    const line = context.lines[cursor];
    if (!line) continue;
    const normalizedLine = normalizeText(line.text);
    if (isHardNonTotalAmountLine(normalizedLine)) continue;
    const larger = extractMonetaryTokenDetails(line.text).some(
      (token) =>
        !isSuspiciousBareGroupedAmount(token) &&
        Math.abs(token.value) > value * 1.18 &&
        Math.abs(token.value) > value + 5,
    );
    if (larger) return true;
  }
  return false;
}

function hasNearbyDomesticCurrency(context: CandidateContext, index: number) {
  const start = Math.max(0, index - 4);
  const end = Math.min(context.lines.length - 1, index + 4);
  for (let cursor = start; cursor <= end; cursor += 1) {
    if (/\b(?:LEI|RON)\b/i.test(context.lines[cursor]?.text ?? "")) return true;
  }
  return false;
}

function hasRepeatedAmountToken(tokens: MonetaryToken[]) {
  const counts = new Map<number, number>();
  tokens.forEach((token) => {
    const value = roundAmount(Math.abs(token.value));
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.values()).some((count) => count >= 2);
}

function hasNearbyTaxTableContext(context: CandidateContext, index: number) {
  const start = Math.max(0, index - 6);
  const end = Math.min(context.lines.length - 1, index + 3);
  for (let cursor = start; cursor <= end; cursor += 1) {
    const line = normalizeText(context.lines[cursor]?.text ?? "");
    if (
      /\b(?:tva|vat|tax|valoarea|valoare\s+tva|fara\s+tva|pret\s+unitar|cantitate)\b/i.test(line)
    ) {
      return true;
    }
  }
  return false;
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function extractMonetaryTokens(text: string) {
  return extractMonetaryTokenDetails(text).map((token) => token.value);
}

function extractMonetaryTokenDetails(text: string): MonetaryToken[] {
  return Array.from(text.matchAll(AMOUNT_PATTERN))
    .filter((match) => {
      const raw = match[0];
      const index = match.index ?? 0;
      const endIndex = index + raw.length;
      const before = text[index - 1] ?? "";
      const after = text[endIndex] ?? "";
      if (/[A-Za-z0-9.,:/-]/.test(before) || /[A-Za-z0-9.,:/-]/.test(after)) return false;
      const tail = text.slice(endIndex, endIndex + 2);
      if (tail.includes("%")) return false;
      if (/^\d{4}$/.test(raw.trim())) return false;
      if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(raw)) return false;
      return true;
    })
    .map((match) => {
      const raw = match[0];
      const value = normalizeAmount(raw);
      if (value === null || Math.abs(value) >= 1_000_000_000) return null;
      const currencyless = raw.replace(/\b(RON|LEI|LEU|EUR|USD|GBP)\b/gi, "").replace(/[$€£]/g, "");
      const numeric = currencyless.replace(/[\s'’]/g, "");
      return {
        raw,
        value: roundAmount(value),
        index: match.index ?? 0,
        endIndex: (match.index ?? 0) + raw.length,
        hasCurrency: /[$€£]|\b(?:RON|LEI|LEU|EUR|USD|GBP)\b/i.test(raw),
        hasDecimal: /[,.]\d{1,2}\s*$/i.test(numeric),
        hasThousandsSeparator: /\d{1,3}(?:[\s.,']\d{3})+/.test(currencyless),
      };
    })
    .filter((token): token is MonetaryToken => token !== null);
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
    .sort((left, right) => right.confidence - left.confidence || right.score - left.score);
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
