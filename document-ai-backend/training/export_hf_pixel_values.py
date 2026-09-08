import json
from pathlib import Path

import numpy as np
from datasets import load_from_disk

SRC = Path("document-ai-backend/datasets/external/layoutlmv3_invoice")
PROC = Path("document-ai-backend/datasets/external/layoutlmv3_invoice_processed")
PIXELS = PROC / "pixel_values"

PIXELS.mkdir(parents=True, exist_ok=True)

ds = load_from_disk(str(SRC))

for split_name in ["train", "valid", "test"]:
    split = ds[split_name]

    jsonl = PROC / f"layoutxlm_{split_name}.jsonl"
    rows = []

    with open(jsonl, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))

    if len(rows) != len(split):
        raise RuntimeError(
            f"{split_name}: JSONL={len(rows)} vs HF={len(split)}"
        )

    split_dir = PIXELS / split_name
    split_dir.mkdir(parents=True, exist_ok=True)

    for i, (record, source) in enumerate(zip(rows, split)):
        arr = np.asarray(source["pixel_values"], dtype=np.float32)

        dst = split_dir / f"{i:05d}.npy"
        np.save(dst, arr)

        record["pixel_values_path"] = str(dst.resolve())

        if i % 100 == 0:
            print(f"{split_name}: {i}/{len(rows)}")

    tmp = jsonl.with_suffix(".jsonl.tmp")

    with open(tmp, "w", encoding="utf-8") as f:
        for record in rows:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    tmp.replace(jsonl)

    print(f"DONE {split_name}: {len(rows)}")

print("\nAll HF visual tensors exported.")
