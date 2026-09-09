// Bridges v2's existing candidate generation into v3's region-aware
// resolver, so the v2-vs-v3 comparison (item 6) isolates the ARCHITECTURE
// difference -- region-dominance joint resolution vs. independent
// per-field scoring over flattened lines -- rather than differences in
// regex/heuristic quality. v3's "predictions" from this bridge come from
// re-scoring v2's OWN raw per-field candidates (real bboxes, via
// CandidateLine) through v3's regionResolver + tableResolver, not from a
// separate from-scratch v3 entity extractor.
//
// This file is READ-ONLY with respect to src/lib: it imports
// extractInvoiceCandidates unmodified. Nothing in src/lib or
// document-ai-backend imports from document-ai-v3 -- v2 stays completely
// unaffected either way. See ARCHITECTURE.md.
//
// Explicit scope caveat: this bridge does NOT include a real LayoutXLM
// entity-proposal layer (RESOLVER_DESIGN.md's designed source for v3's
// candidates). It exercises v3's NEW layer only -- region-dominance gating
// and header-based table resolution -- on top of the SAME regex/heuristic
// candidate quality v2 already has. That isolates "does the resolution
// architecture itself help," which is exactly what the user's final
// question (item 8) asks, without confounding it by also changing candidate
// quality. A full production v3 still needs LayoutXLM wired into the
// candidate layer.

import {
  extractInvoiceCandidates,
  type CandidateExtractionResult,
  type CandidateFieldKey,
  type CandidateFieldResult,
  type CandidateLine,
  type FieldCandidate,
} from "../../src/lib/invoiceCandidateEngine.ts";
import { resolveParty } from "./regionResolver.ts";
import { buildItemsTable, resolveSubtotal, resolveTotalAmount, resolveVatAmount } from "./tableResolver.ts";
import { resolveAmountsWithFallback, type TextLine } from "./totalsRegionResolver.ts";
import type { EntityCandidate, ItemsTable, PartyCandidatePools, Region, TableCell } from "./types.ts";

function fieldCandidateToEntity(candidate: FieldCandidate, lines: CandidateLine[]): EntityCandidate | null {
  const line = lines[candidate.lineIndex];
  if (!line?.bbox) return null; // no geometry available -- v3's region gate has nothing to check, so this candidate can't participate in region-aware resolution (it simply doesn't enter the pool, rather than being force-included with a fabricated bbox)
  return {
    value: String(candidate.value),
    source: "ocr_regex",
    modelConfidence: candidate.confidence,
    bbox: line.bbox,
  };
}

// CandidateFieldResult.alternatives is ONLY the runners-up --
// selectBestCandidate in invoiceCandidateEngine.ts explicitly does
// `alternatives: ranked.slice(1, 5)`, excluding rank 0 (the winner) by
// construction. A first version of this bridge fed v3 only `.alternatives`
// and never gave it v2's own best candidate at all -- confirmed via
// _debug_v2_candidates.ts, where v3 ended up choosing "FACTURĂ" for
// supplierName simply because it was the highest-confidence candidate v3
// was ever SHOWN, not because the region gate preferred it over the real
// answer. This function reconstructs the full pool (winner + alternatives)
// by locating the winner's originating line via `sourceText` (the winner
// itself carries no lineIndex -- only FieldCandidate entries do), so v3
// resolves over the same candidate set v2 actually had, not a pre-filtered
// subset missing its own top pick.
function allFieldCandidates(
  fieldResult: CandidateFieldResult,
  alternatives: FieldCandidate[],
  lines: CandidateLine[],
): EntityCandidate[] {
  const result: EntityCandidate[] = [];

  if (fieldResult.value !== null && fieldResult.value !== undefined && fieldResult.sourceText) {
    const winnerLine = lines.find((line) => line.text === fieldResult.sourceText);
    if (winnerLine?.bbox) {
      result.push({
        value: String(fieldResult.value),
        source: "ocr_regex",
        modelConfidence: fieldResult.confidence,
        bbox: winnerLine.bbox,
      });
    }
  }

  for (const candidate of alternatives) {
    const entity = fieldCandidateToEntity(candidate, lines);
    if (entity) result.push(entity);
  }

  return result;
}

export type PPStructureLayoutBox = {
  label: string;
  coordinate: [number, number, number, number]; // [x0, y0, x1, y1], as PP-StructureV3 emits it
  score: number;
};

// Converts PP-StructureV3's raw layout boxes into v3's Region[] shape.
//
// Candidate party-block boxes are "text"-labeled boxes that sit ABOVE the
// table (party blocks always precede the items table on an invoice) and
// BELOW any header/title box (invoice number/date, document title) -- this
// excludes footer/legal-notice text (which sits below the table) without
// needing to know in advance whether a document has one. Among those
// candidates:
//   - exactly 2: decide side-by-side vs. stacked by bbox geometry (not a
//     fixed assumption) -- if their X-ranges overlap by more than 40% of
//     the narrower box's width AND their Y-ranges don't overlap, they're
//     stacked (assign top=supplier, bottom=customer, the conventional
//     issuer-then-recipient reading order); otherwise side-by-side (assign
//     left=supplier, right=customer).
//   - more than 2 (e.g. a document where each address line got its own
//     layout box instead of one merged per-party block): fall back to the
//     two largest-area boxes, on the assumption a multi-line party block is
//     larger than a stray label -- a heuristic, not a certainty, and
//     exactly the kind of case the benchmark's unlabeled/stacked documents
//     exist to surface as a measured failure rate rather than an assumed
//     non-issue.
//   - fewer than 2: no reliable party-block signal at all; left
//     unassigned, and the region-dominance resolver treats candidates
//     outside every region as "no_region_data" (not "wrong region"), so
//     this degrades to v2-like behavior for this document rather than
//     actively hurting it.
export function buildRegionsFromPPStructureLayout(boxes: PPStructureLayoutBox[]): {
  regions: Region[];
  tableBox: PPStructureLayoutBox | null;
} {
  const toBBox = (box: PPStructureLayoutBox) => ({
    x: box.coordinate[0],
    y: box.coordinate[1],
    width: box.coordinate[2] - box.coordinate[0],
    height: box.coordinate[3] - box.coordinate[1],
  });

  const tableBox = boxes.find((box) => box.label === "table") ?? null;
  const headerLikeBoxes = boxes.filter((box) => box.label === "header" || box.label === "paragraph_title");
  const headerBottomY = headerLikeBoxes.length > 0 ? Math.max(...headerLikeBoxes.map((box) => box.coordinate[3])) : 0;
  const tableTopY = tableBox ? tableBox.coordinate[1] : Number.POSITIVE_INFINITY;

  const candidateBoxes = boxes.filter(
    (box) => box.label === "text" && box.coordinate[1] >= headerBottomY - 20 && box.coordinate[3] <= tableTopY + 20,
  );

  let partyBoxes: PPStructureLayoutBox[];
  if (candidateBoxes.length === 2) {
    partyBoxes = candidateBoxes;
  } else if (candidateBoxes.length > 2) {
    const area = (box: PPStructureLayoutBox) =>
      (box.coordinate[2] - box.coordinate[0]) * (box.coordinate[3] - box.coordinate[1]);
    partyBoxes = [...candidateBoxes].sort((a, b) => area(b) - area(a)).slice(0, 2);
  } else {
    partyBoxes = [];
  }

  const regions: Region[] = [];
  if (partyBoxes.length === 2) {
    const [a, b] = partyBoxes;
    const xOverlap = Math.max(0, Math.min(a.coordinate[2], b.coordinate[2]) - Math.max(a.coordinate[0], b.coordinate[0]));
    const yOverlap = Math.max(0, Math.min(a.coordinate[3], b.coordinate[3]) - Math.max(a.coordinate[1], b.coordinate[1]));
    const narrowerWidth = Math.min(a.coordinate[2] - a.coordinate[0], b.coordinate[2] - b.coordinate[0]);
    const isStacked = xOverlap > 0.4 * narrowerWidth && yOverlap === 0;

    const [supplierBox, customerBox] = isStacked
      ? [a, b].sort((x, y) => x.coordinate[1] - y.coordinate[1]) // top first
      : [a, b].sort((x, y) => x.coordinate[0] - y.coordinate[0]); // left first

    regions.push({ type: "supplier_block", bbox: toBBox(supplierBox), boundaryConfidence: supplierBox.score });
    regions.push({ type: "customer_block", bbox: toBBox(customerBox), boundaryConfidence: customerBox.score });
  }
  // Fewer than 2 party-block candidates: left unassigned rather than
  // guessing (see function comment above) -- degrades to v2-like behavior
  // for this document instead of actively hurting it.

  if (tableBox) {
    regions.push({ type: "items_table", bbox: toBBox(tableBox), boundaryConfidence: tableBox.score });
  }

  return { regions, tableBox };
}

export type V3PartyResult = {
  supplierName: string | null;
  supplierCui: string | null;
  customerName: string | null;
  customerCui: string | null;
};

export function resolvePartiesViaV3(
  candidateResult: CandidateExtractionResult,
  lines: CandidateLine[],
  regions: Region[],
): V3PartyResult {
  const supplierPools: PartyCandidatePools = {
    name: allFieldCandidates(
      candidateResult.fields.supplierName,
      candidateResult.fields.supplierName.alternatives,
      lines,
    ),
    taxId: allFieldCandidates(
      candidateResult.fields.supplierCui,
      candidateResult.fields.supplierCui.alternatives,
      lines,
    ),
    registrationNumber: [],
    address: [],
  };
  const customerPools: PartyCandidatePools = {
    name: allFieldCandidates(
      candidateResult.fields.customerName,
      candidateResult.fields.customerName.alternatives,
      lines,
    ),
    taxId: allFieldCandidates(
      candidateResult.fields.customerCui,
      candidateResult.fields.customerCui.alternatives,
      lines,
    ),
    registrationNumber: [],
    address: [],
  };

  const supplierRegion = regions.find((r) => r.type === "supplier_block") ?? null;
  const customerRegion = regions.find((r) => r.type === "customer_block") ?? null;

  const supplierParty = resolveParty("supplier", "supplier_block", supplierRegion?.bbox ?? null, regions, supplierPools);
  const customerParty = resolveParty("customer", "customer_block", customerRegion?.bbox ?? null, regions, customerPools);

  return {
    supplierName: supplierParty.name.value,
    supplierCui: supplierParty.taxId.value,
    customerName: customerParty.name.value,
    customerCui: customerParty.taxId.value,
  };
}

export type V3AmountResult = {
  subtotal: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
};

// Builds an ItemsTable purely from PP-StructureV3's raw OCR text+bbox
// output that falls inside the detected table region -- never from
// pred_html. Caller supplies the already-extracted (text, bbox) pairs for
// the table area (e.g. from overall_ocr_res filtered to the table's bbox,
// or from table_res_list[0].table_ocr_pred converted per
// verify_real_pp_structure_table.ts) plus which of those rows is the
// header row.
// `allLines` (optional): every OCR line on the document, not just the table
// area -- used ONLY as a fallback for whichever of subtotal/vatAmount/
// totalAmount the table-column resolution leaves null (e.g. a table with no
// subtotal column at all, the value only appearing in a summary block below
// the table -- see totalsRegionResolver.ts). A table-column answer, when
// present, is never overridden by it.
export function resolveAmountsViaV3(
  tableRegion: Region,
  headerCells: TableCell[],
  dataRows: TableCell[][],
  allLines: TextLine[] = [],
): { amounts: V3AmountResult; table: ItemsTable } {
  const table = buildItemsTable(tableRegion, headerCells, dataRows);
  const tableAmounts = {
    subtotal: resolveSubtotal(table),
    vatAmount: resolveVatAmount(table),
    totalAmount: resolveTotalAmount(table),
  };
  return {
    amounts: allLines.length > 0 ? resolveAmountsWithFallback(tableAmounts, allLines) : tableAmounts,
    table,
  };
}

// Convenience: v2's own extraction, for the "v2" column of the comparison
// table -- literally just extractInvoiceCandidates + its already-selected
// `.fields[x].value`, unmodified. Kept here so the comparison script has one
// obvious place to get both v2's and v3's predictions from the same input.
export function runV2(text: string, lines: CandidateLine[], ocrConfidence: number): CandidateExtractionResult {
  return extractInvoiceCandidates({ text, lines, ocrConfidence });
}

export type { CandidateFieldKey };
