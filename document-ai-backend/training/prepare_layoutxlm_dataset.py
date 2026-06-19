"""Convert FATURA hugg annotations into split-aware LayoutXLM JSONL records."""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, TextIO, Tuple

from fatura_dataset_io import (
    DatasetSource,
    classify_annotation_files,
    document_id_from_annotation,
    load_stratified_splits,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = BACKEND_ROOT / "datasets/fatura/invoices_dataset_final.zip"
DEFAULT_OUTPUT = BACKEND_ROOT / "datasets/fatura/processed"


def main() -> int:
    args = parse_args()
    dataset_path = Path(args.dataset).expanduser().resolve()
    output_root = Path(args.output).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    output_paths = {
        "train": output_root / "layoutxlm_train.jsonl",
        "dev": output_root / "layoutxlm_dev.jsonl",
        "test": output_root / "layoutxlm_test.jsonl",
    }
    handles = {
        split: path.open("w", encoding="utf-8") for split, path in output_paths.items()
    }
    counts = {"train": 0, "dev": 0, "test": 0, "skipped": 0}
    issues: List[Dict[str, str]] = []

    try:
        with DatasetSource(dataset_path) as source:
            groups = classify_annotation_files(source.names)
            official_splits = load_stratified_splits(source)
            dimension_map = load_coco_dimensions(
                source, groups["coco_train"] + groups["coco_test"]
            )
            annotations = groups["hugg_train"] + groups["hugg_test"]
            for index, name in enumerate(annotations, start=1):
                try:
                    raw = source.read_json(name)
                    document_id = document_id_from_annotation(name)
                    split = choose_official_split(
                        document_id,
                        official_splits,
                        "test" if name.endswith("_hugg_test.json") else "train",
                    )
                    record = prepare_record(
                        source,
                        raw,
                        document_id,
                        split,
                        dimension_map.get(document_id),
                    )
                    handles[split].write(json.dumps(record, ensure_ascii=False) + "\n")
                    counts[split] += 1
                except Exception as exc:
                    counts["skipped"] += 1
                    if len(issues) < 200:
                        issues.append({"file": name, "error": compact_error(exc)})
                if index % 1000 == 0:
                    print(
                        f"prepared {index}/{len(annotations)} annotations",
                        file=sys.stderr,
                    )
    finally:
        for handle in handles.values():
            handle.close()

    summary = {
        "dataset_path": str(dataset_path),
        "outputs": {split: str(path) for split, path in output_paths.items()},
        "counts": counts,
        "issues": issues,
        "bbox_format": "xyxy normalized to integers in [0, 1000]",
        "split_source": "strat1_train.csv / strat1_dev.csv / strat1_test.csv, with annotation suffix fallback",
    }
    summary_path = output_root / "layoutxlm_preparation_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if counts["train"] and counts["test"] and not counts["skipped"] else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset",
        nargs="?",
        default=os.getenv("FATURA_DATASET_PATH", str(discover_default_dataset())),
        help="Path to invoices_dataset_final.zip or its extracted directory",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    return parser.parse_args()


def discover_default_dataset() -> Path:
    candidates = [DEFAULT_DATASET, Path.home() / "Downloads/invoices_dataset_final.zip"]
    return next((path for path in candidates if path.exists()), DEFAULT_DATASET)


def load_coco_dimensions(
    source: DatasetSource, names: Sequence[str]
) -> Dict[str, Tuple[int, int]]:
    dimensions: Dict[str, Tuple[int, int]] = {}
    for name in names:
        try:
            record = source.read_json(name)
            original = record.get("orig_size")
            image_id = str(record.get("image_id") or document_id_from_annotation(name))
            if isinstance(original, list) and len(original) >= 2:
                height, width = int(original[0]), int(original[1])
                if width > 0 and height > 0:
                    dimensions[image_id] = (width, height)
        except Exception:
            continue
    return dimensions


def choose_official_split(
    document_id: str, official: Dict[str, set[str]], fallback: str
) -> str:
    matches = [
        split for split, documents in official.items() if document_id in documents
    ]
    if len(matches) > 1:
        raise ValueError(f"document appears in multiple official splits: {matches}")
    return matches[0] if matches else fallback


def prepare_record(
    source: DatasetSource,
    raw: Dict[str, Any],
    document_id: str,
    split: str,
    dimensions: Optional[Tuple[int, int]],
) -> Dict[str, Any]:
    words = raw.get("words")
    boxes = raw.get("bboxes")
    labels = raw.get("ner_tags")
    if (
        not isinstance(words, list)
        or not isinstance(boxes, list)
        or not isinstance(labels, list)
    ):
        raise ValueError("words, bboxes and ner_tags must be lists")
    if not (len(words) == len(boxes) == len(labels)):
        raise ValueError(
            f"length mismatch words={len(words)} bboxes={len(boxes)} labels={len(labels)}"
        )
    image_name = str(raw.get("path") or f"{document_id}.jpg")
    image_member = source.image_member(image_name)
    image_available = image_member is not None
    effective_image_member = image_member or source.expected_image_member(image_name)
    if dimensions:
        width, height = dimensions
    elif image_member:
        width, height = read_image_dimensions(source.read_bytes(image_member))
    else:
        raise FileNotFoundError(f"image and COCO dimensions not found: {image_name}")
    normalized_boxes = [normalize_bbox(box, width, height) for box in boxes]
    return {
        "document_id": document_id,
        "split": split,
        "image_path": source.image_reference(effective_image_member),
        "image_member": effective_image_member,
        "image_available": image_available,
        "dataset_path": str(source.path),
        "tokens": [str(word) for word in words],
        "bboxes": normalized_boxes,
        "labels": [int(label) for label in labels],
        "bbox_format": "xyxy_0_1000",
        "original_size": [height, width],
    }


def normalize_bbox(value: Any, width: int, height: int) -> List[int]:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError(f"invalid bbox: {value}")
    box = [float(item) for item in value]
    x0, y0, x1, y1 = box
    looks_like_pixels = (
        width > 0
        and height > 0
        and max(x0, x1) <= width * 1.05
        and max(y0, y1) <= height * 1.05
    )
    if looks_like_pixels:
        box = [
            x0 / width * 1000,
            y0 / height * 1000,
            x1 / width * 1000,
            y1 / height * 1000,
        ]
    elif max(box) <= 1.01:
        box = [item * 1000 for item in box]
    return clamp_xyxy(box)


def clamp_xyxy(box: Sequence[float]) -> List[int]:
    x0, y0, x1, y1 = [max(0, min(round(value), 1000)) for value in box]
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def read_image_dimensions(data: bytes) -> Tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required when COCO orig_size is missing") from exc
    with Image.open(io.BytesIO(data)) as image:
        return image.size


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:500] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
