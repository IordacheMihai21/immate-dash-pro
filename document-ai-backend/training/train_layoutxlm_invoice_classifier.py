"""Fine-tune LayoutXLM token classification on prepared FATURA JSONL records."""

from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = BACKEND_ROOT / "datasets/fatura/processed_holdout"
DEFAULT_LABEL_MAP = BACKEND_ROOT / "datasets/fatura/inferred_label_map.json"
DEFAULT_OUTPUT = BACKEND_ROOT / "models/layoutxlm-invoice-token-classifier"


def main() -> int:
    args = parse_args()
    if args.smoke_test:
        args.max_train_samples = args.max_train_samples or 2
        args.max_eval_samples = args.max_eval_samples or 1
        args.batch_size = 1
        args.epochs = 1.0
    data_root = Path(args.data).expanduser().resolve()
    paths = {
        "train": data_root / "layoutxlm_train.jsonl",
        "dev": data_root / "layoutxlm_dev.jsonl",
        "test": data_root / "layoutxlm_test.jsonl",
    }
    missing = [
        str(path)
        for split, path in paths.items()
        if split != "dev" and not path.exists()
    ]
    if missing:
        print(
            "Processed dataset is missing. Run prepare_layoutxlm_dataset.py first: "
            + ", ".join(missing),
            file=sys.stderr,
        )
        return 2
    train_records = read_jsonl(paths["train"], args.max_train_samples)
    dev_records = (
        read_jsonl(paths["dev"], args.max_eval_samples) if paths["dev"].exists() else []
    )
    test_records = read_jsonl(paths["test"], args.max_eval_samples)
    unavailable_images = sum(
        record.get("image_available") is False
        for record in train_records + dev_records + test_records
    )
    train_records = [
        record for record in train_records if record.get("image_available") is not False
    ]
    dev_records = [
        record for record in dev_records if record.get("image_available") is not False
    ]
    test_records = [
        record for record in test_records if record.get("image_available") is not False
    ]
    label_config = json.loads(
        Path(args.label_map).expanduser().read_text(encoding="utf-8")
    )
    raw_id2label = {
        int(key): str(value) for key, value in label_config.get("id2label", {}).items()
    }
    observed_labels = sorted(
        {
            int(label)
            for record in train_records + dev_records + test_records
            for label in record["labels"]
        }
    )
    if not observed_labels:
        print("No token labels found in the processed dataset.", file=sys.stderr)
        return 2
    maximum_label = max(observed_labels)
    id2label = {
        index: raw_id2label.get(index, f"UNKNOWN_{index}")
        for index in range(maximum_label + 1)
    }
    label2id = {name: index for index, name in id2label.items()}
    validate_records(train_records + dev_records + test_records, maximum_label)
    print(
        f"dataset: train={len(train_records)} dev={len(dev_records)} test={len(test_records)} "
        f"labels={observed_labels} excluded_missing_images={unavailable_images}"
    )
    print("label map status: inferred_not_official; manual review remains required")
    if args.dry_run:
        print("Dry run passed; no model weights were loaded or changed.")
        return 0

    try:
        import accelerate  # noqa: F401 - Trainer runtime dependency preflight
        import numpy as np
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
            "Training dependencies are unavailable. Install requirements-training.txt. "
            f"Missing import: {exc}",
            file=sys.stderr,
        )
        return 3
    resolved_device = resolve_training_device(args.device, torch)
    if resolved_device is None:
        print(
            f"Requested device '{args.device}' is unavailable. Enable a GPU runtime or choose another device.",
            file=sys.stderr,
        )
        return 4
    if resolved_device != "cuda" and not args.allow_cpu and not args.smoke_test:
        print(
            f"Resolved device is '{resolved_device}'. Full LayoutXLM training is intentionally "
            "reserved for CUDA in this workflow. Use Colab/Kaggle or pass --allow-cpu explicitly.",
            file=sys.stderr,
        )
        return 4
    print(f"training device: {resolved_device}")
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
        image_processor = AutoImageProcessor.from_pretrained(
            args.model, apply_ocr=False, use_fast=False
        )
        model = AutoModelForTokenClassification.from_pretrained(
            args.model,
            num_labels=maximum_label + 1,
            id2label=id2label,
            label2id=label2id,
            ignore_mismatched_sizes=True,
        )
    except Exception as exc:
        print(f"Could not load base model: {compact_error(exc)}", file=sys.stderr)
        return 5

    class FaturaDataset(Dataset):
        def __init__(self, records: List[Dict[str, Any]]) -> None:
            self.records = records
            self.zip_handles: Dict[str, zipfile.ZipFile] = {}

        def __len__(self) -> int:
            return len(self.records)

        def __getitem__(self, index: int) -> Dict[str, Any]:
            record = self.records[index]
            encoding = tokenizer(
                record["tokens"],
                boxes=record["bboxes"],
                truncation=True,
                padding="max_length",
                max_length=512,
                return_tensors="pt",
            )
            aligned: List[int] = []
            previous_word = None
            for word_id in encoding.word_ids(batch_index=0):
                if word_id is None or word_id == previous_word:
                    aligned.append(-100)
                else:
                    aligned.append(int(record["labels"][word_id]))
                previous_word = word_id
            pixel_values_path = record.get("pixel_values_path")

            if pixel_values_path:
                pixels = torch.from_numpy(
                    np.load(str(pixel_values_path))
                ).float()
            else:
                image = self.load_image(record, Image)
                pixels = image_processor(
                    images=image,
                    return_tensors="pt"
                )["pixel_values"][0]
            result = {key: value[0] for key, value in encoding.items()}
            result["labels"] = torch.tensor(aligned, dtype=torch.long)
            result["image"] = pixels
            return result

        def load_image(self, record: Dict[str, Any], image_module: Any) -> Any:
            dataset_path = str(record.get("dataset_path", ""))
            member = str(record.get("image_member", ""))
            if dataset_path.lower().endswith(".zip") and member:
                archive = self.zip_handles.get(dataset_path)
                if archive is None:
                    archive = zipfile.ZipFile(dataset_path)
                    self.zip_handles[dataset_path] = archive
                return image_module.open(io.BytesIO(archive.read(member))).convert(
                    "RGB"
                )
            path = str(record.get("image_path", ""))
            return image_module.open(path).convert("RGB")

    def compute_metrics(prediction: Any) -> Dict[str, float]:
        logits, labels = prediction
        predicted = np.argmax(logits, axis=-1)
        active = labels != -100
        return {"token_accuracy": float((predicted[active] == labels[active]).mean())}

    temporary_output = (
        Path(tempfile.mkdtemp(prefix="immapp-layoutxlm-smoke-"))
        if args.smoke_test and not args.save
        else None
    )
    output = temporary_output or Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    evaluation_strategy = (
        "steps" if args.smoke_test and dev_records else "epoch" if dev_records else "no"
    )
    training_args = TrainingArguments(
        output_dir=str(output),
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        num_train_epochs=args.epochs,
        max_steps=1 if args.smoke_test else -1,
        weight_decay=0.01,
        eval_strategy=evaluation_strategy,
        save_strategy="no" if args.smoke_test and not args.save else "epoch",
        eval_steps=1 if args.smoke_test else None,
        logging_steps=1 if args.smoke_test else 25,
        report_to=[],
        remove_unused_columns=False,
        fp16=bool(args.fp16 and torch.cuda.is_available()),
        use_cpu=resolved_device == "cpu",
        dataloader_pin_memory=resolved_device == "cuda",
        seed=args.seed,
        load_best_model_at_end=bool(dev_records) and not args.smoke_test,
        metric_for_best_model="token_accuracy" if dev_records else None,
        greater_is_better=True if dev_records else None,
        save_total_limit=2,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=FaturaDataset(train_records),
        eval_dataset=FaturaDataset(dev_records) if dev_records else None,
        compute_metrics=compute_metrics if dev_records else None,
    )
    try:
        trainer.train()
        test_metrics = trainer.evaluate(
            FaturaDataset(test_records), metric_key_prefix="test"
        )
        if not args.smoke_test or args.save:
            trainer.save_model(str(output))
            tokenizer.save_pretrained(str(output))
            image_processor.save_pretrained(str(output))
            split_summary_path = data_root / "split_summary.json"
            split_method = (
                json.loads(split_summary_path.read_text(encoding="utf-8"))
                if split_summary_path.exists()
                else {
                    "method": "unknown",
                    "warning": (
                        "No split_summary.json next to --data. If this data came from "
                        "prepare_layoutxlm_dataset.py directly (FATURA's official "
                        "strat1_* split), be aware that split does NOT hold out whole "
                        "invoice templates -- every template appears in train, dev and "
                        "test, so test accuracy mostly measures template memorization, "
                        "not generalization to unseen layouts. Use "
                        "split_by_template_holdout.py for a trustworthy number."
                    ),
                }
            )
            (output / "immapp_training_manifest.json").write_text(
                json.dumps(
                    {
                        "base_model": args.model,
                        "train_documents": len(train_records),
                        "dev_documents": len(dev_records),
                        "test_documents": len(test_records),
                        "id2label": id2label,
                        "label_mapping_status": "inferred_not_official",
                        "split_method": split_method,
                        "test_metrics": test_metrics,
                        "seed": args.seed,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
    except Exception as exc:
        print(
            "Training stopped safely; the existing backend fallback is unchanged. "
            f"Reason: {compact_error(exc)}",
            file=sys.stderr,
        )
        if temporary_output:
            shutil.rmtree(temporary_output, ignore_errors=True)
        return 6
    if args.smoke_test:
        print(
            "Smoke test passed: model initialized, one training step and tiny evaluation completed."
        )
        print(json.dumps(test_metrics, indent=2))
        if temporary_output:
            shutil.rmtree(temporary_output, ignore_errors=True)
        if args.save:
            print(f"Smoke-test model saved explicitly to {output}")
        else:
            print(
                "Smoke-test weights were discarded; the real model directory was not changed."
            )
        return 0
    print(f"Model saved to {output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=str(DEFAULT_DATA))
    parser.add_argument("--label-map", default=str(DEFAULT_LABEL_MAP))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--model", default="microsoft/layoutxlm-base")
    parser.add_argument(
        "--device",
        choices=["auto", "cuda", "cpu", "mps"],
        default="auto",
        help="Training device. Use cuda in Colab/Kaggle.",
    )
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--allow-cpu", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument(
        "--save",
        action="store_true",
        help="Persist smoke-test weights to --output; normal full training always saves",
    )
    parser.add_argument("--max-train-samples", type=int)
    parser.add_argument("--max-eval-samples", type=int)
    return parser.parse_args()


def read_jsonl(path: Path, limit: Optional[int]) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    records: List[Dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                records.append(json.loads(line))
            if limit and len(records) >= limit:
                break
    return records


def validate_records(records: List[Dict[str, Any]], maximum_label: int) -> None:
    for record in records:
        lengths = [len(record.get(key, [])) for key in ("tokens", "bboxes", "labels")]
        if len(set(lengths)) != 1 or not lengths[0]:
            raise ValueError(
                f"{record.get('document_id')}: token/bbox/label lengths differ"
            )
        if any(
            len(box) != 4 or min(box) < 0 or max(box) > 1000 for box in record["bboxes"]
        ):
            raise ValueError(f"{record.get('document_id')}: invalid bbox")
        if any(
            int(label) < 0 or int(label) > maximum_label for label in record["labels"]
        ):
            raise ValueError(f"{record.get('document_id')}: invalid label id")


def resolve_training_device(requested: str, torch_module: Any) -> Optional[str]:
    cuda_available = bool(torch_module.cuda.is_available())
    mps_backend = getattr(torch_module.backends, "mps", None)
    mps_available = bool(mps_backend and mps_backend.is_available())
    if requested == "cuda":
        return "cuda" if cuda_available else None
    if requested == "mps":
        return "mps" if mps_available else None
    if requested == "cpu":
        return "cpu"
    if cuda_available:
        return "cuda"
    if mps_available:
        return "mps"
    return "cpu"


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:900] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
