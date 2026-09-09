# document-ai-v3 structural benchmark — manifest

28 documents total: the 2 pre-existing samples from the first v3 spike, plus
26 new documents generated for this phase (`scripts/generate_benchmark.py` +
`scripts/benchmark_specs.py`). Images in `samples/`, ground truth in
`ground_truth/` (one JSON per document, fields per `TEST_SET_SCHEMA.md` plus
`supplierRegionBBox` / `customerRegionBBox` / `tableRegionBBox` / `traits`).

All companies, CUIs, IBANs, and registration numbers are synthetic
placeholders — no real registered Romanian entities, nothing scraped.
Region bboxes for the 26 new documents come directly from Playwright's
`element.bounding_box()` on the actual rendered DOM, not hand-estimated
coordinates.

## Rule: eval subset stays untouched until the architecture is frozen

**Do not inspect, debug against, or tune the resolver/engine choice using
any `eval`-split document until the v3 architecture is frozen.** Use only
`dev`-split documents (plus the 2 pre-existing samples, see below) while
iterating. This file is the enforcement record for that rule — if a change
was made in response to an eval-split document's specific failure, it
belongs in this file's changelog, not silently.

The existing 100-invoice v2 benchmark (frozen at commit `e8e0945e`, 92.8%
accuracy) stays a **separate, frozen regression suite** — this new set does
not replace or extend it, and is not affected by it.

## The 2 pre-existing samples are dev-only, not eval-eligible

`facturis_unlabeled_supplier_column.png` and
`waystar_two_column_party_block.png` were extensively inspected during the
architecture-design phase — `RESOLVER_DESIGN.md`, `tableResolver.ts`, and
`RUN_LOG.md`'s empirical PP-StructureV3/Surya comparison were all built
looking directly at these two documents' exact values (the TVA=1596.64/
Total=10000.00 case is literally named in the resolver design doc). They are
**not blind** and must never be counted as eval evidence. They also lack
region-bbox ground truth JSON (no source HTML/DOM was available to derive
precise bboxes from for these two — hand-estimating pixel coordinates would
violate the same precision bar applied to the 26 new documents, so this was
left undone rather than faked; a gap flagged for whoever next touches this
corpus, not silently skipped).

## Trait coverage (26 new documents)

| Trait | Total | dev | eval |
|---|---|---|---|
| side_by_side | 13 | 7 | 6 |
| stacked | 13 | 6 | 7 |
| labeled | 14 | 8 | 6 |
| unlabeled | 12 | 5 | 7 |
| bilingual | 10 | 6 | 4 |
| totals_only_table | 13 | 6 | 7 |
| with_summary_table | 13 | 7 | 6 |
| multi_currency | 6 | 3 | 3 |
| noisy_scan | 9 | 5 | 4 |
| footer_legal | 12 | 7 | 5 |
| series_combined | 9 | — | — |
| series_split | 6 | 3 | 3 |
| series_number_only | 5 | 3 | 2 |
| series_alnum_id | 6 | 1 | 5 |

`series_combined` count not split out in this table (it's the majority
default `invoiceSeries`+`invoiceNumber` style, not a stress trait); it's
present across both dev and eval in the raw ground truth. `series_alnum_id`
is the most eval-heavy trait (1 dev / 5 eval) — a known imbalance from the
greedy stratifier prioritizing the higher-cardinality traits first; worth
adding 1-2 more `alnum_id` documents to `dev` before heavy tuning starts if
that trait turns out to matter a lot in early results.

Every trait has non-zero representation in both splits — no trait was
accidentally concentrated entirely in `eval` (which would make it
untestable during development) or entirely in `dev` (which would make it
untested at evaluation time).

## Changelog (dev-split-diagnosed resolver fixes)

Per this file's own enforcement rule: any resolver/engine change made in
response to a specific document's failure must be logged here, and must
only ever be made in response to a `dev`-split (or the 2 pre-existing
samples) document, never `eval`.

- **VAT_HEADER_PATTERN missed "T.V.A." written with periods between each
  letter.** Diagnosed via `v3_002_sbs_unlabeled_footer` (dev). Fixed in
  `src/tableResolver.ts` to `/\bt\.?v\.?a\.?\b|\bvat\b/i`. Generic fix (a
  common Romanian abbreviation style), not tuned to this document's exact
  values.
- **VAT label-value fallback matched "Valoare fara TVA" (the SUBTOTAL
  label, meaning "value WITHOUT VAT") as if it were the VAT label**, because
  it literally contains the word "TVA". Diagnosed via the same document.
  Fixed in `src/totalsRegionResolver.ts`: the VAT label search now excludes
  any line that also matches the subtotal pattern. Generic fix (a standard
  Romanian negation phrasing), not tuned to this document's exact values.

Both fixes were applied, then the FULL 26-document benchmark (dev + eval)
was re-scored once, unchanged after that -- no iterative re-tuning against
individual eval failures occurred. Effect: v3's vatAmount accuracy went
from 53.8% (13/26, with 12 wrong-region-style regressions vs. v2) to 100%
(26/26), with zero remaining v2-vs-v3 regressions on any field. See
`PHASE2_REPORT.md` for full results.

## Document list

| id | layout | labeled | bilingual | table | multi-cur | noisy | footer | series style | split |
|---|---|---|---|---|---|---|---|---|---|
| v3_001_sbs_labeled_plain_totals | side_by_side | yes | no | totals_only | no | no | no | combined | eval |
| v3_002_sbs_unlabeled_footer | side_by_side | no | no | with_summary | no | no | yes | combined | dev |
| v3_003_sbs_labeled_bilingual_split | side_by_side | yes | yes | totals_only | no | no | yes | split | dev |
| v3_004_sbs_unlabeled_bilingual_multicur | side_by_side | no | yes | with_summary | yes (EUR) | no | no | number_only | eval |
| v3_005_sbs_labeled_noisy_alnum | side_by_side | yes | no | totals_only | no | yes | no | alnum_id | eval |
| v3_006_sbs_unlabeled_noisy_footer | side_by_side | no | no | with_summary | no | yes | yes | combined | dev |
| v3_007_sbs_labeled_bilingual_multicur_usd | side_by_side | yes | yes | with_summary | yes (USD) | no | no | split | dev |
| v3_008_sbs_unlabeled_bilingual_noisy_footer | side_by_side | no | yes | totals_only | no | yes | yes | number_only | eval |
| v3_009_sbs_labeled_footer_alnum | side_by_side | yes | no | with_summary | no | no | yes | alnum_id | eval |
| v3_010_sbs_unlabeled_plain_totals | side_by_side | no | no | totals_only | no | no | no | combined | dev |
| v3_011_stk_labeled_plain_totals | stacked | yes | no | totals_only | no | no | no | combined | eval |
| v3_012_stk_unlabeled_footer_split | stacked | no | no | with_summary | no | no | yes | split | eval |
| v3_013_stk_labeled_bilingual_noisy | stacked | yes | yes | totals_only | no | yes | no | number_only | dev |
| v3_014_stk_unlabeled_bilingual_multicur | stacked | no | yes | with_summary | yes (EUR) | no | no | alnum_id | eval |
| v3_015_stk_labeled_footer_noisy | stacked | yes | no | with_summary | no | yes | yes | combined | dev |
| v3_016_stk_unlabeled_plain_split | stacked | no | no | totals_only | no | no | no | split | eval |
| v3_017_stk_labeled_bilingual_footer | stacked | yes | yes | with_summary | no | no | yes | number_only | dev |
| v3_018_stk_unlabeled_bilingual_noisy_alnum | stacked | no | yes | totals_only | no | yes | no | alnum_id | eval |
| v3_019_stk_labeled_multicur_usd | stacked | yes | no | totals_only | yes (USD) | no | no | combined | dev |
| v3_020_stk_unlabeled_footer_noisy_split | stacked | no | no | with_summary | no | yes | yes | split | dev |
| v3_021_sbs_labeled_footer_number | side_by_side | yes | no | with_summary | no | no | yes | number_only | eval |
| v3_022_sbs_unlabeled_multicur_noisy | side_by_side | no | no | totals_only | yes (EUR) | yes | no | alnum_id | dev |
| v3_023_stk_labeled_bilingual_footer | stacked | yes | yes | with_summary | no | no | yes | combined | dev |
| v3_024_stk_unlabeled_noisy_split | stacked | no | no | totals_only | no | yes | no | split | eval |
| v3_025_sbs_labeled_bilingual_number | side_by_side | yes | yes | totals_only | no | no | no | number_only | dev |
| v3_026_stk_labeled_footer_multicur | stacked | yes | no | with_summary | yes (USD) | no | yes | alnum_id | eval |

## Known gaps (report honestly, not silently)

- **Noisy-scan simulation excludes rotation/skew.** `apply_noise()` in
  `generate_benchmark.py` applies blur, JPEG recompression, a
  downscale/upscale resolution round-trip, and contrast/brightness jitter —
  all axis-aligned, so the DOM-derived bboxes stay valid. Real noisy scans
  are very often also rotated/skewed a few degrees; that was left out
  because a rotation invalidates axis-aligned ground-truth bboxes and
  re-deriving rotated-and-correct bboxes was out of scope for this pass. If
  rotation robustness specifically needs testing later, that's a follow-up
  batch with its own bbox re-derivation (e.g. via the rotation transform
  matrix applied to the pre-rotation bbox corners), not a retrofit onto
  these 9 documents.
- **The 2 pre-existing samples have no region-bbox ground truth** (see
  above) — flat-field ground truth for them would need to be written by
  hand from the images (feasible) but region bboxes cannot be derived
  precisely without their original source HTML, which doesn't exist. Left
  undone rather than faked.
- **Every document is a single-item invoice** (one line item in the items
  table). Multi-line-item tables (the more common real-world case, and a
  harder test for column/row alignment specifically) are not represented in
  this batch at all — a real gap, not a stress trait that was deliberately
  deprioritized. Worth a follow-up batch focused specifically on multi-row
  tables before treating the table-subsystem comparison as complete.
- **All amounts are round-ish, plausible but synthetic figures** — no
  attempt was made to simulate OCR-hostile numeric formatting quirks (e.g.
  thousands-separator ambiguity, amounts split across a line wrap). The
  existing 100-invoice v2 regression suite already covers real-world OCR
  noise on numeric formatting; this set's noisy-scan trait targets image
  quality specifically, not numeric-format edge cases.
