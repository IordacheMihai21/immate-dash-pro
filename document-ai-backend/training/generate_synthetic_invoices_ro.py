"""Generate deterministic synthetic ROMANIAN invoice HTML + reference JSON.

Same purpose and output contract as generate_synthetic_invoices.py (HTML +
reference JSON pairs, "future training only" until a separate labeling step
renders them to images and assigns word-level bboxes/NER tags -- see
prepare_layoutxlm_dataset.py, which currently only understands the FATURA
zip format, not this generator's output).

The difference is content, not format: real Romanian field labels, date
formats, VAT rates (19/9/5/0%, never 21% which isn't a Romanian rate),
diacritics (a-ă, a-â, i-î, s-ș, t-ț), CUI/Nr. Reg. Com. formats, and layout
conventions that mirror SmartBill/Oblio-style invoices instead of a generic
English template. The current LayoutXLM model has only ever been trained on
Spanish (FATURA) and English (this script's original output) invoices, so
it has never seen real Romanian invoice vocabulary or layout.
"""

from __future__ import annotations

import argparse
import html
import json
import random
from datetime import date, timedelta
from pathlib import Path


SUPPLIERS = [
    ("Nord Consulting SRL", "J40/1234/2018"),
    ("Atelier Digital SRL", "J12/5678/2020"),
    ("Comexim Trading SA", "J22/910/2015"),
    ("Servicii Contabile Pro SRL", "J40/4321/2019"),
]
CUSTOMERS = [
    ("Beta Retail SRL", "J35/222/2017"),
    ("Global Impex SRL", "J13/876/2021"),
    ("Mihai Popescu PFA", "F40/999/2022"),
    ("Media Solutions SRL", "J40/1500/2016"),
]
CITIES = [
    ("București", "Sector 1"),
    ("Cluj-Napoca", "Cluj"),
    ("Timișoara", "Timiș"),
    ("Iași", "Iași"),
    ("Brașov", "Brașov"),
]
LINE_ITEMS = [
    "Servicii de consultanță",
    "Abonament lunar mentenanță",
    "Licență software",
    "Servicii de transport marfă",
    "Materiale consumabile birou",
    "Servicii de contabilitate",
    "Chirie spațiu birouri",
]
VAT_RATES = [0.19, 0.09, 0.05, 0.0]
MONTHS_RO = [
    "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
    "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
]
LAYOUTS = [
    "header-left",
    "header-center",
    "totals-right",
    "totals-left",
    "table-compact",
]
STREET_NAMES = ["Victoriei", "Republicii", "Mihai Eminescu", "Unirii", "Ștefan cel Mare"]


def main() -> int:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    for index in range(args.count):
        record = make_invoice(index, rng)
        stem = f"synthetic_invoice_ro_{index + 1:05d}"
        (output / f"{stem}.json").write_text(
            json.dumps(record["reference"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (output / f"{stem}.html").write_text(render_html(record), encoding="utf-8")
    (output / "manifest.json").write_text(
        json.dumps(
            {
                "count": args.count,
                "seed": args.seed,
                "locale": "ro-RO",
                "purpose": (
                    "future training only; needs image rendering + word-level "
                    "bbox/NER labeling before it can feed prepare_layoutxlm_dataset.py "
                    "or an equivalent LayoutXLM record builder"
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Generated {args.count} Romanian HTML/reference pairs in {output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="datasets/fatura/raw/synthetic_ro")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def format_date_ro(value: date) -> str:
    return f"{value.day} {MONTHS_RO[value.month - 1]} {value.year}"


def format_locality(city: str, county: str) -> str:
    prefix = "" if city == "București" else "jud. "
    return f"{city}, {prefix}{county}"


def make_invoice(index: int, rng: random.Random) -> dict:
    supplier_name, supplier_reg = rng.choice(SUPPLIERS)
    customer_name, customer_reg = rng.choice(CUSTOMERS)
    supplier_city, supplier_county = rng.choice(CITIES)
    customer_city, customer_county = rng.choice(CITIES)
    layout = rng.choice(LAYOUTS)
    vat_rate = rng.choice(VAT_RATES)

    invoice_number = rng.choice(
        [
            f"FCT{rng.randint(1000, 9999)}",
            f"{rng.randint(100, 999)}/{rng.randint(2024, 2026)}",
            f"SER-{rng.randint(10000, 99999)}",
        ]
    )
    issued = date(2023, 1, 1) + timedelta(days=rng.randint(0, 900))
    due = issued + timedelta(days=rng.choice([15, 30, 45]))
    date_text = rng.choice(
        [issued.strftime("%d.%m.%Y"), format_date_ro(issued)]
    )

    line_count = rng.randint(1, 3)
    lines = []
    subtotal = 0.0
    for line_index in range(line_count):
        quantity = rng.randint(1, 10)
        unit_price = round(rng.uniform(50, 800), 2)
        line_total = round(quantity * unit_price, 2)
        subtotal += line_total
        lines.append(
            {
                "description": rng.choice(LINE_ITEMS),
                "quantity": quantity,
                "unitPrice": f"{unit_price:.2f}",
                "lineTotal": f"{line_total:.2f}",
            }
        )
    subtotal = round(subtotal, 2)
    tax = round(subtotal * vat_rate, 2)
    total = round(subtotal + tax, 2)

    return {
        "layout": layout,
        "vat_rate": vat_rate,
        "reference": {
            "invoiceNumber": invoice_number,
            "invoiceDate": issued.isoformat(),
            "dueDate": due.isoformat(),
            "supplierName": supplier_name,
            "supplierCui": f"RO{rng.randint(10000000, 39999999)}",
            "supplierRegCom": supplier_reg,
            "supplierAddress": f"Str. {rng.choice(STREET_NAMES)} nr. {rng.randint(1, 200)}, {format_locality(supplier_city, supplier_county)}",
            "customerName": customer_name,
            "customerCui": f"RO{rng.randint(40000000, 69999999)}",
            "customerRegCom": customer_reg,
            "customerAddress": f"Str. {rng.choice(STREET_NAMES)} nr. {rng.randint(1, 200)}, {format_locality(customer_city, customer_county)}",
            "subtotal": f"{subtotal:.2f}",
            "vatAmount": f"{tax:.2f}",
            "vatRatePercent": round(vat_rate * 100),
            "totalAmount": f"{total:.2f}",
            "currency": "RON",
            "lines": lines,
        },
        "display_date": date_text,
        "due_date_text": due.strftime("%d.%m.%Y"),
        "index": index,
    }


def render_html(record: dict) -> str:
    ref = record["reference"]
    alignment = "center" if record["layout"] == "header-center" else "left"
    totals_side = "left" if record["layout"] == "totals-left" else "right"
    escaped = {
        key: html.escape(str(value))
        for key, value in ref.items()
        if key != "lines"
    }
    lines_html = "".join(
        f"""<tr>
          <td>{html.escape(line['description'])}</td>
          <td class="num">{line['quantity']}</td>
          <td class="num">{html.escape(line['unitPrice'])} lei</td>
          <td class="num">{html.escape(line['lineTotal'])} lei</td>
        </tr>"""
        for line in ref["lines"]
    )
    return f"""<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><style>
body {{ font-family: 'DejaVu Sans', Arial, sans-serif; margin: 48px; color: #1a2233; font-size: 13px; }}
.header {{ text-align: {alignment}; margin-bottom: 24px; }}
.parties {{ display:flex; justify-content:space-between; gap: 40px; margin-bottom: 24px; }}
.party h3 {{ margin: 0 0 4px 0; font-size: 13px; text-transform: uppercase; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
th, td {{ border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }}
.num {{ text-align: right; }}
.totals {{ width: 280px; margin-top: 16px; margin-left: {'0' if totals_side == 'left' else 'auto'}; }}
.totals .row {{ display:flex; justify-content:space-between; padding: 6px 0; }}
.totals .grand {{ font-weight: bold; border-top: 2px solid #1a2233; padding-top: 8px; }}
.footer {{ margin-top: 32px; font-size: 11px; color: #64748b; }}
</style></head><body>
<div class="header">
  <h1>FACTURĂ FISCALĂ</h1>
  <p>Nr. <strong>{escaped['invoiceNumber']}</strong> &middot; Data emiterii: {html.escape(record['display_date'])} &middot; Scadență: {html.escape(record['due_date_text'])}</p>
</div>
<div class="parties">
  <div class="party">
    <h3>Furnizor</h3>
    <p><strong>{escaped['supplierName']}</strong></p>
    <p>CUI: {escaped['supplierCui']} &middot; Nr. Reg. Com.: {escaped['supplierRegCom']}</p>
    <p>{escaped['supplierAddress']}</p>
  </div>
  <div class="party">
    <h3>Cumpărător</h3>
    <p><strong>{escaped['customerName']}</strong></p>
    <p>CUI: {escaped['customerCui']} &middot; Nr. Reg. Com.: {escaped['customerRegCom']}</p>
    <p>{escaped['customerAddress']}</p>
  </div>
</div>
<table>
  <thead><tr><th>Denumire produs/serviciu</th><th class="num">Cant.</th><th class="num">Preț unitar</th><th class="num">Valoare</th></tr></thead>
  <tbody>{lines_html}</tbody>
</table>
<div class="totals">
  <div class="row"><span>Subtotal</span><span>{escaped['subtotal']} lei</span></div>
  <div class="row"><span>TVA ({escaped['vatRatePercent']}%)</span><span>{escaped['vatAmount']} lei</span></div>
  <div class="row grand"><span>Total de plată</span><span>{escaped['totalAmount']} lei</span></div>
</div>
<div class="footer">
  <p>Vă rugăm să efectuați plata în contul IBAN menționat pe factură până la data scadenței.</p>
</div>
</body></html>"""


if __name__ == "__main__":
    raise SystemExit(main())
