# PP-StructureV3 vs. Surya — A/B for document-ai-v3's layout/table layer

Research pass on published docs/licenses first, before installing anything —
license terms decide whether a tool is even worth spending prototype time on
for a commercial SaaS. Empirical run results follow in a separate section
below once available.

## PP-StructureV3 (PaddleOCR)

| | |
|---|---|
| Install | `pip install "paddleocr[all]"` |
| License | **Apache 2.0** — code and model weights both. No revenue/funding threshold, no commercial restriction. |
| Structural output | Layout region detection (text/table/title/figure/seal/formula, each with a bbox) + table structure recognition (cell-level coordinates) + reading order, exported directly to structured JSON/Markdown. |
| Integration with our bboxes | High — region/cell bboxes come out in pixel coordinates on the input image, same coordinate space our own Tesseract word bboxes already use. No coordinate-system translation needed. |
| CPU/GPU | CPU is a first-class supported backend (not a fallback path) — PaddlePaddle explicitly lists CPU alongside GPU as a maintained target. |
| Model size | OCR sub-models (PP-OCRv6 family) range 1.5M–34.5M params — small. No published size for the structure model itself; expect similarly modest. |
| Dependencies | PaddlePaddle framework (own tensor runtime, not PyTorch) — a genuinely new dependency for this codebase, not a shared one with the existing LayoutXLM/transformers stack. |
| Runtime | Not independently benchmarked yet for CPU wall-clock/page — first thing to measure in the prototype run. |
| Advantage | Most complete "give me the document's structure" output of the two; zero licensing risk; CPU-first. |
| Disadvantage | New framework dependency (PaddlePaddle) alongside the existing PyTorch/transformers stack already used for LayoutXLM — two ML runtimes in one backend if this ever went further than a prototype. |

## Surya (datalab-to/surya)

| | |
|---|---|
| Install | `pip install surya-ocr` |
| License | Code: Apache 2.0. **Weights: modified RAIL-M** — free for research/personal use and companies under **$5M in funding or revenue**; above that, commercial use requires a **paid license** from Datalab (pricing not public, requires contacting them directly). **This needs an explicit answer on IMMapp's funding/revenue status before Surya goes beyond a private research spike** — flagging, not assuming. |
| Structural output | Layout detection with reading order (header/text/table/image region labels), dedicated table recognition (row/column/cell geometry), OCR as HTML with per-block confidence. Narrower framing than PP-StructureV3 (per-region primitives vs. one unified document→JSON), but the primitives map cleanly onto bbox-relation work. |
| Integration with our bboxes | Comparable to PP-StructureV3 — pixel-space bboxes, straightforward to reconcile with our existing OCR word boxes. |
| CPU/GPU | Reported ~0.108 pages/sec on CPU via llama.cpp/Metal on Apple Silicon (~9.3s/page) vs. ~5.35 pages/sec on an RTX 5090 GPU. Workable for a 20–30 document batch experiment (~3–4 min total); far from production-viable at that speed on CPU alone. |
| Model size | 650M params — notably heavier than PaddleOCR's OCR sub-models. |
| Advantage | Per-region confidence scores map directly onto the confidence-calibration goal (model confidence vs. structural consistency, kept separate). |
| Disadvantage | Licensing needs a real answer before any use beyond sandboxed research; slower CPU inference; larger model. |

## Verdict (superseded by empirical run — see below)

The paragraph below was written before either engine was actually run, from
published docs/licenses only. It is kept for the record, but **the runtime
claim in it turned out to be wrong** — see `RUN_LOG.md`.

> ~~PP-StructureV3 is the stronger prototype candidate. No licensing question
> to resolve first, CPU-first design matches our CPU-only backend today~~ —
> measured CPU runtime was ~260–300s/page, not "CPU-first" in any practical
> sense at that speed.

## Empirical run

**Both engines were actually run** on the two real problematic invoices in
`samples/` (CPU-only, Apple M3) via `run_pp_structure.py` and
`run_surya.py`. Full results, the one real bug found (PP-StructureV3's table
reconstruction swapping TVA/Total on the 5-column table), and the updated
recommendation are in **`RUN_LOG.md`** — read that file for the actual
verdict, not this section.
