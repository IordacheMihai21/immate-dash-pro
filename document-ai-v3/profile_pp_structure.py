"""
Runtime profiling for PP-StructureV3, addressing the user's explicit ask:
where does the ~300s/page CPU time go, are models reloaded per page, and
what does a lighter/mobile model configuration cost in accuracy vs. runtime.

Must be run with PADDLE_PDX_PIPELINE_BENCHMARK=1 in the environment BEFORE
this process starts (the paddlex benchmark singleton is created at import
time from that env var) -- see run script invocation.

Not wired into production. Standalone, document-ai-v3/.venv only.
"""

import json
import os
import sys
import time
from pathlib import Path

from paddleocr import PPStructureV3

SAMPLES_DIR = Path(__file__).parent / "samples"
OUTPUT_DIR = Path(__file__).parent / "output" / "profiling"

# Components an invoice never needs: seals, chemical/math formulas, charts.
# Doc unwarping/orientation and textline orientation are also disabled here
# to isolate pure OCR+layout+table cost -- a real deployment on possibly
# rotated/skewed phone-scanned invoices would need to re-enable these and
# accept the extra cost; that tradeoff is exactly what this script exists to
# quantify, not to hide.
LIGHT_CONFIG = dict(
    device="cpu",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    use_seal_recognition=False,
    use_formula_recognition=False,
    use_chart_recognition=False,
    # layout_detection_model_name deliberately left at its default
    # (PP-DocLayout_plus-L): swapping it to the coarser PP-DocBlockLayout
    # was tried first and turned out to break table detection entirely (no
    # table_res_list in the output at all -- PP-DocBlockLayout doesn't
    # produce a typed "table" region), for no speed benefit, since layout
    # detection was already only ~2.2s of the original 262s (~1%). All of
    # the real cost was in text detection -- see RUN_LOG.md/profiling
    # summary.csv: TextDetRunnerPredictor.apply was 253.3s of 262.4s (96.5%).
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
)


def run_config(label: str, config: dict, max_images: int | None = None) -> None:
    print(f"\n########## config: {label} ##########")
    out_dir = OUTPUT_DIR / label
    out_dir.mkdir(parents=True, exist_ok=True)

    construct_start = time.monotonic()
    engine = PPStructureV3(**config)
    construct_elapsed = time.monotonic() - construct_start
    print(f"construction (cold, includes model load): {construct_elapsed:.1f}s")

    images = sorted(SAMPLES_DIR.glob("*.png"))
    if max_images is not None:
        images = images[:max_images]
    per_image_times = []
    for image_path in images:
        start = time.monotonic()
        results = list(engine.predict(str(image_path)))
        elapsed = time.monotonic() - start
        per_image_times.append(elapsed)
        print(f"  {image_path.name}: {elapsed:.1f}s")

        page_dir = out_dir / image_path.stem
        page_dir.mkdir(parents=True, exist_ok=True)
        for i, res in enumerate(results):
            res.save_to_json(save_path=str(page_dir / f"page_{i}.json"))

    summary = {
        "label": label,
        "construction_seconds": construct_elapsed,
        "per_image_seconds": {
            img.name: t for img, t in zip(images, per_image_times)
        },
    }
    (out_dir / "timing_summary.json").write_text(json.dumps(summary, indent=2))
    print(f"summary written to {out_dir / 'timing_summary.json'}")


def main() -> None:
    if os.environ.get("PADDLE_PDX_PIPELINE_BENCHMARK") not in ("1", "true", "True"):
        print(
            "WARNING: PADDLE_PDX_PIPELINE_BENCHMARK not set -- stage-level "
            "breakdown will not be recorded, only total per-image time.",
            file=sys.stderr,
        )

    which = sys.argv[1] if len(sys.argv) > 1 else "light"
    if which == "light":
        run_config("light", LIGHT_CONFIG)
    elif which == "batch10":
        # Steady-state / warm-inference check: one already-constructed
        # engine (light config, to keep total time reasonable) predicting
        # 10 pages in a row in the same process, reusing the 2 sample
        # images 5x each. This measures per-call latency variance and
        # whether later calls get faster/slower once "warm" -- it does NOT
        # produce 10 independent accuracy data points (same 2 documents
        # repeated), only latency/RAM data, which is the only thing this
        # mode is for.
        out_dir = OUTPUT_DIR / "batch10"
        out_dir.mkdir(parents=True, exist_ok=True)
        construct_start = time.monotonic()
        engine = PPStructureV3(**LIGHT_CONFIG)
        construct_elapsed = time.monotonic() - construct_start
        print(f"construction: {construct_elapsed:.1f}s")
        images = sorted(SAMPLES_DIR.glob("*.png")) * 5
        per_call_times = []
        for idx, image_path in enumerate(images):
            start = time.monotonic()
            list(engine.predict(str(image_path)))
            elapsed = time.monotonic() - start
            per_call_times.append(elapsed)
            print(f"  call {idx + 1}/10 ({image_path.name}): {elapsed:.1f}s")
        (out_dir / "timing_summary.json").write_text(
            json.dumps(
                {"construction_seconds": construct_elapsed, "per_call_seconds": per_call_times},
                indent=2,
            )
        )
    elif which == "default_single":
        # Single-image run under the default config, purely to get the
        # paddlex pipeline-benchmark stage breakdown for the *default*
        # config without re-paying the ~560s cost of both images again
        # (already measured in RUN_LOG.md: 301.5s + 259.2s).
        run_config("default_single", dict(device="cpu"), max_images=1)
    else:
        print(f"Unknown config: {which}")
        sys.exit(1)

    # Print + persist the paddlex-native per-stage timing breakdown
    # (doc_preprocessor / ocr / table / layout_parsing sub-pipelines), if
    # PIPELINE_BENCHMARK was enabled.
    from paddlex.inference.utils.benchmark import benchmark

    if benchmark._enabled:
        benchmark.print_pipeline_data()
        benchmark.save_pipeline_data(str(OUTPUT_DIR / which / "pipeline_benchmark"))
        print(f"pipeline benchmark CSVs saved to {OUTPUT_DIR / which / 'pipeline_benchmark'}")


if __name__ == "__main__":
    main()
