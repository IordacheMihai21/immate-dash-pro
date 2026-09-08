import json
from pathlib import Path
from datasets import load_from_disk
from transformers import AutoTokenizer

SRC = Path("document-ai-backend/datasets/external/layoutlmv3_invoice")
OUT = Path("document-ai-backend/datasets/external/layoutlmv3_invoice_processed")
OUT.mkdir(parents=True, exist_ok=True)

TOKENIZER_NAME = "microsoft/layoutxlm-base"
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)

HF_LABELS = [
    "O",
    "B-INVOICE_NO", "I-INVOICE_NO",
    "B-INVOICE_DATE", "I-INVOICE_DATE",
    "B-SELLER", "I-SELLER",
    "B-CLIENT", "I-CLIENT",
    "B-SELLER_TAX_ID", "I-SELLER_TAX_ID",
    "B-CLIENT_TAX_ID", "I-CLIENT_TAX_ID",
    "B-IBAN", "I-IBAN",
    "B-ITEM_DESC", "I-ITEM_DESC",
    "B-ITEM_QTY", "I-ITEM_QTY",
    "B-ITEM_NET_PRICE", "I-ITEM_NET_PRICE",
    "B-ITEM_NET_WORTH", "I-ITEM_NET_WORTH",
    "B-ITEM_VAT", "I-ITEM_VAT",
    "B-ITEM_GROSS_WORTH", "I-ITEM_GROSS_WORTH",
    "B-TOTAL_NET_WORTH", "I-TOTAL_NET_WORTH",
    "B-TOTAL_VAT", "I-TOTAL_VAT",
    "B-TOTAL_GROSS_WORTH", "I-TOTAL_GROSS_WORTH",
    "B-DUE_DATE", "I-DUE_DATE",
    "B-PAYMENT_TERMS", "I-PAYMENT_TERMS",
    "B-CURRENCY", "I-CURRENCY",
    "B-SUBTOTAL", "I-SUBTOTAL",
    "B-DISCOUNT", "I-DISCOUNT",
    "B-SHIPPING", "I-SHIPPING"
]

TARGET = {
    "INVOICE_NO": 1,
    "INVOICE_DATE": 2,
    "DUE_DATE": 3,
    "SELLER": 4,
    "SELLER_TAX_ID": 5,
    "CLIENT": 6,
    "CLIENT_TAX_ID": 7,
    "TOTAL_NET_WORTH": 8,
    "SUBTOTAL": 8,
    "TOTAL_VAT": 9,
    "TOTAL_GROSS_WORTH": 10,
    "CURRENCY": 11,
    "IBAN": 12,
}

def remap(label_id):
    if label_id == -100:
        return -100

    name = HF_LABELS[label_id]

    if name == "O":
        return 0

    entity = name[2:] if name.startswith(("B-", "I-")) else name
    return TARGET.get(entity, 0)

def convert_split(ds, split_name):
    rows = []

    for idx, row in enumerate(ds):
        input_ids = row["input_ids"]
        bboxes = row["bbox"]
        labels = row["labels"]

        tokens = []
        out_boxes = []
        out_labels = []

        for token_id, box, label in zip(input_ids, bboxes, labels):
            if label == -100:
                continue

            tok = tokenizer.convert_ids_to_tokens(int(token_id))

            if tok in tokenizer.all_special_tokens:
                continue

            tokens.append(tok)
            out_boxes.append(box)
            out_labels.append(remap(int(label)))

        if not tokens:
            continue

        rows.append({
            "document_id": f"hf_invoice_{split_name}_{idx}",
            "split": split_name,
            "image_path": None,
            "image_member": None,
            "image_available": False,
            "dataset_path": str(SRC.resolve()),
            "tokens": tokens,
            "bboxes": out_boxes,
            "labels": out_labels,
            "bbox_format": "xyxy_0_1000",
            "original_size": None,
            "language": "en",
            "source": "Kwash67_layoutlmv3_invoice"
        })

    out = OUT / f"layoutxlm_{split_name}.jsonl"

    with open(out, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(split_name, "->", len(rows), "docs")
    print("saved:", out)

if __name__ == "__main__":
    ds = load_from_disk(str(SRC))

    convert_split(ds["train"], "train")
    convert_split(ds["valid"], "valid")
    convert_split(ds["test"], "test")
