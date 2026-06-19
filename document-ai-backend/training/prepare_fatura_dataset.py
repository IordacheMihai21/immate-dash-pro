"""Prepare FATURA image/reference pairs as LayoutXLM-ready BIO token records."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


FIELD_LABELS = {
    "invoiceNumber": "INVOICE_NUMBER",
    "invoiceDate": "INVOICE_DATE",
    "supplierName": "SUPPLIER",
    "customerName": "CUSTOMER",
    "supplierCui": "SUPPLIER_CUI",
    "customerCui": "CUSTOMER_CUI",
    "subtotal": "SUBTOTAL",
    "vatAmount": "TAX",
    "totalAmount": "TOTAL",
    "currency": "CURRENCY",
}
FIELD_ORDER = list(FIELD_LABELS)
TOKEN_PATTERN = re.compile(r"[A-Za-zÀ-ž0-9]+(?:[./_-][A-Za-zÀ-ž0-9]+)*|[$€£]")


@dataclass
class OcrWord:
    text: str
    box: List[int]
    confidence: float = 0.0


@dataclass
class Match:
    field: str
    start: int
    end: int
    score: float
    text: str


def main() -> int:
    args = parse_args()
    images_root = Path(args.images).expanduser().resolve()
    annotations_root = Path(args.annotations).expanduser().resolve()
    output_root = Path(args.output).expanduser().resolve()
    splits_path = Path(args.splits).expanduser().resolve()
    ocr_root = Path(args.ocr_dir).expanduser().resolve() if args.ocr_dir else None
    split_config = load_json(splits_path)
    output_root.mkdir(parents=True, exist_ok=True)
    pairs = discover_pairs(images_root, annotations_root)
    if not pairs:
        print("No image/reference pairs were found.", file=sys.stderr)
        return 2

    prepared: List[Dict[str, Any]] = []
    failures: List[Dict[str, str]] = []
    for image_path, annotation_path, relative_path in pairs:
        document_id = image_path.stem
        try:
            annotation = load_json(annotation_path)
            expected = parse_reference_fields(annotation)
            words, ocr_source = load_or_run_ocr(
                image_path,
                document_id,
                relative_path,
                ocr_root,
                args.run_ocr,
            )
            split = choose_split(document_id, relative_path, split_config)
            labels, matches, unmatched = create_bio_labels(words, expected)
            record = {
                "version": 1,
                "document_id": document_id,
                "split": split,
                "image_path": str(image_path),
                "reference_path": str(annotation_path),
                "ocr_source": ocr_source,
                "words": [word.text for word in words],
                "boxes": [word.box for word in words],
                "word_confidences": [round(word.confidence, 4) for word in words],
                "labels": labels,
                "expected_fields": expected,
                "matched_fields": {
                    match.field: {
                        "text": match.text,
                        "score": round(match.score, 4),
                        "token_span": [match.start, match.end],
                    }
                    for match in matches
                },
                "unmatched_fields": unmatched,
            }
            output_path = (
                output_root / split / relative_path.parent / f"{document_id}.json"
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            prepared.append(
                {"document_id": document_id, "split": split, "path": str(output_path)}
            )
            if args.copy_pairs:
                materialize_pair(
                    image_path,
                    annotation_path,
                    output_root.parent / split,
                    relative_path,
                )
            print(
                f"prepared {document_id}: {len(matches)} matched, {len(unmatched)} unmatched [{split}]"
            )
        except Exception as exc:  # keep batch preparation auditable
            failures.append({"document_id": document_id, "error": compact_error(exc)})
            print(f"failed {document_id}: {compact_error(exc)}", file=sys.stderr)

    index_path = output_root / "index.jsonl"
    index_path.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in prepared),
        encoding="utf-8",
    )
    summary = {
        "prepared": len(prepared),
        "failed": len(failures),
        "train": sum(item["split"] == "train" for item in prepared),
        "test": sum(item["split"] == "test" for item in prepared),
        "failures": failures,
    }
    (output_root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if prepared else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--images", required=True, help="Root containing JPG/PNG/PDF documents"
    )
    parser.add_argument(
        "--annotations", required=True, help="Root containing matching JSON files"
    )
    parser.add_argument(
        "--ocr-dir", help="Optional root containing <document>.json OCR records"
    )
    parser.add_argument("--output", default="datasets/fatura/processed")
    parser.add_argument("--splits", default="datasets/fatura/splits.json")
    parser.add_argument(
        "--run-ocr",
        action="store_true",
        help="Use pytesseract when OCR JSON is missing",
    )
    parser.add_argument(
        "--copy-pairs", action="store_true", help="Copy source pairs into train/test"
    )
    return parser.parse_args()


def discover_pairs(
    images_root: Path, annotations_root: Path
) -> List[Tuple[Path, Path, Path]]:
    pairs: List[Tuple[Path, Path, Path]] = []
    for image_path in sorted(images_root.rglob("*")):
        if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".pdf"}:
            continue
        relative_path = image_path.relative_to(images_root)
        annotation_path = (
            annotations_root / relative_path.parent / f"{image_path.stem}.json"
        )
        if annotation_path.exists():
            pairs.append((image_path, annotation_path, relative_path))
    return pairs


def load_or_run_ocr(
    image_path: Path,
    document_id: str,
    relative_path: Path,
    ocr_root: Optional[Path],
    run_ocr: bool,
) -> Tuple[List[OcrWord], str]:
    candidates: List[Path] = []
    if ocr_root:
        candidates.extend(
            [
                ocr_root / relative_path.parent / f"{document_id}.json",
                ocr_root / f"{document_id}.json",
            ]
        )
    for path in candidates:
        if path.exists():
            words, source = parse_ocr_record(load_json(path), image_path)
            return words, f"{source}:{path}"
    if not run_ocr:
        raise RuntimeError("OCR JSON missing; provide --ocr-dir or enable --run-ocr")
    if image_path.suffix.lower() == ".pdf":
        raise RuntimeError(
            "pytesseract fallback accepts images; render the PDF to PNG first"
        )
    try:
        import pytesseract
        from PIL import Image
        from pytesseract import Output
    except ImportError as exc:
        raise RuntimeError("--run-ocr requires Pillow and pytesseract") from exc
    image = Image.open(image_path).convert("RGB")
    data = pytesseract.image_to_data(image, lang="eng", output_type=Output.DICT)
    words: List[OcrWord] = []
    for index, raw_text in enumerate(data.get("text", [])):
        text = str(raw_text).strip()
        if not text:
            continue
        x, y = int(data["left"][index]), int(data["top"][index])
        width, height = int(data["width"][index]), int(data["height"][index])
        words.append(
            OcrWord(
                text=text,
                box=normalize_box(
                    [x, y, x + width, y + height], image.width, image.height
                ),
                confidence=normalize_confidence(data["conf"][index]),
            )
        )
    return words, "pytesseract"


def parse_ocr_record(record: Any, image_path: Path) -> Tuple[List[OcrWord], str]:
    if not isinstance(record, dict):
        raise ValueError("OCR record must be a JSON object")
    raw_words = record.get("words")
    if isinstance(raw_words, list) and raw_words:
        width, height = image_dimensions(image_path)
        words: List[OcrWord] = []
        for item in raw_words:
            if not isinstance(item, dict) or not str(item.get("text", "")).strip():
                continue
            raw_box = item.get("bbox") or item.get("box") or [0, 0, 0, 0]
            box = box_from_value(raw_box, width, height)
            words.append(
                OcrWord(
                    text=str(item["text"]).strip(),
                    box=box,
                    confidence=normalize_confidence(item.get("confidence", 0)),
                )
            )
        return words, "ocr-json-words"
    text = str(record.get("text", "")).strip()
    if not text:
        raise ValueError("OCR record contains neither words nor text")
    return synthetic_words(text), "ocr-json-text"


def synthetic_words(text: str) -> List[OcrWord]:
    words: List[OcrWord] = []
    lines = [line for line in text.splitlines() if line.strip()]
    for line_index, line in enumerate(lines):
        tokens = TOKEN_PATTERN.findall(line)
        for token_index, token in enumerate(tokens):
            x0 = min(20 + token_index * 90, 960)
            y0 = min(20 + line_index * 28, 970)
            words.append(
                OcrWord(token, [x0, y0, min(x0 + 80, 1000), min(y0 + 22, 1000)])
            )
    return words


def create_bio_labels(
    words: Sequence[OcrWord], expected: Dict[str, str]
) -> Tuple[List[str], List[Match], List[str]]:
    labels = ["O"] * len(words)
    occupied: set[int] = set()
    matches: List[Match] = []
    unmatched: List[str] = []
    for field in FIELD_ORDER:
        target = str(expected.get(field, "")).strip()
        if not target:
            continue
        match = best_span_match(field, target, words, occupied)
        if match is None:
            unmatched.append(field)
            continue
        entity = FIELD_LABELS[field]
        for index in range(match.start, match.end):
            labels[index] = f"{'B' if index == match.start else 'I'}-{entity}"
            occupied.add(index)
        matches.append(match)
    return labels, matches, unmatched


def best_span_match(
    field: str, target: str, words: Sequence[OcrWord], occupied: set[int]
) -> Optional[Match]:
    target_tokens = TOKEN_PATTERN.findall(target) or [target]
    maximum = min(max(len(target_tokens) + 3, 4), 12)
    threshold = (
        0.74
        if field in {"supplierName", "customerName", "supplierCui", "customerCui"}
        else 0.9
    )
    best: Optional[Match] = None
    for start in range(len(words)):
        for length in range(1, maximum + 1):
            end = start + length
            if end > len(words) or any(
                index in occupied for index in range(start, end)
            ):
                continue
            text = " ".join(word.text for word in words[start:end])
            score = field_match_score(field, target, text)
            score += context_bonus(field, words, start, end)
            score -= abs(length - len(target_tokens)) * 0.008
            if best is None or score > best.score:
                best = Match(field, start, end, min(score, 1.0), text)
    return best if best and best.score >= threshold else None


def field_match_score(field: str, target: str, candidate: str) -> float:
    if field == "invoiceDate":
        left, right = normalize_date(target), normalize_date(candidate)
        return 1.0 if left and left == right else 0.0
    if field in {"subtotal", "vatAmount", "totalAmount"}:
        left, right = normalize_amount(target), normalize_amount(candidate)
        if left is None or right is None:
            return 0.0
        tolerance = max(0.01, abs(left) * 0.0001)
        return 1.0 if abs(left - right) <= tolerance else 0.0
    if field == "currency":
        return (
            1.0 if normalize_currency(target) == normalize_currency(candidate) else 0.0
        )
    left = (
        normalize_identifier(target)
        if "Cui" in field or field == "invoiceNumber"
        else normalize_text(target)
    )
    right = (
        normalize_identifier(candidate)
        if "Cui" in field or field == "invoiceNumber"
        else normalize_text(candidate)
    )
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    return SequenceMatcher(None, left, right).ratio()


def context_bonus(field: str, words: Sequence[OcrWord], start: int, end: int) -> float:
    context = normalize_text(
        " ".join(
            word.text for word in words[max(0, start - 4) : min(len(words), end + 3)]
        )
    )
    patterns = {
        "invoiceNumber": r"invoice|factura|number|nr",
        "invoiceDate": r"invoice date|date|data facturii",
        "supplierName": r"seller|supplier|vendor|furnizor",
        "customerName": r"buyer|bill to|customer|client",
        "subtotal": r"subtotal|sub total|sub_total|net amount",
        "vatAmount": r"vat|gst|tax|tva",
        "totalAmount": r"total|amount due|balance due",
        "currency": r"total|subtotal|amount|vat|gst|tax",
    }
    return 0.035 if re.search(patterns.get(field, r"$^"), context) else 0.0


def parse_reference_fields(annotation: Any) -> Dict[str, str]:
    if isinstance(annotation, dict) and any(key in annotation for key in FIELD_LABELS):
        return {field: clean(annotation.get(field, "")) for field in FIELD_ORDER}
    entries = collect_entries(annotation)
    number = find_entry(entries, {"NUMBER", "INVOICENUMBER"})
    date = find_entry(entries, {"DATE", "INVOICEDATE"})
    supplier = find_entry(entries, {"SELLERNAME", "SUPPLIERNAME", "VENDORNAME"})
    customer = find_entry(entries, {"BUYER", "BUYERNAME", "CUSTOMER", "CUSTOMERNAME"})
    supplier_cui = find_entry(
        entries, {"GSTIN", "GSTINSELLER", "SUPPLIERCUI", "VATID", "TAXID"}
    )
    customer_cui = find_entry(entries, {"GSTINBUYER", "CUSTOMERCUI", "CUSTOMERTAXID"})
    subtotal = find_entry(entries, {"SUBTOTAL", "SUBTOTALAMOUNT", "NETAMOUNT"})
    tax = next(
        (
            text
            for key, text in entries
            if re.match(r"^(GST|VAT|TAX|TVA)", key)
            and not re.match(r"^(GSTIN|VATID|TAXID)", key)
            and "TOTAL" not in key
        ),
        "",
    )
    total = find_entry(entries, {"TOTAL", "GRANDTOTAL", "AMOUNTDUE", "PAYABLEAMOUNT"})
    currency = (
        extract_currency(total) or extract_currency(subtotal) or extract_currency(tax)
    )
    return {
        "invoiceNumber": re.sub(
            r"^(?:INVOICE\s*(?:#|NO\.?|NUMBER|ID)?|NUMBER|ID)\s*[:#-]?\s*",
            "",
            clean(number),
            flags=re.I,
        ),
        "invoiceDate": normalize_date_from_text(date),
        "supplierName": clean(supplier),
        "supplierCui": clean_tax_identifier(supplier_cui),
        "customerName": clean_party_reference(customer),
        "customerCui": clean_tax_identifier(customer_cui),
        "subtotal": format_amount_from_text(subtotal),
        "vatAmount": format_amount_from_text(tax),
        "totalAmount": format_amount_from_text(total),
        "currency": currency,
    }


def collect_entries(value: Any, parent: str = "") -> List[Tuple[str, str]]:
    entries: List[Tuple[str, str]] = []
    if isinstance(value, dict):
        if parent and isinstance(value.get("text"), (str, int, float)):
            entries.append((normalize_key(parent), str(value["text"])))
        for key, child in value.items():
            if key == "text":
                continue
            if isinstance(child, (str, int, float)):
                entries.append((normalize_key(key), str(child)))
            elif isinstance(child, list):
                for item in child:
                    entries.extend(collect_entries(item, key))
            else:
                entries.extend(collect_entries(child, key))
    return entries


def find_entry(entries: Sequence[Tuple[str, str]], keys: set[str]) -> str:
    return next((text for key, text in entries if key in keys), "")


def choose_split(document_id: str, relative_path: Path, config: Dict[str, Any]) -> str:
    if document_id in set(config.get("train", [])):
        return "train"
    if document_id in set(config.get("test", [])):
        return "test"
    parts = {part.lower() for part in relative_path.parts}
    for directory, split in config.get("directory_mapping", {}).items():
        if directory.lower() in parts and split in {"train", "test"}:
            return split
    seed = int(config.get("seed", 42))
    ratio = min(max(float(config.get("train_ratio", 0.8)), 0.05), 0.95)
    digest = hashlib.sha1(f"{seed}:{document_id}".encode()).digest()
    return "train" if int.from_bytes(digest[:4], "big") / 2**32 < ratio else "test"


def materialize_pair(
    image: Path, annotation: Path, root: Path, relative_path: Path
) -> None:
    destination = root / relative_path.parent
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(image, destination / image.name)
    shutil.copy2(annotation, destination / annotation.name)


def normalize_date_from_text(value: str) -> str:
    match = re.search(
        r"(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[A-Za-z]*[- ]\d{2,4})",
        value,
        re.I,
    )
    return normalize_date(match.group(1)) if match else ""


def normalize_date(value: str) -> str:
    cleaned = clean(value).replace("Sept", "Sep")
    for pattern in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%d/%m/%Y",
        "%d.%m.%Y",
        "%d-%m-%Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ):
        try:
            return datetime.strptime(cleaned, pattern).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def normalize_amount(value: str) -> Optional[float]:
    cleaned = re.sub(r"\b(RON|LEI|LEU|EUR|USD|GBP)\b", "", value.upper())
    cleaned = re.sub(r"[€$£\s'’]", "", cleaned)
    match = re.search(r"-?\d[\d.,]*", cleaned)
    if not match:
        return None
    text = match.group(0)
    comma, dot = text.rfind(","), text.rfind(".")
    separator = max(comma, dot)
    if separator >= 0:
        decimals = text[separator + 1 :]
        integer = re.sub(r"[.,]", "", text[:separator])
        text = f"{integer}.{decimals}" if len(decimals) <= 2 else integer + decimals
    try:
        return float(text)
    except ValueError:
        return None


def format_amount_from_text(value: str) -> str:
    amounts = [
        normalize_amount(match.group(0))
        for match in re.finditer(r"-?\d[\d .,'’]*", value)
    ]
    valid = [amount for amount in amounts if amount is not None]
    return f"{valid[-1]:.2f}" if valid else ""


def extract_currency(value: str) -> str:
    match = re.search(r"\b(RON|LEI|LEU|EUR|USD|GBP)\b", value, re.I)
    if match:
        return normalize_currency(match.group(1))
    for symbol in ("$", "€", "£"):
        if symbol in value:
            return normalize_currency(symbol)
    return ""


def normalize_currency(value: str) -> str:
    cleaned = value.strip().upper()
    return {"$": "USD", "€": "EUR", "£": "GBP", "LEI": "RON", "LEU": "RON"}.get(
        cleaned, cleaned
    )


def clean_party_reference(value: str) -> str:
    first = next((line for line in value.splitlines() if line.strip()), "")
    first = re.sub(
        r"^(BUYER|CUSTOMER|CLIENT|BILL\s+TO|SOLD\s+TO)\s*[:#-]?\s*",
        "",
        first,
        flags=re.I,
    )
    return re.split(
        r"\b(?:SHIP[\s_-]*TO|INVOICE\s*(?:NUMBER|NO\.?|#|ID))\b",
        first,
        maxsplit=1,
        flags=re.I,
    )[0].strip()


def clean_tax_identifier(value: str) -> str:
    return re.sub(
        r"^(?:\(?GSTIN|VAT\s*(?:ID|CODE)?|TAX\s*ID|CUI|CIF)\s*[:#-]?\s*",
        "",
        clean(value),
        flags=re.I,
    ).replace(" ", "")


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", strip_accents(value).lower())


def normalize_identifier(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", strip_accents(value).upper())


def normalize_key(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", strip_accents(value).upper())


def strip_accents(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFD", value)
        if unicodedata.category(character) != "Mn"
    )


def box_from_value(value: Any, width: int, height: int) -> List[int]:
    if isinstance(value, dict):
        x, y = float(value.get("x", 0)), float(value.get("y", 0))
        raw = [
            x,
            y,
            x + float(value.get("width", 0)),
            y + float(value.get("height", 0)),
        ]
    elif isinstance(value, list) and len(value) >= 4:
        raw = [float(item) for item in value[:4]]
    else:
        raw = [0.0, 0.0, 0.0, 0.0]
    if max(raw, default=0) <= 1000 and width <= 0:
        return [max(0, min(round(item), 1000)) for item in raw]
    return normalize_box(raw, width, height)


def normalize_box(box: Sequence[float], width: int, height: int) -> List[int]:
    width, height = max(width, 1), max(height, 1)
    return [
        max(0, min(round(box[0] / width * 1000), 1000)),
        max(0, min(round(box[1] / height * 1000), 1000)),
        max(0, min(round(box[2] / width * 1000), 1000)),
        max(0, min(round(box[3] / height * 1000), 1000)),
    ]


def image_dimensions(path: Path) -> Tuple[int, int]:
    if path.suffix.lower() == ".pdf":
        return 0, 0
    try:
        from PIL import Image

        with Image.open(path) as image:
            return image.size
    except Exception:
        return 0, 0


def normalize_confidence(value: Any) -> float:
    try:
        number = float(value)
        return max(0.0, min(number / 100 if number > 1 else number, 1.0))
    except (TypeError, ValueError):
        return 0.0


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def compact_error(error: Exception) -> str:
    return re.sub(r"\s+", " ", str(error)).strip()[:500] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
