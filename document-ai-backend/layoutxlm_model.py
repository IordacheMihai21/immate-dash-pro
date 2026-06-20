import os
import re
import threading
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple


RuntimeMode = str
FINE_TUNED_MODEL_ID = "local_fine_tuned_layoutxlm"
FINE_TUNED_RUNTIME_MODE = "fine_tuned_layoutxlm"


class LayoutXlmModelManager:
    """Lazy LayoutXLM loader with a truthful fallback-safe runtime contract."""

    def __init__(self) -> None:
        self.base_model_id = os.getenv("LAYOUTXLM_MODEL_ID", "microsoft/layoutxlm-base")
        default_classifier = os.path.join(
            os.path.dirname(__file__), "models", "layoutxlm-invoice-token-classifier"
        )
        self.fine_tuned_model_path = os.path.abspath(
            os.getenv("LAYOUTXLM_FINE_TUNED_MODEL_PATH", default_classifier)
        )
        self.fine_tuned_model_available = all(
            os.path.isfile(os.path.join(self.fine_tuned_model_path, filename))
            for filename in ("config.json", "model.safetensors")
        )
        dataset_root = os.path.join(os.path.dirname(__file__), "datasets", "fatura")
        self.layoutxlm_training_ready = all(
            os.path.isfile(path)
            for path in [
                os.path.join(dataset_root, "inferred_label_map.json"),
                os.path.join(dataset_root, "processed", "layoutxlm_train.jsonl"),
                os.path.join(dataset_root, "processed", "layoutxlm_test.jsonl"),
            ]
        )
        self.fine_tuned_model_used = False
        self.model_source = (
            self.fine_tuned_model_path
            if self.fine_tuned_model_available
            else self.base_model_id
        )
        self.model_id = (
            FINE_TUNED_MODEL_ID
            if self.fine_tuned_model_available
            else self.base_model_id
        )
        self.device_name = os.getenv("LAYOUTXLM_DEVICE", "cpu").strip() or "cpu"
        self.local_files_only = _env_flag("LAYOUTXLM_LOCAL_FILES_ONLY", False)
        self.runtime_mode: RuntimeMode = "fallback_layout_aware"
        self.layout_model_available = False
        self.model_inference_available = False
        self.fallback_reason: Optional[str] = None
        self.notes: List[str] = []
        self._loaded = False
        self._load_lock = threading.Lock()
        self._torch: Any = None
        self._model: Any = None
        self._tokenizer: Any = None
        self._image_processor: Any = None
        self._id2label: Dict[int, str] = {}

    def ensure_loaded(self) -> None:
        if self._loaded:
            return

        with self._load_lock:
            if self._loaded:
                return

            try:
                import torch
                from huggingface_hub import snapshot_download
                from transformers import (
                    AutoConfig,
                    AutoImageProcessor,
                    AutoModel,
                    AutoModelForTokenClassification,
                    AutoTokenizer,
                )

                loaders = {
                    "AutoConfig": AutoConfig,
                    "AutoImageProcessor": AutoImageProcessor,
                    "AutoModel": AutoModel,
                    "AutoModelForTokenClassification": AutoModelForTokenClassification,
                    "AutoTokenizer": AutoTokenizer,
                    "snapshot_download": snapshot_download,
                }
                try:
                    self._load_with_cache_policy(loaders)
                    self.fine_tuned_model_used = self.fine_tuned_model_available
                    if self.fine_tuned_model_used:
                        self.model_id = FINE_TUNED_MODEL_ID
                        self.runtime_mode = FINE_TUNED_RUNTIME_MODE
                except Exception as fine_tuned_error:
                    if not self.fine_tuned_model_available:
                        raise
                    self.model_source = self.base_model_id
                    self.model_id = self.base_model_id
                    self.fine_tuned_model_used = False
                    self._load_with_cache_policy(loaders)
                    self.notes = [
                        "Clasificatorul local nu a putut fi incarcat; modelul de baza este folosit.",
                        _compact_error(fine_tuned_error),
                    ]

                self._torch = torch
                self._model.to(self.device_name)
                self._model.eval()
                probe = self._execute_forward(
                    image=None,
                    words=["INVOICE", "TOTAL", "100.00", "EUR"],
                    boxes=[
                        [20, 20, 180, 70],
                        [20, 120, 180, 170],
                        [200, 120, 360, 170],
                        [380, 120, 470, 170],
                    ],
                )
                if probe["tokens_count"] <= 0:
                    raise RuntimeError(
                        "LayoutXLM forward pass returned no active tokens."
                    )
                self.layout_model_available = True
                self.model_inference_available = True
                self.fallback_reason = None
                self.notes = list(self.notes) + [
                    (
                        "Clasificatorul LayoutXLM specializat a fost incarcat."
                        if self.fine_tuned_model_used
                        else "Modelul LayoutXLM de baza a fost incarcat pentru inferenta reala."
                    ),
                ]
            except Exception as exc:
                self.runtime_mode = "fallback_layout_aware"
                self.layout_model_available = False
                self.model_inference_available = False
                self.fine_tuned_model_used = False
                self.fallback_reason = _compact_error(exc)
                self.notes = [
                    "Modelul LayoutXLM nu a putut fi incarcat; extractorul layout-aware ramane disponibil.",
                ]
            finally:
                self._loaded = True

    def _load_with_cache_policy(self, loaders: Dict[str, Any]) -> None:
        try:
            with _offline_huggingface_hub():
                self._load_components(loaders, local_files_only=True)
        except Exception as local_error:
            if (
                self.local_files_only
                or os.path.isdir(self.model_source)
                or not _is_cache_miss(local_error)
            ):
                raise
            self._load_components(loaders, local_files_only=False)

    def _load_components(self, loaders: Dict[str, Any], local_files_only: bool) -> None:
        source = self.model_source
        if local_files_only and not os.path.isdir(source):
            source = loaders["snapshot_download"](
                self.model_source,
                local_files_only=True,
            )

        config = loaders["AutoConfig"].from_pretrained(
            source,
            local_files_only=local_files_only,
        )
        tokenizer = loaders["AutoTokenizer"].from_pretrained(
            source,
            local_files_only=local_files_only,
            use_fast=True,
        )
        image_processor = loaders["AutoImageProcessor"].from_pretrained(
            source,
            local_files_only=local_files_only,
            apply_ocr=False,
            use_fast=False,
        )

        if _has_token_classification_head(config):
            model = loaders["AutoModelForTokenClassification"].from_pretrained(
                source,
                config=config,
                local_files_only=local_files_only,
            )
            runtime_mode = "full_layoutxlm"
            id2label = {
                int(key): str(value) for key, value in (config.id2label or {}).items()
            }
        else:
            model = loaders["AutoModel"].from_pretrained(
                source,
                config=config,
                local_files_only=local_files_only,
            )
            runtime_mode = "layoutxlm_backbone"
            id2label = {}

        self._tokenizer = tokenizer
        self._image_processor = image_processor
        self._model = model
        self.runtime_mode = runtime_mode
        self._id2label = id2label

    def health(self) -> Dict[str, Any]:
        self.ensure_loaded()
        result: Dict[str, Any] = {
            "model_id": self.model_id,
            "runtime_mode": self.runtime_mode,
            "layout_model_available": self.layout_model_available,
            "model_inference_available": self.model_inference_available,
            "fine_tuned_model_available": self.fine_tuned_model_available,
            "fine_tuned_model_used": self.fine_tuned_model_used,
            "fine_tuned_model_path": self.fine_tuned_model_path,
            "layoutxlm_training_ready": self.layoutxlm_training_ready,
            "fallback_available": True,
            "device": self.device_name,
            "notes": list(self.notes),
        }
        if self.fallback_reason:
            result["fallback_reason"] = self.fallback_reason
        return result

    def analyze(
        self,
        image: Any,
        words: List[str],
        boxes: List[List[int]],
    ) -> Dict[str, Any]:
        self.ensure_loaded()

        base_result: Dict[str, Any] = {
            "runtime_mode": self.runtime_mode,
            "layout_model_available": self.layout_model_available,
            "model_inference_executed": False,
            "field_extraction_method": "Fallback layout-aware extraction",
            "fallback_reason": self.fallback_reason,
            "device": self.device_name,
            "tokens_count": 0,
            "words_count": len(words),
            "boxes_count": len(boxes),
            "model_confidence": None,
            "fine_tuned_model_available": self.fine_tuned_model_available,
            "fine_tuned_model_used": self.fine_tuned_model_used,
            "fine_tuned_model_path": self.fine_tuned_model_path,
            "layoutxlm_training_ready": self.layoutxlm_training_ready,
            "token_predictions": [],
            "notes": list(self.notes),
        }

        if not self.layout_model_available or self._model is None:
            return base_result

        if not words:
            base_result["runtime_mode"] = "fallback_layout_aware"
            base_result["fallback_reason"] = (
                "Nu exista cuvinte OCR pentru inferenta LayoutXLM."
            )
            return base_result

        try:
            model_output = self._execute_forward(image, words, boxes)
            base_result.update(
                {
                    "runtime_mode": self.runtime_mode,
                    "layout_model_available": True,
                    "model_inference_executed": True,
                    "field_extraction_method": (
                        "LayoutXLM token classification"
                        if _is_token_classification_runtime(self.runtime_mode)
                        else "LayoutXLM-assisted layout-aware extraction"
                    ),
                    "fallback_reason": None,
                    "tokens_count": model_output["tokens_count"],
                    "model_confidence": model_output["model_confidence"],
                    "token_predictions": model_output["token_predictions"],
                }
            )
            return base_result
        except Exception as exc:
            reason = _compact_error(exc)
            base_result.update(
                {
                    "runtime_mode": "fallback_layout_aware",
                    "model_inference_executed": False,
                    "field_extraction_method": "Fallback layout-aware extraction",
                    "fallback_reason": reason,
                    "notes": list(self.notes)
                    + [
                        "Inferenta LayoutXLM a esuat; analiza layout-aware a fost pastrata."
                    ],
                }
            )
            return base_result

    def _execute_forward(
        self,
        image: Any,
        words: List[str],
        boxes: List[List[int]],
    ) -> Dict[str, Any]:
        document_image = _ensure_document_image(image)
        safe_boxes = _ensure_boxes(words, boxes)
        encoding = self._tokenizer(
            words,
            boxes=safe_boxes,
            truncation=True,
            padding="max_length",
            max_length=512,
            return_tensors="pt",
        )
        image_features = self._image_processor(
            images=document_image,
            return_tensors="pt",
        )
        model_inputs = {
            key: value.to(self.device_name)
            for key, value in encoding.items()
            if key in {"input_ids", "bbox", "attention_mask", "token_type_ids"}
        }
        model_inputs["image"] = image_features["pixel_values"].to(self.device_name)

        with self._torch.no_grad():
            outputs = self._model(**model_inputs)

        attention_mask = model_inputs.get("attention_mask")
        tokens_count = (
            int(attention_mask.sum().item()) if attention_mask is not None else 0
        )
        result: Dict[str, Any] = {
            "tokens_count": tokens_count,
            "model_confidence": None,
            "token_predictions": [],
        }

        if _is_token_classification_runtime(self.runtime_mode) and hasattr(
            outputs, "logits"
        ):
            probabilities = self._torch.softmax(outputs.logits, dim=-1)
            confidences, label_ids = probabilities.max(dim=-1)
            result["model_confidence"] = round(float(confidences.mean().item()), 4)
            result["token_predictions"] = _token_predictions(
                encoding,
                label_ids[0].tolist(),
                confidences[0].tolist(),
                self._id2label,
                words,
            )
        else:
            hidden_state = getattr(outputs, "last_hidden_state", None)
            if hidden_state is None:
                raise RuntimeError("LayoutXLM forward pass returned no hidden state.")
            active_state = hidden_state[:, : max(tokens_count, 1), :]
            signal = float(active_state.float().std().item())
            result["model_confidence"] = round(min(max(signal / 2.0, 0.0), 1.0), 4)

        return result


def _has_token_classification_head(config: Any) -> bool:
    architectures = getattr(config, "architectures", None) or []
    if any("TokenClassification" in str(name) for name in architectures):
        return True

    labels = list((getattr(config, "id2label", None) or {}).values())
    meaningful_labels = [
        label for label in labels if not re.fullmatch(r"LABEL_\d+", str(label))
    ]
    return len(meaningful_labels) > 1


def _is_token_classification_runtime(runtime_mode: RuntimeMode) -> bool:
    return runtime_mode in {"full_layoutxlm", FINE_TUNED_RUNTIME_MODE}


def _ensure_document_image(image: Any) -> Any:
    from PIL import Image

    if image is None:
        return Image.new("RGB", (224, 224), color="white")
    return image.convert("RGB")


def _ensure_boxes(words: List[str], boxes: List[List[int]]) -> List[List[int]]:
    if len(boxes) == len(words):
        return [_clamp_box(box) for box in boxes]

    generated: List[List[int]] = []
    columns = 8
    row_height = 36
    for index, _word in enumerate(words):
        column = index % columns
        row = index // columns
        x0 = column * 120
        y0 = min(row * row_height, 970)
        generated.append(_clamp_box([x0, y0, x0 + 110, y0 + 28]))
    return generated


def _clamp_box(box: List[int]) -> List[int]:
    values = (box + [0, 0, 0, 0])[:4]
    x0, y0, x1, y1 = [max(0, min(int(value), 1000)) for value in values]
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def _token_predictions(
    encoding: Any,
    label_ids: List[int],
    confidences: List[float],
    id2label: Dict[int, str],
    words: List[str],
) -> List[Dict[str, Any]]:
    predictions: List[Dict[str, Any]] = []
    word_ids = encoding.word_ids(batch_index=0) if hasattr(encoding, "word_ids") else []
    seen = set()

    for token_index, word_index in enumerate(word_ids):
        if word_index is None or word_index in seen or word_index >= len(words):
            continue
        seen.add(word_index)
        label_id = int(label_ids[token_index])
        predictions.append(
            {
                "word_index": word_index,
                "text": words[word_index],
                "label": id2label.get(label_id, str(label_id)),
                "confidence": round(float(confidences[token_index]), 4),
            }
        )

    return predictions


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _is_cache_miss(error: Exception) -> bool:
    message = str(error).lower()
    cache_markers = [
        "not cached",
        "couldn't connect",
        "could not connect",
        "does not appear to have a file",
        "couldn't find",
        "cannot find the requested files",
    ]
    return any(marker in message for marker in cache_markers)


@contextmanager
def _offline_huggingface_hub() -> Any:
    previous_env = os.environ.get("HF_HUB_OFFLINE")
    previous_constant: Optional[bool] = None
    hub_constants: Any = None
    os.environ["HF_HUB_OFFLINE"] = "1"

    try:
        import huggingface_hub.constants as hub_constants_module

        hub_constants = hub_constants_module
        previous_constant = bool(hub_constants.HF_HUB_OFFLINE)
        hub_constants.HF_HUB_OFFLINE = True
    except Exception:
        hub_constants = None

    try:
        yield
    finally:
        if previous_env is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = previous_env
        if hub_constants is not None and previous_constant is not None:
            hub_constants.HF_HUB_OFFLINE = previous_constant


def _compact_error(error: Exception) -> str:
    message = re.sub(r"\s+", " ", str(error)).strip()
    return message[:1200] or error.__class__.__name__


layoutxlm_model_manager = LayoutXlmModelManager()
