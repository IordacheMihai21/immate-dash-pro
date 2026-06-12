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

export type DocumentAiExtractedFields = Record<DocumentAiFieldKey, DocumentAiFieldValue>;

export type DocumentAiConfidenceMap = Record<DocumentAiFieldKey, number>;

export type DocumentAiAnalysis = {
  fileName: string;
  fileType: string;
  extractedText: string;
  ocrConfidence: number;
  overallConfidence: number;
  fields: DocumentAiExtractedFields;
  confidences: DocumentAiConfidenceMap;
  warnings: string[];
  classification: InvoiceClassification;
  companyCui: string;
};

export type OcrProgress = {
  status: string;
  progress: number;
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
  const fields = extractInvoiceFields(extraction.text);
  const confidences = estimateFieldConfidence(fields, extraction.text, extraction.confidence);
  const warnings = buildWarnings(fields, extraction.text, file.type, companyCui);
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
    warnings,
    classification,
    companyCui,
  };
}

async function extractText(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<{ text: string; confidence: number }> {
  if (isPdfFile(file)) {
    onProgress?.({ status: "Se citeste continutul PDF", progress: 0.2 });
    const pdfText = await extractReadablePdfText(file);

    if (pdfText.trim().length >= 40) {
      onProgress?.({ status: "Text extras din PDF", progress: 1 });

      return {
        text: pdfText,
        confidence: 0.72,
      };
    }

    onProgress?.({ status: "PDF-ul necesita verificare", progress: 1 });

    return {
      text: pdfText,
      confidence: 0.2,
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
    };
  } catch {
    const result = await tesseract.recognize(file, "eng", { logger });

    return {
      text: result.data.text ?? "",
      confidence: normalizePercent(result.data.confidence),
    };
  }
}

async function extractReadablePdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder("latin1").decode(buffer);
  const chunks = decoded.replace(/\r/g, "\n").match(/[A-Za-z0-9ĂÂÎȘȚăâîșț.,:;/%+\-\s]{6,}/g);

  return (chunks ?? []).join(" ").replace(/\s+/g, " ").trim();
}

function extractInvoiceFields(text: string): DocumentAiExtractedFields {
  const normalizedText = text.replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const supplierBlock = findBlock(lines, ["furnizor", "vanzator", "emitent", "supplier", "seller"]);
  const customerBlock = findBlock(lines, [
    "client",
    "cumparator",
    "beneficiar",
    "customer",
    "buyer",
  ]);
  const allCuis = findAllCuis(normalizedText);
  const supplierCui = extractCui(supplierBlock) ?? allCuis[0] ?? null;
  const customerCui =
    extractCui(customerBlock) ?? allCuis.find((cui) => cui !== supplierCui) ?? null;

  const totalAmount = findAmount(normalizedText, [
    "total de plata",
    "total plata",
    "total factura",
    "valoare totala",
    "grand total",
    "amount due",
    "total",
  ]);
  const vatAmount = findAmount(normalizedText, [
    "total tva",
    "valoare tva",
    "tva",
    "vat amount",
    "vat",
  ]);
  const subtotal =
    findAmount(normalizedText, [
      "baza fara tva",
      "valoare fara tva",
      "subtotal",
      "tax exclusive",
      "net amount",
    ]) ?? inferSubtotal(totalAmount, vatAmount);

  return {
    invoiceNumber: findInvoiceNumber(normalizedText),
    invoiceDate: findInvoiceDate(normalizedText),
    supplierName: findPartyName(supplierBlock, ["furnizor", "supplier", "vanzator"]),
    supplierCui,
    customerName: findPartyName(customerBlock, ["client", "customer", "cumparator"]),
    customerCui,
    subtotal,
    vatAmount,
    totalAmount,
    currency: findCurrency(normalizedText),
  };
}

function estimateFieldConfidence(
  fields: DocumentAiExtractedFields,
  text: string,
  ocrConfidence: number,
): DocumentAiConfidenceMap {
  const textSignal = text.trim().length > 40 ? 0.12 : 0;
  const base = Math.min(0.94, Math.max(0.35, ocrConfidence + textSignal));

  return {
    invoiceNumber: fields.invoiceNumber ? base : 0,
    invoiceDate: fields.invoiceDate ? base : 0,
    supplierName: fields.supplierName ? base - 0.08 : 0,
    supplierCui: fields.supplierCui ? base : 0,
    customerName: fields.customerName ? base - 0.08 : 0,
    customerCui: fields.customerCui ? base : 0,
    subtotal: fields.subtotal ? base - 0.04 : 0,
    vatAmount: fields.vatAmount ? base - 0.02 : 0,
    totalAmount: fields.totalAmount ? base : 0,
    currency: fields.currency ? Math.min(0.96, base + 0.02) : 0,
  };
}

function buildWarnings(
  fields: DocumentAiExtractedFields,
  text: string,
  fileType: string,
  companyCui: string,
) {
  const warnings: string[] = [];

  if (!text.trim()) {
    warnings.push("Nu s-a putut extrage text suficient din document.");
  }

  if (fileType === "application/pdf" && text.trim().length < 40) {
    warnings.push("Pentru PDF scanat, incarca o imagine clara a facturii.");
  }

  if (!companyCui.trim()) {
    warnings.push("Completeaza CUI-ul companiei in Setari firma pentru clasificare automata.");
  }

  if (!fields.invoiceNumber) {
    warnings.push("Numarul facturii nu a fost identificat clar.");
  }

  if (!fields.invoiceDate) {
    warnings.push("Data facturii nu a fost identificata clar.");
  }

  if (!fields.supplierCui || !fields.customerCui) {
    warnings.push("CUI-ul furnizorului sau al clientului necesita verificare.");
  }

  if (!fields.totalAmount) {
    warnings.push("Totalul facturii nu a fost identificat clar.");
  }

  return warnings;
}

function calculateOverallConfidence(confidences: DocumentAiConfidenceMap) {
  const values = Object.values(confidences);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return Math.round(average * 100);
}

function findBlock(lines: string[], labels: string[]) {
  const labelPattern = new RegExp(`\\b(${labels.join("|")})\\b`, "i");
  const index = lines.findIndex((line) => labelPattern.test(removeDiacritics(line)));

  if (index < 0) {
    return "";
  }

  return lines.slice(index, index + 5).join("\n");
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
    const candidate = line.replace(labelPattern, "").trim();

    if (
      candidate &&
      candidate.length > 2 &&
      !/(cui|cif|cod fiscal|tva|vat|iban|banca)/i.test(candidate)
    ) {
      return candidate.slice(0, 90);
    }
  }

  return null;
}

function findInvoiceNumber(text: string) {
  const patterns = [
    /(?:factura(?:\s+fiscala)?\s*(?:nr\.?|numar)?|nr\.?\s*factura|numar\s+factura|invoice\s*(?:no\.?|number)?)[^\w]{0,12}([A-Z0-9][A-Z0-9./-]{1,30})/i,
    /\b(?:serie\s+si\s+numar|seria)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{1,30})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].replace(/[.,;:]$/, "").trim();
    }
  }

  return null;
}

function findInvoiceDate(text: string) {
  const dateNearLabel = text.match(
    /(?:data\s+(?:facturii|emiterii)|invoice\s+date|issue\s+date)[^\d]{0,20}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i,
  );
  const fallback = text.match(
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/,
  );
  const value = dateNearLabel?.[1] ?? fallback?.[1];

  return value ? normalizeDate(value) : null;
}

function findCurrency(text: string) {
  const match = text.match(/\b(RON|LEI|EUR|USD|GBP)\b/i);
  const currency = match?.[1]?.toUpperCase();

  if (!currency || currency === "LEI") {
    return "RON";
  }

  return currency;
}

function findAmount(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}[^0-9-]{0,35}(-?\\d[\\d\\s.,]*)`, "i");
    const match = text.match(pattern);
    const parsed = parseAmount(match?.[1]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function inferSubtotal(totalAmount: number | null, vatAmount: number | null) {
  if (totalAmount === null || vatAmount === null) {
    return null;
  }

  return Math.max(totalAmount - vatAmount, 0);
}

function findAllCuis(text: string) {
  const matches = text.match(/\b(?:RO\s*)?\d{5,12}\b/gi) ?? [];

  return Array.from(
    new Set(matches.map((value) => value.replace(/\s+/g, "").toUpperCase()).filter(Boolean)),
  );
}

function extractCui(text: string) {
  const directMatch = text.match(
    /(?:CUI|CIF|COD\s+FISCAL|COD\s+UNIC|VAT|TVA)[^A-Z0-9]{0,12}((?:RO\s*)?\d{5,12})/i,
  );

  if (directMatch?.[1]) {
    return directMatch[1].replace(/\s+/g, "").toUpperCase();
  }

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
  const parts = value.replace(/[./]/g, "-").split("-");

  if (parts[0]?.length === 4) {
    const [year, month, day] = parts;

    return `${year}-${padDate(month)}-${padDate(day)}`;
  }

  const [day, month, yearPart] = parts;
  const year = yearPart?.length === 2 ? `20${yearPart}` : yearPart;

  return `${year}-${padDate(month)}-${padDate(day)}`;
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
