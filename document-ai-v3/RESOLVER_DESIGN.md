# document-ai-v3 — relation-aware joint resolver (design)

Experimental design, not implemented against production data yet. Depends on
the region-segmentation layer (PP-StructureV3, pending empirical results in
`RUN_LOG.md`) actually producing usable region/table output on real RO
invoices before this gets built for real.

## Pipeline shape

```
image
  │
  ├─→ OCR (existing: Tesseract word-level text + bbox + confidence)
  ├─→ LayoutXLM (existing: token classification → entity proposals + confidence)
  └─→ Layout/table structural engine (new: region segmentation + table structure)
                │
                ▼
       region graph: { supplier_block, customer_block, metadata_block,
                        items_table (header row + data rows + column
                        X-ranges), totals_region, footer }
                │
                ▼
        joint resolver (new)
                │
                ▼
   { supplierParty, customerParty, invoiceMeta, lineItems, totals }
                │
                ▼
      confidence layering (model / structural / calibrated)
```

LayoutXLM and the layout engine run independently and in parallel — neither
depends on the other's output. The joint resolver is the first place their
outputs actually meet.

## Region graph

Each region gets: `type` (supplier_block | customer_block | metadata_block |
items_table | totals_region | footer), `bbox`, and the set of OCR
words/LayoutXLM entities whose bbox falls inside it (by containment, not by
nearest-line text matching — this is the structural change from v2).

`items_table` additionally carries: header row (label + X-range per column),
data rows (each cell's value + which header X-range it falls under).

## Party objects

```
supplierParty = {
  name: EntityRef,
  taxId: EntityRef,
  registrationNumber: EntityRef,
  address: EntityRef,
  iban: EntityRef,
  bank: EntityRef,
  regionBBox: BBox,
}
customerParty = {
  name: EntityRef,
  taxId: EntityRef,
  registrationNumber: EntityRef,
  address: EntityRef,
  regionBBox: BBox,   // no iban/bank -- customers don't carry payment routing info on an invoice
}

EntityRef = {
  value: string,
  candidates: Array<{ value, source: "layoutxlm" | "ocr_regex", modelConfidence: number }>,
  region: "supplier_block" | "customer_block" | null,
}
```

Resolved as ONE object per party, from ONE region, in one pass — not as five
independently-scored fields that happen to carry the same role tag. A
candidate whose own bbox falls in the *other* party's region is excluded
from consideration for this object before scoring even runs, not
down-weighted after the fact (see "region dominance" below).

## Relation edges

The resolver operates over a small fixed set of expected relations, each
with its own compatibility check:

| Relation | Compatibility check |
|---|---|
| `supplier_role → supplier_name` | role label and name both inside `supplier_block` |
| `supplier_name → supplier_tax_id` | tax ID inside `supplier_block`, no candidate accepted from `customer_block` |
| `customer_role → customer_name` | role label and name both inside `customer_block` |
| `customer_name → customer_tax_id` | tax ID inside `customer_block`, no candidate accepted from `supplier_block` |
| `invoice_number_label → invoice_number_value` | same row/line or nearest label-right/label-below within `metadata_block` |
| `invoice_date_label → invoice_date_value` | same, within `metadata_block` |
| `vat_label → vat_value` | header cell "TVA"/"VAT" in `items_table`, value in the data row under that column's X-range |
| `total_label → total_value` | header cell "Total" in `items_table`, or `totals_region` label-value pair |

Each relation produces a `score = bboxProximity * semanticCompatibility *
regionMembership` — but region membership is a **gate**, not a smooth
multiplier, for the two tax-ID relations specifically (see below). For the
others it's a strong multiplier (near-zero outside the expected region)
without being an absolute hard gate, since metadata/table regions are less
prone to the specific side-by-side-column ambiguity that motivated the hard
gate for tax IDs.

## Region dominance (the actual fix for this session's bugs)

Stated directly, matching the requirement: **a tax ID whose own bbox falls in
`customer_block` cannot become `supplier_tax_id` without evidence strong
enough to first override the region assignment itself** (e.g. the layout
engine's own region boundary confidence was low, or LayoutXLM's entity
confidence for that assignment is very high AND the region boundary sits
within its own uncertainty margin) — not evidence at the relation-scoring
stage, which is a different appeal than what caused v2's regression.

Why the earlier v2 patch attempt regressed the frozen benchmark, and why
that lesson carries into v3's design: gating occurred after loosely detecting
"is there roughly a two-column layout on this line," which produced false
positives on single-column documents with wide but legitimate word spacing
(a company name with extra tracking, a long field padded by a table cell).
v3's region boundaries come from a real segmentation model trained on
document layouts specifically (not a per-line heuristic gap threshold), which
is the actual reason to expect this to generalize — that's an empirical
claim to verify once the segmentation engine is chosen and run at scale, not
an assumption to build on faith.

## Collapse prevention

`supplierTaxId` and `customerTaxId` are resolved from disjoint region
candidate pools by construction (a customer-region candidate is never in the
supplier pool to begin with), so the "both fields converge on the same
value" failure mode v2 needed an explicit invariant check to catch after the
fact shouldn't be structurally possible in v3's resolver — worth confirming
empirically rather than assuming once real data is flowing.

## Table subsystem

Separate from the party/metadata resolver. Given a layout engine's table
region + header row + cell geometry:

1. Identify header cells by row position (topmost row in the table region)
   and text (label vocabulary: "TVA"/"VAT", "Total", "Valoare", "Cantitate",
   etc. -- generic terms, not company-specific).
2. For each header cell, record its X-range.
3. For each data row, assign each cell to the header whose X-range it falls
   within (by cell-center containment, with a fallback to nearest-X-range
   for OCR/segmentation edge cases).
4. `vatAmount` / `totalAmount` / `subtotal` become header→column lookups,
   not "find a number near a total-shaped label" text search.
5. Arithmetic consistency (subtotal + vat ≈ total) is then a *cross-check*
   on the header-resolved values, not the primary resolution mechanism the
   way it partly is in v2 today.

## Confidence layering

Three separate numbers per resolved field, not one blended score:

- **modelConfidence**: LayoutXLM's own softmax confidence for the winning
  entity proposal (or OCR-regex match strength when LayoutXLM didn't
  propose this field at all).
- **structuralConsistency**: does this value's region membership, relation
  edges, and (for amounts) arithmetic checks all agree — a 0–1 score derived
  from how many of the expected relation checks passed, not a probability.
- **calibratedConfidence**: `modelConfidence` and `structuralConsistency`
  combined via a fitted calibration (temperature scaling or isotonic
  regression) — deferred until v3 has real predictions on a labeled
  validation set to fit against. Until then, do not display a single
  "confidence %" as if it were a calibrated probability; show the two
  component scores separately, or don't show a number at all, rather than
  imply a precision the pipeline doesn't have yet.
