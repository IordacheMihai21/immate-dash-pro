"""Rebuild a leak-free train/dev/test split for LayoutXLM training.

Why this exists: the currently deployed model (see
models/layoutxlm-invoice-token-classifier/immapp_training_manifest.json)
reported test_token_accuracy: 1.0. That number is not trustworthy. FATURA's
own official split (strat1_{train,dev,test}.csv, consumed by
prepare_layoutxlm_dataset.py) assigns individual document INSTANCES to
train/dev/test, but every one of FATURA's 43 visual templates appears in
all three splits -- confirmed directly against the processed data:

    train: 43/43 templates present
    dev:   43/43 templates present
    test:  43/43 templates present

So "test" documents are, layout-wise, templates the model already saw
during training with different instance data (different company names,
amounts) filled in. A block classifier can hit ~100% by recognizing "this
is Template13's layout, the total is always in this region" without
having learned anything that generalizes to an invoice layout it has
never seen -- which is exactly the case that matters for a real user's
real invoice.

This script re-splits by HOLDING OUT ENTIRE TEMPLATES: every document
from a given FATURA template goes to exactly one of train/dev/test, never
split across them. Test accuracy on the result reflects generalization to
unseen layouts, not template memorization.

It also folds in the Romanian synthetic dataset (datasets/fatura/processed_ro/,
prepared 2026-07-28 by label_ro_invoices_for_layoutxlm.py) which was sitting
ready but was never actually used for the deployed model -- so the current
model has never seen a Romanian invoice's vocabulary or layout, despite
this being a Romanian-market product. Its existing instance-level split is
kept as-is: the generator only has 5 layout skeletons (see LAYOUTS in
generate_synthetic_invoices_ro.py) and does not record which one it used
per document in the reference JSON, so a template-holdout split isn't
possible for it yet without a generator change. That's a smaller, real
caveat worth knowing, not a blocker -- documented in the output summary.

Usage:
    python split_by_template_holdout.py
    python train_layoutxlm_invoice_classifier.py --data ../datasets/fatura/processed_holdout ...
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict, List

BACKEND_ROOT = Path(__file__).resolve().parents[1]
FATURA_DIR = BACKEND_ROOT / "datasets/fatura/processed"
RO_DIR = BACKEND_ROOT / "datasets/fatura/processed_ro"
OUTPUT_DIR = BACKEND_ROOT / "datasets/fatura/processed_holdout"
LABEL_MAP_PATH = BACKEND_ROOT / "datasets/fatura/inferred_label_map.json"

# Fraction of FATURA templates held out entirely for dev / test. The
# remainder trains. Seeded for reproducibility.
DEV_TEMPLATE_FRACTION = 0.14  # ~6 of 43 templates
TEST_TEMPLATE_FRACTION = 0.19  # ~8 of 43 templates
SEED = 42


def main() -> int:
    fatura_records = read_all_splits(FATURA_DIR)
    ro_records = read_all_splits(RO_DIR)

    template_of = {
        record["document_id"]: record["document_id"].split("_Instance")[0]
        for record in fatura_records
    }
    templates = sorted(set(template_of.values()))
    rng = random.Random(SEED)
    shuffled = templates[:]
    rng.shuffle(shuffled)

    n_test = max(1, round(len(shuffled) * TEST_TEMPLATE_FRACTION))
    n_dev = max(1, round(len(shuffled) * DEV_TEMPLATE_FRACTION))
    test_templates = set(shuffled[:n_test])
    dev_templates = set(shuffled[n_test : n_test + n_dev])
    train_templates = set(shuffled[n_test + n_dev :])

    assert not (test_templates & dev_templates & train_templates)
    assert test_templates | dev_templates | train_templates == set(templates)

    split_records: Dict[str, List[dict]] = {"train": [], "dev": [], "test": []}
    for record in fatura_records:
        template = template_of[record["document_id"]]
        if template in test_templates:
            split_records["test"].append(record)
        elif template in dev_templates:
            split_records["dev"].append(record)
        else:
            split_records["train"].append(record)

    # Romanian data keeps its existing instance-level split (see docstring
    # for why a template holdout isn't available for it yet).
    for record in ro_records:
        split_records[record["split"]].append(record)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for split, records in split_records.items():
        path = OUTPUT_DIR / f"layoutxlm_{split}.jsonl"
        with path.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    label_coverage = check_label_coverage(split_records)

    summary = {
        "method": "template_holdout",
        "fatura_templates_total": len(templates),
        "fatura_templates_train": len(train_templates),
        "fatura_templates_dev": len(dev_templates),
        "fatura_templates_test": len(test_templates),
        "held_out_test_templates": sorted(test_templates),
        "held_out_dev_templates": sorted(dev_templates),
        "counts": {split: len(records) for split, records in split_records.items()},
        "label_coverage_warnings": label_coverage,
        "romanian_data_included": bool(ro_records),
        "romanian_data_caveat": (
            "Romanian synthetic data uses its existing instance-level split, "
            "not a template holdout -- the generator has only 5 layout "
            "skeletons and doesn't record which one was used per document, "
            "so all 5 likely appear in all three splits. Real held-out "
            "generalization here would need either more layout variety or "
            "the generator to record its 'layout' field so this script can "
            "hold entire layouts out too."
        ),
        "seed": SEED,
    }
    (OUTPUT_DIR / "split_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def check_label_coverage(split_records: Dict[str, List[dict]]) -> List[str]:
    """Holding out whole templates can zero out a label class in dev/test if
    that class only ever occurs on one template (e.g. SELLER_WEBSITE, which
    the label report shows only on Template1). Flag it instead of letting a
    silent zero slip through -- it means precision/recall for that class in
    the resulting eval is meaningless, not that the class is fine."""
    if not LABEL_MAP_PATH.exists():
        return ["inferred_label_map.json not found; skipped coverage check"]

    id2label = json.loads(LABEL_MAP_PATH.read_text(encoding="utf-8"))["id2label"]
    warnings: List[str] = []
    for split in ("train", "dev", "test"):
        present = {label_id for record in split_records[split] for label_id in record["labels"]}
        missing = [name for label_id, name in id2label.items() if int(label_id) not in present]
        if missing:
            warnings.append(f"{split}: no examples of {', '.join(sorted(missing))}")
    return warnings


def read_all_splits(directory: Path) -> List[dict]:
    records: List[dict] = []
    for split in ("train", "dev", "test"):
        path = directory / f"layoutxlm_{split}.jsonl"
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                record = json.loads(line)
                record["split"] = split
                records.append(record)
    return records


if __name__ == "__main__":
    raise SystemExit(main())
