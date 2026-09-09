"""
Experimental smoke test: Surya (layout + table recognition) on real
problematic invoices from the document-ai-v3 evaluation set. Not wired into
production -- this script is standalone, uses its own venv
(document-ai-v3/.venv-surya), and only reads from document-ai-v3/samples/.

Licensing note: Surya's model weights are modified RAIL-M, free for
research/personal use and companies under $5M funding/revenue -- this run is
a private research spike only, not a production evaluation. See
AB_COMPARISON.md.
"""

import json
import sys
import time
from pathlib import Path

from PIL import Image

from surya.layout import LayoutPredictor
from surya.recognition import RecognitionPredictor
from surya.table_rec import TableRecPredictor

SAMPLES_DIR = Path(__file__).parent / "samples"
OUTPUT_DIR = Path(__file__).parent / "output" / "surya"


def to_jsonable(obj):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, list):
        return [to_jsonable(o) for o in obj]
    return obj


def main() -> None:
    images = sorted(SAMPLES_DIR.glob("*.png"))
    if not images:
        print(f"No sample images found in {SAMPLES_DIR}")
        sys.exit(1)

    print("Loading Surya predictors (first run downloads models)...")
    init_start = time.monotonic()
    layout_predictor = LayoutPredictor()
    rec_predictor = RecognitionPredictor()
    table_predictor = TableRecPredictor()
    print(f"init: {time.monotonic() - init_start:.1f}s")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for image_path in images:
        print(f"\n=== {image_path.name} ===")
        image = Image.open(image_path).convert("RGB")

        start = time.monotonic()
        layout_predictions = layout_predictor([image])
        layout_elapsed = time.monotonic() - start
        print(f"layout runtime: {layout_elapsed:.1f}s")

        # Table recognition on any table-labeled layout regions.
        table_start = time.monotonic()
        table_regions = [
            b for b in layout_predictions[0].bboxes if b.label.lower() == "table"
        ]
        table_predictions = []
        if table_regions:
            crops = []
            for region in table_regions:
                x0, y0, x1, y1 = region.bbox
                crops.append(image.crop((x0, y0, x1, y1)))
            table_predictions = table_predictor(crops)
        table_elapsed = time.monotonic() - table_start
        print(f"table runtime: {table_elapsed:.1f}s ({len(table_regions)} table region(s))")

        # Block-mode OCR keyed to the layout regions above -- gives
        # per-block bboxes + confidence we can compare against our own
        # Tesseract word-level bboxes, rather than one flattened full-page
        # text blob.
        ocr_start = time.monotonic()
        rec_predictions = rec_predictor(
            [image], layout_results=layout_predictions, full_page=False
        )
        ocr_elapsed = time.monotonic() - ocr_start
        print(f"ocr runtime: {ocr_elapsed:.1f}s")

        total_elapsed = layout_elapsed + table_elapsed + ocr_elapsed
        print(f"total runtime: {total_elapsed:.1f}s")

        out_subdir = OUTPUT_DIR / image_path.stem
        out_subdir.mkdir(parents=True, exist_ok=True)

        result = {
            "runtime_seconds": {
                "layout": layout_elapsed,
                "table": table_elapsed,
                "ocr": ocr_elapsed,
                "total": total_elapsed,
            },
            "layout": to_jsonable(layout_predictions[0]),
            "tables": [to_jsonable(t) for t in table_predictions],
            "ocr": to_jsonable(rec_predictions[0]),
        }
        json_path = out_subdir / "result.json"
        json_path.write_text(json.dumps(result, indent=2, default=str))
        print(f"  output saved to {out_subdir}")


if __name__ == "__main__":
    main()
