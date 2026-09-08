import json
from pathlib import Path
from collections import Counter

SRC = Path("document-ai-backend/datasets/fatura/processed_holdout")
OUT = Path("document-ai-backend/datasets/fatura/processed_holdout_immapp")
OUT.mkdir(parents=True, exist_ok=True)

# FATURA old ids -> IMMapp unified ids
MAP = {
    0: 0,   # SELLER_WEBSITE -> OTHER
    1: 10,  # TOTAL_BLOCK -> TOTAL
    2: 0,   # TOTAL_IN_WORDS_BLOCK -> OTHER
    3: 2,   # INVOICE_DATE_BLOCK -> INVOICE_DATE
    4: 3,   # DUE_DATE_BLOCK -> DUE_DATE
    5: 0,   # BUYER_BLOCK -> OTHER
    6: 4,   # SUPPLIER_NAME -> SELLER_NAME
    8: 0,   # BILL_TO_BLOCK -> OTHER
    9: 0,   # SHIP_TO_BLOCK -> OTHER
    10: 0,  # TABLE_REGION -> OTHER
    11: 0,  # LOGO_REGION -> OTHER
    12: 1,  # INVOICE_NUMBER_BLOCK -> INVOICE_NUMBER
    13: 0,  # OTHER -> OTHER
}

for split in ["train", "dev", "test"]:
    src = SRC / f"layoutxlm_{split}.jsonl"
    dst = OUT / f"layoutxlm_{split}.jsonl"

    counts = Counter()
    docs = 0

    with open(src, encoding="utf-8") as fin, open(dst, "w", encoding="utf-8") as fout:
        for line in fin:
            row = json.loads(line)

            new_labels = []
            for lab in row["labels"]:
                if lab == -100:
                    new_labels.append(-100)
                else:
                    new_labels.append(MAP.get(lab, 0))
                    counts[new_labels[-1]] += 1

            row["labels"] = new_labels
            row["source"] = "FATURA"
            row["language"] = "en"

            fout.write(json.dumps(row, ensure_ascii=False) + "\n")
            docs += 1

    print(f"\n{split}: {docs} docs")
    for k, v in sorted(counts.items()):
        print(k, v)
