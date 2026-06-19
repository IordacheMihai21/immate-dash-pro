# Antrenare LayoutXLM IMMapp în Google Colab

Acest ghid produce un model real. Nu considera modelul antrenat și nu raporta metrici noi până
când celulele de training s-au încheiat, modelul a fost importat local și benchmark-ul a fost
rulat din nou.

## De ce nu antrenăm complet pe MacBook

LayoutXLM procesează simultan tokeni, coordonate și imaginea documentului. Setul FATURA are peste
8.500 de documente utilizabile, iar fine-tuning-ul cere multă memorie și calcule CUDA. MacBook-ul
nu are GPU NVIDIA/CUDA; CPU sau MPS sunt potrivite pentru dezvoltare și smoke-test, dar nu pentru
un experiment complet reproductibil într-un timp rezonabil. Colab oferă temporar un GPU NVIDIA
T4, iar Kaggle oferă T4/P100 în funcție de disponibilitate.

## Fișiere necesare

1. Proiectul complet `immate-dash-pro` — preferabil arhivat ZIP sau salvat în Google Drive.
2. `invoices_dataset_final.zip` — nu trebuie extras manual.
3. Notebook-ul
   `document-ai-backend/training/IMMapp_LayoutXLM_FATURA_Training_Colab.ipynb`.

Fișierele JSONL pot fi regenerate în cloud din arhiva FATURA. Nu este necesar să încarci separat
cei aproximativ 23 MB de JSONL generate local.

## Pașii în Colab

1. Deschide [Google Colab](https://colab.research.google.com/) și încarcă notebook-ul `.ipynb`.
2. Alege **Runtime → Change runtime type → T4 GPU**.
3. Pune proiectul și datasetul în `MyDrive/IMMapp/` sau folosește celula alternativă de upload.
4. Editează `PROJECT_DIR` și `DATASET_ZIP` dacă directoarele tale diferă.
5. Rulează celulele în ordine. Oprește-te dacă verificarea `nvidia-smi` nu arată un GPU.
6. Inspectorul trebuie să raporteze 8.600 hugg și 8.600 COCO valide.
7. Pregătirea trebuie să genereze 6.450 train, 1.075 dev și 1.075 test.
8. Rulează smoke-test-ul. Acesta nu păstrează greutățile.
9. Rulează o singură variantă de training complet.

Comanda recomandată:

```bash
python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
  --device cuda --fp16 --epochs 3 --batch-size 2 --save
```

Varianta pentru memorie GPU redusă:

```bash
python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
  --device cuda --fp16 --epochs 2 --batch-size 1 --save
```

Validare rapidă:

```bash
python document-ai-backend/training/train_layoutxlm_invoice_classifier.py \
  --smoke-test --device cuda
```

Modelul este salvat în:

```text
document-ai-backend/models/layoutxlm-invoice-token-classifier
```

## Descărcarea modelului

Ultimele celule creează `layoutxlm-invoice-token-classifier.zip` și deschid descărcarea. Păstrează
arhiva intactă; scriptul local verifică structura HuggingFace înainte de a înlocui vreun model.

## Import local în IMMapp

Pe MacBook:

```bash
cd /Users/mi/Desktop/immate-dash-pro
npm run document-ai:import-trained-model -- /path/to/layoutxlm-invoice-token-classifier.zip
```

Destinația finală exactă este:

```text
document-ai-backend/models/layoutxlm-invoice-token-classifier
```

Apoi repornește frontendul și backendul:

```bash
npm run dev
```

Verifică health endpoint-ul:

```bash
curl http://localhost:8000/health
```

Trebuie să vezi `fine_tuned_model_available: true`. `fine_tuned_model_used` devine `true` numai
dacă modelul se încarcă și trece inferența de probă; altfel fallback-ul existent rămâne activ.

## Benchmark final

Rulează:

```bash
npm run document-ai:evaluate
```

Dacă rădăcinile imaginilor/referințelor nu sunt configurate, folosește forma explicită:

```bash
npm run document-ai:evaluate -- \
  --images "/path/to/JPG URI" \
  --annotations "/path/to/JSON URI"
```

Compară transparent:

- baseline-ul vechi: aproximativ 77,5% F1;
- candidate engine: aproximativ 90,1% F1;
- ținta de cercetare LayoutXLM + candidate engine: 95%+.

Ținta nu este un rezultat obținut. Raportează numai valoarea măsurată după import și evaluare.
