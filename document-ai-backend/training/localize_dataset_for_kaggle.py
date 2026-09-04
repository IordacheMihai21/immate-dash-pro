"""Rewrite processed_combined JSONL image paths to match Kaggle input mounts.

Local jsonl records point at this machine's absolute paths: the FATURA zip
opened in place (`dataset_path` + `image_member`) for English documents, and
the local `processed_ro/images/` PNGs for Romanian ones. Kaggle mounts
datasets read-only under /kaggle/input/<dataset-slug>/..., with zip datasets
auto-extracted, so none of those local paths exist there. This rewrites both
to plain `image_path` entries pointing at the Kaggle-mounted images, so
training reads files directly with no zip machinery.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict


def localize_record(
    record: Dict[str, Any], fatura_images_dir: Path, ro_images_dir: Path
) -> Dict[str, Any]:
    record = dict(record)
    image_member = record.pop("image_member", None)
    dataset_path = record.pop("dataset_path", None)
    if dataset_path and str(dataset_path).lower().endswith(".zip") and image_member:
        filename = Path(image_member).name
        record["image_path"] = str(fatura_images_dir / filename)
    else:
        filename = Path(record["image_path"]).name
        record["image_path"] = str(ro_images_dir / filename)
    return record


def localize_file(
    source: Path, destination: Path, fatura_images_dir: Path, ro_images_dir: Path
) -> int:
    if not source.exists():
        return 0
    count = 0
    with source.open(encoding="utf-8") as handle_in, destination.open(
        "w", encoding="utf-8"
    ) as handle_out:
        for line in handle_in:
            line = line.strip()
            if not line:
                continue
            record = localize_record(json.loads(line), fatura_images_dir, ro_images_dir)
            handle_out.write(json.dumps(record) + "\n")
            count += 1
    return count


def main() -> int:
    args = parse_args()
    data_root = Path(args.data)
    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)
    fatura_images_dir = Path(args.fatura_images_dir)
    ro_images_dir = Path(args.ro_images_dir)

    total = 0
    for split in ("train", "dev", "test"):
        source = data_root / f"layoutxlm_{split}.jsonl"
        destination = output_root / f"layoutxlm_{split}.jsonl"
        count = localize_file(source, destination, fatura_images_dir, ro_images_dir)
        total += count
        print(f"{split}: {count} records -> {destination}")

    split_summary = data_root / "split_summary.json"
    if split_summary.exists():
        (output_root / "split_summary.json").write_text(
            split_summary.read_text(encoding="utf-8"), encoding="utf-8"
        )
        print(f"copied {split_summary.name} -> {output_root / split_summary.name}")

    checked = 0
    missing = 0
    for split in ("train", "dev", "test"):
        destination = output_root / f"layoutxlm_{split}.jsonl"
        if not destination.exists():
            continue
        with destination.open(encoding="utf-8") as handle:
            for index, line in enumerate(handle):
                if index >= 20:
                    break
                record = json.loads(line)
                checked += 1
                if not Path(record["image_path"]).exists():
                    missing += 1
    print(f"path spot-check: {checked - missing}/{checked} sampled images exist")
    if missing:
        print(
            "Some sampled images are missing; verify --fatura-images-dir and "
            "--ro-images-dir point at the extracted Kaggle input folders.",
            file=sys.stderr,
        )
        return 1
    print(f"Localized {total} records to {output_root}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="datasets/fatura/processed_holdout")
    parser.add_argument(
        "--fatura-images-dir",
        required=True,
        help=(
            "Extracted invoices_dataset_final/images directory, e.g. "
            "/kaggle/input/fatura-full/invoices_dataset_final/images"
        ),
    )
    parser.add_argument(
        "--ro-images-dir",
        required=True,
        help=(
            "Extracted processed_ro/images directory, e.g. "
            "/kaggle/input/immapp-ro-dataset/processed_ro/images"
        ),
    )
    parser.add_argument("--output", default="/kaggle/working/datasets/fatura/processed_holdout")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
