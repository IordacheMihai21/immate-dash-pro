import json
import re
import unicodedata
from pathlib import Path
from collections import Counter, defaultdict

SRC = Path("document-ai-backend/datasets/fatura/processed_ro")
GT = Path("document-ai-backend/datasets/fatura/raw/synthetic_ro")
OUT = Path("document-ai-backend/datasets/run2/synthetic_ro")
OUT.mkdir(parents=True, exist_ok=True)

FIELDS = {
    "invoiceNumber": 1,
    "invoiceDate": 2,
    "dueDate": 3,
    "supplierName": 4,
    "supplierCui": 5,
    "customerName": 6,
    "customerCui": 7,
    "subtotal": 8,
    "vatAmount": 9,
    "totalAmount": 10,
    "currency": 11,
}

CONTEXT = {
    "invoiceNumber": ["factura", "factură", "nr", "numar", "număr"],
    "invoiceDate": ["data", "emiterii", "facturii"],
    "dueDate": ["scadenta", "scadență", "scadent"],
    "supplierName": ["furnizor", "seller", "supplier", "emitent"],
    "supplierCui": ["cui", "cif"],
    "customerName": ["cumparator", "cumpărător", "client", "buyer"],
    "customerCui": ["cui", "cif"],
    "subtotal": ["subtotal", "baza", "net"],
    "vatAmount": ["tva", "vat"],
    "totalAmount": ["total", "plata", "plată"],
    "currency": ["ron", "lei", "eur", "usd", "gbp"],
}

def norm(s):
    s = str(s or "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())

def variants(field, gt):
    vals = []

    if field == "invoiceDate":
        vals += [gt.get("invoiceDate"), gt.get("invoiceDateDisplay")]
    elif field == "dueDate":
        vals += [gt.get("dueDate"), gt.get("dueDateDisplay")]
    else:
        vals += [gt.get(field)]

    if field in {"supplierCui", "customerCui"}:
        raw = str(gt.get(field) or "")
        vals += [raw.removeprefix("RO"), raw.removeprefix("ro")]

    if field == "currency" and str(gt.get(field, "")).upper() == "RON":
        vals += ["RON", "LEI", "LEU"]

    return [v for v in vals if v not in (None, "")]

def candidate_spans(tokens, targets, max_len=12):
    target_norms = {norm(x) for x in targets if norm(x)}
    found = []

    for start in range(len(tokens)):
        joined = ""
        for end in range(start, min(len(tokens), start + max_len)):
            joined += norm(tokens[end])

            if joined in target_norms:
                found.append((start, end))

            if all(not t.startswith(joined) for t in target_norms):
                break

    return found

def context_score(field, tokens, span):
    start, end = span
    left = max(0, start - 8)
    right = min(len(tokens), end + 9)
    context = " ".join(tokens[left:right]).lower()

    score = 0
    for kw in CONTEXT.get(field, []):
        if kw in context:
            score += 2

    # Romanian invoices commonly place totals near bottom
    if field in {"subtotal", "vatAmount", "totalAmount", "currency"}:
        score += start / max(len(tokens), 1)

    # seller tends to occur before buyer
    if field in {"supplierName", "supplierCui"}:
        score += (len(tokens) - start) / max(len(tokens), 1) * 0.3

    # buyer tends to occur after seller
    if field in {"customerName", "customerCui"}:
        score += start / max(len(tokens), 1) * 0.3

    return score

def choose_span(field, tokens, targets):
    spans = candidate_spans(tokens, targets)
    if not spans:
        return None

    return max(spans, key=lambda s: context_score(field, tokens, s))

stats = defaultdict(lambda: Counter())
label_counts = Counter()

for split in ["train", "dev", "test"]:
    src = SRC / f"layoutxlm_{split}.jsonl"
    dst = OUT / f"layoutxlm_{split}.jsonl"

    docs = 0

    with src.open(encoding="utf-8") as fin, dst.open("w", encoding="utf-8") as fout:
        for line in fin:
            row = json.loads(line)
            doc_id = row["document_id"]

            gt_path = GT / f"{doc_id}.json"
            if not gt_path.exists():
                raise FileNotFoundError(gt_path)

            gt = json.loads(gt_path.read_text(encoding="utf-8"))
            tokens = row["tokens"]

            labels = [0] * len(tokens)

            for field, label_id in FIELDS.items():
                vals = variants(field, gt)
                span = choose_span(field, tokens, vals)

                stats[split][f"{field}_total"] += 1

                if span is None:
                    stats[split][f"{field}_miss"] += 1
                    continue

                start, end = span
                for i in range(start, end + 1):
                    # don't overwrite another specific field
                    if labels[i] == 0:
                        labels[i] = label_id

                stats[split][f"{field}_hit"] += 1

            row["labels"] = labels
            row["source"] = "IMMapp_synthetic_RO_run2"
            row["language"] = "ro"

            label_counts.update(labels)
            fout.write(json.dumps(row, ensure_ascii=False) + "\n")
            docs += 1

    print(f"\n=== {split.upper()} ===")
    print("docs:", docs)

    for field in FIELDS:
        hit = stats[split][f"{field}_hit"]
        total = stats[split][f"{field}_total"]
        print(f"{field:15} {hit}/{total} = {100*hit/max(total,1):.1f}%")

print("\n=== LABEL COUNTS ===")
for label, count in sorted(label_counts.items()):
    print(label, count)

print("\nSaved to:", OUT)
