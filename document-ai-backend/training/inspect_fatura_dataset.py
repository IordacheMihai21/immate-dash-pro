"""Inspect the full FATURA archive and produce auditable annotation/label reports."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, DefaultDict, Dict, List

from fatura_dataset_io import (
    DatasetSource,
    classify_annotation_files,
    document_id_from_annotation,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = BACKEND_ROOT / "datasets/fatura/invoices_dataset_final.zip"
DEFAULT_REPORT = BACKEND_ROOT / "datasets/fatura/annotation_report.json"
DEFAULT_LABEL_MAP = BACKEND_ROOT / "datasets/fatura/inferred_label_map.json"
INFERRED_LABELS = {
    "0": "SELLER_WEBSITE",
    "1": "TOTAL_BLOCK",
    "2": "TOTAL_IN_WORDS_BLOCK",
    "3": "INVOICE_DATE_BLOCK",
    "4": "DUE_DATE_BLOCK",
    "5": "BUYER_BLOCK",
    "6": "SUPPLIER_NAME",
    "8": "BILL_TO_BLOCK",
    "9": "SHIP_TO_BLOCK",
    "10": "TABLE_REGION",
    "11": "LOGO_REGION",
    "12": "INVOICE_NUMBER_BLOCK",
    "13": "OTHER",
}


def main() -> int:
    args = parse_args()
    dataset_path = Path(args.dataset).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    label_map_path = Path(args.label_map).expanduser().resolve()
    token_samples: DefaultDict[int, List[str]] = defaultdict(list)
    token_seen: DefaultDict[int, set[str]] = defaultdict(set)
    box_samples: DefaultDict[int, List[List[float]]] = defaultdict(list)
    document_samples: DefaultDict[int, List[str]] = defaultdict(list)
    document_seen: DefaultDict[int, set[str]] = defaultdict(set)
    span_samples: DefaultDict[int, List[str]] = defaultdict(list)
    span_seen: DefaultDict[int, set[str]] = defaultdict(set)
    ner_counts: Counter[int] = Counter()
    coco_counts: Counter[int] = Counter()
    invalid_hugg: List[Dict[str, Any]] = []
    invalid_coco: List[Dict[str, Any]] = []
    read_errors: List[Dict[str, str]] = []

    with DatasetSource(dataset_path) as source:
        groups = classify_annotation_files(source.names)
        counts = {
            "valid_files": len(source.names),
            "images": sum(
                name.lower().endswith((".jpg", ".jpeg", ".png"))
                for name in source.names
            ),
            "json_files": sum(name.lower().endswith(".json") for name in source.names),
            **{key: len(value) for key, value in groups.items()},
        }
        for index, name in enumerate(
            groups["hugg_train"] + groups["hugg_test"], start=1
        ):
            try:
                record = source.read_json(name)
                words = record.get("words")
                boxes = record.get("bboxes")
                tags = record.get("ner_tags")
                if (
                    not isinstance(words, list)
                    or not isinstance(boxes, list)
                    or not isinstance(tags, list)
                ):
                    invalid_hugg.append(
                        {"file": name, "reason": "missing words/bboxes/ner_tags lists"}
                    )
                    continue
                if not (len(words) == len(boxes) == len(tags)):
                    invalid_hugg.append(
                        {
                            "file": name,
                            "reason": "length mismatch",
                            "words": len(words),
                            "bboxes": len(boxes),
                            "ner_tags": len(tags),
                        }
                    )
                    continue
                document_id = document_id_from_annotation(name)
                for tag in {int(value) for value in tags}:
                    if (
                        document_id not in document_seen[tag]
                        and len(document_samples[tag]) < args.samples
                    ):
                        document_samples[tag].append(document_id)
                        document_seen[tag].add(document_id)
                for tag, span in extract_label_spans(words, tags):
                    if (
                        span not in span_seen[tag]
                        and len(span_samples[tag]) < args.samples
                    ):
                        span_samples[tag].append(span)
                        span_seen[tag].add(span)
                for word, raw_tag in zip(words, tags):
                    tag = int(raw_tag)
                    ner_counts[tag] += 1
                    text = str(word).strip()
                    if (
                        text
                        and text not in token_seen[tag]
                        and len(token_samples[tag]) < args.samples
                    ):
                        token_samples[tag].append(text)
                        token_seen[tag].add(text)
            except Exception as exc:
                append_limited(read_errors, {"file": name, "error": compact_error(exc)})
            if index % 2000 == 0:
                print(f"inspected {index} hugg annotations", file=sys.stderr)

        for index, name in enumerate(
            groups["coco_train"] + groups["coco_test"], start=1
        ):
            try:
                record = source.read_json(name)
                labels = record.get("class_labels")
                boxes = record.get("boxes")
                if not isinstance(labels, list) or not isinstance(boxes, list):
                    invalid_coco.append(
                        {"file": name, "reason": "missing class_labels/boxes lists"}
                    )
                    continue
                if len(labels) != len(boxes):
                    invalid_coco.append(
                        {
                            "file": name,
                            "reason": "length mismatch",
                            "class_labels": len(labels),
                            "boxes": len(boxes),
                        }
                    )
                    continue
                for raw_label, raw_box in zip(labels, boxes):
                    label = int(raw_label)
                    coco_counts[label] += 1
                    if (
                        isinstance(raw_box, list)
                        and len(raw_box) == 4
                        and len(box_samples[label]) < args.samples
                    ):
                        box_samples[label].append(
                            [round(float(value), 6) for value in raw_box]
                        )
            except Exception as exc:
                append_limited(read_errors, {"file": name, "error": compact_error(exc)})
            if index % 2000 == 0:
                print(f"inspected {index} coco annotations", file=sys.stderr)

    unique_labels = sorted(set(ner_counts) | set(coco_counts))
    label_report = {
        str(label): {
            "inferred_name": INFERRED_LABELS.get(str(label), f"UNKNOWN_{label}"),
            "mapping_status": "inferred_not_official",
            "hugg_token_count": ner_counts[label],
            "coco_region_count": coco_counts[label],
            "sample_tokens": token_samples[label],
            "sample_spans": span_samples[label],
            "sample_documents": document_samples[label],
            "sample_boxes": box_samples[label],
        }
        for label in unique_labels
    }
    report = {
        "dataset_path": dataset_path.name,
        "dataset_source_type": (
            "zip" if dataset_path.suffix.lower() == ".zip" else "directory"
        ),
        "mapping_warning": "Label names are inferred from observed samples; no official label map was present.",
        "counts": counts,
        "validation": {
            "hugg_valid": counts["hugg_train"]
            + counts["hugg_test"]
            - len(invalid_hugg),
            "hugg_invalid_count": len(invalid_hugg),
            "hugg_invalid_examples": invalid_hugg[:100],
            "coco_valid": counts["coco_train"]
            + counts["coco_test"]
            - len(invalid_coco),
            "coco_invalid_count": len(invalid_coco),
            "coco_invalid_examples": invalid_coco[:100],
            "read_error_count": len(read_errors),
            "read_error_examples": read_errors,
        },
        "unique_ner_tags": sorted(ner_counts),
        "unique_coco_class_labels": sorted(coco_counts),
        "label_report": label_report,
    }
    inferred_map = {
        "status": "inferred_not_official",
        "inferred_not_official": True,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "warning": "Review sample tokens and boxes before training; this is not an official FATURA label map.",
        "notes": [
            "Names were reviewed from hugg token spans and COCO regions.",
            "Label 5 covers Buyer/Bill to recipient blocks; label 8 covers the dataset's explicit BILL_TO block class.",
            "Block/region suffixes are used when a label covers headings, values, and related tokens together.",
        ],
        "id2label": {
            str(label): INFERRED_LABELS.get(str(label), f"UNKNOWN_{label}")
            for label in unique_labels
        },
        "label2id": {
            INFERRED_LABELS.get(str(label), f"UNKNOWN_{label}"): label
            for label in unique_labels
        },
        "label_report": label_report,
    }
    write_json(report_path, report)
    write_json(label_map_path, inferred_map)
    print(json.dumps(counts, indent=2))
    print(f"unique ner_tags: {sorted(ner_counts)}")
    print(f"unique coco class_labels: {sorted(coco_counts)}")
    for label in sorted(ner_counts):
        print(
            f"label {label} ({inferred_map['id2label'][str(label)]}): {token_samples[label]}"
        )
    print(f"annotation report: {report_path}")
    print(f"inferred label map: {label_map_path}")
    return 0 if not read_errors else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset",
        nargs="?",
        default=os.getenv("FATURA_DATASET_PATH", str(discover_default_dataset())),
        help="Path to invoices_dataset_final.zip or its extracted directory",
    )
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--label-map", default=str(DEFAULT_LABEL_MAP))
    parser.add_argument("--samples", type=int, default=12)
    return parser.parse_args()


def discover_default_dataset() -> Path:
    candidates = [DEFAULT_DATASET, Path.home() / "Downloads/invoices_dataset_final.zip"]
    return next((path for path in candidates if path.exists()), DEFAULT_DATASET)


def append_limited(target: List[Dict[str, str]], value: Dict[str, str]) -> None:
    if len(target) < 100:
        target.append(value)


def extract_label_spans(words: List[Any], tags: List[Any]) -> List[tuple[int, str]]:
    spans: List[tuple[int, str]] = []
    start = 0
    while start < len(words):
        tag = int(tags[start])
        end = start + 1
        while end < len(words) and int(tags[end]) == tag:
            end += 1
        text = " ".join(
            str(word).strip() for word in words[start:end] if str(word).strip()
        )
        if text:
            spans.append((tag, text[:300]))
        start = end
    return spans


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:500] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
