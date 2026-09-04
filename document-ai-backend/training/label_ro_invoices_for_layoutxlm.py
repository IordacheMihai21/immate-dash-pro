"""Render generate_synthetic_invoices_ro.py's HTML/reference pairs to images, OCR them
with Tesseract's Romanian model, and auto-label each OCR word against the known
ground-truth field values.

Output uses the exact same record schema as prepare_layoutxlm_dataset.py (tokens,
bboxes normalized to xyxy in [0, 1000], flat label ids from inferred_label_map.json)
so the resulting layoutxlm_{train,dev,test}.jsonl files can be concatenated directly
with the FATURA-derived ones for joint training -- no model/label-map changes needed:

    cat datasets/fatura/processed/layoutxlm_train.jsonl \\
        datasets/fatura/processed_ro/layoutxlm_train.jsonl \\
        > datasets/fatura/processed_combined/layoutxlm_train.jsonl
    # ...repeat for dev/test, then point train_layoutxlm_invoice_classifier.py's
    # --data at datasets/fatura/processed_combined

Only a subset of fields map onto the existing 13-class block schema (invoice number,
dates, supplier/buyer name, buyer address, total). Everything else -- CUI, reg. com.,
line items, VAT breakdown, boilerplate -- is left as OTHER, matching how those fields
are already (not) covered by the FATURA label map. Widening the schema to per-field
BIO tags is a separate, larger follow-up.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image

from prepare_layoutxlm_dataset import normalize_bbox

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = BACKEND_ROOT / "datasets/fatura/raw/synthetic_ro"
DEFAULT_OUTPUT = BACKEND_ROOT / "datasets/fatura/processed_ro"
DEFAULT_LABEL_MAP = BACKEND_ROOT / "datasets/fatura/inferred_label_map.json"

# Field on the generator's reference JSON -> block label in inferred_label_map.json.
# Order matters: earlier entries are matched first and claim their OCR words before
# later, more generic fields (e.g. customerName) get a chance, preventing a short
# specific value from being swallowed by a longer overlapping candidate span.
FIELD_TO_LABEL: List[Tuple[str, str]] = [
    ("invoiceNumber", "INVOICE_NUMBER_BLOCK"),
    ("totalAmount", "TOTAL_BLOCK"),
    ("invoiceDateDisplay", "INVOICE_DATE_BLOCK"),
    ("dueDateDisplay", "DUE_DATE_BLOCK"),
    ("supplierName", "SUPPLIER_NAME"),
    ("customerAddress", "BILL_TO_BLOCK"),
    ("customerName", "BUYER_BLOCK"),
]

MATCH_THRESHOLD = 0.85
MAX_EXTRA_WORDS = 2


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output).expanduser().resolve()
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    label_map = json.loads(Path(args.label_map).read_text(encoding="utf-8"))
    label2id: Dict[str, int] = label_map["label2id"]
    other_id = label2id["OTHER"]

    stems = sorted(p.stem for p in input_dir.glob("*.html"))
    if not stems:
        print(f"No *.html files found in {input_dir}", file=sys.stderr)
        return 1

    output_paths = {
        "train": output_dir / "layoutxlm_train.jsonl",
        "dev": output_dir / "layoutxlm_dev.jsonl",
        "test": output_dir / "layoutxlm_test.jsonl",
    }
    handles = {split: path.open("w", encoding="utf-8") for split, path in output_paths.items()}
    counts = {"train": 0, "dev": 0, "test": 0, "skipped": 0}
    label_hits = {name: 0 for _, name in FIELD_TO_LABEL}
    issues: List[Dict[str, str]] = []

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=2)
            for index, stem in enumerate(stems, start=1):
                try:
                    reference = json.loads(
                        (input_dir / f"{stem}.json").read_text(encoding="utf-8")
                    )
                    image_path = images_dir / f"{stem}.png"
                    render_html_to_png(page, input_dir / f"{stem}.html", image_path)
                    split = choose_split(index)
                    record, hits = label_invoice(
                        stem, split, image_path, reference, label2id, other_id
                    )
                    for name in hits:
                        label_hits[name] += 1
                    handles[split].write(json.dumps(record, ensure_ascii=False) + "\n")
                    counts[split] += 1
                except Exception as exc:
                    counts["skipped"] += 1
                    if len(issues) < 200:
                        issues.append({"file": stem, "error": compact_error(exc)})
                if index % 50 == 0:
                    print(f"labeled {index}/{len(stems)} invoices", file=sys.stderr)
            browser.close()
    finally:
        for handle in handles.values():
            handle.close()

    summary = {
        "input_dir": str(input_dir),
        "outputs": {split: str(path) for split, path in output_paths.items()},
        "counts": counts,
        "field_match_rate": {
            name: f"{label_hits[name]}/{sum(counts[s] for s in ('train', 'dev', 'test'))}"
            for _, name in FIELD_TO_LABEL
        },
        "issues": issues,
        "bbox_format": "xyxy normalized to integers in [0, 1000]",
        "label_source": str(args.label_map),
        "merge_hint": (
            "concatenate with datasets/fatura/processed/layoutxlm_{split}.jsonl "
            "(same schema + label ids) before training on combined data"
        ),
    }
    summary_path = output_dir / "layoutxlm_preparation_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if counts["train"] and not counts["skipped"] else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--label-map", default=str(DEFAULT_LABEL_MAP))
    return parser.parse_args()


def choose_split(index: int) -> str:
    remainder = index % 10
    if remainder == 0:
        return "test"
    if remainder == 1:
        return "dev"
    return "train"


def render_html_to_png(page: Any, html_path: Path, output_path: Path) -> None:
    page.goto(html_path.as_uri())
    page.screenshot(path=str(output_path), full_page=True)


def label_invoice(
    document_id: str,
    split: str,
    image_path: Path,
    reference: Dict[str, Any],
    label2id: Dict[str, int],
    other_id: int,
) -> Tuple[Dict[str, Any], List[str]]:
    with Image.open(image_path) as image:
        width, height = image.size

    words = ocr_words(image_path)
    if not words:
        raise ValueError("OCR returned no words")

    labels = [other_id] * len(words)
    normalized_words = [normalize_text(word["text"]) for word in words]
    hits: List[str] = []

    for field, label_name in FIELD_TO_LABEL:
        value = reference.get(field)
        if not value:
            continue
        span = find_best_span(normalized_words, labels, other_id, str(value))
        if span is not None:
            label_id = label2id[label_name]
            for i in range(span[0], span[1]):
                labels[i] = label_id
            hits.append(label_name)

    tokens = [word["text"] for word in words]
    pixel_boxes = [
        [word["left"], word["top"], word["left"] + word["width"], word["top"] + word["height"]]
        for word in words
    ]
    normalized_boxes = [normalize_bbox(box, width, height) for box in pixel_boxes]

    record = {
        "document_id": document_id,
        "split": split,
        "image_path": str(image_path),
        "tokens": tokens,
        "bboxes": normalized_boxes,
        "labels": labels,
        "bbox_format": "xyxy_0_1000",
        "original_size": [height, width],
    }
    return record, hits


def ocr_words(image_path: Path) -> List[Dict[str, Any]]:
    import pytesseract

    data = pytesseract.image_to_data(
        str(image_path), lang="ron", output_type=pytesseract.Output.DICT
    )
    words: List[Dict[str, Any]] = []
    for i in range(len(data["text"])):
        text = data["text"][i].strip()
        if not text:
            continue
        words.append(
            {
                "text": text,
                "left": int(data["left"][i]),
                "top": int(data["top"][i]),
                "width": int(data["width"][i]),
                "height": int(data["height"][i]),
            }
        )
    return words


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", stripped.lower())


def find_best_span(
    normalized_words: Sequence[str],
    labels: Sequence[int],
    other_id: int,
    expected_value: str,
) -> Optional[Tuple[int, int]]:
    expected_norm = normalize_text(expected_value)
    if not expected_norm:
        return None
    approx_words = max(1, len(expected_value.split()))
    max_window = min(len(normalized_words), approx_words + MAX_EXTRA_WORDS)
    best: Optional[Tuple[int, int, float]] = None
    for window in range(1, max_window + 1):
        for start in range(0, len(normalized_words) - window + 1):
            end = start + window
            if any(labels[i] != other_id for i in range(start, end)):
                continue
            candidate = "".join(normalized_words[start:end])
            if not candidate:
                continue
            ratio = difflib.SequenceMatcher(None, candidate, expected_norm).ratio()
            if best is None or ratio > best[2]:
                best = (start, end, ratio)
    if best is not None and best[2] >= MATCH_THRESHOLD:
        return best[0], best[1]
    return None


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:500] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
