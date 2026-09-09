// Proof of the header->column->cell mapping on the exact case named in
// RESOLVER_DESIGN.md: TVA -> 1596.64, Total -> 10000.00, from
// samples/waystar_two_column_party_block.png's items table. Bboxes below
// approximate that table's real column X-positions (header row: Denumire,
// Cantitate, Pret unitar, TVA, Total). Run with:
// node --experimental-strip-types demo_table_resolver.ts

import { buildItemsTable, checkArithmeticConsistency, resolveTotalAmount, resolveVatAmount } from "./tableResolver.ts";
import type { Region, TableCell } from "./types.ts";

const tableRegion: Region = {
  type: "items_table",
  bbox: { x: 76, y: 330, width: 1600, height: 90 },
  boundaryConfidence: 0.93,
};

const headerCells: TableCell[] = [
  { value: "Denumire produs/serviciu", bbox: { x: 90, y: 335, width: 650, height: 30 }, columnIndex: null },
  { value: "Cantitate", bbox: { x: 740, y: 335, width: 210, height: 30 }, columnIndex: null },
  { value: "Pret unitar", bbox: { x: 970, y: 335, width: 240, height: 30 }, columnIndex: null },
  { value: "TVA", bbox: { x: 1230, y: 335, width: 210, height: 30 }, columnIndex: null },
  { value: "Total", bbox: { x: 1460, y: 335, width: 210, height: 30 }, columnIndex: null },
];

// A single data row -- cell X-positions roughly under their respective
// headers, exactly the layout a table-structure engine would hand back.
const dataRow: TableCell[] = [
  { value: "Consultanta strategica Q2 2025", bbox: { x: 90, y: 375, width: 650, height: 30 }, columnIndex: null },
  { value: "1", bbox: { x: 740, y: 375, width: 210, height: 30 }, columnIndex: null },
  { value: "8403.36", bbox: { x: 970, y: 375, width: 240, height: 30 }, columnIndex: null },
  { value: "1596.64", bbox: { x: 1230, y: 375, width: 210, height: 30 }, columnIndex: null },
  { value: "10000.00", bbox: { x: 1460, y: 375, width: 210, height: 30 }, columnIndex: null },
];

const table = buildItemsTable(tableRegion, headerCells, [dataRow]);

const vatAmount = resolveVatAmount(table);
const totalAmount = resolveTotalAmount(table);
const subtotal = 8403.36; // resolveSubtotal would find this too; hardcoded here only to exercise the arithmetic check
const consistent = checkArithmeticConsistency(subtotal, vatAmount, totalAmount);

console.log("vatAmount:", vatAmount);
console.log("totalAmount:", totalAmount);
console.log("arithmeticConsistency:", consistent);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${message}`);
}

assert(vatAmount === 1596.64, "vatAmount resolves via the TVA-labeled column, not a text search");
assert(totalAmount === 10000.0, "totalAmount resolves via the Total-labeled column, not a text search");
assert(vatAmount !== totalAmount, "TVA and Total do not get confused with each other");
assert(consistent === true, "subtotal + vat == total passes as a cross-check on the header-resolved values");
