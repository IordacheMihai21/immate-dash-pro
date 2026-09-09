"""
Runs PP-StructureV3 (light/mobile-OCR config, per profile_pp_structure.py's
LIGHT_CONFIG) across the full 26-document v3 benchmark corpus
(samples/v3_*.png), saving one JSON per document for the v2-vs-v3 batch
comparison harness (run_benchmark.ts). Not wired into production.
"""

import json
import time
from pathlib import Path

from paddleocr import PPStructureV3

SAMPLES_DIR = Path(__file__).parent / "samples"
OUTPUT_DIR = Path(__file__).parent / "output" / "pp_structure_batch"

LIGHT_CONFIG = dict(
    device="cpu",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    use_seal_recognition=False,
    use_formula_recognition=False,
    use_chart_recognition=False,
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
)


def main() -> None:
    images = sorted(SAMPLES_DIR.glob("v3_*.png"))
    print(f"{len(images)} documents to process")

    engine = PPStructureV3(**LIGHT_CONFIG)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    timings = {}
    for image_path in images:
        start = time.monotonic()
        results = list(engine.predict(str(image_path)))
        elapsed = time.monotonic() - start
        timings[image_path.stem] = elapsed
        print(f"{image_path.stem}: {elapsed:.1f}s")

        out_dir = OUTPUT_DIR / image_path.stem
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, res in enumerate(results):
            res.save_to_json(save_path=str(out_dir / f"page_{i}.json"))

    (OUTPUT_DIR / "timings.json").write_text(json.dumps(timings, indent=2))
    print(f"\ntotal: {sum(timings.values()):.1f}s, mean: {sum(timings.values())/len(timings):.1f}s/page")


if __name__ == "__main__":
    main()
