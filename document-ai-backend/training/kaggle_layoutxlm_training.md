# Antrenare LayoutXLM IMMapp în Kaggle

Kaggle este alternativa la Colab când ai nevoie de o sesiune GPU mai lungă sau de un artifact
salvat direct în output-ul notebook-ului.

## 1. Creează resursele Kaggle

1. Arhivează proiectul local ca `immate-dash-pro.zip`, fără `.venv`, `node_modules` și `dist`.
2. Creează un Kaggle Dataset privat pentru proiect.
3. Creează un al doilea Kaggle Dataset privat cu `invoices_dataset_final.zip`.
4. Creează un Kaggle Notebook și atașează ambele datasets prin **Add Input**.
5. În **Notebook options → Accelerator**, selectează `GPU T4 x2`, `GPU T4` sau `P100`.
6. Activează Internet numai pentru instalarea pachetelor/modelului de bază, dacă politica proiectului
   permite acest lucru.

Datele din `/kaggle/input` sunt read-only. Copiază proiectul în `/kaggle/working`:

```python
!unzip -q /kaggle/input/immapp-project/immate-dash-pro.zip -d /kaggle/working
PROJECT_DIR = "/kaggle/working/immate-dash-pro"
DATASET_ZIP = "/kaggle/input/fatura-full/invoices_dataset_final.zip"
%cd $PROJECT_DIR
```

## 2. Instalează dependențele

```python
!python -m pip install -q --upgrade pip
!python -m pip install -q -r document-ai-backend/requirements-training.txt
!python -m pip install -q ninja cython pycocotools
!python -m pip install -q --no-build-isolation 'git+https://github.com/facebookresearch/detectron2.git'
!nvidia-smi
```

## 3. Inspectează și pregătește datasetul

```python
!python document-ai-backend/training/inspect_fatura_dataset.py "$DATASET_ZIP"
!python document-ai-backend/training/prepare_layoutxlm_dataset.py "$DATASET_ZIP"
```

Rezultatele așteptate sunt 8.600 adnotări hugg valide și split-uri 6.450/1.075/1.075.

## 4. Smoke-test și antrenare

```python
!python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
  --smoke-test --device cuda
```

Training complet:

```python
!python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
  --device cuda --fp16 --epochs 3 --batch-size 2 --save
```

Pentru memorie redusă folosește `--epochs 2 --batch-size 1`.

## 5. Publică artifact-ul modelului

```python
import shutil
model_dir = "/kaggle/working/immate-dash-pro/document-ai-backend/models/layoutxlm-invoice-token-classifier"
shutil.make_archive(
    "/kaggle/working/layoutxlm-invoice-token-classifier",
    "zip",
    root_dir="/kaggle/working/immate-dash-pro/document-ai-backend/models",
    base_dir="layoutxlm-invoice-token-classifier",
)
```

Selectează **Save Version → Save & Run All**. După terminare, descarcă
`layoutxlm-invoice-token-classifier.zip` din secțiunea **Output**.

Importă arhiva pe MacBook:

```bash
cd /Users/mi/Desktop/immate-dash-pro
npm run document-ai:import-trained-model -- /path/to/layoutxlm-invoice-token-classifier.zip
npm run dev
curl http://localhost:8000/health
```

Încheie experimentul rulând `npm run document-ai:evaluate` și raportează numai metricile măsurate.
