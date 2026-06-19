"""Safely validate and import a trained HuggingFace LayoutXLM model ZIP."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Dict, List


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DESTINATION = BACKEND_ROOT / "models/layoutxlm-invoice-token-classifier"
MAX_ARCHIVE_FILES = 10_000
MAX_UNCOMPRESSED_BYTES = 20 * 1024**3


def main() -> int:
    args = parse_args()
    archive_path = Path(args.archive).expanduser().resolve()
    destination = Path(args.destination).expanduser().resolve()
    if not archive_path.is_file() or not zipfile.is_zipfile(archive_path):
        print(f"Eroare: arhiva ZIP nu este validă: {archive_path}")
        return 2

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_root = Path(tempfile.mkdtemp(prefix="immapp-model-import-"))
    staging = destination.parent / f".{destination.name}.incoming-{uuid.uuid4().hex}"
    backup = destination.parent / f".{destination.name}.backup-{uuid.uuid4().hex}"
    try:
        safe_extract_zip(archive_path, temporary_root)
        model_source = find_model_root(temporary_root)
        manifest = validate_model_directory(model_source)
        shutil.copytree(model_source, staging)
        validate_model_directory(staging)

        old_model_exists = destination.exists()
        if old_model_exists:
            os.replace(destination, backup)
        try:
            os.replace(staging, destination)
        except Exception:
            if old_model_exists and backup.exists() and not destination.exists():
                os.replace(backup, destination)
            raise
        if backup.exists():
            shutil.rmtree(backup)

        print("Model LayoutXLM importat și validat cu succes.")
        print(f"Destinație: {destination}")
        print(f"Config: {manifest['config']}")
        print(f"Greutăți: {manifest['weights']}")
        print(f"Tokenizer: {manifest['tokenizer']}")
        print("\nPașii următori:")
        print("1. Repornește backend-ul: npm run dev")
        print("2. Verifică: curl http://localhost:8000/health")
        print("3. Rulează benchmark-ul: npm run document-ai:evaluate")
        return 0
    except Exception as exc:
        print(
            f"Import anulat; modelul existent nu a fost înlocuit. Motiv: {compact_error(exc)}"
        )
        return 3
    finally:
        shutil.rmtree(temporary_root, ignore_errors=True)
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        if backup.exists() and destination.exists():
            shutil.rmtree(backup, ignore_errors=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "archive", help="Path to layoutxlm-invoice-token-classifier.zip"
    )
    parser.add_argument(
        "--destination",
        default=str(DEFAULT_DESTINATION),
        help="Override only for testing; defaults to the IMMapp model directory",
    )
    return parser.parse_args()


def safe_extract_zip(archive_path: Path, output: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        if len(members) > MAX_ARCHIVE_FILES:
            raise ValueError(f"arhiva conține prea multe fișiere: {len(members)}")
        total_size = sum(member.file_size for member in members)
        if total_size > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("arhiva depășește limita sigură de 20 GB necomprimați")
        for member in members:
            relative = PurePosixPath(member.filename)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"cale nesigură în arhivă: {member.filename}")
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError(f"link simbolic nepermis în arhivă: {member.filename}")
            if is_ignored(relative):
                continue
            target = output.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)


def find_model_root(root: Path) -> Path:
    candidates: List[Path] = []
    for config in root.rglob("config.json"):
        try:
            validate_model_directory(config.parent)
            candidates.append(config.parent)
        except ValueError:
            continue
    if not candidates:
        raise ValueError(
            "nu a fost găsit un director HuggingFace cu config, greutăți și tokenizer"
        )
    candidates.sort(key=lambda path: (len(path.relative_to(root).parts), str(path)))
    shallowest_depth = len(candidates[0].relative_to(root).parts)
    shallowest = [
        path
        for path in candidates
        if len(path.relative_to(root).parts) == shallowest_depth
    ]
    named = [path for path in shallowest if path.name == DEFAULT_DESTINATION.name]
    if len(named) == 1:
        return named[0]
    if len(shallowest) != 1:
        raise ValueError("arhiva conține mai multe directoare-model ambigue")
    return shallowest[0]


def validate_model_directory(model_dir: Path) -> Dict[str, str]:
    config = model_dir / "config.json"
    weights = next(
        (
            path
            for path in [
                model_dir / "model.safetensors",
                model_dir / "pytorch_model.bin",
            ]
            if path.is_file()
        ),
        None,
    )
    tokenizer = next(
        (
            path
            for path in [
                model_dir / "tokenizer.json",
                model_dir / "tokenizer_config.json",
            ]
            if path.is_file()
        ),
        None,
    )
    if not config.is_file():
        raise ValueError("lipsește config.json")
    if weights is None or weights.stat().st_size == 0:
        raise ValueError(
            "lipsesc model.safetensors/pytorch_model.bin sau fișierul este gol"
        )
    if tokenizer is None:
        raise ValueError("lipsește tokenizer.json/tokenizer_config.json")
    try:
        config_value = json.loads(config.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("config.json nu este JSON valid") from exc
    if not isinstance(config_value, dict) or not config_value.get("model_type"):
        raise ValueError("config.json nu conține model_type")
    return {
        "config": config.name,
        "weights": weights.name,
        "tokenizer": tokenizer.name,
        "special_tokens": (
            "special_tokens_map.json"
            if (model_dir / "special_tokens_map.json").is_file()
            else "opțional/absent"
        ),
    }


def is_ignored(path: PurePosixPath) -> bool:
    return "__MACOSX" in path.parts or any(
        part == ".DS_Store" or part.startswith("._") for part in path.parts
    )


def compact_error(error: Exception) -> str:
    return " ".join(str(error).split())[:900] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
