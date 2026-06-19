import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
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

type SplitName = "tuning" | "test" | "all";

const args = parseArgs(process.argv.slice(2));
const imagesRoot = resolve(requiredArg(args, "images"));
const annotationsRoot = resolve(requiredArg(args, "annotations"));
const selectedSplit = (args.split ?? "all") as SplitName;
const cacheRoot = resolve(args.cache ?? "/tmp/immapp-document-ai-ocr");
const exportOcrRoot = args["export-ocr-dir"] ? resolve(args["export-ocr-dir"]) : "";
const requestedNames = new Set(
  String(args.documents ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\.(?:jpe?g|png|json)$/i, ""))
    .filter(Boolean),
);

if (!["tuning", "test", "all"].includes(selectedSplit)) {
  throw new Error("--split trebuie să fie tuning, test sau all.");
}

const imagePaths = (await walk(imagesRoot)).filter((path) => /\.(?:jpe?g|png)$/i.test(path));
const pairs = imagePaths
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
  });

if (pairs.length === 0) {
  throw new Error("Nu au fost găsite perechi imagine + JSON pentru filtrele date.");
}

await mkdir(cacheRoot, { recursive: true });
const worker = await createWorker("eng", OEM.LSTM_ONLY, { cachePath: cacheRoot });
const items: BatchEvaluationItem[] = [];

try {
  for (const pair of pairs) {
    await stat(pair.annotationPath);
    const annotation = JSON.parse(await readFile(pair.annotationPath, "utf8"));
    const expected = parseFaturaAnnotationToExpected(annotation);
    const cacheKey = createHash("sha1").update(`psm-v2:${pair.imagePath}`).digest("hex");
    const cachePath = join(cacheRoot, `${cacheKey}.json`);
    let ocr: { text: string; confidence: number };

    try {
      ocr = JSON.parse(await readFile(cachePath, "utf8"));
    } catch {
      const attempts: Array<{ text: string; confidence: number; score: number }> = [];
      for (const pageSegmentationMode of ["3", "6", "11"]) {
        await worker.setParameters({ tessedit_pageseg_mode: pageSegmentationMode });
        const result = await worker.recognize(pair.imagePath);
        const text = result.data.text;
        const confidence = result.data.confidence / 100;
        attempts.push({ text, confidence, score: scoreOcrText(text, confidence) });
      }
      const best = attempts.sort((left, right) => right.score - left.score)[0];
      ocr = { text: best.text, confidence: best.confidence };
      await writeFile(cachePath, JSON.stringify(ocr), "utf8");
    }

    const extraction = extractInvoiceCandidates({
      text: ocr.text,
      lines: ocr.text.split(/\r?\n/).map((text) => ({ text })),
      ocrConfidence: ocr.confidence,
    });
    if (exportOcrRoot) {
      const exportPath = join(
        exportOcrRoot,
        dirname(relative(imagesRoot, pair.imagePath)),
        `${pair.documentId}.json`,
      );
      await mkdir(dirname(exportPath), { recursive: true });
      await writeFile(exportPath, JSON.stringify(ocr, null, 2), "utf8");
    }
    const predicted = DOCUMENT_AI_EVALUATION_FIELDS.reduce((fields, field) => {
      fields[field] = extraction.fields[field].value;
      return fields;
    }, {} as DocumentAiEvaluationFields);
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
  if (mismatches.length) process.stdout.write(`  ${field}: ${mismatches.join("; ")}\n`);
}

const fineTunedModelPath = resolve(
  "document-ai-backend/models/layoutxlm-invoice-token-classifier/config.json",
);
process.stdout.write(
  `\nMod inferență benchmark: candidate_engine_fallback; fine-tuned folosit: nu; model local disponibil: ${existsSync(fineTunedModelPath) ? "da" : "nu"}.\n`,
);

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
