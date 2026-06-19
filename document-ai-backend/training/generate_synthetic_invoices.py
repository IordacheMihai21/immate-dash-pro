"""Generate deterministic synthetic invoice HTML + reference JSON for future training."""

from __future__ import annotations

import argparse
import html
import json
import random
from datetime import date, timedelta
from pathlib import Path


SUPPLIERS = ["Northwind Services SRL", "Blue Harbor Consulting", "Atlas Components SA"]
CUSTOMERS = ["Green Field Retail", "Orion Market SRL", "Mara Ionescu"]
CURRENCIES = [("EUR", "€"), ("USD", "$"), ("RON", "lei")]
LAYOUTS = [
    "supplier-top-left",
    "supplier-top-center",
    "customer-right",
    "totals-bottom-left",
    "totals-bottom-right",
]


def main() -> int:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    for index in range(args.count):
        record = make_invoice(index, rng)
        stem = f"synthetic_invoice_{index + 1:05d}"
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
                "purpose": "future training only; excluded from current FATURA benchmark",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Generated {args.count} HTML/reference pairs in {output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="datasets/fatura/raw/synthetic")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def make_invoice(index: int, rng: random.Random) -> dict:
    supplier = rng.choice(SUPPLIERS)
    customer = rng.choice(CUSTOMERS)
    currency, symbol = rng.choice(CURRENCIES)
    layout = rng.choice(LAYOUTS)
    invoice_number = rng.choice(
        [
            f"INV{rng.randint(100000, 999999)}",
            f"INV/{rng.randint(10, 99)}-{rng.randint(100, 999)}",
            f"{rng.randint(1000, 9999)}-{rng.randint(100, 999)}",
        ]
    )
    issued = date(2022, 1, 1) + timedelta(days=rng.randint(0, 1200))
    date_text = rng.choice(
        [issued.strftime("%d-%b-%Y"), issued.strftime("%d/%m/%Y"), issued.isoformat()]
    )
    subtotal = round(rng.uniform(80, 5000), 2)
    tax = round(subtotal * rng.choice([0.09, 0.19, 0.21]), 2)
    total = round(subtotal + tax, 2)
    return {
        "layout": layout,
        "symbol": symbol,
        "reference": {
            "invoiceNumber": invoice_number,
            "invoiceDate": issued.isoformat(),
            "supplierName": supplier,
            "supplierCui": f"RO{rng.randint(10000000, 99999999)}",
            "customerName": customer,
            "customerCui": f"RO{rng.randint(10000000, 99999999)}",
            "subtotal": f"{subtotal:.2f}",
            "vatAmount": f"{tax:.2f}",
            "totalAmount": f"{total:.2f}",
            "currency": currency,
        },
        "display_date": date_text,
        "index": index,
    }


def render_html(record: dict) -> str:
    ref = record["reference"]
    alignment = "center" if record["layout"] == "supplier-top-center" else "left"
    customer_side = "right" if record["layout"] == "customer-right" else "left"
    totals_side = "left" if record["layout"] == "totals-bottom-left" else "right"
    escaped = {key: html.escape(str(value)) for key, value in ref.items()}
    symbol = html.escape(record["symbol"])
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
body {{ font-family: Arial, sans-serif; margin: 48px; color: #172033; }}
.supplier {{ text-align: {alignment}; }} .customer {{ text-align: {customer_side}; margin-top: 60px; }}
.totals {{ width: 320px; margin-top: 180px; margin-left: {'0' if totals_side == 'left' else 'auto'}; }}
.row {{ display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #ddd; }}
</style></head><body>
<section class="supplier"><h2>{escaped['supplierName']}</h2><p>CUI: {escaped['supplierCui']}</p></section>
<h1>INVOICE</h1><p>Invoice #: {escaped['invoiceNumber']}</p><p>Invoice Date: {html.escape(record['display_date'])}</p>
<section class="customer"><strong>Bill to: {escaped['customerName']}</strong><p>CUI: {escaped['customerCui']}</p></section>
<section class="totals"><div class="row"><span>Subtotal</span><span>{escaped['subtotal']} {symbol}</span></div>
<div class="row"><span>VAT</span><span>{escaped['vatAmount']} {symbol}</span></div>
<div class="row"><strong>Total</strong><strong>{escaped['totalAmount']} {symbol}</strong></div></section>
</body></html>"""


if __name__ == "__main__":
    raise SystemExit(main())
