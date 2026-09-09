# document-ai-v3 — fresh test set schema

Not built yet — this defines the format for the future untouched
generalization test set, kept separate from the frozen 100-invoice
regression benchmark (which stays a regression suite, not evidence of
real-world generalization, per the standing instruction).

## Why a separate set

The 100-invoice benchmark has been the target of many rounds of verified,
targeted fixes this session. That makes it a good regression guard (did a
change break something known to work) but a poor generalization signal (a
fix tuned against its specific failure modes can look better than it
actually is on genuinely new documents) — exactly the distinction the v3
initiative is meant to protect against by construction, not just by
discipline.

## Fields (per document)

```json
{
  "invoiceNumber": "string | null",
  "invoiceSeries": "string | null",
  "invoiceDate": "YYYY-MM-DD | null",
  "dueDate": "YYYY-MM-DD | null",
  "supplierName": "string | null",
  "customerName": "string | null",
  "supplierTaxId": "string | null",
  "customerTaxId": "string | null",
  "subtotal": "number | null",
  "vatAmount": "number | null",
  "totalAmount": "number | null",
  "currency": "string | null"
}
```

Notes:
- `invoiceSeries` is split out from `invoiceNumber` here (unlike v2's schema,
  which concatenates them into one `invoiceNumber` field) — worth deciding
  explicitly whether v3 keeps them split or concatenates at the end; keeping
  them split during evaluation makes it possible to separately measure
  "found the series" vs. "found the number" instead of one combined
  pass/fail.
- `dueDate` is new relative to v2's current scored field set — include it in
  ground truth from the start even if v3's first resolver pass doesn't
  target it yet, since adding a field to an existing test set later means
  every prior document needs re-annotation.
- Amounts as numbers, not strings — avoids repeating v2's benchmark-side
  string-comparison-with-formatting-noise class of bugs.

## Sourcing constraints (carried over from this session's standing rules)

- No document-specific rules anywhere in v3's code informed by this set.
- No memorizing exact values from these documents into source code.
- Company names/CUIs in the set should be varied and, where the source
  documents are synthetic reconstructions (as several this session were),
  clearly distinct from any single real company — the set exists to catch
  genuine structural failure modes (column layouts, bilingual headers, table
  header/column ambiguity, missing redundant totals), not to overfit to
  specific companies' letterheads.
- Real documents in the set (if any) should be sourced with the same care
  applied earlier this session (public samples, generated via real invoicing
  tools with placeholder data, or explicitly donated test documents) — never
  scraped customer data.

## Minimum diversity bar

Given this session's empirical findings about what actually breaks v2,
the set should deliberately include, not just accumulate organically:

- Two-column party blocks (both labeled and one-side-unlabeled variants)
- Bilingual/dual-language role labels
- Tables where VAT/Total appear only as column headers (no redundant
  summary line elsewhere)
- Multi-currency documents (foreign-currency total + required RON
  equivalent)
- At least a few genuinely low-resolution/poor-quality scans, since this
  session's own testing found image resolution alone explains a meaningful
  share of real-world confidence gaps, separate from any resolver logic
