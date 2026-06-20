import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { createWorker, OEM } from "tesseract.js";
import {
  DOCUMENT_AI_EVALUATION_FIELDS,
  evaluateBatch,
  parseFaturaAnnotationToExpected,
  type BatchEvaluationItem,
  type DocumentAiEvaluationFields,
} from "../src/lib/documentAiEvaluationService.ts";
import { extractInvoiceCandidates } from "../src/lib/invoiceCandidateEngine.ts";
import { mergeLayoutXlmWithCandidateEngine } from "../src/lib/layoutAiHybridMerge.ts";

type SplitName = "tuning" | "test" | "all";
type BenchmarkInferenceMode =
  | "candidate_engine_baseline"
  | "fine_tuned_layoutxlm_backend"
  | "hybrid_layoutxlm_candidate_engine";

type BackendHealth = {
  model_id?: string;
  runtime_mode?: string;
  fine_tuned_model_used?: boolean;
  model_inference_available?: boolean;
};

type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

type CachedOcr = {
  text: string;
  confidence: number;
  words: OcrWord[];
};

type LayoutBackendResponse = {
  model_id?: string;
  runtime_mode?: string;
  model_inference_executed?: boolean;
  fine_tuned_model_used?: boolean;
  fields?: Partial<Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], unknown>>;
  field_details?: Partial<
    Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], { confidence?: number; method?: string }>
  >;
  fallback_reason?: string | null;
};

type BenchmarkPrediction = {
  fields: DocumentAiEvaluationFields;
  confidences: Partial<Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], number>>;
  methods: Partial<Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], string>>;
};

const args = parseArgs(process.argv.slice(2));
const imagesRoot = resolve(requiredArg(args, "images"));
const annotationsRoot = resolve(requiredArg(args, "annotations"));
const selectedSplit = (args.split ?? "all") as SplitName;
const requestedMode = (args.mode ?? "hybrid_layoutxlm_candidate_engine") as BenchmarkInferenceMode;
const cacheRoot = resolve(args.cache ?? "/tmp/immapp-document-ai-ocr");
const exportOcrRoot = args["export-ocr-dir"] ? resolve(args["export-ocr-dir"]) : "";
const backendUrl = normalizeBackendUrl(args["backend-url"] ?? "http://localhost:8000");
const limit = parsePositiveInteger(args.limit, "limit");
const requestedNames = new Set(
  String(args.documents ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\.(?:jpe?g|png|json)$/i, ""))
    .filter(Boolean),
);

if (!["tuning", "test", "all"].includes(selectedSplit)) {
  throw new Error("--split trebuie să fie tuning, test sau all.");
}
if (
  ![
    "candidate_engine_baseline",
    "fine_tuned_layoutxlm_backend",
    "hybrid_layoutxlm_candidate_engine",
  ].includes(requestedMode)
) {
  throw new Error(
    "--mode trebuie să fie candidate_engine_baseline, fine_tuned_layoutxlm_backend sau hybrid_layoutxlm_candidate_engine.",
  );
}

const imagePaths = (await walk(imagesRoot)).filter((path) => /\.(?:jpe?g|png)$/i.test(path));
const allPairs = imagePaths
  .map((imagePath) => {
    const relativePath = relative(imagesRoot, imagePath);
    const documentId = basename(imagePath, extname(imagePath));
    const annotationPath = join(annotationsRoot, dirname(relativePath), `${documentId}.json`);
    const split = splitFor(relativePath, documentId);
    return { imagePath, annotationPath, documentId, split };
  })
  .filter(({ documentId, split }) => {
    const named = requestedNames.size === 0 || requestedNames.has(documentId);
    return named && (selectedSplit === "all" || selectedSplit === split);
  })
  .sort((left, right) => left.imagePath.localeCompare(right.imagePath));
const pairs = limit ? allPairs.slice(0, limit) : allPairs;

if (pairs.length === 0) {
  throw new Error("Nu au fost găsite perechi imagine + JSON pentru filtrele date.");
}

const backendHealth = await readBackendHealth(backendUrl);
const benchmarkInferenceMode = requestedMode;
const fineTunedUsed = benchmarkInferenceMode !== "candidate_engine_baseline";
if (
  fineTunedUsed &&
  (backendHealth?.fine_tuned_model_used !== true ||
    backendHealth.model_inference_available !== true)
) {
  throw new Error(
    `Modul ${benchmarkInferenceMode} necesită backend-ul fine-tuned activ. Verifică ${backendUrl}/health.`,
  );
}

process.stdout.write(`benchmark_inference_mode: ${benchmarkInferenceMode}\n`);
process.stdout.write(`fine_tuned_used: ${fineTunedUsed}\n`);
process.stdout.write(`backend_health.model_id: ${backendHealth?.model_id ?? "unavailable"}\n`);
process.stdout.write(
  `backend_health.runtime_mode: ${backendHealth?.runtime_mode ?? "unavailable"}\n`,
);

await mkdir(cacheRoot, { recursive: true });
const worker = await createWorker("eng", OEM.LSTM_ONLY, { cachePath: cacheRoot });
const items: BatchEvaluationItem[] = [];

try {
  for (const pair of pairs) {
    await stat(pair.annotationPath);
    const annotation = JSON.parse(await readFile(pair.annotationPath, "utf8"));
    const expected = parseFaturaAnnotationToExpected(annotation);
    const cacheKey = createHash("sha1").update(`psm-v3-blocks:${pair.imagePath}`).digest("hex");
    const cachePath = join(cacheRoot, `${cacheKey}.json`);
    let ocr: CachedOcr;

    try {
      ocr = JSON.parse(await readFile(cachePath, "utf8"));
    } catch {
      const attempts: Array<CachedOcr & { score: number }> = [];
      for (const pageSegmentationMode of ["3", "6", "11"]) {
        await worker.setParameters({ tessedit_pageseg_mode: pageSegmentationMode });
        const result = await worker.recognize(pair.imagePath, {}, { text: true, blocks: true });
        const text = result.data.text;
        const confidence = result.data.confidence / 100;
        const words = extractOcrWords(result.data.blocks);
        attempts.push({ text, confidence, words, score: scoreOcrText(text, confidence) });
      }
      const best = attempts.sort((left, right) => right.score - left.score)[0];
      ocr = { text: best.text, confidence: best.confidence, words: best.words };
      await writeFile(cachePath, JSON.stringify(ocr), "utf8");
    }

    const candidatePrediction =
      benchmarkInferenceMode === "fine_tuned_layoutxlm_backend"
        ? null
        : extractWithCandidateEngine(ocr);
    const layoutPrediction =
      benchmarkInferenceMode === "candidate_engine_baseline"
        ? null
        : await analyzeWithFineTunedBackend(pair.imagePath, ocr, backendUrl);
    const predicted = selectPrediction(
      benchmarkInferenceMode,
      candidatePrediction,
      layoutPrediction,
    );
    if (exportOcrRoot) {
      const exportPath = join(
        exportOcrRoot,
        dirname(relative(imagesRoot, pair.imagePath)),
        `${pair.documentId}.json`,
      );
      await mkdir(dirname(exportPath), { recursive: true });
      await writeFile(exportPath, JSON.stringify(ocr, null, 2), "utf8");
    }
    items.push({ documentId: `${pair.documentId} [${pair.split}]`, predicted, expected });
    process.stdout.write(`Analizat: ${pair.documentId} (${pair.split})\n`);
  }
} finally {
  await worker.terminate();
}

const result = evaluateBatch(items);
for (const document of result.documents) {
  process.stdout.write(`\n${document.documentId}\n`);
  process.stdout.write(
    `  accuracy=${percent(document.fieldAccuracy)} precision=${percent(document.precision)} recall=${percent(document.recall)} F1=${percent(document.f1Score)}\n`,
  );
  const matched = document.fields.filter((field) => field.correct).map((field) => field.field);
  const missing = document.fields.filter((field) => field.missing).map((field) => field.field);
  const mismatched = document.fields.filter((field) => field.incorrect);
  process.stdout.write(`  matched: ${matched.join(", ") || "-"}\n`);
  process.stdout.write(`  missing: ${missing.join(", ") || "-"}\n`);
  process.stdout.write(
    `  mismatched: ${mismatched.map((field) => `${field.field}="${field.predicted}" (ref="${field.expected}")`).join("; ") || "-"}\n`,
  );
}

process.stdout.write("\nRezultat agregat\n");
process.stdout.write(
  `  documente=${result.documentsEvaluated} accuracy=${percent(result.fieldAccuracy)} precision=${percent(result.precision)} recall=${percent(result.recall)} F1=${percent(result.f1Score)} exact_strict=${percent(result.strictExactMatchRate)} exact_normalized=${percent(result.normalizedExactMatchRate)}\n`,
);
for (const metric of result.fieldMetrics.filter((field) => field.total > 0)) {
  process.stdout.write(
    `  ${metric.field}: ${percent(metric.accuracy)} (${metric.correct}/${metric.total})\n`,
  );
}

if (selectedSplit === "all") {
  for (const split of ["tuning", "test"] as const) {
    const splitResult = evaluateBatch(
      items.filter((item) => item.documentId?.endsWith(`[${split}]`)),
    );
    process.stdout.write(
      `\n${split === "tuning" ? "Train/tuning" : "Held-out test"}: documente=${splitResult.documentsEvaluated} accuracy=${percent(splitResult.fieldAccuracy)} precision=${percent(splitResult.precision)} recall=${percent(splitResult.recall)} F1=${percent(splitResult.f1Score)}\n`,
    );
  }
}

process.stdout.write("\nNeconcordanțe rămase pe câmp\n");
for (const field of DOCUMENT_AI_EVALUATION_FIELDS) {
  const mismatches = result.documents.flatMap((document) => {
    const comparison = document.fields.find((item) => item.field === field);
    return comparison && (comparison.missing || comparison.incorrect)
      ? [
          `${document.documentId}: \"${comparison.predicted || "<missing>"}\" vs \"${comparison.expected}\"`,
        ]
      : [];
  });
  if (mismatches.length) {
    process.stdout.write(`  ${field}: ${mismatches.length}\n`);
    process.stdout.write(`    ${mismatches.join("; ")}\n`);
  }
}

process.stdout.write("\nBenchmark runtime\n");
process.stdout.write(`  benchmark_inference_mode: ${benchmarkInferenceMode}\n`);
process.stdout.write(`  fine_tuned_used: ${fineTunedUsed}\n`);
process.stdout.write(`  backend_health.model_id: ${backendHealth?.model_id ?? "unavailable"}\n`);
process.stdout.write(
  `  backend_health.runtime_mode: ${backendHealth?.runtime_mode ?? "unavailable"}\n`,
);
process.stdout.write(
  `  evaluated_documents: ${result.documentsEvaluated}\n  accuracy: ${percent(result.fieldAccuracy)}\n  precision: ${percent(result.precision)}\n  recall: ${percent(result.recall)}\n  F1: ${percent(result.f1Score)}\n`,
);

async function readBackendHealth(url: string): Promise<BackendHealth | null> {
  let lastError: unknown = new Error("Backend health indisponibil.");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as BackendHealth;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(1_000);
    }
  }

  process.stderr.write(
    `Backend indisponibil; benchmark-ul folosește candidate engine: ${errorMessage(lastError)}\n`,
  );
  return null;
}

async function analyzeWithFineTunedBackend(
  imagePath: string,
  ocr: CachedOcr,
  url: string,
): Promise<BenchmarkPrediction> {
  const formData = new FormData();
  const imageBytes = await readFile(imagePath);
  formData.append(
    "file",
    new Blob([imageBytes], { type: imageMimeType(imagePath) }),
    basename(imagePath),
  );
  formData.append("ocr_text", ocr.text);
  if (ocr.words.length) formData.append("ocr_words", JSON.stringify(ocr.words));

  const response = await fetch(`${url}/analyze-layout`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `Backend Layout AI a răspuns HTTP ${response.status} pentru ${basename(imagePath)}.`,
    );
  }

  const result = (await response.json()) as LayoutBackendResponse;
  if (result.fine_tuned_model_used !== true || result.model_inference_executed !== true) {
    throw new Error(
      `Backend-ul nu a executat modelul fine-tuned pentru ${basename(imagePath)}: ${result.fallback_reason ?? result.runtime_mode ?? "motiv necunoscut"}.`,
    );
  }

  return {
    fields: DOCUMENT_AI_EVALUATION_FIELDS.reduce((fields, field) => {
      const value = result.fields?.[field];
      fields[field] = value === null || value === undefined ? "" : String(value);
      return fields;
    }, {} as DocumentAiEvaluationFields),
    confidences: DOCUMENT_AI_EVALUATION_FIELDS.reduce(
      (confidences, field) => {
        confidences[field] = Number(result.field_details?.[field]?.confidence ?? 0);
        return confidences;
      },
      {} as BenchmarkPrediction["confidences"],
    ),
    methods: DOCUMENT_AI_EVALUATION_FIELDS.reduce(
      (methods, field) => {
        methods[field] = String(result.field_details?.[field]?.method ?? "");
        return methods;
      },
      {} as BenchmarkPrediction["methods"],
    ),
  };
}

function extractWithCandidateEngine(ocr: CachedOcr): BenchmarkPrediction {
  const extraction = extractInvoiceCandidates({
    text: ocr.text,
    lines: ocr.text.split(/\r?\n/).map((text) => ({ text })),
    ocrConfidence: ocr.confidence,
  });
  return {
    fields: DOCUMENT_AI_EVALUATION_FIELDS.reduce((fields, field) => {
      fields[field] = extraction.fields[field].value;
      return fields;
    }, {} as DocumentAiEvaluationFields),
    confidences: DOCUMENT_AI_EVALUATION_FIELDS.reduce(
      (confidences, field) => {
        confidences[field] = extraction.fields[field].confidence;
        return confidences;
      },
      {} as BenchmarkPrediction["confidences"],
    ),
    methods: {},
  };
}

function selectPrediction(
  mode: BenchmarkInferenceMode,
  candidate: BenchmarkPrediction | null,
  layout: BenchmarkPrediction | null,
): DocumentAiEvaluationFields {
  if (mode === "candidate_engine_baseline" && candidate) return candidate.fields;
  if (mode === "fine_tuned_layoutxlm_backend" && layout) return layout.fields;
  if (mode === "hybrid_layoutxlm_candidate_engine" && candidate && layout) {
    return mergeLayoutXlmWithCandidateEngine({
      candidateFields: candidate.fields,
      candidateConfidences: candidate.confidences,
      layoutFields: layout.fields,
      layoutConfidences: layout.confidences,
      layoutMethods: layout.methods,
    }).fields;
  }
  throw new Error(`Sursele de inferență nu sunt disponibile pentru modul ${mode}.`);
}

function extractOcrWords(
  blocks: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text?: string;
          confidence?: number;
          bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
        }>;
      }>;
    }>;
  }> | null,
): OcrWord[] {
  return (blocks ?? []).flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) =>
        (line.words ?? []).flatMap((word) => {
          const text = word.text?.trim();
          const box = word.bbox;
          if (!text || !box) return [];
          const x0 = Number(box.x0 ?? 0);
          const y0 = Number(box.y0 ?? 0);
          const x1 = Number(box.x1 ?? x0);
          const y1 = Number(box.y1 ?? y0);
          return [
            {
              text,
              confidence: Number(word.confidence ?? 0) / 100,
              bbox: { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) },
            },
          ];
        }),
      ),
    ),
  );
}

function normalizeBackendUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
  return parsed.toString().replace(/\/$/, "");
}

function parsePositiveInteger(value: string | undefined, name: string) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} trebuie să fie un număr întreg pozitiv.`);
  }
  return parsed;
}

function imageMimeType(path: string) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  return "image/jpeg";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) continue;
    parsed[key.slice(2)] = values[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

function requiredArg(values: Record<string, string>, key: string) {
  const value = values[key];
  if (!value) {
    throw new Error(
      `Lipsește --${key}. Exemplu: npm run document-ai:evaluate -- --images \"/cale/JPG\" --annotations \"/cale/JSON\"`,
    );
  }
  return value;
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? walk(join(root, entry.name))
        : Promise.resolve([join(root, entry.name)]),
    ),
  );
  return nested.flat();
}

function splitFor(relativePath: string, documentId: string): Exclude<SplitName, "all"> {
  const normalizedPath = relativePath.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath.split("/").includes("set1")) return "tuning";
  if (normalizedPath.split("/").includes("set2")) return "test";
  const hash = createHash("sha1").update(documentId).digest()[0];
  return hash % 5 === 0 ? "test" : "tuning";
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function scoreOcrText(text: string, confidence: number) {
  const words = text.match(/[A-Za-zÀ-ž0-9]{2,}/g)?.length ?? 0;
  const keywords =
    text.match(/invoice|buyer|seller|customer|date|subtotal|sub_total|total|vat|gst|tax/gi)
      ?.length ?? 0;
  return confidence * 0.25 + Math.min(words / 80, 1) * 0.3 + Math.min(keywords / 8, 1) * 0.45;
}
