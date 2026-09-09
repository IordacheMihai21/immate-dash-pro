"""
Experimental smoke test: PP-StructureV3 on real problematic invoices from
the document-ai-v3 evaluation set. Not wired into production -- this script
is standalone, uses its own venv (document-ai-v3/.venv), and only reads
from document-ai-v3/samples/.
"""

import json
import sys
import time
from pathlib import Path

from paddleocr import PPStructureV3

SAMPLES_DIR = Path(__file__).parent / "samples"
OUTPUT_DIR = Path(__file__).parent / "output" / "pp_structure"


def run_on_image(engine: PPStructureV3, image_path: Path) -> None:
    print(f"\n=== {image_path.name} ===")
    start = time.monotonic()
    results = engine.predict(str(image_path))
    elapsed = time.monotonic() - start
    print(f"runtime: {elapsed:.1f}s")

    out_subdir = OUTPUT_DIR / image_path.stem
    out_subdir.mkdir(parents=True, exist_ok=True)

    for i, res in enumerate(results):
        # Save the full structured result (layout regions, tables, reading
        # order) as JSON for inspection.
        json_path = out_subdir / f"page_{i}.json"
        res.save_to_json(save_path=str(json_path))
        # Also dump a markdown reconstruction if available -- useful for a
        # quick human-readable look at reading order + table structure.
        try:
            res.save_to_markdown(save_path=str(out_subdir))
        except Exception as exc:  # noqa: BLE001
            print(f"  (markdown export skipped: {exc})")

    print(f"  output saved to {out_subdir}")


def main() -> None:
    images = sorted(SAMPLES_DIR.glob("*.png"))
    if not images:
        print(f"No sample images found in {SAMPLES_DIR}")
        sys.exit(1)

    print("Initializing PPStructureV3 (first run downloads models)...")
    init_start = time.monotonic()
    engine = PPStructureV3(device="cpu")
    print(f"init: {time.monotonic() - init_start:.1f}s")

    for image_path in images:
        run_on_image(engine, image_path)


if __name__ == "__main__":
    main()
