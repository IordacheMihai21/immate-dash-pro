# Empirical run log — PP-StructureV3 vs. Surya on real problematic invoices

Actual runs, both engines, on the same two hardware (Apple M3, CPU-only, no
GPU used by either), same two sample invoices from `samples/`:

- `facturis_unlabeled_supplier_column.png` — supplier/customer blocks with
  **no role labels at all** ("FURNIZOR"/"CLIENT" absent, just two company
  blocks side by side). This is the case that motivated the v2 patch attempt
  that regressed the frozen benchmark (see ARCHITECTURE.md).
- `waystar_two_column_party_block.png` — labeled two-column party blocks,
  5-column items table (Denumire / Cantitate / Pret unitar / TVA / Total),
  the exact TVA=1596.64 / Total=10000.00 case named in RESOLVER_DESIGN.md.

Raw output: `output/pp_structure/*/page_0.json` and
`output/surya/*/result.json`. Scripts: `run_pp_structure.py`,
`run_surya.py`.

## Runtime (measured, CPU-only, M3, cold-cache excluded for init)

| | facturis (unlabeled) | waystar (labeled) |
|---|---|---|
| **PP-StructureV3** | 301.5s | 259.2s |
| **Surya** (layout+table+ocr) | 95.1s¹ | 27.2s |

¹ Surya's first run includes `llama-server` cold spin-up (its inference
backend runs as a subprocess); the second run's 27.2s is the more
representative steady-state number.

**This contradicts AB_COMPARISON.md's pre-run assumption.** The docs-only
research pass expected PP-StructureV3's CPU support to be "first-class" and
flagged Surya's CPU speed as the risk (~9.3s/page from published
benchmarks). Measured reality on this machine is the opposite: PP-StructureV3
took **~4.5–5 minutes per single-page invoice on CPU** — not viable for any
interactive or near-real-time product path at that speed — while Surya, even
including a cold backend spin-up, finished in under 100s and dropped to 27s
once warm. Runtime must now be weighed as a real cost for PP-StructureV3, not
an assumed non-issue.

## New dependency found only by actually running it

Surya 0.22.1's inference now routes through a `llama-server` subprocess
(llama.cpp), which is **not pip-installable** — it required
`brew install llama.cpp` (an OS-level binary dependency) before any inference
would run at all. AB_COMPARISON.md's research pass noted the llama.cpp/Metal
detail but didn't flag that this means an extra system package, not just a
Python dependency, which matters for containerized deployment (the backend
today ships as a Docker image — an extra brew/apt package is a Dockerfile
change, not just a `pip install` line).

## Layout / region segmentation

Both engines separate the supplier and customer blocks into distinct
regions **even in the unlabeled `facturis` case** — the single strongest
result of this whole spike, since it's the exact case v2 cannot handle
without label text to anchor on, and both structural engines solve it from
visual layout alone with no text-based role cues:

- **PP-StructureV3**: one merged `text` region per party block (label text +
  company info as a single bbox) — `[0.6, 120.2, 383.1, 209.5]` for the
  supplier column vs. `[921.0, 127.6, 1295.1, 215.0]` for the customer
  column in `facturis`. This maps almost directly onto v3's
  `supplier_block`/`customer_block` region shape with no extra grouping
  step needed.
- **Surya**: finer-grained, line-level boxes (`SectionHeader` for the role
  label, separate `Text` boxes per address/name/tax-ID line) — 3 separate
  boxes per party column in the unlabeled case, not pre-grouped into one
  region. Building v3's single `supplier_block`/`customer_block` region out
  of Surya's output requires an extra column-clustering step on our side;
  PP-StructureV3 hands that grouping to us already done.

Neither engine's region boxes overlap across the supplier/customer column
boundary in either sample — the specific property `RESOLVER_DESIGN.md`'s
region-dominance gate depends on.

## Table structure — the one real bug found

On `waystar` (5-column table), **PP-StructureV3's own reconstructed
`pred_html`/markdown swapped TVA and Total**:

```
ground truth:  TVA = 1596.64   Total = 10000.00
pred_html:     TVA = 10000.00  Total = 1596.64   <- swapped
```

But the same result's raw geometric primitives (`table_res_list[0].cell_box_list`
+ `table_ocr_pred.rec_texts`/`rec_polys`) are **correct** — the OCR text
"1596.64" sits at a bbox whose X-range matches the "TVA" header's X-range,
and "10000.00" matches "Total"'s X-range. The bug is specifically in
PP-StructureV3's own cell-to-HTML-position reconstruction step, not in its
underlying detection. (On the 6-column `facturis` table, `pred_html` was
correct — the bug did not reproduce on every table shape, which is itself
informative: it's not safe to assume the flattened reconstruction is
reliable even when it happens to work on one document.)

Surya's table model does **not** attempt this reconstruction at all —
`table_res.html` is `None` by design; it returns only row/column/cell grid
geometry (`row_id`, `col_id`, `bbox` per cell, no text). Pairing OCR text to
a specific column is left entirely to the integrator.

**This is the single most load-bearing empirical finding of this spike**:
it confirms, with a real reproduced bug rather than a hypothetical, the
RESOLVER_DESIGN.md decision to never consume a structural engine's own
flattened text/HTML/markdown reconstruction as ground truth. `tableResolver.ts`
already implements header→column→cell assignment purely from raw geometry
(header cell bboxes + data cell bboxes + OCR text, matched by X-position) —
exactly the integration path that avoids this bug for both engines, and the
only path Surya's table output supports at all.

## Updated verdict

The runtime gap changes AB_COMPARISON.md's original licensing-led verdict
into a genuine tradeoff, not a clear pick:

| | PP-StructureV3 | Surya |
|---|---|---|
| License | Apache 2.0, unconditional | RAIL-M weights, free under $5M funding/revenue — **needs an answer from IMMapp before any non-research use** |
| Measured CPU runtime/page | ~260–300s | ~27–95s |
| Region grouping | Pre-grouped into party-level blocks (matches v3 schema directly) | Line-level only; needs our own clustering step |
| Table reconstruction | Has a real, reproduced TVA/Total swap bug (raw geometry unaffected) | Never attempts reconstruction; geometry-only by design |
| New deploy dependency | PaddlePaddle (Python-only) | `llama-server` binary (OS package, not pip) |

**Recommendation**: proceed to a real v3 pipeline prototype on
**PP-StructureV3's layout region output only** (not its table `pred_html`),
paired with `tableResolver.ts`'s own X-position column assignment fed by
PP-StructureV3's raw `cell_box_list` + OCR text — this sidesteps the one bug
found, keeps the licensing question closed, and its pre-grouped party blocks
need the least adaptation work to fit v3's region schema. But log the
runtime cost honestly: ~300s/page CPU is not shippable as-is, and the next
concrete step before going further than a prototype is timing
PP-StructureV3's lighter model variants (`PP-OCRv5_mobile` instead of
`_server`, disabling the formula/seal sub-models this invoice use case never
needs) or GPU inference, not assuming CPU is fine because the docs said so.

Revisit Surya specifically if either changes: (a) IMMapp's funding/revenue
status is confirmed under the $5M RAIL-M threshold, removing the licensing
blocker, or (b) PP-StructureV3's lightweight-model runtime still isn't
workable — Surya's ~5–10x speed advantage on this same hardware would then
be the deciding factor, at the cost of accepting the `llama-server` OS-level
dependency and doing the region-grouping step ourselves.

## Runtime profiling (superseding the "revisit lighter variants" note above)

Used PaddleX's native `PADDLE_PDX_PIPELINE_BENCHMARK` profiler (see
`profile_pp_structure.py`) to get a real per-stage breakdown of the default
config's 262.4s single-page run, rather than guessing:

| Stage | Time | Share |
|---|---|---|
| **Text detection** (`TextDetRunnerPredictor.apply`, inside `PP-OCRv5_server_det`) | **253.3s** | **96.5%** |
| Text recognition | 2.0s | 0.8% |
| Table structure recognition | 3.7s | 1.4% |
| Layout detection | ~2.2s | 0.8% |
| Doc preprocessing | 0.5s | 0.2% |
| Formula/seal/chart (disabled) | ~0s | — |

**Text detection alone is 96.5% of the cost.** Table structure and layout
detection — the two components this whole spike is actually about — were
never the bottleneck; they were already fast (under 4s combined). This
redirects where optimization effort belongs: the OCR detector, not the
structural layer.

No per-page model reload was observed (exactly 18 "Creating model" log
lines across a 2-image run, matching the code's single `PPStructureV3(...)`
construction outside the per-image loop) — the 262s/page figure is close to
pure inference cost, not repeated initialization.

Separately, `/usr/bin/time -l` on that same run showed **275.6s real time
against only 22.4s user + 22.6s sys CPU time (~16% average utilization)** —
the process was mostly not actively computing during that wall-clock
window. Peak RSS: 5.0GB. No root cause confirmed for the gap between real
and CPU time (thread contention, the "no ccache" JIT-compilation warning
seen at startup, or something else); flagging as an open question rather
than a diagnosed cause.

### Lighter config: this fixes the runtime problem

Swapping only `text_detection_model_name`/`text_recognition_model_name` to
`PP-OCRv5_mobile_det`/`PP-OCRv5_mobile_rec` (keeping the default layout and
table models, disabling doc-unwarping/textline-orientation/seal/formula/chart
recognition, none of which an invoice needs):

| | Default | Light (mobile OCR) |
|---|---|---|
| Runtime/page | 260–301s | **9.1–9.9s** (~28x faster) |
| Peak RSS | 5.0GB | 2.3GB |
| Region separation (supplier/customer blocks) | correct | **still correct** |
| Table structure detected at all | yes | **yes** |
| TVA/Total order in `pred_html` (waystar) | swapped (bug) | correct this run — **but see caveat below** |

A first attempt also swapped `layout_detection_model_name` to the coarser
`PP-DocBlockLayout`, on the assumption that would help too — it didn't:
layout detection was never more than ~1% of the runtime, and the coarser
model **broke table detection entirely** (no `table_res_list` in the
output — `PP-DocBlockLayout` doesn't produce a typed "table" region). Kept
the default layout model in the final light config; only the OCR detector
needed to change, since that's where the actual cost was.

**Caveat on the table result "getting it right" this time**: this is one
run on one document. RUN_LOG.md's own earlier finding was that
PP-StructureV3's `pred_html` reconstruction is *inconsistent* — correct on
the 6-column `facturis` table, wrong on the 5-column `waystar` table, in
the default-config run. One correct run under the light config doesn't
establish the bug is gone; it reinforces that raw geometry
(`tableResolver.ts`'s own header→column→cell assignment), not `pred_html`,
is still the only trustworthy path regardless of which OCR model is used —
see "Keep raw geometry only" in the user's follow-up requirements.

One quality regression observed with the mobile recognizer: "Servicii
consultanta" was read as "Servici consultanta" on the `facturis` sample
(dropped a letter) — worth tracking once the real benchmark corpus is
scored, not just noted anecdotally.

### Updated recommendation

**This changes the earlier verdict.** With the OCR-detector-only light
config, PP-StructureV3 runs at ~9–10s/page — faster than Surya's own
measured warm-state 27.2s/page on the same hardware — while keeping Apache
2.0 licensing and correct region/table structure. The "300s/page isn't
shippable" concern from the first verdict is resolved by this
configuration change, not by switching engines. Recommendation stands even
more strongly now: build the real v3 prototype on PP-StructureV3 with this
light OCR configuration, consuming only raw region/cell/OCR geometry, never
`pred_html`/markdown.

Still open: whether the ~16% CPU-utilization gap (275s real vs. 45s
user+sys under the default config) reproduces under the light config too,
and if so, what's actually causing it — worth a follow-up investigation
before treating 9–10s/page as a reliable production number rather than a
promising CPU-only laptop measurement on two documents.
