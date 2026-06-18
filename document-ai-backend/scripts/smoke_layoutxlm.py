#!/usr/bin/env python3
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image, ImageDraw

from layoutxlm_model import LayoutXlmModelManager


def main() -> int:
    image = Image.new("RGB", (800, 1000), "white")
    draw = ImageDraw.Draw(image)
    draw.text((30, 30), "INVOICE INV-001", fill="black")
    draw.text((30, 140), "TOTAL 100.00 EUR", fill="black")

    manager = LayoutXlmModelManager()
    result = manager.analyze(
        image=image,
        words=["INVOICE", "INV-001", "TOTAL", "100.00", "EUR"],
        boxes=[
            [38, 30, 180, 70],
            [190, 30, 360, 70],
            [38, 140, 180, 180],
            [190, 140, 350, 180],
            [360, 140, 460, 180],
        ],
    )

    summary = {
        "runtime_mode": result["runtime_mode"],
        "layout_model_available": result["layout_model_available"],
        "model_inference_executed": result["model_inference_executed"],
        "field_extraction_method": result["field_extraction_method"],
        "fallback_reason": result.get("fallback_reason"),
    }
    print(json.dumps(summary, indent=2))

    real_inference = (
        summary["runtime_mode"] in {"layoutxlm_backbone", "full_layoutxlm"}
        and summary["layout_model_available"] is True
        and summary["model_inference_executed"] is True
    )
    if not real_inference:
        print("SMOKE TEST FAILED: real LayoutXLM inference is not available.", file=sys.stderr)
        return 1

    print("SMOKE TEST PASSED: real LayoutXLM inference executed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
