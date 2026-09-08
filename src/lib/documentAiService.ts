import { classifyInvoiceByCui, type InvoiceClassification } from "./cuiUtils.ts";
import { getActiveCompanyId, getCompanyProfileById } from "./companyService";
import {
  calculateDocumentConfidence as calculateCandidateDocumentConfidence,
  extractInvoiceCandidates,
  type CandidateFieldResult,
} from "./invoiceCandidateEngine";
import {
  attachBboxToTextLines,
  buildLayoutLines,
  type LayoutLine,
  type OcrWord,
} from "./layoutLines.ts";

export { buildLayoutLines, type LayoutLine, type OcrWord };

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

export type DocumentAiExtractionMethod =
  "OCR" | "Regex" | "Layout heuristic" | "Hybrid LayoutXLM + candidate engine" | "User verified";

export type DocumentAiExtractedFields = Record<DocumentAiFieldKey, DocumentAiFieldValue>;

export type DocumentAiConfidenceMap = Record<DocumentAiFieldKey, number>;

export type DocumentAiProfile = "romanian_efactura" | "generic_invoice" | "fatura_dataset";

export type DocumentAiFieldDetail = {
  value: DocumentAiFieldValue;
  normalizedValue?: string | number | null;
  confidence: number;
  method: DocumentAiExtractionMethod;
  warning?: string;
  sourceText?: string;
  alternatives?: Array<{
    value: string | number;
    normalizedValue: string | number;
    confidence: number;
    sourceText: string;
  }>;
};

export type DocumentAiFieldDetails = Record<DocumentAiFieldKey, DocumentAiFieldDetail>;

export type DocumentAiLayoutInfo = {
  wordCount: number;
  wordsWithPosition: number;
  averageWordConfidence: number;
  detectedLines: number;
  hasLayoutData: boolean;
};

export type DocumentAiOcrAttempt = {
  variant: string;
  label: string;
  confidence: number;
  wordCount: number;
  usefulWordCount: number;
  invoiceKeywordCount: number;
  score: number;
  selected?: boolean;
  error?: string;
};

export type DocumentAiOcrDetails = {
  selectedVariant: string;
  selectedLabel: string;
  confidence: number;
  wordCount: number;
  usefulWordCount: number;
  invoiceKeywordCount: number;
  score: number;
  preprocessingApplied: boolean;
  attempts: DocumentAiOcrAttempt[];
};

export type DocumentAiAnalysis = {
  fileName: string;
  fileType: string;
  extractedText: string;
  ocrConfidence: number;
  overallConfidence: number;
  visibleOverallConfidence?: number;
  documentProfile?: DocumentAiProfile;
  applicableConfidenceFields?: DocumentAiFieldKey[];
  coreFieldsDetected?: number;
  fields: DocumentAiExtractedFields;
  confidences: DocumentAiConfidenceMap;
  fieldDetails: DocumentAiFieldDetails;
  ocrWords: OcrWord[];
  layout: DocumentAiLayoutInfo;
  ocrDetails?: DocumentAiOcrDetails;
  warnings: string[];
  classification: InvoiceClassification;
  companyCui: string;
  inferenceMode?: "candidate_engine_baseline" | "hybrid_layoutxlm_candidate_engine";
  uiPipelineVersion?: number;
};

export type OcrProgress = {
  status: string;
  progress: number;
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

type TextExtractionResult = {
  text: string;
  confidence: number;
  words: OcrWord[];
  ocrDetails?: DocumentAiOcrDetails;
};

type TesseractRecognizeResult = {
  data: {
    text?: string;
    confidence?: number | null;
  } & Record<string, unknown>;
};

type TesseractLike = {
  recognize: (
    image: unknown,
    language: string,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void;
    },
  ) => Promise<TesseractRecognizeResult>;
};

type OcrImageVariant = {
  variant: string;
  label: string;
  input: File | Blob;
  preprocessingApplied: boolean;
};

type OcrVariantResult = TextExtractionResult & {
  variant: string;
  label: string;
  usefulWordCount: number;
  invoiceKeywordCount: number;
  score: number;
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
  currency: null,
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

const OCR_KEYWORDS = [
  "invoice",
  "date",
  "total",
  "tax",
  "vat",
  "gst",
  "subtotal",
  "buyer",
  "seller",
  "address",
  "cui",
  "cif",
  "tva",
  "factura",
];

const MAX_OCR_IMAGE_DIMENSION = 3200;

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

  // The active company's own CUI, not "whichever company the current auth
  // user personally owns" -- matters for an accountant processing a
  // client's document while viewing that client's company, not their own.
  const companyProfile = await getActiveCompanyId()
    .then((companyId) => getCompanyProfileById(companyId))
    .catch(() => null);
  const companyCui = companyProfile?.cui ?? "";
  const extraction = await extractText(file, onProgress);
  // buildLayoutLines re-derives lines from word positions -- fine for
  // summarizeLayout (a diagnostic summary, not extraction), but confirmed
  // to change line boundaries just enough to measurably hurt real-invoice
  // extraction accuracy (89.1% -> 86.2% on the real benchmark), because
  // every regex/heuristic in invoiceCandidateEngine.ts was tuned against
  // Tesseract's own plain-text line boundaries specifically. Extraction
  // uses attachBboxToTextLines instead, which keeps those exact boundaries
  // and only attaches bbox as metadata (verified neutral to accuracy).
  const layoutLines = buildLayoutLines(extraction.words, extraction.text);
  const layout = summarizeLayout(extraction.words, layoutLines);
  const extractionLines = attachBboxToTextLines(extraction.text, extraction.words);
  const fieldDetails = extractInvoiceFieldDetails(
    extraction.text,
    extraction.words,
    extractionLines,
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
  const overallConfidence = calculateCandidateDocumentConfidence({
    fields: fieldDetails,
    ocrConfidence: extraction.confidence,
    consistencyScore: calculateFinancialConsistency(fieldDetails),
  });
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
    ocrDetails: extraction.ocrDetails,
    warnings,
    classification,
    companyCui,
  };
}

async function extractText(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<TextExtractionResult> {
  if (isPdfFile(file)) {
    onProgress?.({ status: "Se extrage textul din PDF", progress: 0.2 });
    const pdfText = await extractSelectablePdfText(file, onProgress);

    if (pdfText.trim().length >= 40) {
      onProgress?.({ status: "Text extras din PDF", progress: 1 });
      const ocrDetails = buildOcrDetailsFromText(
        "pdf-text",
        "Text PDF selectabil",
        pdfText,
        0.72,
        [],
      );

      return {
        text: pdfText,
        confidence: 0.72,
        words: [],
        ocrDetails,
      };
    }

    onProgress?.({ status: "PDF-ul necesita verificare", progress: 1 });
    const ocrDetails = buildOcrDetailsFromText("pdf-text", "Text PDF verificat", pdfText, 0.2, []);

    return {
      text: pdfText,
      confidence: 0.2,
      words: [],
      ocrDetails,
    };
  }

  onProgress?.({ status: "Se pregateste preprocesarea imaginii", progress: 0.05 });

  const tesseractModule = await import("tesseract.js");
  const tesseract = tesseractModule.default as unknown as TesseractLike;
  const variants = await createImageOcrVariants(file);
  const results: OcrVariantResult[] = [];
  const failedAttempts: DocumentAiOcrAttempt[] = [];

  for (const [index, variant] of variants.entries()) {
    const baseProgress = 0.08 + (index / variants.length) * 0.84;
    const progressSpan = 0.84 / variants.length;
    const logger = (message: { status?: string; progress?: number }) => {
      if (typeof message.progress === "number") {
        onProgress?.({
          status: `OCR ${index + 1}/${variants.length}: ${variant.label}`,
          progress: Math.max(0.08, Math.min(baseProgress + message.progress * progressSpan, 0.95)),
        });
      } else if (message.status) {
        onProgress?.({
          status: translateOcrStatus(message.status),
          progress: Math.max(0.08, Math.min(baseProgress, 0.95)),
        });
      }
    };

    try {
      const extraction = await recognizeImageVariant(tesseract, variant.input, logger);
      const score = scoreOcrResult(extraction.text, extraction.confidence, extraction.words);

      results.push({
        ...extraction,
        variant: variant.variant,
        label: variant.label,
        usefulWordCount: score.usefulWordCount,
        invoiceKeywordCount: score.invoiceKeywordCount,
        score: score.score,
      });
    } catch (error) {
      failedAttempts.push({
        variant: variant.variant,
        label: variant.label,
        confidence: 0,
        wordCount: 0,
        usefulWordCount: 0,
        invoiceKeywordCount: 0,
        score: 0,
        error:
          error instanceof Error ? error.message : "OCR-ul nu a putut procesa aceasta varianta.",
      });
    }
  }

  const bestResult = results.sort((a, b) => b.score - a.score)[0];

  if (!bestResult) {
    onProgress?.({ status: "OCR-ul necesita verificare", progress: 1 });

    return {
      text: "",
      confidence: 0,
      words: [],
      ocrDetails: {
        selectedVariant: "none",
        selectedLabel: "Nicio varianta selectata",
        confidence: 0,
        wordCount: 0,
        usefulWordCount: 0,
        invoiceKeywordCount: 0,
        score: 0,
        preprocessingApplied: true,
        attempts: failedAttempts,
      },
    };
  }

  onProgress?.({ status: `OCR selectat: ${bestResult.label}`, progress: 1 });

  return {
    text: bestResult.text,
    confidence: bestResult.confidence,
    words: bestResult.words,
    ocrDetails: buildOcrDetailsFromVariant(bestResult, variants, results, failedAttempts),
  };
}

async function recognizeImageVariant(
  tesseract: TesseractLike,
  input: File | Blob,
  logger: (message: { status?: string; progress?: number }) => void,
): Promise<TextExtractionResult> {
  try {
    const result = await tesseract.recognize(input, "ron+eng", { logger });

    return {
      text: result.data.text ?? "",
      confidence: normalizePercent(result.data.confidence),
      words: extractOcrWords(result.data),
    };
  } catch {
    const result = await tesseract.recognize(input, "eng", { logger });

    return {
      text: result.data.text ?? "",
      confidence: normalizePercent(result.data.confidence),
      words: extractOcrWords(result.data),
    };
  }
}

async function createImageOcrVariants(file: File): Promise<OcrImageVariant[]> {
  const image = await loadImageElement(file);

  try {
    const variants: OcrImageVariant[] = [
      {
        variant: "original",
        label: "Original",
        input: file,
        preprocessingApplied: false,
      },
    ];
    const preprocessingModes: Array<{
      variant: OcrImageVariant["variant"];
      label: string;
      mode: Parameters<typeof createProcessedImageBlob>[1];
    }> = [
      { variant: "grayscale", label: "Tonuri de gri", mode: "grayscale" },
      { variant: "contrast", label: "Contrast imbunatatit", mode: "contrast" },
      { variant: "resized-2x", label: "Redimensionat 2x", mode: "resized-2x" },
      { variant: "threshold", label: "Binarizat", mode: "threshold" },
      { variant: "sharpened", label: "Claritate imbunatatita", mode: "sharpened" },
    ];

    for (const mode of preprocessingModes) {
      try {
        variants.push({
          variant: mode.variant,
          label: mode.label,
          input: await createProcessedImageBlob(image, mode.mode),
          preprocessingApplied: true,
        });
      } catch (error) {
        console.debug("Document AI OCR preprocessing skipped", {
          variant: mode.variant,
          error: error instanceof Error ? error.message : "Preprocesare indisponibila",
        });
      }
    }

    return variants;
  } finally {
    if (image.src.startsWith("blob:")) {
      URL.revokeObjectURL(image.src);
    }
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imaginea nu a putut fi incarcata pentru preprocesare."));
    };
    image.src = url;
  });
}

async function createProcessedImageBlob(
  image: HTMLImageElement,
  mode: "grayscale" | "contrast" | "resized-2x" | "threshold" | "sharpened",
) {
  const scale = getImageScale(image, mode === "resized-2x" ? 2 : 1);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas-ul nu este disponibil pentru preprocesarea imaginii.");
  }

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (mode !== "resized-2x") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    if (mode === "grayscale") {
      applyGrayscale(imageData);
    }

    if (mode === "contrast") {
      applyContrast(imageData, 1.55);
    }

    if (mode === "threshold") {
      applyThreshold(imageData, computeOtsuThreshold(imageData));
    }

    if (mode === "sharpened") {
      applyContrast(imageData, 1.2);
      applySharpen(imageData);
    }

    context.putImageData(imageData, 0, 0);
  }

  return canvasToBlob(canvas);
}

function getImageScale(image: HTMLImageElement, requestedScale: number) {
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);

  if (maxDimension <= 0) {
    return 1;
  }

  return Math.min(requestedScale, MAX_OCR_IMAGE_DIMENSION / maxDimension);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Varianta OCR nu a putut fi generata."));
    }, "image/png");
  });
}

function applyGrayscale(imageData: ImageData) {
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );

    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
}

function applyContrast(imageData: ImageData, factor: number) {
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clampByte((gray - 128) * factor + 128);

    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
}

/**
 * Otsu's method: picks the threshold that best splits the grayscale histogram into
 * two classes (ink vs. paper) by maximizing between-class variance, instead of a
 * fixed guess -- adapts per-document to lighting/scan exposure instead of assuming
 * every image has the same brightness.
 */
function computeOtsuThreshold(imageData: ImageData): number {
  const { data } = imageData;
  const histogram = new Array(256).fill(0);
  let totalPixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );

    histogram[gray] += 1;
    totalPixels += 1;
  }

  let sumAll = 0;
  for (let level = 0; level < 256; level += 1) {
    sumAll += level * histogram[level];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let bestThreshold = 128;
  let bestVariance = 0;

  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level];

    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = totalPixels - weightBackground;

    if (weightForeground === 0) {
      break;
    }

    sumBackground += level * histogram[level];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const betweenVariance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance;
      bestThreshold = level;
    }
  }

  return bestThreshold;
}

function applyThreshold(imageData: ImageData, threshold: number) {
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const value = gray >= threshold ? 255 : 0;

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
}

function applySharpen(imageData: ImageData) {
  const { width, height, data } = imageData;
  const source = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + channel;
            const kernelIndex = (ky + 1) * 3 + (kx + 1);

            value += source[pixelIndex] * kernel[kernelIndex];
          }
        }

        data[(y * width + x) * 4 + channel] = clampByte(value);
      }
    }
  }
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function scoreOcrResult(text: string, confidence: number, words: OcrWord[]) {
  const wordCount = words.length > 0 ? words.length : countWords(text);
  const usefulWordCount = countUsefulWords(text);
  const invoiceKeywordCount = countInvoiceKeywords(text);
  const usefulWordFactor = Math.min(usefulWordCount / 250, 1);
  const keywordFactor = Math.min(invoiceKeywordCount / 8, 1);
  const shortTextPenalty = text.trim().length < 80 || wordCount < 10 ? 0.15 : 0;
  const score = Math.max(
    0,
    Math.min(
      1,
      confidence * 0.5 + usefulWordFactor * 0.25 + keywordFactor * 0.25 - shortTextPenalty,
    ),
  );

  return {
    score,
    wordCount,
    usefulWordCount,
    invoiceKeywordCount,
  };
}

function buildOcrDetailsFromVariant(
  bestResult: OcrVariantResult,
  variants: OcrImageVariant[],
  results: OcrVariantResult[],
  failedAttempts: DocumentAiOcrAttempt[],
): DocumentAiOcrDetails {
  const attempts: DocumentAiOcrAttempt[] = [
    ...results.map((result) => ({
      variant: result.variant,
      label: result.label,
      confidence: result.confidence,
      wordCount: result.words.length > 0 ? result.words.length : countWords(result.text),
      usefulWordCount: result.usefulWordCount,
      invoiceKeywordCount: result.invoiceKeywordCount,
      score: result.score,
      selected: result.variant === bestResult.variant,
    })),
    ...failedAttempts,
  ].sort((a, b) => b.score - a.score);

  const selectedVariant = variants.find((variant) => variant.variant === bestResult.variant);

  return {
    selectedVariant: bestResult.variant,
    selectedLabel: bestResult.label,
    confidence: bestResult.confidence,
    wordCount: bestResult.words.length > 0 ? bestResult.words.length : countWords(bestResult.text),
    usefulWordCount: bestResult.usefulWordCount,
    invoiceKeywordCount: bestResult.invoiceKeywordCount,
    score: bestResult.score,
    preprocessingApplied: Boolean(selectedVariant?.preprocessingApplied),
    attempts,
  };
}

function buildOcrDetailsFromText(
  variant: string,
  label: string,
  text: string,
  confidence: number,
  words: OcrWord[],
): DocumentAiOcrDetails {
  const score = scoreOcrResult(text, confidence, words);

  return {
    selectedVariant: variant,
    selectedLabel: label,
    confidence,
    wordCount: score.wordCount,
    usefulWordCount: score.usefulWordCount,
    invoiceKeywordCount: score.invoiceKeywordCount,
    score: score.score,
    preprocessingApplied: false,
    attempts: [
      {
        variant,
        label,
        confidence,
        wordCount: score.wordCount,
        usefulWordCount: score.usefulWordCount,
        invoiceKeywordCount: score.invoiceKeywordCount,
        score: score.score,
        selected: true,
      },
    ],
  };
}

async function extractSelectablePdfText(file: File, onProgress?: (progress: OcrProgress) => void) {
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
  const extraction = extractInvoiceCandidates({
    text,
    // Deliberately not forwarding line.confidence -- see the comment on
    // attachBboxToTextLines for why (confirmed to reproduce the exact same
    // regression as re-deriving line boundaries, for an entirely different
    // reason: it feeds lineConfidenceBonus, which every line in the
    // originally-tuned baseline implicitly left at 0).
    lines: layoutLines.map((line) => ({
      text: line.text,
      bbox: line.bbox,
    })),
    ocrConfidence,
  });

  return Object.entries(extraction.fields).reduce((details, [field, result]) => {
    details[field as DocumentAiFieldKey] = candidateResultToFieldDetail(result);
    return details;
  }, {} as DocumentAiFieldDetails);
}

function candidateResultToFieldDetail(result: CandidateFieldResult): DocumentAiFieldDetail {
  return {
    value: result.value,
    normalizedValue: result.normalizedValue,
    confidence: result.confidence,
    method: result.method,
    sourceText: result.sourceText,
    warning: result.warning,
    alternatives: result.alternatives.map((candidate) => ({
      value: candidate.value,
      normalizedValue: candidate.normalizedValue,
      confidence: candidate.confidence,
      sourceText: candidate.sourceText,
    })),
  };
}

function calculateFinancialConsistency(details: DocumentAiFieldDetails) {
  if (
    details.subtotal.normalizedValue === null ||
    details.subtotal.normalizedValue === undefined ||
    details.vatAmount.normalizedValue === null ||
    details.vatAmount.normalizedValue === undefined ||
    details.totalAmount.normalizedValue === null ||
    details.totalAmount.normalizedValue === undefined
  ) {
    return 0.7;
  }

  const subtotal = Number(details.subtotal.normalizedValue);
  const tax = Number(details.vatAmount.normalizedValue);
  const total = Number(details.totalAmount.normalizedValue);

  if (![subtotal, tax, total].every(Number.isFinite)) {
    return 0.7;
  }

  return Math.abs(subtotal + tax - total) <= Math.max(0.02, Math.abs(total) * 0.015) ? 1 : 0.35;
}

function extractInvoiceFieldDetailsLegacy(
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
    findLayoutAmount(
      layoutLines,
      [
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
      ],
      {
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
      },
    ) ??
    findRegexAmount(
      normalizedText,
      [
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
      ],
      {
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
      },
    );
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
      ? [
          lines
            .slice(labelLine.index, labelLine.index + nearbyLines)
            .map((line) => line.text)
            .join(" "),
        ]
      : [
          labelLine.line.text,
          ...lines
            .slice(labelLine.index + 1, labelLine.index + nearbyLines)
            .map((line) => line.text),
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
  if (
    isTaxIdentifierLine(line) ||
    hasExcludedAmountTerm(line, [
      "tax exclusive",
      "net amount",
      "subtotal",
      "sub_total",
      "sub total",
    ])
  ) {
    return null;
  }

  const patterns = [
    /\bGST\s*\(\s*\d+(?:[,.]\d+)?\s*%\s*\)\s*[:-]?\s*(.+)$/i,
    /\bGST\b\s*[:-]?\s*(.+)$/i,
    /\bVAT\s+amount\b\s*[:-]?\s*(.+)$/i,
    /\bTax\s+amount\b\s*[:-]?\s*(.+)$/i,
    /\bVAT\b\s*[:-]?\s*(.+)$/i,
    /\bTax\b\s*[:-]?\s*(.+)$/i,
    /\bTVA\b(?:\s+\d+(?:[,.]\d+)?\s*%)?\s*[:-]?\s*(.+)$/i,
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
    textCandidate ?? undefined,
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

  if (
    /(^invoice$|invoice\s*#|invoice\s+no|date|address|gstin|vat|tax|buyer|customer|client|seller|supplier|vendor|total|amount|eur|usd|gbp|ron|lei)/i.test(
      normalized,
    )
  ) {
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
    textCandidate ?? undefined,
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

  if (
    /(factur|total|tva|cui|cif|cod fiscal|cod tva|iban|banca|email|telefon|adresa|ron|lei|scadent|contract|abonament|serie|numar|nr\.)/i.test(
      normalized,
    )
  ) {
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

function findCompanyNameCandidate(
  textLines: string[],
  layoutLines: LayoutLine[],
): ExtractionCandidate {
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

  if (
    /(factura|total|data|cui|cif|cod fiscal|cod tva|tva|iban|cont|banca|client)/i.test(normalized)
  ) {
    return false;
  }

  return value.trim().length >= 4 && value.trim().length <= 120;
}

function cleanupCompanyName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[,:;-]+$/, "")
    .trim()
    .slice(0, 90);
}

function cleanupPartyName(value: string) {
  return value
    .replace(
      /^(client|customer|buyer|bill\s+to|sold\s+to|cumparator|cumpărător|beneficiar)\s*[:#-]?\s*/i,
      "",
    )
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
    ) || /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(value)
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

      return !tail.startsWith("%") && isAllowedMonetaryToken(match[0], options.maxIntegerDigits);
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
  const parts = value
    .replace(/[./\s]/g, "-")
    .split("-")
    .filter(Boolean);

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
                  ?.map((word): OcrWord | null => {
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

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function countUsefulWords(text: string) {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length >= 2 && /[\p{L}\p{N}]/u.test(word)).length;
}

function countInvoiceKeywords(text: string) {
  const normalizedText = removeDiacritics(text).toLowerCase();

  return OCR_KEYWORDS.filter((keyword) => {
    const normalizedKeyword = removeDiacritics(keyword).toLowerCase();
    const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");

    return pattern.test(normalizedText);
  }).length;
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
