// Full v2-vs-v3 batch comparison across the 26-document benchmark corpus
// (item 6). For each document: loads ground truth + PP-StructureV3 (light
// config) output, runs v2 (extractInvoiceCandidates, unmodified) and v3
// (region-dominance resolver + table resolver, via v2v3Bridge.ts) on the
// SAME OCR input, scores both against ground truth with v2's own
// compareField, and aggregates per-field / dev-vs-eval results.
//
// Scope, stated once: v3 in this phase only re-architects
// supplierName/customerName/supplierTaxId/customerTaxId/subtotal/vatAmount/
// totalAmount. invoiceNumber/invoiceSeries/invoiceDate/dueDate/currency pass
// through from v2 unchanged (no region/relation resolver built for them
// yet) -- so v2 and v3 necessarily tie on those five fields. Reported
// separately below, not hidden inside one blended score.
//
// Run with: node --experimental-strip-types run_benchmark.ts

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compareField } from "../../src/lib/documentAiEvaluationService.ts";
import type { CandidateLine } from "../../src/lib/invoiceCandidateEngine.ts";
import {
  buildRegionsFromPPStructureLayout,
  resolveAmountsViaV3,
  resolvePartiesViaV3,
  runV2,
  type PPStructureLayoutBox,
} from "./v2v3Bridge.ts";
import type { Region, TableCell } from "./types.ts";

const ROOT = new URL("..", import.meta.url).pathname; // document-ai-v3/
const SAMPLES_DIR = join(ROOT, "samples");
const GROUND_TRUTH_DIR = join(ROOT, "ground_truth");
const PP_OUTPUT_DIR = join(ROOT, "output", "pp_structure_batch");
const MANIFEST_PATH = join(ROOT, "BENCHMARK_MANIFEST.md");

type GroundTruth = {
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  supplierName: string | null;
  customerName: string | null;
  supplierTaxId: string | null;
  customerTaxId: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  traits: string[];
};

function parseSplitFromManifest(): Map<string, "dev" | "eval"> {
  const manifest = readFileSync(MANIFEST_PATH, "utf8");
  const split = new Map<string, "dev" | "eval">();
  for (const line of manifest.split("\n")) {
    const match = line.match(/^\|\s*(v3_\d{3}\S*)\s*\|.*\|\s*(dev|eval)\s*\|\s*$/);
    if (match) split.set(match[1], match[2] as "dev" | "eval");
  }
  return split;
}

function toBBox([x0, y0, x1, y1]: [number, number, number, number]) {
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// Clusters OCR lines inside the table bbox into rows by Y-proximity, then
// treats the topmost row as the header. Mirrors layoutLines.ts's own
// row-grouping approach (group while consecutive Y centers stay within a
// small band) rather than assuming a fixed row count.
function buildTableRowsFromLines(
  lines: Array<{ text: string; bbox: { x: number; y: number; width: number; height: number } }>,
  tableBBox: { x: number; y: number; width: number; height: number },
): { headerCells: TableCell[]; dataRows: TableCell[][] } {
  const inTable = lines.filter((line) => {
    const cy = line.bbox.y + line.bbox.height / 2;
    const cx = line.bbox.x + line.bbox.width / 2;
    return cx >= tableBBox.x && cx <= tableBBox.x + tableBBox.width && cy >= tableBBox.y && cy <= tableBBox.y + tableBBox.height;
  });
  const sorted = [...inTable].sort((a, b) => a.bbox.y - b.bbox.y);

  const rows: Array<typeof inTable> = [];
  for (const line of sorted) {
    const lastRow = rows[rows.length - 1];
    const lastY = lastRow ? lastRow[0].bbox.y : null;
    if (lastRow && lastY !== null && Math.abs(line.bbox.y - lastY) < 20) {
      lastRow.push(line);
    } else {
      rows.push([line]);
    }
  }

  const toCell = (l: (typeof inTable)[number]): TableCell => ({ value: l.text, bbox: l.bbox, columnIndex: null });
  const headerRow = rows[0] ?? [];
  const dataRows = rows.slice(1).map((row) => row.sort((a, b) => a.bbox.x - b.bbox.x).map(toCell));
  const headerCells = [...headerRow].sort((a, b) => a.bbox.x - b.bbox.x).map(toCell);

  return { headerCells, dataRows };
}

const split = parseSplitFromManifest();
const documentIds = readdirSync(SAMPLES_DIR)
  .filter((f) => f.startsWith("v3_") && f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""))
  .sort();

const FIELDS = [
  "invoiceNumber",
  "invoiceDate",
  "supplierName",
  "supplierTaxId",
  "customerName",
  "customerTaxId",
  "subtotal",
  "vatAmount",
  "totalAmount",
  "currency",
] as const;

// documentAiEvaluationService's field names for the shared 10 -- supplierCui/
// customerCui in v2's vocabulary map to supplierTaxId/customerTaxId in the
// v3 ground-truth schema; compareField only needs a field NAME for its
// normalizeValue logic (dates/amounts/text), which is field-name-agnostic
// enough that passing either name works identically for a CUI/amount/date --
// confirmed by reading compareField's implementation (it dispatches purely
// on value shape, not the field name).
type Row = {
  id: string;
  split: "dev" | "eval";
  field: (typeof FIELDS)[number];
  groundTruth: string | number | null;
  v2: string | number | null;
  v3: string | number | null;
  v2Correct: boolean;
  v3Correct: boolean;
};

const rows: Row[] = [];
const skipped: string[] = [];

for (const id of documentIds) {
  const gtPath = join(GROUND_TRUTH_DIR, `${id}.json`);
  const ppPath = join(PP_OUTPUT_DIR, id, "page_0.json");
  let gt: GroundTruth;
  let pp: any;
  try {
    gt = JSON.parse(readFileSync(gtPath, "utf8"));
    pp = JSON.parse(readFileSync(ppPath, "utf8"));
  } catch (err) {
    skipped.push(`${id}: ${(err as Error).message}`);
    continue;
  }

  const ocr = pp.overall_ocr_res;
  const rawLines: Array<{ text: string; box: [number, number, number, number] }> = ocr.rec_texts.map(
    (text: string, i: number) => ({ text, box: ocr.rec_boxes[i] }),
  );
  const lines: CandidateLine[] = rawLines.map((l) => ({ text: l.text, bbox: toBBox(l.box) }));
  const text = rawLines.map((l) => l.text).join("\n");

  const layoutBoxes: PPStructureLayoutBox[] = pp.layout_det_res.boxes.map((b: any) => ({
    label: b.label,
    coordinate: b.coordinate,
    score: b.score,
  }));
  const { regions } = buildRegionsFromPPStructureLayout(layoutBoxes);

  const v2Result = runV2(text, lines, 0.9);
  const v3Parties = resolvePartiesViaV3(v2Result, lines, regions);

  const tableRegion = regions.find((r) => r.type === "items_table") ?? null;
  let v3Amounts: { subtotal: number | null; vatAmount: number | null; totalAmount: number | null } = {
    subtotal: null,
    vatAmount: null,
    totalAmount: null,
  };
  if (tableRegion) {
    const { headerCells, dataRows } = buildTableRowsFromLines(
      lines.filter((l): l is CandidateLine & { bbox: NonNullable<CandidateLine["bbox"]> } => Boolean(l.bbox)),
      tableRegion.bbox,
    );
    v3Amounts = resolveAmountsViaV3(tableRegion, headerCells, dataRows, lines).amounts;
  }

  const v2Values: Record<string, string | number | null> = {
    invoiceNumber: v2Result.fields.invoiceNumber.value,
    invoiceDate: v2Result.fields.invoiceDate.value,
    supplierName: v2Result.fields.supplierName.value,
    supplierTaxId: v2Result.fields.supplierCui.value,
    customerName: v2Result.fields.customerName.value,
    customerTaxId: v2Result.fields.customerCui.value,
    subtotal: v2Result.fields.subtotal.value,
    vatAmount: v2Result.fields.vatAmount.value,
    totalAmount: v2Result.fields.totalAmount.value,
    currency: v2Result.fields.currency.value,
  };
  const v3Values: Record<string, string | number | null> = {
    // Not yet re-architected in v3 this phase -- passes through from v2.
    invoiceNumber: v2Values.invoiceNumber,
    invoiceDate: v2Values.invoiceDate,
    currency: v2Values.currency,
    supplierName: v3Parties.supplierName,
    supplierTaxId: v3Parties.supplierCui,
    customerName: v3Parties.customerName,
    customerTaxId: v3Parties.customerCui,
    subtotal: v3Amounts.subtotal,
    vatAmount: v3Amounts.vatAmount,
    totalAmount: v3Amounts.totalAmount,
  };

  for (const field of FIELDS) {
    const expected = (gt as any)[field];
    if (expected === null || expected === undefined) continue; // not scored when this document has no ground truth for it (e.g. currency sometimes null)
    const v2Cmp = compareField(v2Values[field], expected, field as never);
    const v3Cmp = compareField(v3Values[field], expected, field as never);
    rows.push({
      id,
      split: split.get(id) ?? "dev",
      field,
      groundTruth: expected,
      v2: v2Values[field],
      v3: v3Values[field],
      v2Correct: v2Cmp.correct,
      v3Correct: v3Cmp.correct,
    });
  }
}

function summarize(subset: Row[], label: string) {
  const v2Correct = subset.filter((r) => r.v2Correct).length;
  const v3Correct = subset.filter((r) => r.v3Correct).length;
  console.log(
    `${label}: n=${subset.length}  v2=${v2Correct}/${subset.length} (${((100 * v2Correct) / subset.length).toFixed(1)}%)  v3=${v3Correct}/${subset.length} (${((100 * v3Correct) / subset.length).toFixed(1)}%)`,
  );
}

console.log(`documents scored: ${new Set(rows.map((r) => r.id)).size} / ${documentIds.length}`);
if (skipped.length > 0) {
  console.log(`skipped (missing PP-Structure output or ground truth): ${skipped.length}`);
  skipped.forEach((s) => console.log(`  ${s}`));
}
console.log();

summarize(rows, "ALL");
summarize(
  rows.filter((r) => r.split === "dev"),
  "DEV",
);
summarize(
  rows.filter((r) => r.split === "eval"),
  "EVAL",
);
console.log();

console.log("Per-field (all documents):");
for (const field of FIELDS) {
  summarize(
    rows.filter((r) => r.field === field),
    field.padEnd(16),
  );
}
console.log();

console.log("v3-fixed (v2 wrong, v3 right):");
for (const row of rows.filter((r) => !r.v2Correct && r.v3Correct)) {
  console.log(`  ${row.id} [${row.split}] ${row.field}: gt=${row.groundTruth} v2=${row.v2} v3=${row.v3}`);
}
console.log();
console.log("v3-regressed (v2 right, v3 wrong):");
for (const row of rows.filter((r) => r.v2Correct && !r.v3Correct)) {
  console.log(`  ${row.id} [${row.split}] ${row.field}: gt=${row.groundTruth} v2=${row.v2} v3=${row.v3}`);
}
console.log();
console.log("both wrong (neither v2 nor v3 correct):");
for (const row of rows.filter((r) => !r.v2Correct && !r.v3Correct)) {
  console.log(`  ${row.id} [${row.split}] ${row.field}: gt=${row.groundTruth} v2=${row.v2} v3=${row.v3}`);
}

// --- Region segmentation accuracy (item 2: "layout segmentation accuracy",
// "supplier/customer region separation") -- IoU of PP-StructureV3's
// detected supplier_block/customer_block/items_table regions against the
// ground-truth region bboxes now available for all 26 documents.
function iou(a: { x: number; y: number; width: number; height: number }, b: typeof a): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

console.log("\n=== Region segmentation accuracy (IoU vs ground truth, PP-StructureV3 light config) ===");
const iouResults: Array<{ id: string; region: string; iou: number; detected: boolean }> = [];
for (const id of documentIds) {
  let gt: GroundTruth;
  let pp: any;
  try {
    gt = JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, `${id}.json`), "utf8"));
    pp = JSON.parse(readFileSync(join(PP_OUTPUT_DIR, id, "page_0.json"), "utf8"));
  } catch {
    continue;
  }
  const layoutBoxes: PPStructureLayoutBox[] = pp.layout_det_res.boxes.map((b: any) => ({
    label: b.label,
    coordinate: b.coordinate,
    score: b.score,
  }));
  const { regions } = buildRegionsFromPPStructureLayout(layoutBoxes);
  const supplierRegion = regions.find((r) => r.type === "supplier_block");
  const customerRegion = regions.find((r) => r.type === "customer_block");
  const tableRegion = regions.find((r) => r.type === "items_table");

  const gtAny = gt as any;
  if (gtAny.supplierRegionBBox) {
    iouResults.push({
      id,
      region: "supplier_block",
      iou: supplierRegion ? iou(supplierRegion.bbox, gtAny.supplierRegionBBox) : 0,
      detected: Boolean(supplierRegion),
    });
  }
  if (gtAny.customerRegionBBox) {
    iouResults.push({
      id,
      region: "customer_block",
      iou: customerRegion ? iou(customerRegion.bbox, gtAny.customerRegionBBox) : 0,
      detected: Boolean(customerRegion),
    });
  }
  if (gtAny.tableRegionBBox) {
    iouResults.push({
      id,
      region: "items_table",
      iou: tableRegion ? iou(tableRegion.bbox, gtAny.tableRegionBBox) : 0,
      detected: Boolean(tableRegion),
    });
  }
}

for (const regionType of ["supplier_block", "customer_block", "items_table"]) {
  const subset = iouResults.filter((r) => r.region === regionType);
  const detected = subset.filter((r) => r.detected).length;
  const meanIou = subset.reduce((sum, r) => sum + r.iou, 0) / subset.length;
  const meanIouWhenDetected = subset.filter((r) => r.detected).reduce((sum, r) => sum + r.iou, 0) / (detected || 1);
  const goodOverlap = subset.filter((r) => r.iou >= 0.5).length;
  console.log(
    `${regionType.padEnd(16)} n=${subset.length}  detected=${detected}/${subset.length}  mean IoU=${meanIou.toFixed(3)}  mean IoU (when detected)=${meanIouWhenDetected.toFixed(3)}  IoU>=0.5: ${goodOverlap}/${subset.length}`,
  );
}
console.log("\nLow-IoU cases (<0.3, worth inspecting):");
for (const r of iouResults.filter((r) => r.iou < 0.3)) {
  console.log(`  ${r.id} ${r.region}: IoU=${r.iou.toFixed(3)} detected=${r.detected}`);
}
