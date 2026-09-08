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
- `verified_fields` - lista JSON cu numele campurilor confirmate manual; acestea nu sunt suprascrise

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

Pentru fallback-ul OCR din backend, instaleaza si Tesseract CLI cu limbile romana si engleza. In Docker acestea sunt incluse in imagine.

```bash
brew install tesseract tesseract-lang
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

## Configurare backend

Pentru dezvoltare locala, backendul porneste tolerant daca lipsesc cheile
Supabase, ca sa poti testa extractorul fallback:

```bash
DOCUMENT_AI_ENV=development
DOCUMENT_AI_REQUIRE_AUTH=false
DOCUMENT_AI_ALLOWED_ORIGINS=http://localhost:8082,http://localhost:8083
```

In production/staging, pornirea trebuie sa fie stricta:

```bash
DOCUMENT_AI_ENV=production
DOCUMENT_AI_REQUIRE_AUTH=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DOCUMENT_AI_ALLOWED_ORIGINS=https://app.example.com
```

Setari utile:

- `DOCUMENT_AI_RATE_LIMIT_ENABLED=true`
- `DOCUMENT_AI_RATE_LIMIT_MAX_REQUESTS=20`
- `DOCUMENT_AI_RATE_LIMIT_WINDOW_SECONDS=60`
- `DOCUMENT_AI_MAX_UPLOAD_BYTES=20971520`
- `DOCUMENT_AI_LOCAL_OCR_TIMEOUT_SECONDS=45`
- `DOCUMENT_AI_SENTRY_DSN=...`

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

Imaginea foloseste Python 3.10, PyTorch CPU, torchvision, Tesseract OCR cu limbile romana/engleza si Detectron2 compilat din sursa oficiala la commitul setat prin `DETECTRON2_GIT_REF` (pinuit implicit in `Dockerfile`). Portul expus ramane `8000`, iar cache-ul Hugging Face este pastrat intr-un volum Docker, fara a intra in Git.

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

## Dataset, auto-labeling si fine-tuning

Structura locala este documentata in `datasets/fatura/README.md`. Un flux complet arata astfel:

```bash
python training/prepare_fatura_dataset.py \
  --images "/path/to/images" \
  --annotations "/path/to/json" \
  --ocr-dir "/path/to/ocr" \
  --output datasets/fatura/processed \
  --splits datasets/fatura/splits.json

python training/train_layoutxlm_token_classifier.py \
  --data datasets/fatura/processed \
  --output models/layoutxlm-invoice-token-classifier \
  --dry-run
```

Elimina `--dry-run` numai dupa verificarea etichetelor si intr-un mediu cu memorie suficienta.
Modelul salvat in `models/layoutxlm-invoice-token-classifier` este detectat automat. Daca lipseste sau
nu poate fi incarcat, backendul revine la LayoutXLM de baza si apoi la extractorul candidat
layout-aware, fara a opri API-ul. Calea poate fi schimbata prin
`LAYOUTXLM_FINE_TUNED_MODEL_PATH`.

Date sintetice pentru extinderea viitoare a setului de antrenare, nu pentru benchmarkul FATURA:

```bash
python training/generate_synthetic_invoices.py --count 100
```

Pentru arhiva completa FATURA cu adnotari hugg si COCO:

```bash
FATURA_DATASET_PATH=/path/invoices_dataset_final.zip npm run document-ai:inspect-fatura
FATURA_DATASET_PATH=/path/invoices_dataset_final.zip npm run document-ai:prepare-layoutxlm
npm run document-ai:train-layoutxlm -- --dry-run
npm run document-ai:train-layoutxlm -- --smoke-test
```

Inspectorul valideaza lungimile `words/bboxes/ner_tags` si `class_labels/boxes`. Pregatirea
normalizeaza bbox-urile hugg in intervalul LayoutXLM 0-1000 si foloseste split-urile oficiale
`strat1_train/dev/test`. Maparea claselor ramane marcata `inferred_not_official` pana la o
confirmare manuala.

`--smoke-test` executa un singur pas pe un subset minuscul si nu scrie in directorul modelului
real fara `--save`. Pentru antrenarea completa pe GPU, dupa revizuirea maparii:

```bash
npm run document-ai:train-layoutxlm -- --fp16 --epochs 3 --batch-size 2
```

Pe un MacBook fara CUDA foloseste pachetul cloud:

- `training/IMMapp_LayoutXLM_FATURA_Training_Colab.ipynb`
- `training/colab_layoutxlm_training.md`
- `training/kaggle_layoutxlm_training.md`

Importul local al arhivei rezultate valideaza intai continutul si inlocuieste atomic modelul:

```bash
npm run document-ai:import-trained-model -- /path/to/layoutxlm-invoice-token-classifier.zip
```
