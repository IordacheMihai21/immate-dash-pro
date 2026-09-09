// Proof using REAL PP-StructureV3 engine output (not synthetic data) that
// tableResolver.ts's own header->column->cell assignment, fed only the raw
// OCR text+bbox primitives, recovers the correct TVA=1596.64/Total=10000.00
// mapping on the exact document where PP-StructureV3's OWN reconstructed
// pred_html swapped them (see RUN_LOG.md "Table structure -- the one real
// bug found"). Values below are copied verbatim from
// output/pp_structure/waystar_two_column_party_block/page_0.json's
// table_res_list[0].table_ocr_pred (rec_texts + rec_polys, converted from
// quad polygons to axis-aligned bboxes) -- this is the actual engine run
// from RUN_LOG.md, not a hand-built fixture.
//
// Run with: node --experimental-strip-types verify_real_pp_structure_table.ts

import { buildItemsTable, resolveTotalAmount, resolveVatAmount } from "./tableResolver.ts";
import type { Region, TableCell } from "./types.ts";

const tableRegion: Region = {
  type: "items_table",
  bbox: { x: 0, y: 296, width: 1746, height: 119 },
  boundaryConfidence: 0.58, // PP-StructureV3's own layout_det_res score for this table region
};

// Verbatim from table_ocr_pred.rec_texts[0:5] + rec_polys[0:5], converted to
// {x,y,width,height}.
const headerCells: TableCell[] = [
  { value: "Denumire produs/serviciu", bbox: { x: 2, y: 304, width: 356, height: 36 }, columnIndex: null },
  { value: "Cantitate", bbox: { x: 738, y: 307, width: 123, height: 38 }, columnIndex: null },
  { value: "Pret unitar", bbox: { x: 995, y: 310, width: 141, height: 34 }, columnIndex: null },
  { value: "TVA", bbox: { x: 1283, y: 311, width: 64, height: 36 }, columnIndex: null },
  { value: "Total", bbox: { x: 1507, y: 313, width: 73, height: 33 }, columnIndex: null },
];

// Verbatim from table_ocr_pred.rec_texts[5:10] + rec_polys[5:10] -- the SAME
// raw OCR data whose flattened cell_box_list ordering caused
// PP-StructureV3's own pred_html to emit
// <td>8403.36</td><td>10000.00</td><td>1596.64</td> (TVA/Total swapped).
// We never touch cell_box_list or pred_html here -- only text+bbox.
const dataRow: TableCell[] = [
  { value: "Consultanta strategica Q2 2025", bbox: { x: 0, y: 364, width: 403, height: 35 }, columnIndex: null },
  { value: "1", bbox: { x: 738, y: 367, width: 25, height: 34 }, columnIndex: null },
  { value: "8403.36", bbox: { x: 993, y: 367, width: 107, height: 36 }, columnIndex: null },
  { value: "1596.64", bbox: { x: 1288, y: 374, width: 99, height: 27 }, columnIndex: null },
  { value: "10000.00", bbox: { x: 1512, y: 373, width: 115, height: 30 }, columnIndex: null },
];

const table = buildItemsTable(tableRegion, headerCells, [dataRow]);
const vatAmount = resolveVatAmount(table);
const totalAmount = resolveTotalAmount(table);

console.log("vatAmount (via our column resolver):", vatAmount);
console.log("totalAmount (via our column resolver):", totalAmount);
console.log("PP-StructureV3's OWN pred_html for this document said: TVA=10000.00, Total=1596.64 (WRONG)");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${message}`);
}

assert(
  vatAmount === 1596.64,
  "our resolver gets vatAmount=1596.64 (correct) from the same raw OCR PP-StructureV3 produced, despite PP-StructureV3's own html getting this wrong",
);
assert(
  totalAmount === 10000.0,
  "our resolver gets totalAmount=10000.00 (correct) from the same raw OCR PP-StructureV3 produced",
);
