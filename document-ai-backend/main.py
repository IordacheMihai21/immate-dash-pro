from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional runtime dependency guard
    Image = None  # type: ignore[assignment]


MODEL_NAME = os.getenv("LAYOUT_AI_MODEL_NAME", "microsoft/layoutxlm-base")
FIELD_KEYS = [
    "invoiceNumber",
    "invoiceDate",
    "supplierName",
    "supplierCui",
    "customerName",
    "customerCui",
    "subtotal",
    "vatAmount",
    "totalAmount",
    "currency",
]
EXCLUDED_PARTY_TERMS = [
    "terms and conditions",
    "bank swift code",
    "iban",
    "swift",
    "po number",
    "total",
    "tax",
    "vat",
    "gst",
    "email",
    "website",
    "tel",
    "phone",
]


class LayoutAiToken(BaseModel):
    text: str
    label: Optional[str] = None
    confidence: Optional[float] = None
    bbox: Optional[Dict[str, float]] = None


class LayoutAiBox(BaseModel):
    text: str
    label: Optional[str] = None
    confidence: Optional[float] = None
    box: List[float] = Field(default_factory=list)


class LayoutAiEntity(BaseModel):
    type: str
    value: str
    confidence: float = 0.55


class AnalyzeLayoutResponse(BaseModel):
    model: str = "LayoutXLM"
    status: Literal["success", "fallback", "unavailable"]
    confidence: float
    fields: Dict[str, str]
    tokens: List[LayoutAiToken] = Field(default_factory=list)
    boxes: List[LayoutAiBox] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    modelName: str = "LayoutXLM"
    entities: List[LayoutAiEntity] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


app = FastAPI(title="IMMapp Document AI Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://192.168.0.113:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://192.168.0.113:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://192.168.0.113:8082",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.0.113:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://192.168.0.113:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.113:3000",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):(3000|5173|5174|8080|8081|8082)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "IMMapp Document AI Backend",
        "model": "LayoutXLM",
        "layout_model_available": get_layout_model_status()["available"],
    }


@app.post("/analyze-layout", response_model=AnalyzeLayoutResponse)
async def analyze_layout(
    file: Optional[UploadFile] = File(default=None),
    ocr_text: Optional[str] = Form(default=None),
    document_ai_fields: Optional[str] = Form(default=None),
) -> AnalyzeLayoutResponse:
    notes: List[str] = []
    fields = empty_fields()
    parsed_document_fields = parse_document_ai_fields(document_ai_fields, notes)
    fields.update(clean_document_fields(parsed_document_fields))

    image_note = await inspect_uploaded_file(file)
    if image_note:
        notes.append(image_note)

    text = normalize_text(ocr_text or "")
    if text:
        fields.update({key: value for key, value in extract_fields_from_text(text).items() if value})
    elif file is not None:
        notes.append(
            "Fisierul a fost primit, dar endpointul nu ruleaza OCR local. Trimite ocr_text din fluxul Document AI pentru analiza fallback."
        )

    model_status = get_layout_model_status()
    tokens = build_tokens(text, fields)
    boxes = build_boxes(tokens)
    entities = fields_to_entities(fields)
    confidence = estimate_confidence(fields, model_status["available"], bool(text))
    status: Literal["success", "fallback", "unavailable"] = "fallback"

    if model_status["available"] and text:
        status = "success"
        notes.append(
            "LayoutXLM este disponibil. In aceasta versiune, predictia finala foloseste heuristici compatibile cu structura LayoutXLM."
        )
    elif model_status["available"]:
        status = "fallback"
        notes.append("LayoutXLM este disponibil, dar analiza a folosit fallback deoarece nu a fost trimis text OCR.")
    else:
        status = "fallback"
        notes.append(model_status["note"])

    if not text and not any(fields.values()):
        status = "unavailable"
        notes.append("Nu exista suficiente date pentru extractie. Trimite o imagine analizata OCR sau campuri Document AI.")

    notes = unique_notes(notes)

    return AnalyzeLayoutResponse(
        status=status,
        confidence=confidence,
        fields=fields,
        tokens=tokens,
        boxes=boxes,
        notes=notes,
        modelName="LayoutXLM",
        entities=entities,
        warnings=notes,
    )


@lru_cache(maxsize=1)
def get_layout_model_status() -> Dict[str, Any]:
    try:
        from transformers import AutoModel, AutoProcessor

        processor = AutoProcessor.from_pretrained(MODEL_NAME, apply_ocr=False)
        model = AutoModel.from_pretrained(MODEL_NAME)

        return {
            "available": True,
            "processor": processor,
            "model": model,
            "note": "Modelul LayoutXLM a fost incarcat.",
        }
    except Exception as exc:
        return {
            "available": False,
            "processor": None,
            "model": None,
            "note": f"LayoutXLM nu este disponibil local. Se foloseste fallback layout-aware. Detalii: {exc}",
        }


async def inspect_uploaded_file(file: Optional[UploadFile]) -> str:
    if file is None:
        return ""

    if Image is None:
        return "Fisier primit. Pillow nu este disponibil pentru inspectia imaginii."

    try:
        content = await file.read()
        await file.seek(0)

        if not content:
            return "Fisierul primit este gol."

        from io import BytesIO

        image = Image.open(BytesIO(content))
        return f"Fisier primit: {file.filename or 'document'}, dimensiune imagine {image.width}x{image.height}."
    except Exception:
        return f"Fisier primit: {file.filename or 'document'}. Continutul nu a putut fi inspectat ca imagine."


def empty_fields() -> Dict[str, str]:
    return {key: "" for key in FIELD_KEYS}


def parse_document_ai_fields(payload: Optional[str], notes: List[str]) -> Dict[str, Any]:
    if not payload:
        return {}

    try:
        value = json.loads(payload)
    except json.JSONDecodeError:
        notes.append("document_ai_fields nu este JSON valid.")
        return {}

    if not isinstance(value, dict):
        notes.append("document_ai_fields trebuie sa fie un obiect JSON.")
        return {}

    if isinstance(value.get("fields"), dict):
        return value["fields"]

    if isinstance(value.get("extracted_fields"), dict):
        extracted_fields = value["extracted_fields"]
        return {
            key: item.get("value", "") if isinstance(item, dict) else item
            for key, item in extracted_fields.items()
        }

    return value


def clean_document_fields(raw_fields: Dict[str, Any]) -> Dict[str, str]:
    fields = empty_fields()

    for key in FIELD_KEYS:
        value = raw_fields.get(key, "")
        fields[key] = clean_value(value)

    return fields


def extract_fields_from_text(text: str) -> Dict[str, str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    fields = empty_fields()

    fields["invoiceNumber"] = extract_invoice_number(text)
    fields["invoiceDate"] = extract_invoice_date(text)
    fields["supplierCui"] = extract_tax_identifier(text)
    fields["customerCui"] = extract_customer_tax_identifier(text, fields["supplierCui"])
    fields["supplierName"] = extract_supplier_name(lines)
    fields["customerName"] = extract_customer_name(lines)
    fields["subtotal"] = extract_amount_by_labels(
        lines,
        ["sub_total", "subtotal", "sub total", "net amount", "valoare fara tva", "baza fara tva"],
    )
    fields["vatAmount"] = extract_amount_by_labels(
        lines,
        ["gst", "vat", "tax amount", "tax", "tva"],
        excluded=["gstin", "vat id", "tax id", "cui", "cif", "cod fiscal", "cod tva"],
    )
    fields["totalAmount"] = extract_amount_by_labels(
        lines,
        ["total de plata", "total de plată", "grand total", "amount due", "total"],
        excluded=["subtotal", "sub_total", "tax", "vat", "gst", "tva"],
        prefer_last=True,
    )
    fields["currency"] = extract_currency(text)

    return fields


def extract_invoice_number(text: str) -> str:
    patterns = [
        r"(?:invoice\s*#|invoice\s+no\.?|invoice\s+number|number|numar\s+factura|nr\.?\s*factura|seria\s+si\s+numarul\s+facturii)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/\-_.]{2,})",
        r"\b(INV[/\-][A-Z0-9/\-_.]+)\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_value(match.group(1))

    return ""


def extract_invoice_date(text: str) -> str:
    match = re.search(
        r"(?:invoice\s+date|issue\s+date|date|data\s+facturii|data)\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})",
        text,
        flags=re.IGNORECASE,
    )

    return clean_value(match.group(1)) if match else ""


def extract_tax_identifier(text: str) -> str:
    match = re.search(
        r"(?:gstin|cui|cif|cod\s+fiscal|cod\s+tva|vat\s+(?:code|id)|tax\s+id)\s*[:#-]?\s*([A-Z]{0,3}\d[A-Z0-9]{4,})",
        text,
        flags=re.IGNORECASE,
    )

    return clean_value(match.group(1)) if match else ""


def extract_customer_tax_identifier(text: str, supplier_tax_id: str) -> str:
    matches = re.findall(
        r"(?:gstin|cui|cif|cod\s+fiscal|cod\s+tva|vat\s+(?:code|id)|tax\s+id)\s*[:#-]?\s*([A-Z]{0,3}\d[A-Z0-9]{4,})",
        text,
        flags=re.IGNORECASE,
    )

    for value in matches:
        cleaned = clean_value(value)
        if cleaned and cleaned != supplier_tax_id:
            return cleaned

    return ""


def extract_supplier_name(lines: List[str]) -> str:
    anchor_index = find_line_index(lines, [r"\bgstin\b", r"\baddress\b", r"\bcui\b", r"\bcif\b"])
    search_lines = lines[: anchor_index if anchor_index >= 0 else min(len(lines), 10)]

    for line in reversed(search_lines):
        if is_valid_party_candidate(line):
            return cleanup_party_name(line)

    return ""


def extract_customer_name(lines: List[str]) -> str:
    buyer_line = next((line for line in lines if re.search(r"\b(buyer|customer|client|bill\s+to)\b", line, re.I)), "")

    if buyer_line:
        candidate = re.sub(r"^\s*(buyer|customer|client|bill\s+to)\s*[:#-]?\s*", "", buyer_line, flags=re.I)
        first_line = candidate.split("\\n")[0].strip()
        if is_valid_party_candidate(first_line):
            return cleanup_party_name(first_line)

    anchor_index = find_line_index(lines, [r"\bbuyer\b", r"\bcustomer\b", r"\bclient\b", r"\bbill\s+to\b"])
    if anchor_index >= 0:
        for line in lines[anchor_index + 1 : anchor_index + 8]:
            if is_valid_party_candidate(line):
                return cleanup_party_name(line)

    return ""


def extract_amount_by_labels(
    lines: List[str],
    labels: List[str],
    excluded: Optional[List[str]] = None,
    prefer_last: bool = False,
) -> str:
    excluded = excluded or []
    normalized_labels = [label.lower() for label in labels]

    for line in lines:
        normalized_line = line.lower()
        if not any(label in normalized_line for label in normalized_labels):
            continue

        if any(term in normalized_line for term in excluded):
            continue

        amounts = re.findall(r"(?<!\d)(\d{1,8}(?:[.,]\d{2}))(?!\d)", line)
        if amounts:
            return amounts[-1 if prefer_last else 0]

    return ""


def extract_currency(text: str) -> str:
    match = re.search(r"\b(RON|LEI|EUR|USD|GBP)\b", text, flags=re.IGNORECASE)

    if not match:
        return ""

    value = match.group(1).upper()
    return "RON" if value == "LEI" else value


def build_tokens(text: str, fields: Dict[str, str]) -> List[LayoutAiToken]:
    source_text = text or " ".join(value for value in fields.values() if value)
    words = source_text.split()
    tokens: List[LayoutAiToken] = []

    for index, word in enumerate(words[:256]):
        tokens.append(
            LayoutAiToken(
                text=word,
                label=infer_token_label(word, fields),
                confidence=0.55,
                bbox={"x": float((index % 8) * 110), "y": float((index // 8) * 28), "width": 100, "height": 22},
            )
        )

    return tokens


def build_boxes(tokens: List[LayoutAiToken]) -> List[LayoutAiBox]:
    boxes: List[LayoutAiBox] = []

    for token in tokens:
        bbox = token.bbox or {}
        boxes.append(
            LayoutAiBox(
                text=token.text,
                label=token.label,
                confidence=token.confidence,
                box=[
                    float(bbox.get("x", 0)),
                    float(bbox.get("y", 0)),
                    float(bbox.get("width", 0)),
                    float(bbox.get("height", 0)),
                ],
            )
        )

    return boxes


def fields_to_entities(fields: Dict[str, str]) -> List[LayoutAiEntity]:
    return [
        LayoutAiEntity(type=key, value=value, confidence=0.68)
        for key, value in fields.items()
        if value
    ]


def infer_token_label(token: str, fields: Dict[str, str]) -> Optional[str]:
    for key, value in fields.items():
        if value and token.lower() in value.lower():
            return key

    return None


def estimate_confidence(fields: Dict[str, str], model_available: bool, has_text: bool) -> float:
    filled = sum(1 for value in fields.values() if value)
    base = 0.2 + min(filled / max(len(FIELD_KEYS), 1), 1) * 0.55

    if model_available:
        base += 0.1

    if has_text:
        base += 0.1

    return round(max(0.0, min(base, 0.92)), 3)


def find_line_index(lines: List[str], patterns: List[str]) -> int:
    for index, line in enumerate(lines):
        if any(re.search(pattern, line, flags=re.IGNORECASE) for pattern in patterns):
            return index

    return -1


def is_valid_party_candidate(value: str) -> bool:
    cleaned = cleanup_party_name(value)

    if len(cleaned) < 3 or len(cleaned) > 120:
        return False

    if not re.search(r"[A-Za-z]", cleaned):
        return False

    if re.search(r"\d{5,}", cleaned):
        return False

    lowered = cleaned.lower()
    return not any(term in lowered for term in EXCLUDED_PARTY_TERMS)


def cleanup_party_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" :#-;,")


def clean_value(value: Any) -> str:
    if value is None:
        return ""

    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_text(value: str) -> str:
    return value.replace("\r", "\n").strip()


def unique_notes(notes: List[str]) -> List[str]:
    seen: Set[str] = set()
    unique: List[str] = []

    for note in notes:
        if note and note not in seen:
            unique.append(note)
            seen.add(note)

    return unique
