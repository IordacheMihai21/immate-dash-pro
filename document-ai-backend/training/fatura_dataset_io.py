"""Shared read-only access helpers for FATURA folders and ZIP archives."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Optional, Set


HUGG_TRAIN_SUFFIX = "_hugg_train.json"
HUGG_TEST_SUFFIX = "_hugg_test.json"
COCO_TRAIN_SUFFIX = "_coco_train.json"
COCO_TEST_SUFFIX = "_coco_test.json"


def is_ignored_member(name: str) -> bool:
    parts = PurePosixPath(name.replace("\\", "/")).parts
    basename = parts[-1] if parts else ""
    return (
        not basename
        or "__MACOSX" in parts
        or basename.startswith(".")
        or basename.startswith("._")
        or basename == ".DS_Store"
    )


class DatasetSource:
    def __init__(self, path: Path) -> None:
        self.path = path.expanduser().resolve()
        self._zip: Optional[zipfile.ZipFile] = None
        if self.path.is_file() and self.path.suffix.lower() == ".zip":
            self._zip = zipfile.ZipFile(self.path)
            names = [
                item.filename for item in self._zip.infolist() if not item.is_dir()
            ]
        elif self.path.is_dir():
            names = [
                item.relative_to(self.path).as_posix()
                for item in self.path.rglob("*")
                if item.is_file()
            ]
        else:
            raise FileNotFoundError(f"Dataset path does not exist: {self.path}")
        self.names = sorted(name for name in names if not is_ignored_member(name))

    @property
    def is_zip(self) -> bool:
        return self._zip is not None

    def close(self) -> None:
        if self._zip is not None:
            self._zip.close()

    def __enter__(self) -> "DatasetSource":
        return self

    def __exit__(self, *_args: Any) -> None:
        self.close()

    def read_bytes(self, name: str) -> bytes:
        if self._zip is not None:
            return self._zip.read(name)
        return (self.path / Path(name)).read_bytes()

    def read_text(self, name: str) -> str:
        return self.read_bytes(name).decode("utf-8-sig")

    def read_json(self, name: str) -> Dict[str, Any]:
        value = json.loads(self.read_text(name))
        if not isinstance(value, dict):
            raise ValueError(f"Expected a JSON object: {name}")
        return value

    def find_name(self, suffix: str) -> Optional[str]:
        normalized = suffix.replace("\\", "/")
        return next((name for name in self.names if name.endswith(normalized)), None)

    def image_member(self, image_name: str) -> Optional[str]:
        expected = f"/images/{PurePosixPath(image_name).name}".lower()
        return next(
            (name for name in self.names if f"/{name.lower()}".endswith(expected)),
            None,
        )

    def expected_image_member(self, image_name: str) -> str:
        sample = next(
            (
                name
                for name in self.names
                if "/images/" in f"/{name}"
                and name.lower().endswith((".jpg", ".jpeg", ".png"))
            ),
            "images/placeholder.jpg",
        )
        return f"{sample.rsplit('/', 1)[0]}/{PurePosixPath(image_name).name}"

    def image_reference(self, image_member: str) -> str:
        if self._zip is not None:
            return f"zip://{self.path}!/{image_member}"
        return str((self.path / Path(image_member)).resolve())


def document_id_from_annotation(name: str) -> str:
    basename = PurePosixPath(name).name
    for suffix in (
        HUGG_TRAIN_SUFFIX,
        HUGG_TEST_SUFFIX,
        COCO_TRAIN_SUFFIX,
        COCO_TEST_SUFFIX,
    ):
        if basename.endswith(suffix):
            return basename[: -len(suffix)]
    return PurePosixPath(basename).stem


def load_stratified_splits(source: DatasetSource) -> Dict[str, Set[str]]:
    splits: Dict[str, Set[str]] = {"train": set(), "dev": set(), "test": set()}
    for split in splits:
        name = source.find_name(f"strat1_{split}.csv")
        if not name:
            continue
        reader = csv.DictReader(io.StringIO(source.read_text(name)))
        for row in reader:
            image_name = row.get("img_path") or row.get("image") or ""
            if image_name:
                splits[split].add(PurePosixPath(image_name).stem)
    return splits


def classify_annotation_files(names: Iterable[str]) -> Dict[str, List[str]]:
    result = {
        "hugg_train": [],
        "hugg_test": [],
        "coco_train": [],
        "coco_test": [],
    }
    for name in names:
        if name.endswith(HUGG_TRAIN_SUFFIX):
            result["hugg_train"].append(name)
        elif name.endswith(HUGG_TEST_SUFFIX):
            result["hugg_test"].append(name)
        elif name.endswith(COCO_TRAIN_SUFFIX):
            result["coco_train"].append(name)
        elif name.endswith(COCO_TEST_SUFFIX):
            result["coco_test"].append(name)
    return result
