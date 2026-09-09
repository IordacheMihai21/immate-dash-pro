// Fallback for subtotal/vatAmount/totalAmount when the items table has no
// matching column (e.g. a table with only Qty/Unit-Price/Total, where the
// VAT breakdown appears only in a separate summary block below the table --
// samples/waystar_two_column_party_block.png is exactly this case: its
// table has no "Valoare"/subtotal column at all, subtotal only appears as
// "Valoare fara TVA: 8403.36 RON" below the table).
//
// RESOLVER_DESIGN.md's relation table describes this as
// "totals_region label-value pair" and assumes a detected totals_region
// bbox to scope it. In practice, PP-StructureV3's layout detector did not
// emit any region at all covering that text on the one real document tested
// here (see RUN_LOG.md/smoke test) -- so this resolves label-value ROW pairs
// across the whole document's OCR lines instead of requiring a pre-detected
// region, which is what the real engine output actually supports today.
// This is a deliberately narrower mechanism than tableResolver.ts's
// column-geometry approach -- same-row (Y-overlap) label-then-value
// proximity, nothing else -- and is only ever consulted as a fallback AFTER
// the table-column path returns null, never as a competing primary source
// (see resolveAmountsWithFallback below), so it can't override a
// table-column answer that's already correct.

import type { BBox } from "./types";

// A CandidateLine-shaped input (matches invoiceCandidateEngine.ts's own
// CandidateLine, kept structurally compatible rather than re-imported, to
// avoid this file depending on src/lib for its core type).
export type TextLine = { text: string; bbox?: BBox };

const SUBTOTAL_LABEL_PATTERN = /\b(valoare\s*fara\s*tva|subtotal|net\s*amount|valoare\s*neta)\b/i;
const VAT_LABEL_PATTERN = /\b(tva|vat)\b/i;
const TOTAL_LABEL_PATTERN = /\b(total\s*de\s*plata|total\s*general|grand\s*total|total)\b/i;

function rowsOverlap(a: BBox, b: BBox): boolean {
  const aTop = a.y;
  const aBottom = a.y + a.height;
  const bTop = b.y;
  const bBottom = b.y + b.height;
  return aTop < bBottom && bTop < aBottom;
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^\d,.\s-]/g, "").trim();
  const normalized = cleaned.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

// For each label pattern, finds the label line, then the value on the SAME
// row (Y-overlap) positioned to its right with the smallest X gap -- the
// same "same row, label-then-value" relation RESOLVER_DESIGN.md specifies
// for invoice_number_label -> invoice_number_value etc.
//
// `excludePattern` guards a genuine linguistic gotcha found via the 26-doc
// benchmark (dev-split document v3_002, so fixable under the "don't tune
// against eval" rule): Romanian "Valoare fara TVA" ("value WITHOUT VAT" --
// the subtotal label) contains the literal word "TVA", so a naive
// /\btva\b/i label pattern matches it and misreads the subtotal as the VAT
// amount. This isn't a per-document hack -- "fara TVA" / "net of VAT" is a
// standard phrasing pattern that any VAT-label heuristic over free Romanian
// invoice text needs to exclude structurally, not just for this one corpus.
function resolveLabelValue(lines: TextLine[], labelPattern: RegExp, excludePattern?: RegExp): number | null {
  const labelLine = lines.find(
    (line) =>
      line.bbox &&
      labelPattern.test(line.text) &&
      !/\d{3,}/.test(line.text) &&
      !(excludePattern && excludePattern.test(line.text)),
  );
  if (!labelLine?.bbox) return null;

  const candidates = lines.filter(
    (line) =>
      line !== labelLine &&
      line.bbox &&
      rowsOverlap(labelLine.bbox!, line.bbox) &&
      line.bbox.x > labelLine.bbox!.x,
  );
  if (candidates.length === 0) return null;

  const closest = candidates.reduce((best, current) =>
    current.bbox!.x - labelLine.bbox!.x < best.bbox!.x - labelLine.bbox!.x ? current : best,
  );
  return parseAmount(closest.text);
}

export function resolveTotalsFromLines(lines: TextLine[]): {
  subtotal: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
} {
  return {
    subtotal: resolveLabelValue(lines, SUBTOTAL_LABEL_PATTERN),
    vatAmount: resolveLabelValue(lines, VAT_LABEL_PATTERN, SUBTOTAL_LABEL_PATTERN),
    totalAmount: resolveLabelValue(lines, TOTAL_LABEL_PATTERN),
  };
}

// Table-column result wins whenever it has a value; the label-value fallback
// only fills in fields the table left null. This ordering matters: a table
// column is a stronger structural signal (RESOLVER_DESIGN.md's
// arithmetic-consistency cross-check applies to it, the totals-region
// fallback has no equivalent cross-check of its own), so it must never be
// silently overridden by the fallback.
export function resolveAmountsWithFallback(
  tableAmounts: { subtotal: number | null; vatAmount: number | null; totalAmount: number | null },
  lines: TextLine[],
): { subtotal: number | null; vatAmount: number | null; totalAmount: number | null } {
  const fallback = resolveTotalsFromLines(lines);
  return {
    subtotal: tableAmounts.subtotal ?? fallback.subtotal,
    vatAmount: tableAmounts.vatAmount ?? fallback.vatAmount,
    totalAmount: tableAmounts.totalAmount ?? fallback.totalAmount,
  };
}
