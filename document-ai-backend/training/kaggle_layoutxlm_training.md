# Antrenare LayoutXLM IMMapp pe Kaggle

Kaggle e recomandat față de training local pe M3: GPU dedicat (T4/P100), fără risc de
supraîncălzire/throttling și fără limita de memorie MPS care oprea deja antrenarea la batch
size 2. Notebook-ul gata pregătit e la
`training/IMMapp_LayoutXLM_FATURA_Training_Kaggle.ipynb` — pașii de mai jos explică ce face și
cum pregătești input-urile înainte de upload.

## 0. De ce modelul curent trebuie reantrenat, nu doar reluat

Modelul curent (`models/layoutxlm-invoice-token-classifier/immapp_training_manifest.json`)
raportează `test_token_accuracy: 1.0`. Cifra e nereală: split-ul oficial FATURA
(`strat1_{train,dev,test}.csv`, folosit de `prepare_layoutxlm_dataset.py`) împarte doar
*instanțele* între train/dev/test, dar toate cele 43 de șabloane vizuale FATURA apar în toate
cele trei seturi (verificat direct: 43/43 șabloane și în train, și în dev, și în test). Deci
"testul" cere modelului sa recunoasca un sablon deja vazut la antrenare, cu alte date de instanta
completate -- nu sa generalizeze la un layout nou, ceea ce conteaza de fapt pentru o factura reala
a unui utilizator.

`training/split_by_template_holdout.py` reconstruiește split-ul ținând **șabloane întregi** în
afara antrenării (implicit ~8 din 43 pentru test, ~6 pentru dev) -- rezultatul e in
`datasets/fatura/processed_holdout/` și e ce folosește acum implicit scriptul de antrenare. Rulează-l
din nou dacă modifici datele sursă:

```bash
cd document-ai-backend/training
python3 split_by_template_holdout.py
```

Include automat și cele 500 de facturi românești sintetice (`processed_ro/`, generate si etichetate
pe 2026-07-28) -- date pe care modelul curent nu le-a vazut niciodata, desi acesta e un produs
pentru piata din Romania. Setul RO isi pastreaza split-ul existent la nivel de instanta (nu de
sablon): generatorul are doar 5 layout-uri si nu retine care a fost folosit per document in JSON-ul
de referinta, deci un holdout pe sablon nu e inca posibil acolo -- e un follow-up separat, nu un
blocaj.

Scriptul scrie si `split_summary.json` langa fisierele de date, cu sabloanele exacte tinute in
afara si un avertisment daca vreo clasa de eticheta ajunge sa aiba zero exemple in dev/test (se
poate intampla cand o eticheta apare doar pe un singur sablon).

Dataset-ul rezultat (`datasets/fatura/processed_holdout/layoutxlm_{train,dev,test}.jsonl`, ~6.200
/ ~1.250 / ~1.650 documente) a fost generat local și conține căi absolute către acest Mac:

- documentele engleze (8.600, din FATURA) citesc imaginea direct din
  `/Users/mi/Downloads/invoices_dataset_final.zip`
- documentele românești sintetice (500) citesc PNG-uri din
  `document-ai-backend/datasets/fatura/processed_ro/images/`

Niciuna dintre aceste căi nu există pe Kaggle. `training/localize_dataset_for_kaggle.py` rescrie
ambele seturi de căi ca să indice direct fișierele montate în `/kaggle/input/...`, fără nevoie de
regenerare a labelurilor (OCR + matching au fost deja validate local, 100% potrivire pe toate cele
7 câmpuri pentru setul RO).

## 1. Pregătește și încarcă cele 3 resurse Kaggle

**a. Arhiva codului** (`immate-dash-pro.zip`), fără `.venv`, `node_modules`, `dist` și fără
directoarele de date (sunt oricum ignorate de Git):

```bash
cd /Users/mi/Desktop/immate-dash-pro
zip -r -q /tmp/immate-dash-pro.zip . \
  -x "node_modules/*" ".venv/*" "dist/*" \
  -x "document-ai-backend/datasets/fatura/raw/*" \
  -x "document-ai-backend/datasets/fatura/train/*" \
  -x "document-ai-backend/datasets/fatura/test/*" \
  -x "document-ai-backend/datasets/fatura/processed/*" \
  -x "document-ai-backend/datasets/fatura/processed_ro/*" \
  -x "document-ai-backend/datasets/fatura/processed_holdout/*"
```

Creează un Kaggle Dataset privat `immapp-project` cu acest zip.

**b. FATURA original**, neschimbat — creează un Kaggle Dataset privat `fatura-full` cu
`/Users/mi/Downloads/invoices_dataset_final.zip` (365MB).

**c. Labelurile combinate + imaginile RO** — arhivă nouă, ~95MB:

```bash
cd /Users/mi/Desktop/immate-dash-pro/document-ai-backend/datasets/fatura
zip -r -q /tmp/immapp-ro-dataset.zip processed_holdout processed_ro/images
```

Creează un Kaggle Dataset privat `immapp-ro-dataset` cu acest zip.

## 2. Creează notebook-ul

1. Creează un Kaggle Notebook și atașează cele 3 datasets prin **Add Input**
   (`immapp-project`, `fatura-full`, `immapp-ro-dataset`).
2. Sau, mai simplu: importă direct
   `training/IMMapp_LayoutXLM_FATURA_Training_Kaggle.ipynb` (**File → Upload Notebook**) — conține
   deja toți pașii de mai jos.
3. În **Notebook options → Accelerator**, selectează `GPU T4 x2` sau `GPU P100`.

## 3. Ce face notebook-ul (rezumat)

1. Verifică GPU-ul (`nvidia-smi`, `torch.cuda.is_available()`).
2. Despachetează proiectul în `/kaggle/working`.
3. Instalează dependențele, inclusiv Detectron2 (necesar pentru backbone-ul vizual LayoutXLM).
4. Rulează `localize_dataset_for_kaggle.py` — rescrie căile din `processed_holdout` către
   `/kaggle/input/fatura-full/invoices_dataset_final/images/` și
   `/kaggle/input/immapp-ro-dataset/processed_ro/images/`, cu un spot-check automat că imaginile
   chiar există înainte de a începe antrenarea.
5. Smoke-test (`--smoke-test --device cuda`) — un pas de optimizare, greutăți aruncate.
6. Antrenare completă:

   ```bash
   python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
     --data /kaggle/working/dataset_localized \
     --label-map document-ai-backend/datasets/fatura/inferred_label_map.json \
     --device cuda --fp16 --epochs 6 --batch-size 4 --save
   ```

   Cu dev set prezent, scriptul activează automat `load_best_model_at_end` (păstrează
   checkpoint-ul cu cea mai bună acuratețe pe dev, nu neapărat ultima epocă) — pentru cea mai bună
   calitate posibilă, nu doar cea mai rapidă rulare. Pentru memorie redusă, folosește
   `--batch-size 2`.
7. Arhivează modelul antrenat în `/kaggle/working` ca să apară în tab-ul **Output**.

Selectează **Save Version → Save & Run All**. După terminare, descarcă
`layoutxlm-invoice-token-classifier.zip` din secțiunea **Output**.

## 4. Importă modelul pe MacBook

```bash
cd /Users/mi/Desktop/immate-dash-pro
npm run document-ai:import-trained-model -- /path/to/layoutxlm-invoice-token-classifier.zip
npm run dev
curl http://localhost:8000/health
npm run document-ai:evaluate
```

Raportează numai metricile măsurate de `document-ai:evaluate`, nu rezultate presupuse.
