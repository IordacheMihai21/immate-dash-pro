import json
from pathlib import Path

ROOT = Path("document-ai-backend/datasets")
OUT = ROOT / "final_bilingual"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "train": [
        ROOT / "fatura/processed_holdout_immapp/layoutxlm_train.jsonl",
        ROOT / "fatura/processed_ro_immapp/layoutxlm_train.jsonl",
        ROOT / "external/invoices_romanian_processed/layoutxlm_train.jsonl",
    ],
    "dev": [
        ROOT / "fatura/processed_holdout_immapp/layoutxlm_dev.jsonl",
        ROOT / "fatura/processed_ro_immapp/layoutxlm_dev.jsonl",
    ],
}

TESTS = {
    "test_fatura": ROOT / "fatura/processed_holdout_immapp/layoutxlm_test.jsonl",
    "test_ro_synthetic": ROOT / "fatura/processed_ro_immapp/layoutxlm_test.jsonl",
    "test_ro_real": ROOT / "external/invoices_romanian_processed/layoutxlm_valid.jsonl",
}

def combine(paths, output):
    n = 0

    with open(output, "w", encoding="utf-8") as fout:
        for path in paths:
            if not path.exists():
                raise FileNotFoundError(path)

            with open(path, encoding="utf-8") as fin:
                for line in fin:
                    row = json.loads(line)

                    if len(row["tokens"]) != len(row["bboxes"]):
                        raise ValueError(
                            f'{row["document_id"]}: tokens/bboxes mismatch'
                        )

                    if len(row["tokens"]) != len(row["labels"]):
                        raise ValueError(
                            f'{row["document_id"]}: tokens/labels mismatch'
                        )

                    fout.write(json.dumps(row, ensure_ascii=False) + "\n")
                    n += 1

    return n


manifest = {
    "schema": {
        "0": "OTHER",
        "1": "INVOICE_NUMBER",
        "2": "INVOICE_DATE",
        "3": "DUE_DATE",
        "4": "SELLER_NAME",
        "5": "SELLER_TAX_ID",
        "6": "BUYER_NAME",
        "7": "BUYER_TAX_ID",
        "8": "SUBTOTAL",
        "9": "VAT",
        "10": "TOTAL",
        "11": "CURRENCY",
        "12": "IBAN",
    },
    "splits": {},
    "note": "HF LayoutLMv3 dataset intentionally excluded because source is already tokenized for LayoutLMv3 and does not expose raw OCR words.",
}

for split, paths in SOURCES.items():
    output = OUT / f"layoutxlm_{split}.jsonl"
    manifest["splits"][split] = combine(paths, output)

for name, src in TESTS.items():
    output = OUT / f"{name}.jsonl"
    manifest["splits"][name] = combine([src], output)

with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

print(json.dumps(manifest, indent=2, ensure_ascii=False))
