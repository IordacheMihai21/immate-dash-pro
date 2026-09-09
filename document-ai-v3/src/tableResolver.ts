// Table subsystem: header->column->cell mapping by X-position, not generic
// amount-regex search. Kept separate from regionResolver.ts because it is
// genuinely different machinery (geometric column alignment vs. party-region
// gating) -- see RESOLVER_DESIGN.md "Table subsystem".

import type { BBox, ItemsTable, Region, TableCell, TableColumn, TableRow } from "./types";

// Generic header-label vocabulary only -- no company-specific terms, no
// document IDs. Bilingual (RO/EN) because that's a documented v2 failure
// mode (bilingual role labels). The `t\.?v\.?a\.?` branch handles "T.V.A."
// written with periods between each letter (found via the 26-doc benchmark,
// dev-split document -- a plain /\btva\b/i missed it entirely, since
// "T.V.A." contains no contiguous "tva" substring, silently falling through
// to the totals-region fallback on every document using this common
// Romanian abbreviation style instead of resolving from the table directly).
const VAT_HEADER_PATTERN = /\bt\.?v\.?a\.?\b|\bvat\b/i;
const TOTAL_HEADER_PATTERN = /\btotal\b/i;
const SUBTOTAL_HEADER_PATTERN = /\b(valoare|subtotal|net|fara\s*tva)\b/i;

function bboxCenterX(bbox: BBox): number {
  return bbox.x + bbox.width / 2;
}

// Builds column X-ranges from a detected header row. headerCells must
// already be in reading order (left to right); each column's xRange spans
// from its own left edge to the next header's left edge (or +Infinity for
// the last column), so a data cell slightly misaligned from its header's
// exact bbox still falls inside the right column.
export function buildColumnsFromHeaderRow(headerCells: TableCell[]): TableColumn[] {
  const sorted = [...headerCells].sort((a, b) => a.bbox.x - b.bbox.x);
  return sorted.map((cell, index) => {
    const nextCell = sorted[index + 1];
    const xStart = cell.bbox.x;
    const xEnd = nextCell ? nextCell.bbox.x : Number.POSITIVE_INFINITY;
    return {
      headerText: cell.value,
      headerBBox: cell.bbox,
      xRange: [xStart, xEnd],
    };
  });
}

// Assigns each data cell to the column whose xRange contains the cell's
// center X. Falls back to nearest-xRange-midpoint when no range contains it
// (OCR/segmentation edge case: a cell bbox extends slightly past its
// column's boundary) -- never leaves a cell unassigned when columns exist.
export function assignCellToColumn(cell: TableCell, columns: TableColumn[]): number | null {
  if (columns.length === 0) return null;
  const centerX = bboxCenterX(cell.bbox);

  const directIndex = columns.findIndex((col) => centerX >= col.xRange[0] && centerX < col.xRange[1]);
  if (directIndex !== -1) return directIndex;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  columns.forEach((col, index) => {
    const midpoint =
      col.xRange[1] === Number.POSITIVE_INFINITY ? col.xRange[0] : (col.xRange[0] + col.xRange[1]) / 2;
    const distance = Math.abs(centerX - midpoint);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function buildItemsTable(
  region: Region,
  headerCells: TableCell[],
  dataRows: TableCell[][],
): ItemsTable {
  const columns = buildColumnsFromHeaderRow(headerCells);
  const rows: TableRow[] = dataRows.map((rowCells) => ({
    cells: rowCells.map((cell) => ({
      ...cell,
      columnIndex: assignCellToColumn(cell, columns),
    })),
  }));
  return { region, columns, rows };
}

function findColumnIndexByHeaderPattern(columns: TableColumn[], pattern: RegExp): number | null {
  const index = columns.findIndex((col) => pattern.test(col.headerText));
  return index === -1 ? null : index;
}

function sumColumn(table: ItemsTable, columnIndex: number): number | null {
  const values = table.rows
    .flatMap((row) => row.cells)
    .filter((cell) => cell.columnIndex === columnIndex)
    .map((cell) => Number.parseFloat(cell.value.replace(/[^\d.-]/g, "")))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

// Header-resolved lookups -- the actual fix for v2's TVA/Total confusion.
// These read the value from the column whose HEADER says "TVA"/"Total", not
// from "whichever number on the page looks total-shaped."
export function resolveVatAmount(table: ItemsTable): number | null {
  const columnIndex = findColumnIndexByHeaderPattern(table.columns, VAT_HEADER_PATTERN);
  return columnIndex === null ? null : sumColumn(table, columnIndex);
}

export function resolveTotalAmount(table: ItemsTable): number | null {
  const columnIndex = findColumnIndexByHeaderPattern(table.columns, TOTAL_HEADER_PATTERN);
  return columnIndex === null ? null : sumColumn(table, columnIndex);
}

export function resolveSubtotal(table: ItemsTable): number | null {
  const columnIndex = findColumnIndexByHeaderPattern(table.columns, SUBTOTAL_HEADER_PATTERN);
  return columnIndex === null ? null : sumColumn(table, columnIndex);
}

// Arithmetic consistency is a CROSS-CHECK on header-resolved values, not the
// resolution mechanism itself -- see RESOLVER_DESIGN.md. Returns null (not
// false) when any operand is missing, since "can't check" is a different
// state from "checked and failed."
export function checkArithmeticConsistency(
  subtotal: number | null,
  vatAmount: number | null,
  totalAmount: number | null,
  tolerance = 0.02,
): boolean | null {
  if (subtotal === null || vatAmount === null || totalAmount === null) return null;
  return Math.abs(subtotal + vatAmount - totalAmount) <= tolerance;
}
