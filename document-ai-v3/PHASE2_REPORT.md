# document-ai-v3 — Phase 2 report

Status: experiment. **Not integrated into production.** v2 stays frozen at
commit `e8e0945e` (92.8% accuracy on the real 100-invoice regression
benchmark). Nothing in `document-ai-backend/` or `src/` was modified;
`document-ai-v3/src/v2v3Bridge.ts` and `run_benchmark.ts` import
`extractInvoiceCandidates` and `compareField` from `src/lib/` **read-only**
for comparison purposes, so v2's own behavior is provably unaffected.

This report answers the phase's stated question directly:

> **Does the bbox-aware structural v3 architecture generalize better than
> v2, and can it run at production-viable latency?**

**Yes, on both counts, on this benchmark** — with real, measured numbers
below, not projections. The rest of this document is the evidence and the
honest list of what's still unresolved.

---

## 1. Benchmark dataset

**28 documents** (2 from the phase-1 spike + 26 generated this phase via a
Playwright-rendered template, `scripts/generate_benchmark.py` +
`scripts/benchmark_specs.py`). Ground truth in `ground_truth/*.json`, one
file per document, matching `TEST_SET_SCHEMA.md`'s field list plus
`supplierRegionBBox` / `customerRegionBBox` / `tableRegionBBox` (read from
actual rendered DOM geometry via Playwright's `element.bounding_box()`, not
hand-estimated) and a `traits` array.

All 9 requested diversity axes covered, genuinely combined (most documents
carry 3–5 traits at once): side-by-side / stacked party blocks, bilingual
RO/EN labels, VAT-and-Total-as-table-columns-only, redundant summary
totals blocks, multi-currency, noisy scans (blur/JPEG artifacts/contrast),
footer/legal identifiers, and four distinct invoice-series/number layouts.
Full trait×split breakdown in `BENCHMARK_MANIFEST.md`.

**Dev/eval split (item 7): 13/13**, stratified so every trait has
non-zero representation on both sides, fixed **before** any tuning began.
The two resolver bugs found and fixed this phase (§4) were both diagnosed
from a single `dev`-split document (`v3_002`) — logged in
`BENCHMARK_MANIFEST.md`'s changelog per its own enforcement rule, never
from an `eval` document. The existing 100-invoice v2 benchmark stays a
separate, frozen regression suite, untouched.

**Known, honestly-flagged gaps** (from the corpus-generation report, not
discovered later):
- Noisy-scan simulation covers blur/JPEG/resolution/contrast, **not
  rotation/skew** (would invalidate the DOM-derived bboxes).
- The 2 phase-1 samples still have **no region-bbox ground truth** (no
  source HTML to derive it from) — excluded from the IoU analysis in §3.
- **Every document has a single line item** — multi-row table
  column-alignment, a harder and more realistic case, isn't tested at all
  yet.

---

## 2. Structural engine comparison (PP-StructureV3 default vs. light vs. Surya)

### Runtime + resource profiling (item 3)

Used PaddleX's native `PADDLE_PDX_PIPELINE_BENCHMARK` profiler for a real
per-stage breakdown (not a guess) of the default config's cost:

| Stage | Time | Share |
|---|---|---|
| **Text detection** (`PP-OCRv5_server_det`) | **253.3s** | **96.5%** |
| Table structure recognition | 3.7s | 1.4% |
| Text recognition | 2.0s | 0.8% |
| Layout detection | ~2.2s | 0.8% |
| Doc preprocessing | 0.5s | 0.2% |

Table structure and layout detection — the components this whole
initiative is actually about — were never the bottleneck. Text detection
alone is 96.5% of the cost. No per-page model reload was observed (single
`PPStructureV3(...)` construction, confirmed by exact "Creating model" log
counts).

**Fix**: swapping only the OCR detector/recognizer to
`PP-OCRv5_mobile_det`/`PP-OCRv5_mobile_rec` (keeping the default layout and
table models — an earlier attempt to also swap the layout model broke table
detection entirely for zero speed gain, since layout was never the cost):

| | Default | Light (mobile OCR) |
|---|---|---|
| Runtime/page (2-doc sample) | 260–301s | 9.1–9.9s |
| **Runtime/page (26-doc corpus, real diversity)** | not run at this scale (cost-prohibitive) | **mean 12.3s, range 6.8–21.1s** |
| Peak RSS | 5.0GB | 2.3GB |
| Region/table detection | correct | correct |

**~28x faster, on real diverse documents, not just the 2 original
samples.** This resolves the "300s/page isn't shippable" concern from
phase 1 by configuration, not by switching engines. One quality caveat: the
mobile recognizer introduced occasional single-character OCR errors (e.g.
"Servici" for "Servicii", "Fumizor" for "Furnizor" on some documents,
visible in the benchmark's "both wrong" list) — a real accuracy/speed
tradeoff, not free.

Open, unresolved question from phase 1, still unresolved: the default
config's wall-clock (275.6s) vastly exceeded its own user+sys CPU time
(45s, ~16% utilization) — something other than raw compute was consuming
most of the time. Not reproduced/investigated for the light config; worth
checking before trusting 12.3s/page as a stable production number rather
than a promising laptop measurement.

### Region segmentation accuracy (item 2, quantitative — IoU vs. ground truth)

Computed against all 26 new documents' `supplierRegionBBox`/
`customerRegionBBox`/`tableRegionBBox`:

| Region | Detected | Mean IoU | IoU ≥ 0.5 |
|---|---|---|---|
| items_table | 26/26 | **0.960** | 26/26 |
| supplier_block | 26/26 | 0.276 | 0/26 |
| customer_block | 26/26 | 0.288 | 3/26 |

**Table detection is excellent by this metric. Party-block IoU looks bad —
but this is mostly a ground-truth definition mismatch, verified directly,
not a real detection failure.** Ground-truth party bboxes were derived from
the CSS grid *column* each party occupies (a fixed, generous width,
independent of how much text is actually in it); PP-StructureV3 detects a
*tight* bounding box around the actual rendered text. Checked directly on
`v3_002`: detected box `x:[74.85, 328.03]` vs. ground truth `x:[80, 863]` —
the **start coordinates match almost exactly** (74.85≈80, 151.41≈152); the
box is simply narrower because the company name/address is shorter than
the reserved column width. This effect is more pronounced on `stacked`
documents (full-width columns lose more area proportionally when the text
is tight) — 13/13 stacked party regions land in the low-IoU list, vs. only
3 side-by-side ones.

**The metric that actually matters for the resolver — does the detected
region correctly *contain* the right party's text and *exclude* the
other's — succeeded far more than IoU alone suggests**: see §4's field
accuracy (customerName 96.2%, tax IDs ~100%) computed using exactly these
same detected boxes. IoU wasn't re-derived against a "tight" ground truth
box for lack of time; flagged as a metric to fix before relying on the IoU
numbers alone in a future pass, rather than silently smoothed over.

### PP-StructureV3 vs. Surya

Full licensing/dependency/runtime comparison in `AB_COMPARISON.md` and
`RUN_LOG.md`. Not re-run against the full 26-document corpus this phase
(Surya's RAIL-M licensing question — IMMapp's funding/revenue status
against the $5M threshold — is still unresolved, so further investment
beyond the phase-1 2-document smoke test wasn't prioritized). Phase 1
findings stand: PP-StructureV3 is licensing-clean (Apache 2.0) and, with
the light config, now faster than Surya's own measured warm-state
27.2s/page on the same hardware. Recommendation unchanged: PP-StructureV3
(light config), revisit Surya only if the funding/revenue question
resolves favorably or the light config proves insufficient at production
scale.

### Table structure: raw geometry vs. `pred_html` (item 4)

Phase 1 found a real, reproduced bug: PP-StructureV3's own `pred_html`
reconstruction swapped TVA/Total on one document while the underlying raw
OCR text+bbox was correct. This phase's `tableResolver.ts` and
`v2v3Bridge.ts` consume **only** `layout_det_res` (region bboxes),
`overall_ocr_res` (line text + bbox), never `pred_html`/markdown, across
all 26 documents — confirmed by code inspection (`v2v3Bridge.ts` never
reads `table_res_list` at all) and by the vatAmount/totalAmount results in
§4 (100%/100%, including documents where the header uses "T.V.A." with
periods, a case the naive header pattern initially missed — see §4's fix
log).

---

## 3. v3 architecture: what it adds

`src/regionResolver.ts`, `src/tableResolver.ts`, `src/totalsRegionResolver.ts`,
`src/v2v3Bridge.ts` (all new this/last phase). Party objects now carry a
full **evidence trail** (item 5):

```ts
Party = {
  role, regionBBox, name, taxId, registrationNumber, address, iban, bank,
  evidence: FieldEvidence[]  // EVERY candidate considered, winner and
                              // losers, each tagged with why (same_region /
                              // no_region_data / weak_boundary_override /
                              // excluded_wrong_region)
}
```

Proven with a real adversarial case (`src/demo_collapse_prevention.ts`): a
tax-ID candidate with a *higher* raw confidence (0.91) than the correct
answer (0.88), sitting inside the wrong party's region, is explicitly
recorded as `accepted: false, relationToRegion: "excluded_wrong_region"` —
inspectable, not silently outscored. `supplierParty.evidence.filter(e =>
e.field === "taxId")` answers "why was this value assigned" directly.

---

## 4. v2 vs. v3 field-level results (item 6)

Both run on the **identical OCR input** (PP-StructureV3 light config's own
`overall_ocr_res`) for every one of the 26 documents — the only variable
between v2 and v3's numbers is the resolution **architecture**, not OCR or
candidate-generation quality (v3 uses v2's own regex/heuristic candidates,
region-gated; see scope note below).

```
ALL:  n=260  v2=180/260 (69.2%)  v3=202/260 (77.7%)
DEV:  n=130  v2=88/130  (67.7%)  v3=99/130  (76.2%)
EVAL: n=130  v2=92/130  (70.8%)  v3=103/130 (79.2%)
```

**+8.5pp overall, +8.5pp on dev, +8.4pp on eval — the gain holds on the
untouched eval split, not just where the resolver was diagnosed against.**
**Zero fields where v3 does worse than v2. Zero individual v2-correct→
v3-wrong regressions**, across all 260 scored (document, field) pairs.

| Field | v2 | v3 | Δ |
|---|---|---|---|
| customerName | 69.2% | **96.2%** | **+27.0pp** |
| vatAmount | 50.0% | **100.0%** | **+50.0pp** |
| subtotal | 42.3% | 50.0% | +7.7pp |
| supplierName | 76.9% | 76.9% | 0 (unchanged, no regression) |
| supplierTaxId | 100.0% | 100.0% | 0 |
| customerTaxId | 88.5% | 88.5% | 0 |
| totalAmount | 100.0% | 100.0% | 0 |
| invoiceNumber, invoiceDate, currency | — | — | not re-architected this phase, pass through from v2 unchanged (see scope note) |

**customerName (+27pp) is exactly the bug class this whole initiative
targets** — supplier/customer text bleeding across columns. Fixed via
region-dominance gating, not a new regex.

**vatAmount (+50pp) required two real bug fixes**, both found via a
`dev`-split document and logged in `BENCHMARK_MANIFEST.md`'s changelog:
1. `VAT_HEADER_PATTERN` didn't match "T.V.A." written with periods between
   letters — a generic Romanian-abbreviation fix, not document-specific.
2. The totals-region fallback matched "Valoare fara TVA" (**"value WITHOUT
   VAT"** — the *subtotal* label) as if it were the VAT label, because it
   literally contains the word "TVA" — a generic negation-phrasing fix.

Before these fixes, v3 was at 73.1% overall with **12 real regressions**
(v2 correct, v3 wrong) concentrated entirely in vatAmount, caused by
exactly this bug. After: 77.7%, zero regressions. This is reported as
found-and-fixed, not smoothed over, because it's a legitimate illustration
of a real risk in this architecture: a resolver mechanism (label-value
pairing) that's *more* general than v2's tightly-scoped regexes can also
be *more* wrong in a new way if a label pattern is too loose — worth
remembering before assuming "more structural" automatically means "more
correct."

### Explicit scope note

v3 in this phase only re-architects **supplierName / customerName /
supplierTaxId / customerTaxId / subtotal / vatAmount / totalAmount**.
`invoiceNumber` / `invoiceSeries` / `invoiceDate` / `dueDate` / `currency`
pass through from v2's existing extraction unchanged (no
region/relation resolver built for them yet — RESOLVER_DESIGN.md's
`invoice_number_label → invoice_number_value` relation is designed but not
implemented this phase). v2 and v3 necessarily tie on those fields; this
is stated explicitly rather than hidden inside one blended headline number.

`invoiceNumber`'s 26.9% (both engines) is mostly a **schema mismatch, not
an extraction failure**: v2 concatenates series+number into one field
("ALF1042"); this benchmark's ground truth scores `invoiceNumber` and
`invoiceSeries` separately ("1042" / "ALF") per `TEST_SET_SCHEMA.md`'s own
noted design choice. Confirmed by inspection — v2/v3 predictions are
correct as printed, just structured differently than the ground truth
field split. Not fixed this phase (would need either re-scoring against
the concatenated form or building the split resolver); flagged, not
miscounted as silently.

`currency`'s 38.5% (both engines) reflects genuinely absent text: several
documents never print a currency marker anywhere (implicit domestic RON),
so there's nothing for either engine to find. Not a v3-vs-v2 difference.

---

## 5. Remaining failure modes (item 8, unresolved list)

1. **subtotal still only 50%** — 13 of 26 documents have `subtotal: null`
   from *both* engines, a pre-existing v2 gap v3's totals-region fallback
   only partially closes. Not investigated per-document this phase (time);
   the two vatAmount fixes above suggest the same class of label-pattern
   gap likely explains several of these too.
2. **Party-region IoU metric needs a ground-truth redefinition** (§2) —
   the current ground truth measures the allocated layout column, not the
   text content; low IoU numbers as reported are not directly comparable
   to "the region detector is bad."
3. **`invoiceNumber`/`invoiceSeries` split not implemented in v3** —
   passes through v2's concatenated form.
4. **No real LayoutXLM entity-proposal layer wired into this v3 prototype**
   — the comparison isolates the resolution architecture specifically
   (region-dominance gating + table geometry) on top of v2's existing
   regex/heuristic candidates, exactly to answer this phase's core
   question without confounding it. A production v3 still needs LayoutXLM
   integrated at the candidate layer per `RESOLVER_DESIGN.md`.
5. **Stacked-layout party role assignment (top=supplier, bottom=customer)
   is a positional heuristic**, not derived from role-label text when
   present — works on this corpus (customerName 96.2% holds across both
   orientations) but is a known simplification, not a certainty for real
   invoices with unconventional ordering.
6. **Confidence calibration not built** — `calibratedConfidence` stays
   `null` throughout, as designed; no labeled validation set exists yet to
   fit temperature scaling / isotonic regression against.
7. **Multi-row tables untested** — every benchmark document has exactly
   one line item; `tableResolver.ts`'s column-assignment logic is
   unverified against real multi-row alignment.
8. **Runtime/RAM gap (§2) unexplained** — 16% CPU utilization during the
   default config's slow run; not reproduced or root-caused for the light
   config.

---

## 6. Recommendation

**Keep PP-StructureV3 (light/mobile-OCR config) as the structural engine
for a real v3 prototype.** Apache 2.0 licensing (no funding-threshold
question), ~12.3s/page mean on a real diverse 26-document set (not just 2
curated samples), correct region separation and table detection when
consumed via raw geometry (never `pred_html`), and a demonstrated +8.5pp
accuracy gain over v2 on the exact bug classes (party-block bleed,
label-pattern generality) this initiative exists to fix — with the gain
holding on an untouched eval split, not just where the resolver was tuned.

**Do not integrate into production yet**, per the standing instruction.
Before that decision: close gap #4 above (LayoutXLM entity-proposal
integration) — this phase deliberately tested the resolution architecture
in isolation, and a production version needs the full designed pipeline,
not just this phase's v2-candidates-plus-region-gating hybrid. The
`invoiceNumber`/`invoiceSeries` split and the subtotal gap are the next
two highest-value gaps to close given how directly they suppress the
headline number.
