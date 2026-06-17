# IMMapp Document AI Backend

Backend FastAPI pentru modulul Layout AI din IMMapp. Serviciul expune un endpoint compatibil cu arhitectura LayoutXLM si pastreaza un fallback lightweight pentru extractie layout-aware atunci cand modelul nu poate fi incarcat local.

## Endpoints

- `GET /health`
- `POST /analyze-layout`

`POST /analyze-layout` accepta `multipart/form-data`:

- `file` - fisier imagine, optional
- `ocr_text` - text OCR, optional
- `document_ai_fields` - JSON string cu campuri Document AI, optional

## Creare mediu virtual

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## Instalare dependinte

```bash
pip install -r requirements.txt
```

## Rulare backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Configurare React

Adauga in fisierul `.env` al aplicatiei React:

```bash
VITE_DOCUMENT_AI_BACKEND_URL=http://localhost:8000
```

## Model

Backendul incearca sa incarce modelul HuggingFace:

```text
microsoft/layoutxlm-base
```

Daca modelul nu este disponibil local sau este prea greu pentru mediul curent, endpointul nu se opreste. Raspunde in modul `fallback` si foloseste reguli lightweight pentru campuri precum numar factura, data, furnizor, client, subtotal, TVA, total si moneda.
