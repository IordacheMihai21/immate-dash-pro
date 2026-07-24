export type ParsedInvoiceLine = {
  lineNumber: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
};

export type ParsedInvoice = {
  invoiceNumber: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  supplier: {
    name: string;
    cui: string;
    address: string;
    city: string;
    country: string;
  };
  customer: {
    name: string;
    cui: string;
    address: string;
    city: string;
    country: string;
  };
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;
  lines: ParsedInvoiceLine[];
};

function textOf(parent: Element | Document, tagName: string): string {
  const byNamespace = parent.getElementsByTagNameNS("*", tagName);
  if (byNamespace.length > 0) {
    return byNamespace[0]?.textContent?.trim() ?? "";
  }

  const byTag = parent.getElementsByTagName(tagName);
  if (byTag.length > 0) {
    return byTag[0]?.textContent?.trim() ?? "";
  }

  return "";
}

function numberOf(parent: Element | Document, tagName: string): number {
  const value = textOf(parent, tagName);
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function firstElement(parent: Element | Document, tagName: string): Element | null {
  const byNamespace = parent.getElementsByTagNameNS("*", tagName);
  if (byNamespace.length > 0) {
    return byNamespace[0] as Element;
  }

  const byTag = parent.getElementsByTagName(tagName);
  if (byTag.length > 0) {
    return byTag[0] as Element;
  }

  return null;
}

function elements(parent: Element | Document, tagName: string): Element[] {
  const byNamespace = Array.from(parent.getElementsByTagNameNS("*", tagName)) as Element[];

  if (byNamespace.length > 0) {
    return byNamespace;
  }

  return Array.from(parent.getElementsByTagName(tagName)) as Element[];
}

function getPartyData(partyWrapper: Element | null) {
  if (!partyWrapper) {
    return {
      name: "",
      cui: "",
      address: "",
      city: "",
      country: "RO",
    };
  }

  const party = firstElement(partyWrapper, "Party") ?? partyWrapper;
  const partyName = firstElement(party, "PartyName");
  const legalEntity = firstElement(party, "PartyLegalEntity");
  const taxScheme = firstElement(party, "PartyTaxScheme");
  const address = firstElement(party, "PostalAddress");

  const name =
    textOf(partyName ?? party, "Name") ||
    textOf(legalEntity ?? party, "RegistrationName") ||
    textOf(party, "Name");

  const cui =
    textOf(taxScheme ?? party, "CompanyID") ||
    textOf(legalEntity ?? party, "CompanyID") ||
    textOf(party, "EndpointID");

  const street = textOf(address ?? party, "StreetName");
  const city = textOf(address ?? party, "CityName");
  const country = textOf(address ?? party, "IdentificationCode") || "RO";

  return {
    name,
    cui,
    address: street,
    city,
    country,
  };
}

export function parseEFacturaXml(xmlText: string): ParsedInvoice {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");

  const parserError = xml.getElementsByTagName("parsererror");

  if (parserError.length > 0) {
    throw new Error("Fisierul XML nu este valid.");
  }

  const invoiceNumber = textOf(xml, "ID");
  const issueDate = textOf(xml, "IssueDate") || null;
  const dueDate = textOf(xml, "DueDate") || null;
  const currency = textOf(xml, "DocumentCurrencyCode") || "RON";

  const supplierParty = firstElement(xml, "AccountingSupplierParty");
  const customerParty = firstElement(xml, "AccountingCustomerParty");

  const supplier = getPartyData(supplierParty);
  const customer = getPartyData(customerParty);

  const legalMonetaryTotal = firstElement(xml, "LegalMonetaryTotal");
  const taxTotal = firstElement(xml, "TaxTotal");

  const taxExclusiveAmount = numberOf(legalMonetaryTotal ?? xml, "TaxExclusiveAmount");
  const taxAmount = numberOf(taxTotal ?? xml, "TaxAmount");
  const taxInclusiveAmount = numberOf(legalMonetaryTotal ?? xml, "TaxInclusiveAmount");
  const payableAmount = numberOf(legalMonetaryTotal ?? xml, "PayableAmount");

  const invoiceLines = elements(xml, "InvoiceLine");

  const lines: ParsedInvoiceLine[] = invoiceLines.map((line, index) => {
    const quantityElement = firstElement(line, "InvoicedQuantity");
    const unitCode = quantityElement?.getAttribute("unitCode") ?? "";

    return {
      lineNumber: textOf(line, "ID") || String(index + 1),
      description: textOf(firstElement(line, "Item") ?? line, "Name"),
      quantity: numberOf(line, "InvoicedQuantity"),
      unitCode,
      unitPrice: numberOf(firstElement(line, "Price") ?? line, "PriceAmount"),
      lineTotal: numberOf(line, "LineExtensionAmount"),
    };
  });

  if (!invoiceNumber) {
    throw new Error("Nu am gasit numarul facturii in XML.");
  }

  return {
    invoiceNumber,
    issueDate,
    dueDate,
    currency,
    supplier,
    customer,
    taxExclusiveAmount,
    taxAmount,
    taxInclusiveAmount,
    payableAmount,
    lines,
  };
}
