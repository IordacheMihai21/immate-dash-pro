import json
from pathlib import Path

ROOT = Path("document-ai-backend/datasets")
OUT = ROOT / "run2/final"
OUT.mkdir(parents=True, exist_ok=True)

FATURA_TRAIN = ROOT / "fatura/processed_holdout_immapp/layoutxlm_train.jsonl"
FATURA_DEV = ROOT / "fatura/processed_holdout_immapp/layoutxlm_dev.jsonl"
FATURA_TEST = ROOT / "fatura/processed_holdout_immapp/layoutxlm_test.jsonl"

RO_REAL_TRAIN = ROOT / "external/invoices_romanian_processed/layoutxlm_train.jsonl"
RO_REAL_TEST = ROOT / "external/invoices_romanian_processed/layoutxlm_valid.jsonl"

RO_SYNTH_TRAIN = ROOT / "run2/synthetic_ro/layoutxlm_train.jsonl"
RO_SYNTH_DEV = ROOT / "run2/synthetic_ro/layoutxlm_dev.jsonl"
RO_SYNTH_TEST = ROOT / "run2/synthetic_ro/layoutxlm_test.jsonl"

def read_rows(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows

def write_rows(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

fatura_train = read_rows(FATURA_TRAIN)
ro_real_train = read_rows(RO_REAL_TRAIN)
ro_synth_train = read_rows(RO_SYNTH_TRAIN)

# x3 total synthetic representation
train = (
    fatura_train
    + ro_real_train
    + ro_synth_train
    + ro_synth_train
    + ro_synth_train
)

dev = (
    read_rows(FATURA_DEV)
    + read_rows(RO_SYNTH_DEV)
)

write_rows(OUT / "layoutxlm_train.jsonl", train)
write_rows(OUT / "layoutxlm_dev.jsonl", dev)
write_rows(OUT / "test_fatura.jsonl", read_rows(FATURA_TEST))
write_rows(OUT / "test_ro_real.jsonl", read_rows(RO_REAL_TEST))
write_rows(OUT / "test_ro_synthetic.jsonl", read_rows(RO_SYNTH_TEST))

print("train:", len(train))
print("dev:", len(dev))
print("test_fatura:", sum(1 for _ in open(OUT / "test_fatura.jsonl")))
print("test_ro_real:", sum(1 for _ in open(OUT / "test_ro_real.jsonl")))
print("test_ro_synthetic:", sum(1 for _ in open(OUT / "test_ro_synthetic.jsonl")))
