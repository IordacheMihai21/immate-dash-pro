# FATURA training dataset

This directory is intentionally data-free in Git. Keep invoice images and annotations local.

## Structure

- `raw/`: source image/PDF + reference JSON pairs.
- `train/`: optional materialized training/tuning pairs.
- `test/`: optional materialized held-out pairs. Do not tune rules on these documents.
- `processed/`: OCR words, normalized boxes, BIO labels and match diagnostics.
- `splits.json`: deterministic split configuration and optional explicit document lists.

Pair files by the same stem, for example `invoice_001.jpg` and `invoice_001.json`. The
preparation script also accepts separate image and annotation roots, so existing FATURA files do
not need to be moved.

```bash
cd document-ai-backend
python training/prepare_fatura_dataset.py \
  --images "/path/to/JPG URI" \
  --annotations "/path/to/JSON URI" \
  --ocr-dir "/path/to/ocr-json" \
  --output datasets/fatura/processed \
  --splits datasets/fatura/splits.json
```

OCR JSON may contain `words` with `text`, `bbox`, and `confidence`, or simply `text`; text-only
records receive deterministic synthetic boxes. If OCR JSON is unavailable, install `pytesseract`
and the Tesseract binary, then pass `--run-ocr`. Unmatched reference fields are recorded and never
forced onto unrelated tokens.

Train only from processed records whose `split` is `train`. Evaluate the final model only on
`test`.

## Full `invoices_dataset_final` archive

The full archive can be inspected and converted without extracting it:

```bash
FATURA_DATASET_PATH=/path/invoices_dataset_final.zip npm run document-ai:inspect-fatura
FATURA_DATASET_PATH=/path/invoices_dataset_final.zip npm run document-ai:prepare-layoutxlm
npm run document-ai:train-layoutxlm -- --dry-run
npm run document-ai:train-layoutxlm -- --smoke-test
```

`inferred_label_map.json` is explicitly inferred, not official. Review its token and COCO box
samples before using it in a thesis result. Generated JSONL files remain local and are ignored by
Git because they are derived artifacts.

Smoke-test mode uses two training records, one dev record, one test record, and one optimizer step.
It runs on CPU when necessary and discards its temporary weights unless `--save` is explicitly
provided.
