#!/usr/bin/env python3
import json
import platform
import sys
from pathlib import Path
from typing import Any, Dict


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def package_status(name: str) -> Dict[str, Any]:
    try:
        module = __import__(name)
        return {
            "available": True,
            "version": getattr(module, "__version__", "unknown"),
        }
    except Exception as exc:
        return {
            "available": False,
            "error": repr(exc),
        }


def main() -> int:
    print("Python:", sys.executable)
    print("Python version:", sys.version.replace("\n", " "))
    print("Platform:", platform.platform())
    print("Machine:", platform.machine())

    for package_name, label in [
        ("torch", "Torch"),
        ("torchvision", "Torchvision"),
        ("transformers", "Transformers"),
        ("detectron2", "Detectron2"),
    ]:
        status = package_status(package_name)
        if status["available"]:
            print(f"{label}: OK {status['version']}")
        else:
            print(f"{label}: FAILED {status['error']}")

    from layoutxlm_model import LayoutXlmModelManager

    manager = LayoutXlmModelManager()
    health = manager.health()
    print("LayoutXLM health:")
    print(json.dumps(health, indent=2))

    result = manager.analyze(
        image=None,
        words=["INVOICE", "INV-001", "TOTAL", "100.00", "EUR"],
        boxes=[
            [20, 20, 180, 70],
            [200, 20, 380, 70],
            [20, 120, 180, 170],
            [200, 120, 360, 170],
            [380, 120, 470, 170],
        ],
    )
    print("Minimal forward pass:")
    print(
        json.dumps(
            {
                "runtime_mode": result["runtime_mode"],
                "layout_model_available": result["layout_model_available"],
                "model_inference_executed": result["model_inference_executed"],
                "fallback_reason": result.get("fallback_reason"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
