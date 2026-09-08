import json
from pathlib import Path
from collections import defaultdict

import pytesseract
from PIL import Image

ROOT = Path("document-ai-backend/datasets/external/invoices_romanian")
OUT = Path("document-ai-backend/datasets/external/invoices_romanian_processed")
OUT.mkdir(parents=True, exist_ok=True)

TARGET_ID = {
    "OTHER": 0,
    "INVOICE_NUMBER": 1,
    "INVOICE_DATE": 2,
    "DUE_DATE": 3,
    "SELLER_NAME": 4,
    "SELLER_TAX_ID": 5,
    "BUYER_NAME": 6,
    "BUYER_TAX_ID": 7,
    "SUBTOTAL": 8,
    "VAT": 9,
    "TOTAL": 10,
    "CURRENCY": 11,
    "IBAN": 12,
}

CLASS_MAP = {
    "invoice-numbers": "INVOICE_NUMBER",
    "date": "INVOICE_DATE",
    "seller-cif": "SELLER_TAX_ID",
    "buyer-cif": "BUYER_TAX_ID",
    "total": "TOTAL",
}


def normalize_box(x1, y1, x2, y2, w, h):
    return [
        max(0, min(1000, int(1000 * x1 / w))),
        max(0, min(1000, int(1000 * y1 / h))),
        max(0, min(1000, int(1000 * x2 / w))),
        max(0, min(1000, int(1000 * y2 / h))),
    ]


def token_center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def inside(cx, cy, region):
    x1, y1, x2, y2 = region
    return x1 <= cx <= x2 and y1 <= cy <= y2


def process_split(split):
    split_dir = ROOT / split
    coco_path = split_dir / "_annotations.coco.json"

    with open(coco_path, "r", encoding="utf-8") as f:
        coco = json.load(f)

    categories = {c["id"]: c["name"] for c in coco["categories"]}
    images = {i["id"]: i for i in coco["images"]}

    ann_by_image = defaultdict(list)

    for ann in coco["annotations"]:
        cname = categories[ann["category_id"]]
        if cname not in CLASS_MAP:
            continue

        x, y, bw, bh = ann["bbox"]
        ann_by_image[ann["image_id"]].append({
            "label": CLASS_MAP[cname],
            "box": [x, y, x + bw, y + bh],
        })

    rows = []

    for idx, (image_id, meta) in enumerate(images.items(), start=1):
        image_path = split_dir / meta["file_name"]

        if not image_path.exists():
            print("MISSING:", image_path)
            continue

        img = Image.open(image_path).convert("RGB")
        w, h = img.size

        ocr = pytesseract.image_to_data(
            img,
            output_type=pytesseract.Output.DICT,
            config="--psm 6"
        )

        tokens = []
        bboxes = []
        labels = []

        regions = ann_by_image.get(image_id, [])

        for i, text in enumerate(ocr["text"]):
            text = text.strip()

            if not text:
                continue

            try:
                conf = float(ocr["conf"][i])
            except:
                conf = -1

            if conf < 0:
                continue

            x = int(ocr["left"][i])
            y = int(ocr["top"][i])
            bw = int(ocr["width"][i])
            bh = int(ocr["height"][i])

            box_px = [x, y, x + bw, y + bh]
            cx, cy = token_center(box_px)

            label_name = "OTHER"

            # token center inside annotated region
            for reg in regions:
                if inside(cx, cy, reg["box"]):
                    label_name = reg["label"]
                    break

            tokens.append(text)
            bboxes.append(normalize_box(*box_px, w, h))
            labels.append(TARGET_ID[label_name])

        if not tokens:
            print("NO OCR TOKENS:", image_path)
            continue

        row = {
            "document_id": f"roboflow_ro_{split}_{image_id}",
            "split": split,
            "image_path": str(image_path.resolve()),
            "image_member": None,
            "image_available": True,
            "dataset_path": str(ROOT.resolve()),
            "tokens": tokens,
            "bboxes": bboxes,
            "labels": labels,
            "bbox_format": "xyxy_0_1000",
            "original_size": [h, w],
            "language": "ro",
            "source": "InvoicesRomanian_Roboflow",
        }

        rows.append(row)

        if idx % 25 == 0:
            print(f"{split}: {idx}/{len(images)}")

    out_name = "layoutxlm_valid.jsonl" if split == "valid" else "layoutxlm_train.jsonl"
    out_path = OUT / out_name

    with open(out_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\nDONE {split}: {len(rows)} docs -> {out_path}")


if __name__ == "__main__":
    process_split("train")
    process_split("valid")
