// End-to-end v2-vs-v3 smoke test on ONE real document, using REAL engine
// output copied verbatim from output/profiling/light/waystar_two_column_party_block/page_0.json
// (PP-StructureV3, light/mobile-OCR config) -- not synthetic data. Proves
// the v2v3Bridge.ts wiring actually works before running it across the full
// 20-30 document benchmark corpus. Produces the field-level diff table item
// 6 asks for: field | ground truth | v2 | v3 | v2 correct? | v3 correct?
//
// Run with: node --experimental-strip-types smoke_test_v2v3.ts

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

// Verbatim from overall_ocr_res.rec_texts + rec_boxes (axis-aligned
// [x0,y0,x1,y1] -> {x,y,width,height}), in reading order.
const rawOcrLines: Array<{ text: string; box: [number, number, number, number] }> = [
  { text: "FACTURĂ", box: [69, 67, 271, 121] },
  { text: "Seria /Nr.: FACT-0170", box: [1432, 71, 1679, 103] },
  { text: "Data: 05.06.2025", box: [1488, 103, 1680, 130] },
  { text: "FURNIZOR", box: [72, 169, 192, 194] },
  { text: "CLIENT", box: [920, 165, 1008, 196] },
  { text: "WAYSTAR ROYCO SRL", box: [70, 201, 364, 233] },
  { text: "KENDALL ROY", box: [919, 200, 1109, 235] },
  { text: "Str. Panorama nr. 5, Bucuresti", box: [72, 233, 426, 264] },
  { text: "Str. Logan nr. 1, Cluj-Napoca", box: [918, 231, 1261, 267] },
  { text: "CUI:RO12345678", box: [72, 263, 294, 293] },
  { text: "CUI: RO123456", box: [921, 262, 1112, 292] },
  { text: "Denumire produs/serviciu", box: [93, 347, 391, 378] },
  { text: "Cantitate", box: [736, 344, 849, 379] },
  { text: "Pret unitar", box: [974, 344, 1104, 378] },
  { text: "TVA", box: [1241, 343, 1301, 379] },
  { text: "Total", box: [1451, 345, 1522, 378] },
  { text: "Consultanta strategica Q2 2025", box: [92, 398, 433, 431] },
  { text: "1", box: [737, 399, 757, 430] },
  { text: "8403.36", box: [973, 396, 1071, 431] },
  { text: "1596.64", box: [1244, 398, 1338, 430] },
  { text: "10000.00", box: [1454, 398, 1563, 430] },
  { text: "Valoare fara TVA", box: [1089, 466, 1276, 496] },
  { text: "8403.36 RON", box: [1404, 468, 1557, 495] },
  { text: "TVA (19%)", box: [1085, 502, 1213, 541] },
  { text: "1596.64RON", box: [1404, 506, 1559, 537] },
  { text: "Total de plata", box: [1086, 546, 1250, 583] },
  { text: "10000.00 RON", box: [1405, 550, 1569, 578] },
];

function toBBox([x0, y0, x1, y1]: [number, number, number, number]) {
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const lines: CandidateLine[] = rawOcrLines.map((l) => ({ text: l.text, bbox: toBBox(l.box) }));
const text = rawOcrLines.map((l) => l.text).join("\n");

// Verbatim from layout_det_res.boxes (light-corrected run).
const layoutBoxes: PPStructureLayoutBox[] = [
  { label: "text", coordinate: [917.2, 170.0, 1257.8, 288.2], score: 0.85 },
  { label: "header", coordinate: [1430.5, 75.9, 1674.6, 124.9], score: 0.8 },
  { label: "table", coordinate: [77.0, 332.2, 1674.2, 440.8], score: 0.6 },
  { label: "text", coordinate: [69.5, 169.9, 424.4, 287.9], score: 0.68 },
  { label: "paragraph_title", coordinate: [70.7, 73.4, 265.8, 113.1], score: 0.47 },
];

const { regions } = buildRegionsFromPPStructureLayout(layoutBoxes);

// --- v2 ---
const v2Result = runV2(text, lines, 0.9);
const v2 = {
  supplierName: v2Result.fields.supplierName.value,
  supplierCui: v2Result.fields.supplierCui.value,
  customerName: v2Result.fields.customerName.value,
  customerCui: v2Result.fields.customerCui.value,
  subtotal: v2Result.fields.subtotal.value,
  vatAmount: v2Result.fields.vatAmount.value,
  totalAmount: v2Result.fields.totalAmount.value,
};

// --- v3 (region-gated candidates, same candidate pool as v2) ---
const v3Parties = resolvePartiesViaV3(v2Result, lines, regions);

const tableRegion: Region = regions.find((r) => r.type === "items_table")!;
const headerCells: TableCell[] = [
  { value: "Denumire produs/serviciu", bbox: toBBox([93, 347, 391, 378]), columnIndex: null },
  { value: "Cantitate", bbox: toBBox([736, 344, 849, 379]), columnIndex: null },
  { value: "Pret unitar", bbox: toBBox([974, 344, 1104, 378]), columnIndex: null },
  { value: "TVA", bbox: toBBox([1241, 343, 1301, 379]), columnIndex: null },
  { value: "Total", bbox: toBBox([1451, 345, 1522, 378]), columnIndex: null },
];
const dataRow: TableCell[] = [
  { value: "Consultanta strategica Q2 2025", bbox: toBBox([92, 398, 433, 431]), columnIndex: null },
  { value: "1", bbox: toBBox([737, 399, 757, 430]), columnIndex: null },
  { value: "8403.36", bbox: toBBox([973, 396, 1071, 431]), columnIndex: null },
  { value: "1596.64", bbox: toBBox([1244, 398, 1338, 430]), columnIndex: null },
  { value: "10000.00", bbox: toBBox([1454, 398, 1563, 430]), columnIndex: null },
];
const { amounts: v3Amounts } = resolveAmountsViaV3(tableRegion, headerCells, [dataRow], lines);

const v3 = {
  supplierName: v3Parties.supplierName,
  supplierCui: v3Parties.supplierCui,
  customerName: v3Parties.customerName,
  customerCui: v3Parties.customerCui,
  subtotal: v3Amounts.subtotal,
  vatAmount: v3Amounts.vatAmount,
  totalAmount: v3Amounts.totalAmount,
};

// --- ground truth (read directly off the source invoice image) ---
const groundTruth: Record<keyof typeof v2, string | number> = {
  supplierName: "WAYSTAR ROYCO SRL",
  supplierCui: "RO12345678",
  customerName: "KENDALL ROY",
  customerCui: "RO123456",
  subtotal: 8403.36,
  vatAmount: 1596.64,
  totalAmount: 10000.0,
};

console.log("field".padEnd(14), "ground truth".padEnd(20), "v2".padEnd(20), "v3".padEnd(20), "v2 ok", "v3 ok");
console.log("-".repeat(90));
let v2Correct = 0;
let v3Correct = 0;
for (const field of Object.keys(groundTruth) as Array<keyof typeof v2>) {
  const expected = groundTruth[field];
  const v2Cmp = compareField(v2[field], expected, field as never);
  const v3Cmp = compareField(v3[field], expected, field as never);
  if (v2Cmp.correct) v2Correct += 1;
  if (v3Cmp.correct) v3Correct += 1;
  console.log(
    field.padEnd(14),
    String(expected).padEnd(20),
    String(v2[field] ?? "∅").padEnd(20),
    String(v3[field] ?? "∅").padEnd(20),
    v2Cmp.correct ? "✓" : "✗",
    "   ",
    v3Cmp.correct ? "✓" : "✗",
  );
}
console.log("-".repeat(90));
console.log(`v2: ${v2Correct}/7 correct   v3: ${v3Correct}/7 correct`);
