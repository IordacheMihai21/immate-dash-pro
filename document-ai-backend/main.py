from __future__ import annotations

import json
import os
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from layoutxlm_model import layoutxlm_model_manager

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional runtime dependency guard
    Image = None  # type: ignore[assignment]


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
    "address",
    "street",
    "strada",
    "str.",
    "due date",
    "delivery date",
    "invoice date",
    "invoice number",
    "invoice no",
    "data facturii",
    "data scadentei",
    "data scadenței",
    "scadent",
    "subtotal",
    "sub total",
    "amount",
    "balance",
    "date:",
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


class LayoutAiFieldDetail(BaseModel):
    value: str = ""
    confidence: float = 0.0
    method: str = "OCR + layout heuristic"
    sourceText: Optional[str] = None
    warning: Optional[str] = None


class AnalyzeLayoutResponse(BaseModel):
    model: str = "LayoutXLM"
    model_id: str
    status: Literal["ok", "unavailable"]
    runtime_mode: Literal[
        "full_layoutxlm",
        "layoutxlm_backbone",
        "fallback_layout_aware",
        "unavailable",
    ]
    layout_model_available: bool
    model_inference_executed: bool
    fine_tuned_model_available: bool = False
    fine_tuned_model_used: bool = False
    fine_tuned_model_path: Optional[str] = None
    layoutxlm_training_ready: bool = False
    field_extraction_method: str
    fallback_reason: Optional[str] = None
    confidence: float
    fields: Dict[str, str]
    field_details: Dict[str, LayoutAiFieldDetail] = Field(default_factory=dict)
    comparison: Dict[str, Any] = Field(default_factory=dict)
    tokens: List[LayoutAiToken] = Field(default_factory=list)
    boxes: List[LayoutAiBox] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    technical: Dict[str, Any] = Field(default_factory=dict)
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
    model_health = layoutxlm_model_manager.health()
    return {
        "status": "ok",
        "service": "IMMapp Document AI Backend",
        "model": "LayoutXLM",
        **model_health,
    }


@app.post("/analyze-layout", response_model=AnalyzeLayoutResponse)
async def analyze_layout(
    file: Optional[UploadFile] = File(default=None),
    ocr_text: Optional[str] = Form(default=None),
    ocr_words: Optional[str] = Form(default=None),
    document_ai_fields: Optional[str] = Form(default=None),
    verified_fields: Optional[str] = Form(default=None),
) -> AnalyzeLayoutResponse:
    notes: List[str] = []
    fields = empty_fields()
    parsed_document_fields = parse_document_ai_fields(document_ai_fields, notes)
    parsed_verified_fields = parse_verified_fields(verified_fields, notes)
    fields.update(clean_document_fields(parsed_document_fields))

    image, image_note = await read_uploaded_image(file)
    if image_note:
        notes.append(image_note)

    text = normalize_text(ocr_text or "")
    parsed_ocr_words = parse_ocr_words(ocr_words, notes)
    extraction_lines = build_extraction_lines(text, parsed_ocr_words)
    extracted_fields = empty_fields()
    if text:
        extracted_fields = extract_fields_from_text(text, extraction_lines)
        fields.update(
            {
                key: value
                for key, value in extracted_fields.items()
                if value and key not in parsed_verified_fields
            }
        )
    elif file is not None:
        notes.append(
            "Fisierul a fost primit, dar endpointul nu ruleaza OCR local. Trimite ocr_text din fluxul Document AI pentru analiza fallback."
        )

    words, normalized_boxes = prepare_layout_inputs(parsed_ocr_words, text, image)
    model_analysis = layoutxlm_model_manager.analyze(image, words, normalized_boxes)
    model_fields, model_scores, model_sources = extract_model_field_proposals(
        model_analysis["token_predictions"], words
    )
    merge_model_proposals(
        fields,
        extracted_fields,
        model_fields,
        model_scores,
        parsed_verified_fields,
        extraction_lines,
        notes,
    )
    tokens = build_tokens(
        words, normalized_boxes, fields, model_analysis["token_predictions"]
    )
    boxes = build_boxes(tokens)
    entities = fields_to_entities(fields)
    confidence = estimate_confidence(
        fields,
        bool(model_analysis["model_inference_executed"]),
        bool(text),
        model_analysis.get("model_confidence"),
    )
    status: Literal["ok", "unavailable"] = "ok"
    runtime_mode = model_analysis["runtime_mode"]

    if model_analysis["model_inference_executed"]:
        notes.append(
            "Inferenta LayoutXLM a fost executata pe cuvintele si pozitiile documentului."
        )
    else:
        notes.append(
            "Analiza layout-aware locala a fost executata fara inferenta LayoutXLM."
        )

    if not text and not any(fields.values()) and not words:
        status = "unavailable"
        runtime_mode = "unavailable"
        notes.append(
            "Nu exista suficiente date pentru extractie. Trimite o imagine analizata OCR sau campuri Document AI."
        )

    notes = unique_notes(notes + model_analysis["notes"])
    technical = {
        "device": model_analysis["device"],
        "tokens_count": model_analysis["tokens_count"],
        "words_count": model_analysis["words_count"],
        "boxes_count": model_analysis["boxes_count"],
        "model_confidence": model_analysis.get("model_confidence"),
    }
    field_details = build_field_details(
        fields,
        extracted_fields,
        clean_document_fields(parsed_document_fields),
        extraction_lines,
        bool(model_analysis["model_inference_executed"]),
        model_fields,
        model_scores,
        model_sources,
        parsed_verified_fields,
        bool(model_analysis.get("fine_tuned_model_used")),
    )

    return AnalyzeLayoutResponse(
        model_id=layoutxlm_model_manager.model_id,
        status=status,
        runtime_mode=runtime_mode,
        layout_model_available=bool(model_analysis["layout_model_available"]),
        model_inference_executed=bool(model_analysis["model_inference_executed"]),
        fine_tuned_model_available=bool(
            model_analysis.get("fine_tuned_model_available")
        ),
        fine_tuned_model_used=bool(model_analysis.get("fine_tuned_model_used")),
        fine_tuned_model_path=model_analysis.get("fine_tuned_model_path"),
        layoutxlm_training_ready=bool(model_analysis.get("layoutxlm_training_ready")),
        field_extraction_method=model_analysis["field_extraction_method"],
        fallback_reason=model_analysis.get("fallback_reason"),
        confidence=confidence,
        fields=fields,
        field_details=field_details,
        comparison=build_comparison(fields, parsed_document_fields),
        tokens=tokens,
        boxes=boxes,
        notes=notes,
        technical=technical,
        modelName="LayoutXLM",
        entities=entities,
        warnings=notes,
    )


async def read_uploaded_image(file: Optional[UploadFile]) -> Tuple[Any, str]:
    if file is None:
        return None, ""

    if Image is None:
        return (
            None,
            "Fisier primit. Pillow nu este disponibil pentru inspectia imaginii.",
        )

    try:
        content = await file.read()
        await file.seek(0)

        if not content:
            return None, "Fisierul primit este gol."

        image = Image.open(BytesIO(content)).convert("RGB")
        return (
            image,
            f"Fisier primit: {file.filename or 'document'}, dimensiune imagine {image.width}x{image.height}.",
        )
    except Exception:
        return (
            None,
            f"Fisier primit: {file.filename or 'document'}. Continutul nu a putut fi inspectat ca imagine.",
        )


def empty_fields() -> Dict[str, str]:
    return {key: "" for key in FIELD_KEYS}


def parse_document_ai_fields(
    payload: Optional[str], notes: List[str]
) -> Dict[str, Any]:
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


def parse_verified_fields(payload: Optional[str], notes: List[str]) -> Set[str]:
    if not payload:
        return set()
    try:
        value = json.loads(payload)
    except json.JSONDecodeError:
        notes.append("Lista campurilor verificate nu este JSON valid.")
        return set()
    if not isinstance(value, list):
        notes.append("Campurile verificate trebuie trimise ca lista.")
        return set()
    return {str(field) for field in value if str(field) in FIELD_KEYS}


def parse_ocr_words(payload: Optional[str], notes: List[str]) -> List[Dict[str, Any]]:
    if not payload:
        return []

    try:
        value = json.loads(payload)
    except json.JSONDecodeError:
        notes.append("Cuvintele OCR nu au putut fi interpretate.")
        return []

    if not isinstance(value, list):
        notes.append("Cuvintele OCR trebuie trimise ca lista.")
        return []

    parsed: List[Dict[str, Any]] = []
    for item in value[:1000]:
        if not isinstance(item, dict):
            continue
        text = clean_value(item.get("text"))
        if not text:
            continue
        parsed.append(
            {
                "text": text,
                "confidence": _safe_float(item.get("confidence")),
                "bbox": (
                    item.get("bbox") if isinstance(item.get("bbox"), dict) else None
                ),
            }
        )
    return parsed


def prepare_layout_inputs(
    ocr_words: List[Dict[str, Any]],
    text: str,
    image: Any,
) -> Tuple[List[str], List[List[int]]]:
    if not ocr_words:
        words = text.split()[:512]
        return words, synthetic_normalized_boxes(len(words))

    words = [item["text"] for item in ocr_words[:512]]
    positioned = [item.get("bbox") for item in ocr_words[:512]]
    valid_boxes = [bbox for bbox in positioned if isinstance(bbox, dict)]

    if len(valid_boxes) != len(words):
        return words, synthetic_normalized_boxes(len(words))

    image_width = float(getattr(image, "width", 0) or 0)
    image_height = float(getattr(image, "height", 0) or 0)
    if image_width <= 0:
        image_width = max(
            (
                _safe_float(box.get("x")) + _safe_float(box.get("width"))
                for box in valid_boxes
            ),
            default=1000.0,
        )
    if image_height <= 0:
        image_height = max(
            (
                _safe_float(box.get("y")) + _safe_float(box.get("height"))
                for box in valid_boxes
            ),
            default=1000.0,
        )

    normalized: List[List[int]] = []
    for box in valid_boxes:
        x0 = _safe_float(box.get("x"))
        y0 = _safe_float(box.get("y"))
        x1 = x0 + _safe_float(box.get("width"))
        y1 = y0 + _safe_float(box.get("height"))
        normalized.append(
            [
                normalize_coordinate(x0, image_width),
                normalize_coordinate(y0, image_height),
                normalize_coordinate(x1, image_width),
                normalize_coordinate(y1, image_height),
            ]
        )

    return words, normalized


def synthetic_normalized_boxes(word_count: int) -> List[List[int]]:
    boxes: List[List[int]] = []
    for index in range(word_count):
        column = index % 8
        row = index // 8
        x0 = column * 120
        y0 = min(row * 36, 970)
        boxes.append([x0, y0, min(x0 + 110, 1000), min(y0 + 28, 1000)])
    return boxes


def normalize_coordinate(value: float, dimension: float) -> int:
    if dimension <= 0:
        return 0
    return max(0, min(int(round((value / dimension) * 1000)), 1000))


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clean_document_fields(raw_fields: Dict[str, Any]) -> Dict[str, str]:
    fields = empty_fields()

    for key in FIELD_KEYS:
        value = raw_fields.get(key, "")
        fields[key] = clean_value(value)

    return fields


def build_extraction_lines(text: str, ocr_words: List[Dict[str, Any]]) -> List[str]:
    text_lines = [line.strip() for line in text.splitlines() if line.strip()]
    positioned_words = [
        item for item in ocr_words if isinstance(item.get("bbox"), dict)
    ]
    if not positioned_words:
        return text_lines

    ordered = sorted(
        positioned_words,
        key=lambda item: (
            _safe_float(item["bbox"].get("y")),
            _safe_float(item["bbox"].get("x")),
        ),
    )
    groups: List[List[Dict[str, Any]]] = []
    for word in ordered:
        word_y = _safe_float(word["bbox"].get("y"))
        if not groups:
            groups.append([word])
            continue
        last_y = sum(_safe_float(item["bbox"].get("y")) for item in groups[-1]) / len(
            groups[-1]
        )
        word_height = max(_safe_float(word["bbox"].get("height")), 10.0)
        if abs(word_y - last_y) <= max(word_height * 0.55, 8.0):
            groups[-1].append(word)
        else:
            groups.append([word])

    layout_lines = [
        " ".join(
            item["text"]
            for item in sorted(
                group, key=lambda item: _safe_float(item["bbox"].get("x"))
            )
        ).strip()
        for group in groups
    ]
    combined: List[str] = []
    seen: Set[str] = set()
    for line in layout_lines + text_lines:
        normalized = re.sub(r"\s+", " ", line).strip().lower()
        if normalized and normalized not in seen:
            combined.append(line)
            seen.add(normalized)
    return combined


def extract_fields_from_text(
    text: str, lines: Optional[List[str]] = None
) -> Dict[str, str]:
    lines = lines or [line.strip() for line in text.splitlines() if line.strip()]
    searchable_text = "\n".join(lines) if lines else text
    fields = empty_fields()

    fields["invoiceNumber"] = extract_invoice_number(searchable_text)
    fields["invoiceDate"] = extract_invoice_date(searchable_text)
    fields["supplierCui"] = extract_tax_identifier(searchable_text)
    fields["customerCui"] = extract_customer_tax_identifier(
        searchable_text, fields["supplierCui"]
    )
    fields["supplierName"] = extract_supplier_name(lines)
    fields["customerName"] = extract_customer_name(lines)
    fields["subtotal"] = extract_amount_by_labels(
        lines,
        [
            "sub_total",
            "subtotal",
            "sub total",
            "valoare fara tva",
            "valoare fără tva",
            "net amount",
            "baza fara tva",
        ],
        prefer_last=True,
    )
    fields["vatAmount"] = extract_amount_by_labels(
        lines,
        ["tax amount", "vat amount", "gst", "vat", "tva", "tax"],
        excluded=["gstin", "vat id", "tax id", "cui", "cif", "cod fiscal", "cod tva"],
        prefer_last=True,
    )
    fields["totalAmount"] = extract_amount_by_labels(
        lines,
        [
            "total de plata",
            "total de plată",
            "grand total",
            "total due",
            "amount due",
            "total",
        ],
        excluded=["subtotal", "sub_total", "tax", "vat", "gst", "tva"],
        prefer_last=True,
    )
    fields["currency"] = extract_currency(searchable_text)
    repair_lost_amount_separators(fields)

    return fields


def repair_lost_amount_separators(fields: Dict[str, str]) -> None:
    subtotal = normalize_amount_for_comparison(fields.get("subtotal", ""))
    if subtotal is None or subtotal <= 0:
        return
    for field in ("totalAmount", "vatAmount"):
        raw = fields.get(field, "")
        if not re.fullmatch(r"\d{6,8}", raw):
            continue
        value = Decimal(raw)
        candidates = [value / Decimal("100"), (value // Decimal("10")) / Decimal("100")]
        plausible = [
            candidate
            for candidate in candidates
            if subtotal * Decimal("0.72") <= candidate <= subtotal * Decimal("1.55")
        ]
        if plausible:
            repaired = min(plausible, key=lambda candidate: abs(candidate - subtotal))
            fields[field] = f"{repaired:.2f}"


def extract_invoice_number(text: str) -> str:
    patterns = [
        r"(?:invoice\s*(?:#|no\.?|number|id)|num[aă]r(?:ul)?\s+facturii|nr\.?\s*factur[aă]|factur[aă]\s*(?:nr\.?)?|seria\s+(?:si|și|şi)\s+num[aă]rul\s+facturii)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/\-_.]{1,40})",
        r"\b(INV(?=[A-Z0-9/\-_.]*\d)[A-Z0-9/\-_.]{3,40})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_value(match.group(1))

    return ""


def extract_invoice_date(text: str) -> str:
    date_pattern = r"(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})"
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    preferred_labels = [
        r"invoice\s+date",
        r"issue\s+date",
        r"data\s+facturii",
        r"^\s*date\b",
        r"^\s*data\b",
    ]
    excluded_labels = [r"due\s+date", r"delivery\s+date", r"scadent", r"data\s+scaden"]

    for label in preferred_labels:
        for line in lines:
            if any(
                re.search(excluded, line, flags=re.IGNORECASE)
                for excluded in excluded_labels
            ):
                continue
            if not re.search(label, line, flags=re.IGNORECASE):
                continue
            match = re.search(date_pattern, line, flags=re.IGNORECASE)
            if match:
                return normalize_date_for_comparison(
                    clean_value(match.group(1))
                ) or clean_value(match.group(1))

    for line in lines:
        if any(
            re.search(excluded, line, flags=re.IGNORECASE)
            for excluded in excluded_labels
        ):
            continue
        match = re.search(date_pattern, line, flags=re.IGNORECASE)
        if match:
            return normalize_date_for_comparison(
                clean_value(match.group(1))
            ) or clean_value(match.group(1))

    return ""


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
    labeled = extract_labeled_party(
        lines,
        [r"seller", r"supplier", r"vendor", r"from", r"furnizor"],
    )
    if labeled:
        return labeled

    candidates: List[Tuple[float, str]] = []
    customer_index = find_line_index(
        lines,
        [
            r"\bbuyer\b",
            r"\bbill[\s_-]*to\b",
            r"\bcustomer\b",
            r"\bclient\b",
            r"\bcump[aă]r[aă]tor\b",
        ],
    )
    search_limit = min(len(lines), customer_index if customer_index > 0 else 14, 14)
    search_lines = lines[:search_limit]
    for index, line in enumerate(search_lines):
        cleaned = cleanup_party_name(line)
        if not is_valid_party_candidate(cleaned):
            continue
        score = max(0.0, 0.62 - index * 0.025)
        following = " ".join(search_lines[index + 1 : index + 6]).lower()
        if re.search(
            r"\b(email|site|website|tel|phone|address|gstin|vat\s*(?:id|code)|tax\s+id|cui|cif)\b",
            following,
        ):
            score += 0.18
        if re.search(
            r"\b(inc\.?|llc|ltd\.?|limited|corp\.?|company|sons|group|s\.?r\.?l\.?|gmbh|plc)\b",
            cleaned,
            flags=re.IGNORECASE,
        ):
            score += 0.14
        candidates.append((score, cleaned))
    return max(candidates, default=(0.0, ""), key=lambda item: item[0])[1]


def extract_customer_name(lines: List[str]) -> str:
    return extract_labeled_party(
        lines,
        [r"buyer", r"customer", r"bill\s+to", r"client", r"cump[aă]r[aă]tor"],
    )


def extract_labeled_party(lines: List[str], labels: List[str]) -> str:
    label_pattern = "|".join(labels)
    for index, line in enumerate(lines):
        match = re.search(
            rf"(?:^|\b)(?:{label_pattern})\b\s*[:#-]?\s*(.*)$",
            line,
            flags=re.IGNORECASE,
        )
        if not match:
            continue

        inline_candidate = cleanup_party_name(match.group(1))
        if is_valid_party_candidate(inline_candidate):
            return inline_candidate

        for candidate_line in lines[index + 1 : index + 5]:
            if is_valid_party_candidate(candidate_line):
                return cleanup_party_name(candidate_line)

    return ""


def extract_amount_by_labels(
    lines: List[str],
    labels: List[str],
    excluded: Optional[List[str]] = None,
    prefer_last: bool = False,
) -> str:
    excluded = excluded or []
    for label in labels:
        for line in lines:
            normalized_line = line.lower()
            if not line_contains_label(normalized_line, label.lower()):
                continue

            if any(term in normalized_line for term in excluded):
                continue

            candidates: List[str] = []
            for match in re.finditer(r"(?<!\d)(\d{1,8}(?:[.,]\d{2}))(?!\d)", line):
                trailing = line[match.end() : match.end() + 2]
                if "%" in trailing:
                    continue
                candidates.append(match.group(1))
            if candidates:
                return candidates[-1 if prefer_last else 0]

    return ""


def line_contains_label(line: str, label: str) -> bool:
    pattern = re.escape(label).replace(r"\ ", r"\s+")
    if "_" in label:
        return label in line
    return bool(re.search(rf"(?<![a-z]){pattern}(?![a-z])", line, flags=re.IGNORECASE))


def extract_currency(text: str) -> str:
    match = re.search(r"\b(RON|LEI|EUR|USD|GBP)\b", text, flags=re.IGNORECASE)

    if match:
        value = match.group(1).upper()
        return "RON" if value == "LEI" else value

    totals_text = "\n".join(
        line
        for line in text.splitlines()
        if re.search(
            r"\b(total|amount\s*due|sub[\s_]*total|vat|gst|tax|tva)\b",
            line,
            flags=re.IGNORECASE,
        )
    )
    currency_text = totals_text or text
    if "$" in currency_text or re.search(r"\d[.,]\d{2}\s*[§]", currency_text):
        return "USD"
    if "€" in currency_text:
        return "EUR"
    if "£" in currency_text:
        return "GBP"
    return ""


MODEL_LABEL_TO_FIELD = {
    "INVOICE_NUMBER": "invoiceNumber",
    "INVOICE_DATE": "invoiceDate",
    "SUPPLIER": "supplierName",
    "CUSTOMER": "customerName",
    "SUPPLIER_CUI": "supplierCui",
    "CUSTOMER_CUI": "customerCui",
    "SUBTOTAL": "subtotal",
    "TAX": "vatAmount",
    "VAT": "vatAmount",
    "TOTAL": "totalAmount",
    "CURRENCY": "currency",
}


def extract_model_field_proposals(
    predictions: List[Dict[str, Any]], words: List[str]
) -> Tuple[Dict[str, str], Dict[str, float], Dict[str, str]]:
    groups: List[Tuple[str, List[str], List[float]]] = []
    current_entity = ""
    current_words: List[str] = []
    current_scores: List[float] = []
    previous_index = -2

    def flush() -> None:
        nonlocal current_entity, current_words, current_scores
        if current_entity and current_words:
            groups.append((current_entity, current_words, current_scores))
        current_entity, current_words, current_scores = "", [], []

    for prediction in sorted(
        predictions, key=lambda item: int(item.get("word_index", -1))
    ):
        index = int(prediction.get("word_index", -1))
        raw_label = str(prediction.get("label", "O")).upper().replace(" ", "_")
        prefix, entity = (
            (raw_label.split("-", 1) + [""])[:2]
            if "-" in raw_label
            else ("B", raw_label)
        )
        if entity not in MODEL_LABEL_TO_FIELD or index < 0 or index >= len(words):
            flush()
            previous_index = index
            continue
        if prefix == "B" or entity != current_entity or index != previous_index + 1:
            flush()
            current_entity = entity
        current_words.append(words[index])
        current_scores.append(
            max(0.0, min(_safe_float(prediction.get("confidence")), 1.0))
        )
        previous_index = index
    flush()

    proposals: Dict[str, str] = {}
    scores: Dict[str, float] = {}
    sources: Dict[str, str] = {}
    for entity, group_words, confidences in groups:
        field = MODEL_LABEL_TO_FIELD[entity]
        source = " ".join(group_words).strip()
        value = normalize_model_proposal(field, source)
        score = sum(confidences) / max(len(confidences), 1)
        if not value or not is_semantically_valid_field(field, value) or score < 0.5:
            continue
        if score > scores.get(field, 0.0):
            proposals[field] = value
            scores[field] = round(score, 4)
            sources[field] = source
    return proposals, scores, sources


def normalize_model_proposal(field: str, value: str) -> str:
    cleaned = clean_value(value)
    if field in {"supplierName", "customerName"}:
        return cleanup_party_name(cleaned)
    if field == "invoiceDate":
        return normalize_date_for_comparison(cleaned) or ""
    if field in {"subtotal", "vatAmount", "totalAmount"}:
        amount = normalize_amount_for_comparison(cleaned)
        return f"{amount:.2f}" if amount is not None else ""
    if field == "currency":
        return extract_currency(cleaned) or normalize_currency_for_comparison(cleaned)
    if field in {"supplierCui", "customerCui"}:
        return re.sub(r"\s+", "", cleaned).upper()
    return re.sub(r"^[#:\s]+|[.,;:\s]+$", "", cleaned)


def merge_model_proposals(
    fields: Dict[str, str],
    extracted_fields: Dict[str, str],
    model_fields: Dict[str, str],
    model_scores: Dict[str, float],
    verified_fields: Set[str],
    lines: List[str],
    notes: List[str],
) -> None:
    applied: List[str] = []
    for field, proposal in model_fields.items():
        if field in verified_fields:
            continue
        current = fields.get(field, "")
        score = model_scores.get(field, 0.0)
        if current and values_equivalent(field, current, proposal):
            continue
        candidate_source = find_source_line(extracted_fields.get(field, ""), lines)
        candidate_confidence = estimate_field_confidence(field, candidate_source)
        should_apply = (
            (not current and score >= 0.58)
            or (
                current
                and not is_semantically_valid_field(field, current)
                and score >= 0.65
            )
            or (score >= 0.86 and score > candidate_confidence + 0.06)
        )
        if should_apply:
            fields[field] = proposal
            applied.append(field)
    if applied:
        notes.append(
            "Propunerile modelului specializat au completat campuri validate de stratul de siguranta: "
            + ", ".join(applied)
            + "."
        )


def build_tokens(
    words: List[str],
    normalized_boxes: List[List[int]],
    fields: Dict[str, str],
    model_predictions: List[Dict[str, Any]],
) -> List[LayoutAiToken]:
    tokens: List[LayoutAiToken] = []
    predictions_by_word = {
        int(item.get("word_index", -1)): item
        for item in model_predictions
        if isinstance(item, dict)
    }

    for index, word in enumerate(words[:256]):
        box = normalized_boxes[index] if index < len(normalized_boxes) else [0, 0, 0, 0]
        prediction = predictions_by_word.get(index, {})
        tokens.append(
            LayoutAiToken(
                text=word,
                label=prediction.get("label") or infer_token_label(word, fields),
                confidence=_safe_float(prediction.get("confidence")) or 0.55,
                bbox={
                    "x": float(box[0]),
                    "y": float(box[1]),
                    "width": float(max(box[2] - box[0], 0)),
                    "height": float(max(box[3] - box[1], 0)),
                },
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


def estimate_confidence(
    fields: Dict[str, str],
    model_inference_executed: bool,
    has_text: bool,
    model_confidence: Optional[float],
) -> float:
    weights = {
        "invoiceNumber": 0.14,
        "invoiceDate": 0.11,
        "supplierName": 0.14,
        "supplierCui": 0.05,
        "customerName": 0.12,
        "customerCui": 0.04,
        "subtotal": 0.10,
        "vatAmount": 0.08,
        "totalAmount": 0.14,
        "currency": 0.08,
    }
    score = 0.0
    missing_penalty = 0.0
    for field, weight in weights.items():
        value = fields.get(field, "")
        if not value:
            missing_penalty += weight * 0.32
            continue
        valid = is_semantically_valid_field(field, value)
        score += weight * (0.82 if valid else 0.35)

    if has_text:
        score += 0.025
    if model_inference_executed:
        score += 0.025
    if model_confidence is not None:
        score += max(0.0, min(float(model_confidence), 1.0)) * 0.02

    return round(max(0.0, min(score - missing_penalty, 0.97)), 3)


def build_field_details(
    fields: Dict[str, str],
    extracted_fields: Dict[str, str],
    document_fields: Dict[str, str],
    lines: List[str],
    model_inference_executed: bool,
    model_fields: Dict[str, str],
    model_scores: Dict[str, float],
    model_sources: Dict[str, str],
    verified_fields: Set[str],
    fine_tuned_model_used: bool,
) -> Dict[str, LayoutAiFieldDetail]:
    details: Dict[str, LayoutAiFieldDetail] = {}
    for field in FIELD_KEYS:
        value = fields.get(field, "")
        extracted_value = extracted_fields.get(field, "")
        document_value = document_fields.get(field, "")
        source_text = find_source_line(value, lines)
        model_value = model_fields.get(field, "")
        model_confidence = model_scores.get(field, 0.0)

        if field in verified_fields and document_value:
            confidence = 1.0
            method = "User verified"
            source_text = find_source_line(document_value, lines)
        elif (
            fine_tuned_model_used
            and model_value
            and value
            and values_equivalent(field, model_value, value)
        ):
            candidate_confidence = (
                estimate_field_confidence(field, source_text)
                if extracted_value
                else 0.0
            )
            confidence = min(max(model_confidence * 0.94, candidate_confidence), 0.97)
            method = "Fine-tuned LayoutXLM + candidate validation"
            source_text = model_sources.get(field, source_text)
        elif extracted_value:
            confidence = estimate_field_confidence(field, source_text)
            if model_inference_executed:
                confidence = min(confidence + 0.04, 0.96)
            equivalent = bool(
                document_value
                and values_equivalent(field, extracted_value, document_value)
            )
            semantic_match = is_semantically_valid_field(field, extracted_value)
            if equivalent and semantic_match:
                method = "Document AI confirmed"
            elif model_inference_executed:
                method = "LayoutXLM-assisted"
            else:
                method = "OCR + layout heuristic"
            if not semantic_match:
                confidence = min(confidence, 0.48)
        elif document_value:
            confidence = (
                0.68 if is_semantically_valid_field(field, document_value) else 0.35
            )
            method = "Document AI candidate"
        else:
            confidence = 0.0
            method = "OCR + layout heuristic"

        warning = None
        if value and not is_semantically_valid_field(field, value):
            warning = "Valoarea este suspectă semantic și necesită verificare."
        elif value and confidence < 0.72:
            warning = "Valoare cu incredere redusa; necesita verificare."
        elif not value:
            warning = "Campul nu a fost identificat."

        details[field] = LayoutAiFieldDetail(
            value=value,
            confidence=round(confidence, 3),
            method=method,
            sourceText=source_text or None,
            warning=warning,
        )
    return details


def estimate_field_confidence(field: str, source_text: str) -> float:
    source = source_text.lower()
    strong_labels = {
        "invoiceNumber": [
            "invoice #",
            "invoice no",
            "invoice number",
            "numar factura",
            "nr factura",
        ],
        "invoiceDate": ["invoice date", "issue date", "data facturii"],
        "supplierName": ["seller", "supplier", "vendor", "furnizor"],
        "customerName": [
            "buyer",
            "customer",
            "bill to",
            "client",
            "cumparator",
            "cumpărător",
        ],
        "supplierCui": ["gstin", "cui", "cif", "vat id", "tax id"],
        "customerCui": ["gstin", "cui", "cif", "vat id", "tax id"],
        "subtotal": [
            "subtotal",
            "sub total",
            "net amount",
            "valoare fara tva",
            "valoare fără tva",
        ],
        "vatAmount": ["tax amount", "vat amount", "vat", "tva", "gst"],
        "totalAmount": [
            "total de plata",
            "total de plată",
            "grand total",
            "total due",
            "amount due",
        ],
        "currency": ["ron", "lei", "eur", "usd", "gbp"],
    }
    if any(label in source for label in strong_labels.get(field, [])):
        return 0.88
    if source_text:
        return 0.74 if field not in {"supplierName", "customerName"} else 0.68
    return 0.62


def find_source_line(value: str, lines: List[str]) -> str:
    normalized_value = normalize_comparison_value(value)
    if not normalized_value:
        return ""
    for line in lines:
        if normalized_value in normalize_comparison_value(line):
            return clean_value(line)
    return ""


def build_comparison(
    proposed_fields: Dict[str, str],
    document_fields: Dict[str, Any],
) -> Dict[str, Any]:
    cleaned_document_fields = clean_document_fields(document_fields)
    return {
        key: {
            "layout_ai": proposed_fields.get(key, ""),
            "document_ai": cleaned_document_fields.get(key, ""),
            "match": values_equivalent(
                key,
                proposed_fields.get(key, ""),
                cleaned_document_fields.get(key, ""),
            ),
        }
        for key in FIELD_KEYS
    }


def normalize_comparison_value(value: Any) -> str:
    return re.sub(r"\s+", " ", clean_value(value)).strip().lower()


def values_equivalent(field: str, left: Any, right: Any) -> bool:
    left_text = clean_value(left)
    right_text = clean_value(right)
    if not left_text or not right_text:
        return left_text == right_text

    if field == "invoiceDate":
        left_date = normalize_date_for_comparison(left_text)
        right_date = normalize_date_for_comparison(right_text)
        return bool(left_date and right_date and left_date == right_date)

    if field in {"subtotal", "vatAmount", "totalAmount"}:
        left_amount = normalize_amount_for_comparison(left_text)
        right_amount = normalize_amount_for_comparison(right_text)
        return (
            left_amount is not None
            and right_amount is not None
            and abs(left_amount - right_amount) <= Decimal("0.01")
        )

    if field == "currency":
        return normalize_currency_for_comparison(
            left_text
        ) == normalize_currency_for_comparison(right_text)

    if field in {"supplierCui", "customerCui"}:
        return normalize_cui_for_comparison(left_text) == normalize_cui_for_comparison(
            right_text
        )

    if field == "invoiceNumber":
        return re.sub(r"[^A-Z0-9]", "", left_text.upper()) == re.sub(
            r"[^A-Z0-9]", "", right_text.upper()
        )

    return normalize_comparison_value(left_text) == normalize_comparison_value(
        right_text
    )


def normalize_date_for_comparison(value: str) -> Optional[str]:
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%d/%m/%Y",
        "%d.%m.%Y",
        "%d-%m-%Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ]
    cleaned = value.strip()
    for date_format in formats:
        try:
            return datetime.strptime(cleaned, date_format).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def normalize_amount_for_comparison(value: str) -> Optional[Decimal]:
    cleaned = re.sub(r"\b(RON|LEI|EUR|USD|GBP)\b", "", value.upper())
    cleaned = re.sub(r"[€$£\s'’]", "", cleaned)
    cleaned = re.sub(r"[^0-9,.-]", "", cleaned)
    if not cleaned:
        return None

    comma_index = cleaned.rfind(",")
    dot_index = cleaned.rfind(".")
    separator_index = max(comma_index, dot_index)
    if separator_index >= 0:
        decimals = cleaned[separator_index + 1 :]
        integer = re.sub(r"[.,]", "", cleaned[:separator_index])
        cleaned = (
            f"{integer}.{decimals}" if len(decimals) <= 2 else f"{integer}{decimals}"
        )
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def normalize_currency_for_comparison(value: str) -> str:
    normalized = value.strip().upper()
    return "RON" if normalized in {"LEI", "LEU"} else normalized


def normalize_cui_for_comparison(value: str) -> str:
    normalized = re.sub(
        r"^\s*(?:CUI|CIF|VAT(?:\s+(?:ID|CODE))?)\s*[:#-]?\s*",
        "",
        value.upper(),
    )
    normalized = re.sub(r"[^A-Z0-9]", "", normalized)
    return re.sub(r"^RO(?=\d)", "", normalized)


def find_line_index(lines: List[str], patterns: List[str]) -> int:
    for index, line in enumerate(lines):
        if any(re.search(pattern, line, flags=re.IGNORECASE) for pattern in patterns):
            return index

    return -1


def is_valid_party_candidate(value: str) -> bool:
    cleaned = cleanup_party_name(value)

    if len(cleaned) < 3 or len(cleaned) > 120:
        return False

    if not re.search(r"[A-Za-zÀ-ž]", cleaned):
        return False

    if re.search(r"\d{5,}", cleaned):
        return False

    if re.search(
        r"^\s*(?:invoice\s+)?date\s*:", cleaned, flags=re.IGNORECASE
    ) or re.search(
        r"\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})\b",
        cleaned,
        flags=re.IGNORECASE,
    ):
        return False

    alphanumeric = sum(character.isalnum() for character in cleaned)
    visible = sum(not character.isspace() for character in cleaned)
    if visible == 0 or alphanumeric / visible < 0.68:
        return False

    alpha_count = sum(character.isalpha() for character in cleaned)
    if alpha_count < 3:
        return False

    lowered = cleaned.lower()
    if lowered in {
        "invoice",
        "factura",
        "factură",
        "seller",
        "supplier",
        "buyer",
        "customer",
    }:
        return False
    return not any(term in lowered for term in EXCLUDED_PARTY_TERMS)


def cleanup_party_name(value: str) -> str:
    cleaned = re.sub(
        r"^\s*(?:seller|supplier|vendor|furnizor|v[aâ]nz[aă]tor|emitent|from|buyer|bill[\s_-]*to|sold[\s_-]*to|customer|client|cump[aă]r[aă]tor|beneficiar)\s*[:#-]?\s*",
        "",
        value,
        flags=re.IGNORECASE,
    )
    cleaned = re.split(
        r"\b(?:ship[\s_-]*to|invoice\s*(?:number|no\.?|#|id)|commercial\s+invoice|tax\s+invoice|description|unit\s+price|quantity|qty|amount|subtotal|total)\b",
        cleaned,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return re.sub(r"\s+", " ", cleaned).strip(" :#-;,")[:100]


def is_semantically_valid_field(field: str, value: str) -> bool:
    cleaned = clean_value(value)
    if not cleaned:
        return False
    if field in {"supplierName", "customerName"}:
        return is_valid_party_candidate(cleaned)
    if field == "invoiceNumber":
        return bool(re.search(r"\d", cleaned)) and cleaned.lower() not in {
            "invoice",
            "commercial invoice",
            "tax invoice",
        }
    if field == "invoiceDate":
        return normalize_date_for_comparison(cleaned) is not None
    if field in {"subtotal", "vatAmount", "totalAmount"}:
        return normalize_amount_for_comparison(cleaned) is not None
    if field == "currency":
        return normalize_currency_for_comparison(cleaned) in {
            "RON",
            "EUR",
            "USD",
            "GBP",
        }
    return True


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
