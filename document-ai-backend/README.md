# IMMapp Document AI Backend

Backend FastAPI pentru modulul Layout AI din IMMapp. Serviciul incarca lazy un model LayoutXLM, executa inferenta reala atunci cand dependintele sunt disponibile si pastreaza extractia layout-aware ca fallback sigur.

## Endpoints

- `GET /health`
- `POST /analyze-layout`

`POST /analyze-layout` accepta `multipart/form-data`:

- `file` - fisier imagine, optional
- `ocr_text` - text OCR, optional
- `ocr_words` - JSON string cu textul, increderea si bounding box-ul cuvintelor OCR, optional
- `document_ai_fields` - JSON string cu campuri Document AI, optional

## Creare mediu virtual

```bash
cd document-ai-backend
python3 -m venv .venv
source .venv/bin/activate
```

## Instalare dependinte

```bash
pip install -r requirements.txt
```

Pentru dependintele native LayoutXLM/Detectron2 si verificarea inferentei:

```bash
./scripts/install_layoutxlm_deps.sh
```

Scriptul incearca o singura instalare Detectron2 din sursa oficiala si se opreste cu motivul real daca mediul macOS nu poate compila extensiile native.

Din radacina proiectului, porneste frontendul si backendul impreuna:

```bash
npm run dev
```

## Rulare backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Diagnostic si smoke test

```bash
python scripts/check_layoutxlm_env.py
python scripts/smoke_layoutxlm.py
```

`smoke_layoutxlm.py` intoarce cod de iesire `1` daca modelul nu executa un forward pass real. Un rezultat valid trebuie sa raporteze `layoutxlm_backbone` si `model_inference_executed: true` pentru modelul de baza.

## Alternativa Docker

Pe un sistem cu Docker si Docker Compose, backendul Linux reproductibil poate fi pornit din radacina proiectului:

```bash
npm run dev:backend:docker
```

Imaginea foloseste Python 3.10, PyTorch CPU, torchvision si Detectron2 compilat din sursa oficiala. Portul expus ramane `8000`, iar cache-ul Hugging Face este pastrat intr-un volum Docker, fara a intra in Git.

Verificare:

```bash
curl http://localhost:8000/health
```

Prima pornire poate dura deoarece imaginea compileaza Detectron2 si descarca modelul LayoutXLM. Docker este o alternativa; runnerul local `npm run dev` ramane neschimbat.

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

Modelul poate fi schimbat fara modificari de cod:

```bash
LAYOUTXLM_MODEL_ID=microsoft/layoutxlm-base
```

Pentru un mediu fara acces la internet, dupa descarcarea modelului in cache:

```bash
LAYOUTXLM_LOCAL_FILES_ONLY=true
```

Modurile raportate de API sunt:

- `full_layoutxlm` - model cu head de token classification si predictii de entitati
- `layoutxlm_backbone` - inferenta reala prin backbone, completata de reguli pentru factura
- `fallback_layout_aware` - reguli layout-aware, atunci cand modelul nu poate rula
- `unavailable` - nu exista suficiente date nici pentru analiza locala

Modelul de baza LayoutXLM foloseste arhitectura vizuala LayoutLMv2. In unele medii aceasta necesita o instalare compatibila `detectron2`. Lipsa ei nu opreste backendul: motivul exact apare in `/health`, iar extractia layout-aware ramane functionala.
