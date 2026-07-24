import { normalizeCui } from "@/lib/cuiUtils";

export type UblInvoiceParty = {
  name: string;
  cui: string;
  address: string;
  city: string;
  country: string;
};

export type UblInvoiceLine = {
  lineNumber: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
};

export type UblInvoiceInput = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;
  supplier: UblInvoiceParty;
  customer: UblInvoiceParty;
  lines: UblInvoiceLine[];
};

const CIUS_RO_CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1";

// Coduri de unitate de masura UN/ECE Recommendation 20, cerute de UBL/CIUS-RO.
// "buc" (folosit ca eticheta in restul aplicatiei) nu e un cod valid -- se
// traduce aici in codul oficial. Fallback la "H87" (bucata) pentru orice
// unitate nerecunoscuta, ca sa nu generam niciodata un cod gol.
const UNIT_CODE_MAP: Record<string, string> = {
  buc: "H87",
  bucata: "H87",
  bucati: "H87",
  h87: "H87",
  kg: "KGM",
  kgm: "KGM",
  g: "GRM",
  l: "LTR",
  ltr: "LTR",
  m: "MTR",
  mtr: "MTR",
  m2: "MTK",
  m3: "MTQ",
  ora: "HUR",
  ore: "HUR",
  h: "HUR",
  hur: "HUR",
  zi: "DAY",
  zile: "DAY",
  day: "DAY",
  luna: "MON",
  set: "SET",
  pereche: "PR",
};

function toUnitCode(unitCode: string): string {
  const normalized = unitCode.trim().toLowerCase();
  return UNIT_CODE_MAP[normalized] ?? "H87";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatAmount(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function formatQuantity(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(3);
}

function vatRatePercent(taxExclusiveAmount: number, taxAmount: number): number {
  if (taxExclusiveAmount <= 0) {
    return 0;
  }

  return Math.round((taxAmount / taxExclusiveAmount) * 100);
}

function taxCategoryId(ratePercent: number): "S" | "Z" {
  return ratePercent > 0 ? "S" : "Z";
}

function buildParty(party: UblInvoiceParty, legalNameTag: "RegistrationName"): string {
  const cui = normalizeCui(party.cui);
  const name = escapeXml(party.name || "Necunoscut");

  return `
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(cui)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${name}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(party.address || "")}</cbc:StreetName>
        <cbc:CityName>${escapeXml(party.city || "")}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>${escapeXml(party.country || "RO")}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO${escapeXml(cui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:${legalNameTag}>${name}</cbc:${legalNameTag}>
        <cbc:CompanyID>${escapeXml(cui)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>`;
}

export function validateUblInvoiceInput(input: UblInvoiceInput): string[] {
  const errors: string[] = [];

  if (!input.invoiceNumber.trim()) errors.push("Numarul facturii lipseste.");
  if (!input.issueDate.trim()) errors.push("Data emiterii lipseste.");
  if (!input.currency.trim()) errors.push("Moneda facturii lipseste.");
  if (!input.supplier.name.trim()) errors.push("Denumirea furnizorului lipseste.");
  if (!normalizeCui(input.supplier.cui)) errors.push("CUI-ul furnizorului lipseste.");
  if (!input.customer.name.trim()) errors.push("Denumirea clientului lipseste.");
  if (!normalizeCui(input.customer.cui)) errors.push("CUI-ul clientului lipseste.");
  if (input.lines.length === 0) errors.push("Factura nu are nicio linie.");

  return errors;
}

export function generateUblInvoiceXml(input: UblInvoiceInput): string {
  const errors = validateUblInvoiceInput(input);

  if (errors.length > 0) {
    throw new Error(`Factura nu poate fi exportata ca XML: ${errors.join(" ")}`);
  }

  const currency = input.currency || "RON";
  const ratePercent = vatRatePercent(input.taxExclusiveAmount, input.taxAmount);
  const categoryId = taxCategoryId(ratePercent);

  const dueDateTag = input.dueDate
    ? `\n  <cbc:DueDate>${escapeXml(input.dueDate)}</cbc:DueDate>`
    : "";

  const linesXml = input.lines
    .map(
      (line) => `
  <cac:InvoiceLine>
    <cbc:ID>${escapeXml(line.lineNumber)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(toUnitCode(line.unitCode))}">${formatQuantity(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${formatAmount(line.lineTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${categoryId}</cbc:ID>
        <cbc:Percent>${ratePercent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${escapeXml(currency)}">${formatAmount(line.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${CIUS_RO_CUSTOMIZATION_ID}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>${dueDateTag}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>${buildParty(input.supplier, "RegistrationName")}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${buildParty(input.customer, "RegistrationName")}
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxExclusiveAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${categoryId}</cbc:ID>
        <cbc:Percent>${ratePercent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxExclusiveAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${formatAmount(input.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(currency)}">${formatAmount(input.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>
`;
}
