import { classifyInvoiceByCui, type InvoiceClassification } from "./cuiUtils";
import { getCompanyProfile } from "./companyService";

export type DocumentAiFieldKey =
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

export type DocumentAiFieldValue = string | number | null;

export type DocumentAiExtractionMethod = "OCR" | "Regex" | "Layout heuristic" | "User verified";

export type DocumentAiExtractedFields = Record<DocumentAiFieldKey, DocumentAiFieldValue>;

export type DocumentAiConfidenceMap = Record<DocumentAiFieldKey, number>;

export type DocumentAiFieldDetail = {
  value: DocumentAiFieldValue;
  confidence: number;
  method: DocumentAiExtractionMethod;
  warning?: string;
  sourceText?: string;
};

export type DocumentAiFieldDetails = Record<DocumentAiFieldKey, DocumentAiFieldDetail>;

export type OcrWord = {
  text: string;
  confidence?: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type DocumentAiLayoutInfo = {
  wordCount: number;
  wordsWithPosition: number;
  averageWordConfidence: number;
  detectedLines: number;
  hasLayoutData: boolean;
};

export type DocumentAiAnalysis = {
  fileName: string;
  fileType: string;
  extractedText: string;
  ocrConfidence: number;
  overallConfidence: number;
  fields: DocumentAiExtractedFields;
  confidences: DocumentAiConfidenceMap;
  fieldDetails: DocumentAiFieldDetails;
  ocrWords: OcrWord[];
  layout: DocumentAiLayoutInfo;
  warnings: string[];
  classification: InvoiceClassification;
  companyCui: string;
};

export type OcrProgress = {
  status: string;
  progress: number;
};

type LayoutLine = {
  text: string;
  words: OcrWord[];
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ExtractionCandidate = {
  value: DocumentAiFieldValue;
  confidence: number;
  method: DocumentAiExtractionMethod;
  sourceText?: string;
};

type AmountMatchOptions = {
  amountPosition?: "first" | "last";
  combineNearbyLines?: boolean;
  excludedTerms?: string[];
  maxIntegerDigits?: number;
  nearbyLines?: number;
};

type AmountCandidate = {
  value: number;
  sourceText: string;
  method: DocumentAiExtractionMethod;
  confidence: number;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy?: () => Promise<void>;
};

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: {
    data: Uint8Array;
    disableFontFace?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    useWorkerFetch?: boolean;
  }) => PdfLoadingTask;
};

const EMPTY_FIELDS: DocumentAiExtractedFields = {
  invoiceNumber: null,
  invoiceDate: null,
  supplierName: null,
  supplierCui: null,
  customerName: null,
  customerCui: null,
  subtotal: null,
  vatAmount: null,
  totalAmount: null,
  currency: "RON",
};

const EMPTY_CONFIDENCE: DocumentAiConfidenceMap = {
  invoiceNumber: 0,
  invoiceDate: 0,
  supplierName: 0,
  supplierCui: 0,
  customerName: 0,
  customerCui: 0,
  subtotal: 0,
  vatAmount: 0,
  totalAmount: 0,
  currency: 0,
};

const fieldLabels: Record<DocumentAiFieldKey, string> = {
  invoiceNumber: "Numar factura",
  invoiceDate: "Data factura",
  supplierName: "Furnizor",
  supplierCui: "CUI furnizor",
  customerName: "Client",
  customerCui: "CUI client",
  subtotal: "Valoare fara TVA",
  vatAmount: "TVA",
  totalAmount: "Total de plata",
  currency: "Moneda",
};

export function isSupportedDocumentAiFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return ["pdf", "png", "jpg", "jpeg"].includes(extension ?? "");
}

export async function analyzeInvoiceDocument(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<DocumentAiAnalysis> {
  if (!isSupportedDocumentAiFile(file)) {
    throw new Error("Selecteaza un fisier PDF, PNG, JPG sau JPEG.");
  }

  const companyProfile = await getCompanyProfile().catch(() => null);
  const companyCui = companyProfile?.cui ?? "";
  const extraction = await extractText(file, onProgress);
  const layoutLines = buildLayoutLines(extraction.words, extraction.text);
  const layout = summarizeLayout(extraction.words, layoutLines);
  const fieldDetails = extractInvoiceFieldDetails(
    extraction.text,
    extraction.words,
    layoutLines,
    extraction.confidence,
  );
  const fields = detailsToFields(fieldDetails);
  const confidences = detailsToConfidences(fieldDetails);
  const warnings = buildWarnings(
    fieldDetails,
    extraction.text,
    `${file.type} ${file.name}`,
    companyCui,
    layout,
  );
  const overallConfidence = calculateOverallConfidence(confidences);
  const classification = classifyInvoiceByCui({
    companyCui,
    supplierCui: String(fields.supplierCui ?? ""),
    customerCui: String(fields.customerCui ?? ""),
  });

  return {
    fileName: file.name,
    fileType: getFileExtension(file.name),
    extractedText: extraction.text,
    ocrConfidence: extraction.confidence,
    overallConfidence,
    fields,
    confidences,
    fieldDetails,
    ocrWords: extraction.words,
    layout,
    warnings,
    classification,
    companyCui,
  };
}

async function extractText(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<{ text: string; confidence: number; words: OcrWord[] }> {
  if (isPdfFile(file)) {
    onProgress?.({ status: "Se extrage textul din PDF", progress: 0.2 });
    const pdfText = await extractSelectablePdfText(file, onProgress);

    if (pdfText.trim().length >= 40) {
      onProgress?.({ status: "Text extras din PDF", progress: 1 });

      return {
        text: pdfText,
        confidence: 0.72,
        words: [],
      };
    }

    onProgress?.({ status: "PDF-ul necesita verificare", progress: 1 });

    return {
      text: pdfText,
      confidence: 0.2,
      words: [],
    };
  }

  onProgress?.({ status: "Se porneste OCR", progress: 0.05 });

  const tesseractModule = await import("tesseract.js");
  const tesseract = tesseractModule.default;
  const logger = (message: { status?: string; progress?: number }) => {
    if (typeof message.progress === "number") {
      onProgress?.({
        status: translateOcrStatus(message.status),
        progress: Math.max(0.05, Math.min(message.progress, 1)),
      });
    }
  };

  try {
    const result = await tesseract.recognize(file, "ron+eng", { logger });

    return {
      text: result.data.text ?? "",
      confidence: normalizePercent(result.data.confidence),
      words: extractOcrWords(result.data),
    };
  } catch {
    const result = await tesseract.recognize(file, "eng", { logger });

    return {
      text: result.data.text ?? "",
      confidence: normalizePercent(result.data.confidence),
      words: extractOcrWords(result.data),
    };
  }
}

async function extractSelectablePdfText(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
) {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  });

  try {
    const pdf = await loadingTask.promise;
    const pagesToRead = Math.min(pdf.numPages, 2);
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      onProgress?.({
        status: `Se citeste pagina ${pageNumber} din ${pagesToRead}`,
        progress: 0.2 + (pageNumber / pagesToRead) * 0.55,
      });

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = buildReadablePdfPageText(content.items);

      if (pageText.trim()) {
        pageTexts.push(pageText);
      }
    }

    return pageTexts.join("\n").trim();
  } finally {
    await loadingTask.destroy?.();
  }
}

function buildReadablePdfPageText(items: unknown[]) {
  const positionedItems = items
    .filter(isPdfTextItem)
    .map((item) => ({
      text: String(item.str ?? "").trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.text);

  if (positionedItems.length === 0) {
    return "";
  }

  const sortedByLine = [...positionedItems].sort((a, b) => {
    const yDiff = b.y - a.y;

    return Math.abs(yDiff) > 4 ? yDiff : a.x - b.x;
  });
  const lines: Array<{ y: number; items: typeof positionedItems }> = [];

  sortedByLine.forEach((item) => {
    const lastLine = lines[lines.length - 1];

    if (!lastLine || Math.abs(lastLine.y - item.y) > 4) {
      lines.push({ y: item.y, items: [item] });
      return;
    }

    lastLine.items.push(item);
    lastLine.y = average(lastLine.items.map((lineItem) => lineItem.y));
  });

  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return Boolean(item && typeof item === "object" && "str" in item);
}

function extractInvoiceFieldDetails(
  text: string,
  words: OcrWord[],
  layoutLines: LayoutLine[],
  ocrConfidence: number,
): DocumentAiFieldDetails {
  const normalizedText = text.replace(/\r/g, "\n");
  const textLines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const supplierBlock = findTextBlock(textLines, [
    "furnizor",
    "vanzator",
    "emitent",
    "supplier",
    "seller",
    "vendor",
  ]);
  const customerBlock = findTextBlock(textLines, [
    "client",
    "cumparator",
    "beneficiar",
    "customer",
    "buyer",
  ]);
  const supplierLayoutBlock = findLayoutBlock(layoutLines, [
    "furnizor",
    "vanzator",
    "emitent",
    "supplier",
    "seller",
    "vendor",
  ]);
  const customerLayoutBlock = findLayoutBlock(layoutLines, [
    "client",
    "cumparator",
    "beneficiar",
    "customer",
    "buyer",
  ]);
  const allCuis = findAllCuis(normalizedText);
  const supplierCui =
    findCuiCandidate(supplierLayoutBlock, supplierBlock, 0.83) ??
    buildCandidate(allCuis[0] ?? null, 0.58, "Regex", allCuis[0]);
  const customerCui =
    findCuiCandidate(customerLayoutBlock, customerBlock, 0.83) ??
    buildCandidate(allCuis.find((cui) => cui !== supplierCui.value) ?? null, 0.56, "Regex");
  const totalAmount =
    findLayoutAmount(layoutLines, [
      "total de plata",
      "total de plată",
      "total de plata (lei)",
      "total de plată (lei)",
      "total plata",
      "total factură curentă",
      "total factura curenta",
      "total factura curenta cu tva",
      "total factură curentă cu tva",
      "total factura",
      "valoare cu tva",
      "valoare totala",
      "grand total",
      "amount due",
      "balance due",
      "total",
    ], {
      amountPosition: "last",
      combineNearbyLines: true,
      excludedTerms: [
        "fara tva",
        "fără tva",
        "without vat",
        "tax exclusive",
        "sub_total",
        "subtotal",
        "sub total",
        "total tva",
        "valoare tva",
        "gst",
      ],
      nearbyLines: 6,
    }) ??
    findRegexAmount(normalizedText, [
      "total de plata",
      "total de plată",
      "total de plata (lei)",
      "total de plată (lei)",
      "total plata",
      "total factură curentă",
      "total factura curenta",
      "total factura curenta cu tva",
      "total factură curentă cu tva",
      "total factura",
      "valoare cu tva",
      "valoare totala",
      "grand total",
      "amount due",
      "balance due",
      "total",
    ], {
      amountPosition: "last",
      combineNearbyLines: true,
      excludedTerms: [
        "fara tva",
        "fără tva",
        "without vat",
        "tax exclusive",
        "sub_total",
        "subtotal",
        "sub total",
        "total tva",
        "valoare tva",
        "gst",
      ],
      nearbyLines: 6,
    });
  const vatCandidates = findTaxAmountCandidates(layoutLines, textLines);
  const vatAmount = vatCandidates[0]
    ? buildCandidate(
        vatCandidates[0].value,
        vatCandidates[0].confidence,
        vatCandidates[0].method,
        vatCandidates[0].sourceText,
      )
    : buildCandidate(null, 0, "Regex");
  const subtotal =
    findLayoutAmount(layoutLines, [
      "baza fara tva",
      "valoare fara tva",
      "total factura curenta fara tva",
      "total factură curentă fără tva",
      "sub_total",
      "sub total",
      "subtotal",
      "tax exclusive",
      "net amount",
    ]) ??
    findRegexAmount(normalizedText, [
      "baza fara tva",
      "valoare fara tva",
      "total factura curenta fara tva",
      "total factură curentă fără tva",
      "sub_total",
      "sub total",
      "subtotal",
      "tax exclusive",
      "net amount",
    ]) ??
    buildCandidate(
      inferSubtotal(totalAmount.value as number | null, vatAmount.value as number | null),
      0.52,
      "Regex",
    );
  console.debug("Document AI financial extraction", {
    subtotalCandidates: candidateToDebugList(subtotal),
    vatCandidates: vatCandidates.map(amountCandidateToDebug),
    totalCandidates: candidateToDebugList(totalAmount),
    selectedVatAmount: vatAmount.value,
  });
  const details: DocumentAiFieldDetails = {
    invoiceNumber: withFieldWarning(
      "invoiceNumber",
      findLayoutInvoiceNumber(layoutLines) ?? findRegexInvoiceNumber(normalizedText),
    ),
    invoiceDate: withFieldWarning(
      "invoiceDate",
      findLayoutInvoiceDate(layoutLines) ?? findRegexInvoiceDate(normalizedText),
    ),
    supplierName: withFieldWarning(
      "supplierName",
      chooseCandidate(
        chooseCandidate(
          findPartyNameCandidate(supplierLayoutBlock, supplierBlock, [
            "furnizor",
            "supplier",
            "vanzator",
            "vendor",
          ]),
          findCompanyNameCandidate(textLines, layoutLines),
        ),
        findFaturaSupplierNameCandidate(textLines, layoutLines),
      ),
    ),
    supplierCui: withFieldWarning("supplierCui", supplierCui),
    customerName: withFieldWarning(
      "customerName",
      chooseCandidate(
        findBuyerNameCandidate(textLines, layoutLines),
        chooseCandidate(
          findCustomerNameCandidate(textLines, layoutLines),
          findPartyNameCandidate(customerLayoutBlock, customerBlock, [
            "client",
            "customer",
            "cumparator",
            "buyer",
          ]),
        ),
      ),
    ),
    customerCui: withFieldWarning("customerCui", customerCui),
    subtotal: withFieldWarning("subtotal", subtotal),
    vatAmount: withFieldWarning("vatAmount", vatAmount),
    totalAmount: withFieldWarning("totalAmount", totalAmount),
    currency: withFieldWarning("currency", findCurrencyCandidate(normalizedText, ocrConfidence)),
  };

  return applyOcrConfidence(details, ocrConfidence, words.length);
}

function findLayoutAmount(
  lines: LayoutLine[],
  labels: string[],
  options: AmountMatchOptions = {},
): ExtractionCandidate | null {
  const labelLines = findLabelLineCandidates(lines, labels);

  for (const labelLine of labelLines) {
    const nearbyLines = options.nearbyLines ?? 3;
    const candidateTexts = options.combineNearbyLines
      ? [lines.slice(labelLine.index, labelLine.index + nearbyLines).map((line) => line.text).join(" ")]
      : [
          labelLine.line.text,
          ...lines.slice(labelLine.index + 1, labelLine.index + nearbyLines).map((line) => line.text),
        ];

    for (const candidateText of candidateTexts) {
      if (hasExcludedAmountTerm(candidateText, options.excludedTerms)) {
        continue;
      }

      const parsed =
        options.amountPosition === "first"
          ? parseFirstAmountFromText(candidateText, options)
          : parseAmountFromText(candidateText, options);

      if (parsed !== null) {
        return buildCandidate(
          parsed,
          Math.max(0.62, Math.min(0.92, labelLine.line.confidence + 0.12)),
          "Layout heuristic",
          candidateText,
        );
      }
    }
  }

  return null;
}

function findRegexAmount(
  text: string,
  labels: string[],
  options: AmountMatchOptions = {},
): ExtractionCandidate {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const label of labels) {
    const normalizedLabel = removeDiacritics(label);
    const lineIndexes = lines
      .map((line, index) => ({ index, normalizedLine: removeDiacritics(line) }))
      .filter(({ normalizedLine }) => normalizedLine.includes(normalizedLabel))
      .map(({ index }) => index);

    for (const lineIndex of lineIndexes) {
      const nearbyLines = options.nearbyLines ?? 2;
      const currentLine = lines[lineIndex];
      const labelStart = Math.max(0, removeDiacritics(currentLine).indexOf(normalizedLabel));
      const currentLineFromLabel = currentLine.slice(labelStart);
      const candidateText = options.combineNearbyLines
        ? [currentLineFromLabel, ...lines.slice(lineIndex + 1, lineIndex + nearbyLines)].join(" ")
        : [currentLineFromLabel, lines[lineIndex + 1] ?? ""].join(" ");

      if (hasExcludedAmountTerm(candidateText, options.excludedTerms)) {
        continue;
      }

      const parsed =
        options.amountPosition === "first"
          ? parseFirstAmountFromText(candidateText, options)
          : parseAmountFromText(candidateText, options);

      if (parsed !== null) {
        return buildCandidate(parsed, 0.67, "Regex", candidateText);
      }
    }

    const pattern = new RegExp(`${escapeRegExp(label)}[^\\n\\r]{0,80}`, "i");
    const match = text.match(pattern);
    const matchText = match?.[0] ?? "";

    if (hasExcludedAmountTerm(matchText, options.excludedTerms)) {
      continue;
    }

    const parsed =
      options.amountPosition === "first"
        ? parseFirstAmountFromText(matchText, options)
        : parseAmountFromText(matchText, options);

    if (parsed !== null) {
      return buildCandidate(parsed, 0.67, "Regex", matchText);
    }
  }

  return buildCandidate(null, 0, "Regex");
}

function findTaxAmountCandidates(
  layoutLines: LayoutLine[],
  textLines: string[],
): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const seen = new Set<string>();

  layoutLines.forEach((line) => {
    const parsed = extractAmountAfterTaxLabel(line.text);

    if (parsed === null) {
      return;
    }

    candidates.push({
      value: parsed,
      sourceText: line.text,
      method: "Layout heuristic",
      confidence: Math.max(0.66, Math.min(0.9, line.confidence + 0.1)),
    });
    seen.add(`${line.text}:${parsed}`);
  });

  textLines.forEach((line) => {
    const parsed = extractAmountAfterTaxLabel(line);
    const key = `${line}:${parsed}`;

    if (parsed === null || seen.has(key)) {
      return;
    }

    candidates.push({
      value: parsed,
      sourceText: line,
      method: "Regex",
      confidence: 0.7,
    });
    seen.add(key);
  });

  return candidates;
}

function extractAmountAfterTaxLabel(line: string) {
  if (isTaxIdentifierLine(line) || hasExcludedAmountTerm(line, ["tax exclusive", "net amount", "subtotal", "sub_total", "sub total"])) {
    return null;
  }

  const patterns = [
    /\bGST\s*\(\s*\d+(?:[,.]\d+)?\s*%\s*\)\s*[:\-]?\s*(.+)$/i,
    /\bGST\b\s*[:\-]?\s*(.+)$/i,
    /\bVAT\s+amount\b\s*[:\-]?\s*(.+)$/i,
    /\bTax\s+amount\b\s*[:\-]?\s*(.+)$/i,
    /\bVAT\b\s*[:\-]?\s*(.+)$/i,
    /\bTax\b\s*[:\-]?\s*(.+)$/i,
    /\bTVA\b(?:\s+\d+(?:[,.]\d+)?\s*%)?\s*[:\-]?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    const afterLabel = match?.[1]?.trim();

    if (!afterLabel) {
      continue;
    }

    const parsed = parseFirstAmountFromText(afterLabel, { maxIntegerDigits: 6 });

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function findLayoutInvoiceNumber(lines: LayoutLine[]): ExtractionCandidate | null {
  const labelLine = findLabelLine(lines, [
    "seria si numarul facturii",
    "seria şi numărul facturii",
    "seria și numărul facturii",
    "factura",
    "nr factura",
    "numar factura",
    "invoice #",
    "invoice no",
    "invoice no.",
    "invoice number",
  ]);

  if (!labelLine) {
    return null;
  }

  const value = extractInvoiceNumberFromText(labelLine.line.text);

  if (!value) {
    return null;
  }

  return buildCandidate(
    value,
    Math.min(0.92, labelLine.line.confidence + 0.1),
    "Layout heuristic",
    labelLine.line.text,
  );
}

function findRegexInvoiceNumber(text: string): ExtractionCandidate {
  const value = extractInvoiceNumberFromText(text);

  return buildCandidate(value, value ? 0.68 : 0, "Regex");
}

function findLayoutInvoiceDate(lines: LayoutLine[]): ExtractionCandidate | null {
  const labelLine = findLabelLine(lines, [
    "data facturii",
    "data emitere",
    "data",
    "invoice date",
    "issue date",
    "date",
  ]);

  if (!labelLine) {
    return null;
  }

  const value = extractDateFromText(labelLine.line.text);

  if (!value) {
    return null;
  }

  return buildCandidate(
    value,
    Math.min(0.91, labelLine.line.confidence + 0.08),
    "Layout heuristic",
    labelLine.line.text,
  );
}

function findRegexInvoiceDate(text: string): ExtractionCandidate {
  const dateNearLabel = text.match(
    /(?:data\s+(?:facturii|emiterii)|invoice\s+date|issue\s+date|\bdate\b)[^\dA-Z]{0,20}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i,
  );
  const labeledDate = dateNearLabel?.[1] ? normalizeDate(dateNearLabel[1]) : "";
  const fallback = labeledDate ? null : findFirstNormalizedDate(text);
  const normalizedDate = labeledDate || fallback?.value || null;
  const sourceText = dateNearLabel?.[1] ?? fallback?.sourceText;

  return buildCandidate(normalizedDate, normalizedDate ? 0.66 : 0, "Regex", sourceText);
}

function findCuiCandidate(
  layoutBlock: LayoutLine[],
  textBlock: string,
  confidence: number,
): ExtractionCandidate | null {
  const layoutText = layoutBlock.map((line) => line.text).join("\n");
  const layoutCui = extractCui(layoutText);

  if (layoutCui) {
    return buildCandidate(layoutCui, confidence, "Layout heuristic", layoutText);
  }

  const textCui = extractCui(textBlock);

  if (textCui) {
    return buildCandidate(textCui, 0.64, "Regex", textBlock);
  }

  return null;
}

function findPartyNameCandidate(
  layoutBlock: LayoutLine[],
  textBlock: string,
  labels: string[],
): ExtractionCandidate {
  const layoutCandidate = findPartyName(layoutBlock.map((line) => line.text).join("\n"), labels);

  if (layoutCandidate) {
    const averageConfidence = average(
      layoutBlock.flatMap((line) => line.words.map((word) => word.confidence ?? 0.65)),
    );

    return buildCandidate(
      layoutCandidate,
      Math.max(0.55, Math.min(0.86, averageConfidence + 0.05)),
      "Layout heuristic",
      layoutBlock.map((line) => line.text).join("\n"),
    );
  }

  const textCandidate = findPartyName(textBlock, labels);

  return buildCandidate(
    textCandidate,
    textCandidate ? 0.58 : 0,
    textCandidate ? "OCR" : "Regex",
    textBlock,
  );
}

function findFaturaSupplierNameCandidate(
  textLines: string[],
  layoutLines: LayoutLine[],
): ExtractionCandidate {
  const layoutTexts = layoutLines.map((line) => line.text);
  const layoutCandidate = findSupplierNameNearTaxOrAddress(layoutTexts);

  if (layoutCandidate) {
    const layoutLine = layoutLines.find((line) => line.text === layoutCandidate);

    return buildCandidate(
      cleanupPartyName(layoutCandidate),
      Math.max(0.64, Math.min(0.84, (layoutLine?.confidence ?? 0.6) + 0.08)),
      "Layout heuristic",
      layoutCandidate,
    );
  }

  const textCandidate = findSupplierNameNearTaxOrAddress(textLines);

  return buildCandidate(
    textCandidate ? cleanupPartyName(textCandidate) : null,
    textCandidate ? 0.64 : 0,
    "Regex",
    textCandidate,
  );
}

function findSupplierNameNearTaxOrAddress(lines: string[]) {
  const anchorIndex = lines.findIndex((line) => {
    const normalized = removeDiacritics(line);

    return /\b(address|gstin|vat\s+code|tax\s+id|cod\s+fiscal|cod\s+tva)\b/i.test(normalized);
  });
  const searchEnd = anchorIndex >= 0 ? anchorIndex : Math.min(lines.length, 8);

  for (let index = searchEnd - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();

    if (line && isLikelySupplierNameLine(line)) {
      return line;
    }
  }

  for (const line of lines.slice(0, 8)) {
    if (isLikelySupplierNameLine(line)) {
      return line;
    }
  }

  return null;
}

function isLikelySupplierNameLine(value: string) {
  const normalized = removeDiacritics(value);

  if (!/[a-z]/i.test(value)) {
    return false;
  }

  if (isInvoiceMetadataLine(value) || isAccountReferenceLine(value)) {
    return false;
  }

  if (/(^invoice$|invoice\s*#|invoice\s+no|date|address|gstin|vat|tax|buyer|customer|client|seller|supplier|vendor|total|amount|eur|usd|gbp|ron|lei)/i.test(
    normalized,
  )) {
    return false;
  }

  if (/^\d/.test(value.trim()) || /\b\d{5,}\b/.test(value)) {
    return false;
  }

  return value.trim().length >= 4 && value.trim().length <= 120;
}

function findBuyerNameCandidate(
  textLines: string[],
  layoutLines: LayoutLine[],
): ExtractionCandidate {
  const layoutLine = layoutLines.find((line) => extractBuyerName(line.text));

  if (layoutLine) {
    const value = extractBuyerName(layoutLine.text);

    return buildCandidate(
      value,
      Math.max(0.68, Math.min(0.9, layoutLine.confidence + 0.08)),
      "Layout heuristic",
      layoutLine.text,
    );
  }

  const textLine = textLines.find((line) => extractBuyerName(line));
  const textCandidate = textLine ? extractBuyerName(textLine) : null;

  return buildCandidate(textCandidate, textCandidate ? 0.68 : 0, "Regex", textLine);
}

function extractBuyerName(value: string) {
  const match = value.match(/\b(?:buyer|bill\s+to|sold\s+to)\s*[:#-]?\s*(.+)$/i);
  const candidate = cleanupPartyName(match?.[1] ?? "");

  return candidate && isLikelyCustomerNameLine(candidate) ? candidate : null;
}

function findCustomerNameCandidate(
  textLines: string[],
  layoutLines: LayoutLine[],
): ExtractionCandidate {
  const layoutTexts = layoutLines.map((line) => line.text);
  const layoutCandidate = findNameAfterCustomerMetadata(layoutTexts);

  if (layoutCandidate) {
    const layoutLine = layoutLines.find((line) => line.text === layoutCandidate);

    return buildCandidate(
      cleanupPartyName(layoutCandidate),
      Math.max(0.66, Math.min(0.86, (layoutLine?.confidence ?? 0.62) + 0.08)),
      "Layout heuristic",
      layoutCandidate,
    );
  }

  const textCandidate = findNameAfterCustomerMetadata(textLines);

  return buildCandidate(
    textCandidate ? cleanupPartyName(textCandidate) : null,
    textCandidate ? 0.66 : 0,
    "Regex",
    textCandidate,
  );
}

function findNameAfterCustomerMetadata(lines: string[]) {
  const accountIndex = lines.findIndex(isAccountReferenceLine);

  if (accountIndex >= 0) {
    const accountCandidate = findNextCustomerName(lines, accountIndex + 1, accountIndex + 12);

    if (accountCandidate) {
      return accountCandidate;
    }
  }

  const metadataIndex = findLastIndex(lines, (line) =>
    /(seria\s+(?:si|și|şi)\s+numarul\s+facturii|data\s+facturii|invoice\s+(?:date|number|no)|(?:nr|numar)\s+factura)/i.test(
      removeDiacritics(line),
    ),
  );

  if (metadataIndex >= 0) {
    return findNextCustomerName(lines, metadataIndex + 1, metadataIndex + 10);
  }

  return null;
}

function findNextCustomerName(lines: string[], startIndex: number, endIndex: number) {
  const maxIndex = Math.min(lines.length, endIndex);

  for (let index = startIndex; index < maxIndex; index += 1) {
    const line = lines[index]?.trim();

    if (line && isLikelyCustomerNameLine(line)) {
      return line;
    }
  }

  return null;
}

function isLikelyCustomerNameLine(value: string) {
  const normalized = removeDiacritics(value);

  if (isAccountReferenceLine(value) || isInvoiceMetadataLine(value)) {
    return false;
  }

  if (!/[a-zăâîșț]/i.test(value)) {
    return false;
  }

  if (/(factur|total|tva|cui|cif|cod fiscal|cod tva|iban|banca|email|telefon|adresa|ron|lei|scadent|contract|abonament|serie|numar|nr\.)/i.test(
    normalized,
  )) {
    return false;
  }

  if (/^\d/.test(value.trim()) || /\b\d{5,}\b/.test(value)) {
    return false;
  }

  return value.trim().length >= 3 && value.trim().length <= 120;
}

function chooseCandidate(
  preferred: ExtractionCandidate,
  fallback: ExtractionCandidate,
): ExtractionCandidate {
  const preferredHasValue = preferred.value !== null && preferred.value !== "";

  return preferredHasValue ? preferred : fallback;
}

function findCompanyNameCandidate(textLines: string[], layoutLines: LayoutLine[]): ExtractionCandidate {
  const layoutCandidate = layoutLines.find((line) => isLikelyCompanyName(line.text));

  if (layoutCandidate) {
    return buildCandidate(
      cleanupCompanyName(layoutCandidate.text),
      Math.max(0.6, Math.min(0.82, layoutCandidate.confidence + 0.08)),
      "Layout heuristic",
      layoutCandidate.text,
    );
  }

  const textCandidate = textLines.find(isLikelyCompanyName);

  return buildCandidate(
    textCandidate ? cleanupCompanyName(textCandidate) : null,
    textCandidate ? 0.62 : 0,
    textCandidate ? "Regex" : "Regex",
    textCandidate,
  );
}

function isLikelyCompanyName(value: string) {
  const normalized = removeDiacritics(value);

  if (!/(s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|sa\b|srl\b|societate|romania)/i.test(value)) {
    return false;
  }

  if (/(factura|total|data|cui|cif|cod fiscal|cod tva|tva|iban|cont|banca|client)/i.test(
    normalized,
  )) {
    return false;
  }

  return value.trim().length >= 4 && value.trim().length <= 120;
}

function cleanupCompanyName(value: string) {
  return value.replace(/\s+/g, " ").replace(/[,:;-]+$/, "").trim().slice(0, 90);
}

function cleanupPartyName(value: string) {
  return value
    .replace(/^(client|customer|buyer|bill\s+to|sold\s+to|cumparator|cumpărător|beneficiar)\s*[:#\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[,:;-]+$/, "")
    .trim()
    .slice(0, 90);
}

function findCurrencyCandidate(text: string, ocrConfidence: number): ExtractionCandidate {
  const match = text.match(/\b(RON|LEI|EUR|USD|GBP)\b/i);
  const currency = match?.[1]?.toUpperCase();

  if (!currency || currency === "LEI") {
    return buildCandidate("RON", Math.max(0.58, ocrConfidence), "OCR", match?.[0]);
  }

  return buildCandidate(currency, Math.max(0.6, ocrConfidence), "OCR", match?.[0]);
}

function detailsToFields(details: DocumentAiFieldDetails): DocumentAiExtractedFields {
  return Object.entries(details).reduce(
    (acc, [key, detail]) => ({
      ...acc,
      [key]: detail.value,
    }),
    { ...EMPTY_FIELDS },
  ) as DocumentAiExtractedFields;
}

function detailsToConfidences(details: DocumentAiFieldDetails): DocumentAiConfidenceMap {
  return Object.entries(details).reduce(
    (acc, [key, detail]) => ({
      ...acc,
      [key]: detail.confidence,
    }),
    { ...EMPTY_CONFIDENCE },
  ) as DocumentAiConfidenceMap;
}

function buildWarnings(
  details: DocumentAiFieldDetails,
  text: string,
  fileType: string,
  companyCui: string,
  layout: DocumentAiLayoutInfo,
) {
  const warnings: string[] = [];

  if (!text.trim()) {
    warnings.push("Nu s-a putut extrage text suficient din document.");
  }

  if (fileType.toLowerCase().includes("pdf") && text.trim().length < 40) {
    warnings.push(
      "PDF-ul pare scanat sau nu conține text selectabil. Pentru OCR complet, încarcă o imagine clară PNG/JPG sau folosește analiza OCR pe pagină randată.",
    );
  }

  if (!layout.hasLayoutData) {
    warnings.push("Pozitiile cuvintelor nu sunt disponibile pentru acest document.");
  }

  if (!companyCui.trim()) {
    warnings.push("Completeaza CUI-ul companiei in Setari firma pentru clasificare automata.");
  }

  Object.entries(details).forEach(([key, detail]) => {
    if (detail.warning) {
      warnings.push(`${fieldLabels[key as DocumentAiFieldKey]}: ${detail.warning}`);
    }
  });

  return Array.from(new Set(warnings));
}

function calculateOverallConfidence(confidences: DocumentAiConfidenceMap) {
  const values = Object.values(confidences);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return Math.round(average * 100);
}

function applyOcrConfidence(
  details: DocumentAiFieldDetails,
  ocrConfidence: number,
  wordCount: number,
): DocumentAiFieldDetails {
  const confidenceBoost = wordCount > 0 ? 0.04 : 0;
  const baseFloor = Math.min(0.5, Math.max(0.2, ocrConfidence - 0.12));

  return Object.entries(details).reduce((acc, [key, detail]) => {
    const hasValue = detail.value !== null && detail.value !== "";
    const adjustedConfidence = hasValue
      ? Math.max(baseFloor, Math.min(0.98, detail.confidence + confidenceBoost))
      : 0;

    return {
      ...acc,
      [key]: withFieldWarning(key as DocumentAiFieldKey, {
        ...detail,
        confidence: adjustedConfidence,
      }),
    };
  }, {} as DocumentAiFieldDetails);
}

function withFieldWarning(
  field: DocumentAiFieldKey,
  candidate: ExtractionCandidate,
): DocumentAiFieldDetail {
  const value = candidate.value;
  const hasValue = value !== null && value !== "";

  if (!hasValue) {
    return {
      ...candidate,
      value: null,
      confidence: 0,
      warning: "Camp nedetectat.",
    };
  }

  if (candidate.confidence < 0.55) {
    return {
      ...candidate,
      warning: "Necesita verificare.",
    };
  }

  if (field === "totalAmount" && Number(value) <= 0) {
    return {
      ...candidate,
      warning: "Valoarea trebuie verificata.",
    };
  }

  return candidate;
}

function buildLayoutLines(words: OcrWord[], fallbackText: string): LayoutLine[] {
  const positionedWords = words.filter((word) => word.bbox);

  if (positionedWords.length === 0) {
    return fallbackText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        text: line,
        words: [],
        confidence: 0.55,
      }));
  }

  const sortedWords = [...positionedWords].sort((a, b) => {
    const yDiff = (a.bbox?.y ?? 0) - (b.bbox?.y ?? 0);

    return Math.abs(yDiff) > 8 ? yDiff : (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0);
  });
  const groups: OcrWord[][] = [];

  sortedWords.forEach((word) => {
    const wordY = word.bbox?.y ?? 0;
    const lastGroup = groups[groups.length - 1];
    const lastGroupY = average(lastGroup?.map((item) => item.bbox?.y ?? 0) ?? []);

    if (!lastGroup || Math.abs(wordY - lastGroupY) > 12) {
      groups.push([word]);
      return;
    }

    lastGroup.push(word);
  });

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0));
    const xValues = ordered.flatMap((word) =>
      word.bbox ? [word.bbox.x, word.bbox.x + word.bbox.width] : [],
    );
    const yValues = ordered.flatMap((word) =>
      word.bbox ? [word.bbox.y, word.bbox.y + word.bbox.height] : [],
    );
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);
    const maxX = Math.max(...xValues);
    const maxY = Math.max(...yValues);

    return {
      text: ordered.map((word) => word.text).join(" "),
      words: ordered,
      confidence: average(ordered.map((word) => word.confidence ?? 0.55)),
      bbox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  });
}

function summarizeLayout(words: OcrWord[], lines: LayoutLine[]): DocumentAiLayoutInfo {
  const wordsWithPosition = words.filter((word) => word.bbox).length;
  const confidences = words
    .map((word) => word.confidence)
    .filter((value): value is number => typeof value === "number");
  const lineConfidences = lines
    .map((line) => line.confidence)
    .filter((value) => Number.isFinite(value));
  const fallbackWordCount = lines.reduce(
    (sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );

  return {
    wordCount: words.length > 0 ? words.length : fallbackWordCount,
    wordsWithPosition,
    averageWordConfidence:
      confidences.length > 0
        ? average(confidences)
        : lineConfidences.length > 0
          ? average(lineConfidences)
          : 0,
    detectedLines: lines.length,
    hasLayoutData: wordsWithPosition > 0,
  };
}

function findLabelLine(lines: LayoutLine[], labels: string[]) {
  return findLabelLineCandidates(lines, labels)[0] ?? null;
}

function findLabelLineCandidates(lines: LayoutLine[], labels: string[]) {
  const normalizedLabels = labels.map(removeDiacritics);
  const matches: Array<{ index: number; line: LayoutLine }> = [];
  const seenIndexes = new Set<number>();

  for (const label of normalizedLabels) {
    for (let index = 0; index < lines.length; index += 1) {
      const normalizedLine = removeDiacritics(lines[index].text);

      if (normalizedLine.includes(label) && !seenIndexes.has(index)) {
        matches.push({
          index,
          line: lines[index],
        });
        seenIndexes.add(index);
      }
    }
  }

  return matches;
}

function hasExcludedAmountTerm(text: string, excludedTerms: string[] = []) {
  const normalizedText = removeDiacritics(text);

  return excludedTerms.map(removeDiacritics).some((term) => normalizedText.includes(term));
}

function isTaxIdentifierLine(value: string) {
  const normalized = removeDiacritics(value);

  return /\b(gstin|cui|cif|cod\s+fiscal|cod\s+tva|vat\s+(?:id|code|no|number)|tax\s+(?:id|no|number)|gst\s+(?:id|no|number))\b/i.test(
    normalized,
  );
}

function findTextBlock(lines: string[], labels: string[]) {
  const labelPattern = new RegExp(`\\b(${labels.join("|")})\\b`, "i");
  const index = lines.findIndex(
    (line) => labelPattern.test(removeDiacritics(line)) && !isAccountReferenceLine(line),
  );

  if (index < 0) {
    return "";
  }

  return lines.slice(index, index + 5).join("\n");
}

function isAccountReferenceLine(value: string) {
  const normalized = removeDiacritics(value);

  return /\b(cont\s+client|client\s+account|account\s+number|customer\s+account|numar\s+cont|nr\.?\s+cont|cod\s+client)\b/i.test(
    normalized,
  );
}

function isInvoiceMetadataLine(value: string) {
  const normalized = removeDiacritics(value);

  return (
    /\b(data\s+facturii|data\s+scadent|seria\s+si\s+numarul\s+facturii|perioada\s+de\s+facturare|factura\s+curenta|total|tva|rest\s+de\s+plata)\b/i.test(
      normalized,
    ) ||
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(value)
  );
}

function findLayoutBlock(lines: LayoutLine[], labels: string[]) {
  const labelLine = findLabelLine(lines, labels);

  if (!labelLine) {
    return [];
  }

  return lines.slice(labelLine.index, labelLine.index + 5);
}

function findPartyName(block: string, labels: string[]) {
  if (!block.trim()) {
    return null;
  }

  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const labelPattern = new RegExp(`^\\s*(${labels.join("|")})\\s*[:\\-]?\\s*`, "i");

  for (const line of lines) {
    if (isAccountReferenceLine(line)) {
      continue;
    }

    const candidate = line.replace(labelPattern, "").trim();

    if (
      candidate &&
      candidate.length > 2 &&
      !isAccountReferenceLine(candidate) &&
      !/\b\d{5,}\b/.test(candidate) &&
      !/(cui|cif|cod fiscal|cod tva|tva|vat code|iban|banca)/i.test(candidate)
    ) {
      return candidate.slice(0, 90);
    }
  }

  return null;
}

function extractInvoiceNumberFromText(text: string) {
  const patterns = [
    /invoice\s*(?:#|no\.?|number)?\s*[:#-]?\s*([A-Z]{2,}[A-Z0-9]*(?:[/-][A-Z0-9]+)+)/i,
    /invoice\s*(?:#|no\.?|number)?[^\n\rA-Z0-9]{0,20}([A-Z]{2,}[A-Z0-9./-]{2,40})/i,
    /seria\s+(?:si|și|şi)\s+num[aă]rul\s+facturii[^\w]{0,40}([A-Z0-9][A-Z0-9./-]{3,40})/i,
    /(?:nr\.?\s+factura|num[aă]r\s+factura|factura\s*(?:nr\.?|num[aă]r)?|invoice\s*(?:no\.?|number)?)[^\w]{0,40}([A-Z0-9][A-Z0-9./-]{2,40})/i,
    /(?:factura(?:\s+fiscala)?\s*(?:nr\.?|numar)?|nr\.?\s*factura|numar\s+factura|invoice\s*(?:no\.?|number)?)[^\w]{0,12}([A-Z0-9][A-Z0-9./-]{1,30})/i,
    /\b(?:serie\s+si\s+numar|seria)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{1,30})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    const candidate = match?.[1]?.replace(/[.,;:]$/, "").trim();

    if (candidate && /\d/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractDateFromText(text: string) {
  const match = text.match(
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/i,
  );

  return match?.[1] ? normalizeDate(match[1]) : null;
}

function findFirstNormalizedDate(text: string) {
  const datePattern =
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/gi;

  for (const match of text.matchAll(datePattern)) {
    const normalizedDate = normalizeDate(match[1]);

    if (normalizedDate) {
      return {
        value: normalizedDate,
        sourceText: match[1],
      };
    }
  }

  return null;
}

function parseAmountFromText(text: string, options: AmountMatchOptions = {}) {
  const parsed = findAmountsInText(text, options);

  if (parsed.length === 0) {
    return null;
  }

  return parsed[parsed.length - 1];
}

function parseFirstAmountFromText(text: string, options: AmountMatchOptions = {}) {
  return findAmountsInText(text, options)[0] ?? null;
}

function findAmountsInText(text: string, options: AmountMatchOptions = {}) {
  const amountPattern = /-?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:[,.]\s*\d{1,2})?/g;

  return Array.from(text.matchAll(amountPattern))
    .filter((match) => {
      const index = match.index ?? 0;
      const tail = text.slice(index + match[0].length).trimStart();

      return (
        !tail.startsWith("%") &&
        isAllowedMonetaryToken(match[0], options.maxIntegerDigits)
      );
    })
    .map((match) => parseAmount(match[0]))
    .filter((value): value is number => value !== null);
}

function isAllowedMonetaryToken(value: string, maxIntegerDigits?: number) {
  if (!maxIntegerDigits) {
    return true;
  }

  const compact = value.replace(/\s+/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const integerPart = (decimalIndex >= 0 ? compact.slice(0, decimalIndex) : compact).replace(
    /\D/g,
    "",
  );

  return integerPart.length <= maxIntegerDigits;
}

function amountCandidateToDebug(candidate: AmountCandidate) {
  return {
    value: candidate.value,
    sourceText: candidate.sourceText,
    method: candidate.method,
  };
}

function candidateToDebugList(candidate: ExtractionCandidate) {
  if (typeof candidate.value !== "number") {
    return [];
  }

  return [
    {
      value: candidate.value,
      sourceText: candidate.sourceText,
      method: candidate.method,
    },
  ];
}

function inferSubtotal(totalAmount: number | null, vatAmount: number | null) {
  if (totalAmount === null || vatAmount === null) {
    return null;
  }

  return Math.max(totalAmount - vatAmount, 0);
}

function findAllCuis(text: string) {
  const matches = Array.from(
    text.matchAll(
      /(?:CUI|CIF|COD\s+FISCAL|COD\s+UNIC|COD\s+TVA|GSTIN|GST\s*(?:NO\.?|NUMBER|ID)?|VAT\s+(?:CODE|NO\.?|NUMBER|ID)|TAX\s*(?:ID|NO\.?|NUMBER))[^A-Z0-9]{0,20}((?:RO\s*)?[A-Z0-9]{5,20})/gi,
    ),
  ).map((match) => match[1]);

  return Array.from(
    new Set(matches.map((value) => value.replace(/\s+/g, "").toUpperCase()).filter(Boolean)),
  );
}

function extractCui(text: string) {
  return findAllCuis(text)[0] ?? null;
}

function parseAmount(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const compact = value.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");

  if (!compact) {
    return null;
  }

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const normalized =
    decimalSeparator === ","
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string) {
  const parts = value.replace(/[./\s]/g, "-").split("-").filter(Boolean);

  if (parts[0]?.length === 4) {
    const [year, month, day] = parts;
    const normalizedMonth = normalizeMonth(month);

    return isValidDateParts(year, normalizedMonth, day)
      ? `${year}-${padDate(normalizedMonth)}-${padDate(day)}`
      : "";
  }

  const [day, month, yearPart] = parts;
  const year = yearPart?.length === 2 ? `20${yearPart}` : yearPart;
  const normalizedMonth = normalizeMonth(month);

  return isValidDateParts(year, normalizedMonth, day)
    ? `${year}-${padDate(normalizedMonth)}-${padDate(day)}`
    : "";
}

function normalizeMonth(value: string | undefined) {
  if (!value) {
    return "";
  }

  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const normalized = value.slice(0, 4).toLowerCase();
  const shortMonth = value.slice(0, 3).toLowerCase();

  return monthMap[normalized] ?? monthMap[shortMonth] ?? value;
}

function isValidDateParts(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  return (
    Number.isInteger(numericYear) &&
    Number.isInteger(numericMonth) &&
    Number.isInteger(numericDay) &&
    numericYear >= 1900 &&
    numericYear <= 2100 &&
    numericMonth >= 1 &&
    numericMonth <= 12 &&
    numericDay >= 1 &&
    numericDay <= 31
  );
}

function padDate(value: string | undefined) {
  return String(value ?? "1").padStart(2, "0");
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.55;
  }

  return Math.max(0, Math.min(value / 100, 1));
}

function extractOcrWords(data: unknown): OcrWord[] {
  const page = data as {
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          words?: Array<{
            text?: string;
            confidence?: number;
            bbox?: {
              x0?: number;
              y0?: number;
              x1?: number;
              y1?: number;
            };
          }>;
        }>;
      }>;
    }> | null;
  };

  return (
    page.blocks?.flatMap(
      (block) =>
        block.paragraphs?.flatMap(
          (paragraph) =>
            paragraph.lines?.flatMap(
              (line) =>
                line.words
                  ?.map((word) => {
                    const text = word.text?.trim();

                    if (!text) {
                      return null;
                    }

                    return {
                      text,
                      confidence: normalizePercent(word.confidence),
                      bbox:
                        typeof word.bbox?.x0 === "number" &&
                        typeof word.bbox?.y0 === "number" &&
                        typeof word.bbox?.x1 === "number" &&
                        typeof word.bbox?.y1 === "number"
                          ? {
                              x: word.bbox.x0,
                              y: word.bbox.y0,
                              width: word.bbox.x1 - word.bbox.x0,
                              height: word.bbox.y1 - word.bbox.y0,
                            }
                          : undefined,
                    };
                  })
                  .filter((word): word is OcrWord => Boolean(word)) ?? [],
            ) ?? [],
        ) ?? [],
    ) ?? []
  );
}

function translateOcrStatus(status: string | undefined) {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized.includes("recognizing")) {
    return "Se extrage textul";
  }

  if (normalized.includes("loading")) {
    return "Se pregateste OCR";
  }

  return "Se proceseaza documentul";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "document";
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function removeDiacritics(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function average(values: number[]) {
  const cleanValues = values.filter((value) => Number.isFinite(value));

  if (cleanValues.length === 0) {
    return 0;
  }

  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

function buildCandidate(
  value: DocumentAiFieldValue,
  confidence: number,
  method: DocumentAiExtractionMethod,
  sourceText?: string,
): ExtractionCandidate {
  return {
    value,
    confidence: Math.max(0, Math.min(confidence, 0.98)),
    method,
    sourceText,
  };
}
