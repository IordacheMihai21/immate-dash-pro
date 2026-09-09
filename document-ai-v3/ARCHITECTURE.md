# document-ai-v3 — architecture analysis

Status: experiment, not wired into production. Nothing in `document-ai-backend/`
or the frontend imports from this directory. v2 stays frozen at commit
`e8e0945e` (92.8% accuracy / 96.0% precision / 92.8% recall / 94.4% F1 on the
real 100-invoice benchmark) as the regression floor for any future comparison.

## Why v2 hit a structural ceiling

Every serious bug found this session — party columns bleeding into each
other, a CUI landing on the wrong company, names concatenating across a
flattened two-column row, TVA/Total swapping, 90%+ confidence on wrong
answers — traces back to one root cause: **v2 resolves each field
independently over flattened OCR text lines, with bbox used only as a
supplementary scoring signal bolted onto a text-first architecture, never as
the primary structural substrate.**

Concretely:

- `invoiceCandidateEngine.ts` has no persistent notion of "this document has
  a supplier region and a customer region" that spans field types. Bbox data
  (via `attachBboxToTextLines`) reaches individual heuristics as extra
  scoring signal, not as a shared document-level structure other extractors
  can query.
- CUI role assignment leans on nearby *text* cues ("furnizor"/"client" on the
  same line). When both parties' tax-ID lines read identically
  (`"C.i.f.: <digits>"`), text has nothing to disambiguate, and a secondary
  heuristic (RO-prefix bonus) can flip the winner to the wrong company
  entirely — with a confident score, because the pattern match itself was
  genuinely strong.
- Tables are read as flattened rows of numbers with no header→column→cell
  model. Once a row is flattened, which semantic column a value belonged to
  is lost; downstream logic reconstructs it by guessing from nearby text
  labels, which breaks the moment a document has no redundant label
  elsewhere on the page.
- Confidence conflates "this matched my pattern well" with "this is
  structurally correct." A well-matched but spatially-wrong candidate scores
  high, because nothing measures spatial/relational consistency at all.

A late attempt this session to patch this with a narrow geometric heuristic
(hard-gating tax-ID candidates by column position) fixed the target case
completely but regressed the frozen benchmark by 1–3 points on documents
where the existing text heuristics were already correct — a textbook sign
that the fix belongs at a different layer, not as one more rule stacked on
the text-line-first engine. That's the direct empirical case for v3.

## What v3 needs, as engineering requirements

1. **A region/layout segmentation pass, before field extraction.** Typed
   regions (supplier block, customer block, invoice metadata, items table,
   totals, footer) with real bboxes, computed once per document — the
   "document-level" layer v2 never had.
2. **Field extraction scoped to a region.** "Find the tax ID *inside* the
   supplier-block region," not "find the most text-plausible tax ID
   anywhere, nudged by faint semantic cues." This inverts the current
   priority order: region membership becomes a near-hard constraint;
   semantic text cues become a secondary disambiguator *within* a region,
   never a competitor to spatial location.
3. **Party info as a joint object**, not independently-scored fields that
   happen to share a `supplier`/`customer` tag:
   `{name, taxId, registrationNumber, address, iban, bank, regionBBox}`,
   resolved together from the same region.
4. **A dedicated table-structure subsystem**: header-row detection,
   column-X-alignment, cell→header mapping. Genuinely different machinery
   from "find a number near a label word" — the kind of thing purpose-built
   table-structure-recognition models are designed for, not something worth
   extending in regex.
5. **Confidence separated into layers**: model confidence (entity layer's
   own certainty) vs. structural consistency (does this fit the resolved
   region graph and pass arithmetic checks) vs. a final calibrated score.
   Calibration itself (temperature scaling / isotonic regression) needs
   labeled validation data to fit properly — that's a later step once v3 has
   real predictions to calibrate against, not part of this first deliverable.

## Where LayoutXLM fits

LayoutXLM stays as the semantic entity-proposal layer — it already does
token classification with real positional embeddings baked into its
architecture, so the gap was never in per-token classification quality. The
gap is that nothing downstream ever built the *document-level relational
structure*: which region owns which entities, which label pairs with which
value spatially. A real layout-segmentation + table-structure layer runs
upstream/parallel to LayoutXLM; a joint resolver then consumes both LayoutXLM's
entity proposals *and* the layout engine's region/table structure together.
Neither replaces the other.

## Candidate structural engines

See `AB_COMPARISON.md` for the PP-StructureV3 vs. Surya evaluation.
