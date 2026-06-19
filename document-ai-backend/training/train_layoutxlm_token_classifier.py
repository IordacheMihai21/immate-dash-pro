"""Optionally fine-tune LayoutXLM on processed IMMapp BIO token records."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


DEFAULT_MODEL = "microsoft/layoutxlm-base"
DEFAULT_OUTPUT = "models/layoutxlm-invoice-token-classifier"


def main() -> int:
    args = parse_args()
    records = load_records(Path(args.data), split="train")
    if not records:
        print(
            "No processed training records found. Run prepare_fatura_dataset.py first.",
            file=sys.stderr,
        )
        return 2
    labels = sorted({label for record in records for label in record["labels"]})
    if "O" in labels:
        labels.remove("O")
    labels = ["O", *labels]
    print(f"dataset: {len(records)} documents, {len(labels)} labels")
    if args.dry_run:
        validate_records(records)
        print("Dry run passed; no model weights were changed.")
        return 0

    try:
        import torch
        from PIL import Image
        from torch.utils.data import Dataset
        from transformers import (
            AutoImageProcessor,
            AutoModelForTokenClassification,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
    except ImportError as exc:
        print(
            "Fine-tuning dependencies are unavailable. Install requirements.txt plus accelerate, "
            f"then retry. Missing import: {exc}",
            file=sys.stderr,
        )
        return 3

    label2id = {label: index for index, label in enumerate(labels)}
    id2label = {index: label for label, index in label2id.items()}
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
        image_processor = AutoImageProcessor.from_pretrained(
            args.model, apply_ocr=False, use_fast=False
        )
        model = AutoModelForTokenClassification.from_pretrained(
            args.model,
            num_labels=len(labels),
            label2id=label2id,
            id2label=id2label,
            ignore_mismatched_sizes=True,
        )
    except Exception as exc:
        print(
            f"Could not load base model '{args.model}': {compact_error(exc)}",
            file=sys.stderr,
        )
        return 4

    class InvoiceDataset(Dataset):
        def __init__(self, items: List[Dict[str, Any]]) -> None:
            self.items = items

        def __len__(self) -> int:
            return len(self.items)

        def __getitem__(self, index: int) -> Dict[str, Any]:
            item = self.items[index]
            encoding = tokenizer(
                item["words"],
                boxes=item["boxes"],
                truncation=True,
                padding="max_length",
                max_length=512,
                return_tensors="pt",
            )
            word_ids = encoding.word_ids(batch_index=0)
            aligned_labels: List[int] = []
            previous_word = None
            for word_id in word_ids:
                if word_id is None or word_id == previous_word:
                    aligned_labels.append(-100)
                else:
                    aligned_labels.append(label2id[item["labels"][word_id]])
                previous_word = word_id
            image = load_image(Image, Path(item["image_path"]))
            pixels = image_processor(images=image, return_tensors="pt")["pixel_values"][
                0
            ]
            result = {key: value[0] for key, value in encoding.items()}
            result["labels"] = torch.tensor(aligned_labels, dtype=torch.long)
            result["image"] = pixels
            return result

    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(output),
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        logging_steps=1,
        save_strategy="epoch",
        report_to=[],
        remove_unused_columns=False,
        fp16=bool(args.fp16 and torch.cuda.is_available()),
        seed=args.seed,
    )
    trainer = Trainer(
        model=model, args=training_args, train_dataset=InvoiceDataset(records)
    )
    try:
        trainer.train()
        trainer.save_model(str(output))
        tokenizer.save_pretrained(str(output))
        image_processor.save_pretrained(str(output))
        (output / "immapp_training_manifest.json").write_text(
            json.dumps(
                {
                    "base_model": args.model,
                    "documents": len(records),
                    "labels": labels,
                    "seed": args.seed,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as exc:
        print(
            "Training stopped safely. Existing backend fallback remains usable. "
            f"Reason: {compact_error(exc)}",
            file=sys.stderr,
        )
        return 5
    print(f"Fine-tuned model saved to {output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="datasets/fatura/processed")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--epochs", type=float, default=5.0)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_records(root: Path, split: str) -> List[Dict[str, Any]]:
    root = root.expanduser().resolve()
    paths = (
        sorted((root / split).rglob("*.json"))
        if (root / split).exists()
        else sorted(root.rglob("*.json"))
    )
    records: List[Dict[str, Any]] = []
    for path in paths:
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            record.get("split") == split
            and record.get("words")
            and record.get("labels")
        ):
            records.append(record)
    return records


def validate_records(records: List[Dict[str, Any]]) -> None:
    for record in records:
        lengths = [len(record.get(key, [])) for key in ("words", "boxes", "labels")]
        if len(set(lengths)) != 1:
            raise ValueError(
                f"{record.get('document_id')}: words/boxes/labels lengths differ"
            )
        if any(
            len(box) != 4 or min(box) < 0 or max(box) > 1000 for box in record["boxes"]
        ):
            raise ValueError(f"{record.get('document_id')}: invalid normalized box")


def load_image(image_module: Any, path: Path) -> Any:
    if path.suffix.lower() == ".pdf":
        raise RuntimeError(f"Render PDF to PNG/JPG before LayoutXLM training: {path}")
    return image_module.open(path).convert("RGB")


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:800] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
