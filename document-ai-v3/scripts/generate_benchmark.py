"""
Generates the document-ai-v3 structural benchmark corpus: synthetic Romanian
invoices as rendered PNGs + ground-truth JSON (flat fields + region bboxes),
covering the 9 diversity axes requested for the v3 structural evaluation.

Renders via Playwright (real Chromium), reading region bboxes back from the
actual rendered DOM (element.bounding_box()) -- never hand-guessed pixel
coordinates. Run with:
  document-ai-v3/.venv/bin/python scripts/generate_benchmark.py

Standalone, synthetic-only (no real companies/CUIs), not wired into any
resolver or production code. Writes into samples/ and ground_truth/ only.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from playwright.sync_api import sync_playwright
from PIL import Image, ImageFilter, ImageEnhance
import io

ROOT = Path(__file__).parent.parent
SAMPLES_DIR = ROOT / "samples"
GROUND_TRUTH_DIR = ROOT / "ground_truth"

PAGE_WIDTH = 1900


@dataclass
class DocSpec:
    id: str
    layout: Literal["side_by_side", "stacked"]
    labeled: bool
    bilingual: bool
    table_style: Literal["totals_only", "with_summary"]
    series_style: Literal["combined", "split", "number_only", "alnum_id"]
    supplier_name: str
    supplier_tax_id: str
    supplier_address: str
    customer_name: str
    customer_tax_id: str
    customer_address: str
    invoice_number: str
    invoice_series: str | None
    invoice_date: str
    due_date: str | None
    item_desc: str
    subtotal: float
    vat_rate: float
    currency: str = "RON"
    multi_currency: bool = False
    foreign_currency: str | None = None
    fx_rate: float | None = None
    noisy: bool = False
    footer_legal: bool = False
    supplier_iban: str = "RO49AAAA1B31007593840000"
    supplier_bank: str = "Banca Transilvania"
    supplier_reg_no: str = "J40/1234/2021"
    traits: list[str] = field(default_factory=list)

    @property
    def vat_amount(self) -> float:
        return round(self.subtotal * self.vat_rate, 2)

    @property
    def total_amount(self) -> float:
        return round(self.subtotal + self.vat_amount, 2)


def label(ro: str, en: str, bilingual: bool) -> str:
    return f"{ro} / {en}" if bilingual else ro


def invoice_number_block_html(spec: DocSpec) -> str:
    if spec.series_style == "combined":
        return f'<div>Seria {spec.invoice_series} Nr. {spec.invoice_number}</div><div>Data: {spec.invoice_date}</div>'
    if spec.series_style == "split":
        return (
            f'<div>Serie: {spec.invoice_series}</div>'
            f'<div>Numar: {spec.invoice_number}</div>'
            f'<div>Data: {spec.invoice_date}</div>'
        )
    if spec.series_style == "number_only":
        return f'<div>Factura nr. {spec.invoice_number}</div><div>Data: {spec.invoice_date}</div>'
    # alnum_id: no series concept at all, single alphanumeric id
    return f'<div>ID document: {spec.invoice_number}</div><div>Data: {spec.invoice_date}</div>'


def party_block_html(role: Literal["supplier", "customer"], spec: DocSpec) -> str:
    if role == "supplier":
        name, tax_id, address = spec.supplier_name, spec.supplier_tax_id, spec.supplier_address
        role_label = label("FURNIZOR", "SUPPLIER", spec.bilingual)
        elem_id = "supplier-block"
    else:
        name, tax_id, address = spec.customer_name, spec.customer_tax_id, spec.customer_address
        role_label = label("CLIENT", "CUSTOMER", spec.bilingual)
        elem_id = "customer-block"

    label_html = f'<div class="role-label">{role_label}</div>' if spec.labeled else ""
    prefix = "" if spec.labeled else (f"{label('Furnizor', 'Supplier', spec.bilingual)}: " if role == "supplier" else f"{label('Cumparator', 'Buyer', spec.bilingual)}: ")

    return f"""
    <div id="{elem_id}" class="party-block">
      {label_html}
      <div>{prefix}{name}</div>
      <div>{address}</div>
      <div>CUI: {tax_id}</div>
    </div>
    """


def table_html(spec: DocSpec) -> str:
    qty = 1
    unit_price = spec.subtotal
    if spec.table_style == "totals_only":
        header = f"<th>{label('Denumire produs/serviciu', 'Description', spec.bilingual)}</th><th>{label('Cantitate', 'Qty', spec.bilingual)}</th><th>Pret unitar</th><th>TVA</th><th>Total</th>"
        row = f"<td>{spec.item_desc}</td><td>{qty}</td><td>{unit_price:.2f}</td><td>{spec.vat_amount:.2f}</td><td>{spec.total_amount:.2f}</td>"
        summary = ""
    else:
        header = f"<th>{label('Denumire produs/serviciu', 'Description', spec.bilingual)}</th><th>{label('Cantitate', 'Qty', spec.bilingual)}</th><th>Pret unitar</th><th>Valoare</th><th>Valoare T.V.A.</th><th>Total</th>"
        row = f"<td>{spec.item_desc}</td><td>{qty}</td><td>{unit_price:.2f}</td><td>{spec.subtotal:.2f}</td><td>{spec.vat_amount:.2f}</td><td>{spec.total_amount:.2f}</td>"
        currency_display = spec.currency
        summary = f"""
        <div class="summary-block">
          <div>Valoare fara TVA <span>{spec.subtotal:.2f} {currency_display}</span></div>
          <div>TVA ({int(spec.vat_rate * 100)}%) <span>{spec.vat_amount:.2f} {currency_display}</span></div>
          <div class="summary-total">Total de plata <span>{spec.total_amount:.2f} {currency_display}</span></div>
        </div>
        """

    fx_line = ""
    if spec.multi_currency:
        ron_total = spec.total_amount * (spec.fx_rate or 5.0)
        fx_line = f'<div class="fx-line">Curs valutar: 1 {spec.currency} = {spec.fx_rate:.4f} RON &nbsp;|&nbsp; Echivalent RON: {ron_total:,.2f} RON</div>'

    return f"""
    <table id="items-table">
      <thead><tr>{header}</tr></thead>
      <tbody><tr>{row}</tr></tbody>
    </table>
    {summary}
    {fx_line}
    """


def footer_html(spec: DocSpec) -> str:
    if not spec.footer_legal:
        return ""
    return f"""
    <div class="footer">
      <div>{spec.supplier_name} &middot; Nr. Reg. Com. {spec.supplier_reg_no} &middot; CUI {spec.supplier_tax_id}</div>
      <div>Cont IBAN: {spec.supplier_iban} &middot; {spec.supplier_bank}</div>
      <div>{label('Platitor de TVA conform Codului Fiscal', 'VAT payer per Fiscal Code', spec.bilingual)}</div>
    </div>
    """


def render_html(spec: DocSpec) -> str:
    due_date_html = f'<div>{label("Scadenta", "Due", spec.bilingual)}: {spec.due_date}</div>' if spec.due_date else ""

    if spec.layout == "side_by_side":
        parties_html = f"""
        <div class="parties-row">
          {party_block_html("supplier", spec)}
          {party_block_html("customer", spec)}
        </div>
        """
    else:
        parties_html = f"""
        <div class="parties-stacked">
          {party_block_html("supplier", spec)}
          {party_block_html("customer", spec)}
        </div>
        """

    return f"""
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      body {{ font-family: Arial, Helvetica, sans-serif; font-size: 22px; color: #111; margin: 0; padding: 60px 80px; width: {PAGE_WIDTH - 160}px; }}
      h1 {{ font-size: 34px; margin: 0 0 10px 0; }}
      .header-row {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }}
      .invoice-meta {{ text-align: right; }}
      .parties-row {{ display: flex; justify-content: space-between; gap: 40px; margin-bottom: 30px; }}
      .parties-row .party-block {{ width: 45%; }}
      .parties-stacked .party-block {{ margin-bottom: 20px; }}
      .role-label {{ font-weight: bold; color: #555; text-transform: uppercase; font-size: 18px; margin-bottom: 4px; }}
      table {{ border-collapse: collapse; width: 100%; margin-top: 20px; }}
      th, td {{ border: 1px solid #999; padding: 10px 14px; text-align: left; }}
      thead th {{ background: #eee; font-weight: bold; }}
      .summary-block {{ width: 340px; margin-left: auto; margin-top: 16px; }}
      .summary-block div {{ display: flex; justify-content: space-between; padding: 4px 0; }}
      .summary-total {{ font-weight: bold; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px !important; }}
      .fx-line {{ margin-top: 10px; font-size: 18px; color: #333; }}
      .footer {{ margin-top: 60px; font-size: 16px; color: #444; border-top: 1px solid #ccc; padding-top: 14px; }}
    </style>
    </head>
    <body>
      <div class="header-row">
        <h1>FACTURA</h1>
        <div class="invoice-meta">
          {invoice_number_block_html(spec)}
          {due_date_html}
        </div>
      </div>
      {parties_html}
      {table_html(spec)}
      {footer_html(spec)}
    </body>
    </html>
    """


def apply_noise(png_bytes: bytes) -> bytes:
    """Post-render degradation that preserves axis-aligned geometry (no
    rotation/perspective -- ground-truth bboxes must stay valid): gaussian
    blur, JPEG recompression artifacts, contrast/brightness jitter, and a
    resolution round-trip (downscale + upscale) to simulate a lower-quality
    scan. Rotation/skew was deliberately left out of this simulation since
    it would invalidate the axis-aligned ground-truth bboxes; a real noisy-
    scan test would need bbox re-annotation after any geometric transform,
    which is out of scope for this pass."""
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    img = img.resize((int(w * 0.6), int(h * 0.6)), Image.BILINEAR).resize((w, h), Image.BILINEAR)
    img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
    img = ImageEnhance.Contrast(img).enhance(0.85)
    img = ImageEnhance.Brightness(img).enhance(1.08)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=55)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def build_ground_truth(spec: DocSpec, supplier_bbox, customer_bbox, table_bbox) -> dict:
    return {
        "invoiceNumber": spec.invoice_number,
        "invoiceSeries": spec.invoice_series,
        "invoiceDate": spec.invoice_date,
        "dueDate": spec.due_date,
        "supplierName": spec.supplier_name,
        "customerName": spec.customer_name,
        "supplierTaxId": spec.supplier_tax_id,
        "customerTaxId": spec.customer_tax_id,
        "subtotal": spec.subtotal,
        "vatAmount": spec.vat_amount,
        "totalAmount": spec.total_amount,
        "currency": spec.currency,
        "supplierRegionBBox": supplier_bbox,
        "customerRegionBBox": customer_bbox,
        "tableRegionBBox": table_bbox,
        "traits": spec.traits,
    }


def main() -> None:
    from benchmark_specs import DOC_SPECS

    SAMPLES_DIR.mkdir(exist_ok=True)
    GROUND_TRUTH_DIR.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": PAGE_WIDTH, "height": 1400})

        for spec in DOC_SPECS:
            html = render_html(spec)
            page.set_content(html)
            page.wait_for_timeout(50)

            supplier_bbox = page.locator("#supplier-block").bounding_box()
            customer_bbox = page.locator("#customer-block").bounding_box()
            table_locator = page.locator("#items-table")
            table_bbox = table_locator.bounding_box() if table_locator.count() > 0 else None

            png_bytes = page.screenshot(full_page=True)

            image_path = SAMPLES_DIR / f"{spec.id}.png"
            if spec.noisy:
                img = apply_noise(png_bytes)
                img.save(image_path)
            else:
                image_path.write_bytes(png_bytes)

            def to_bbox(b):
                if b is None:
                    return None
                return {"x": round(b["x"], 1), "y": round(b["y"], 1), "width": round(b["width"], 1), "height": round(b["height"], 1)}

            gt = build_ground_truth(spec, to_bbox(supplier_bbox), to_bbox(customer_bbox), to_bbox(table_bbox))
            (GROUND_TRUTH_DIR / f"{spec.id}.json").write_text(json.dumps(gt, indent=2, ensure_ascii=False))
            print(f"generated {spec.id} ({'noisy' if spec.noisy else 'clean'}, {spec.layout})")

        browser.close()

    print(f"\n{len(DOC_SPECS)} documents written to {SAMPLES_DIR} and {GROUND_TRUTH_DIR}")


if __name__ == "__main__":
    main()
