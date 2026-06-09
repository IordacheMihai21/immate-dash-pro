export type InvoiceClassification = "revenue" | "expense" | "unclassified";

export function normalizeCui(cui: unknown): string {
  return String(cui ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^RO/, "");
}

type InvoiceParty =
  | {
      cui?: unknown;
    }
  | {
      cui?: unknown;
    }[]
  | null
  | undefined;

type InvoiceForCompanyClassification = {
  supplier_cui?: unknown;
  supplierCui?: unknown;
  customer_cui?: unknown;
  customerCui?: unknown;
  suppliers?: InvoiceParty;
  supplier?: InvoiceParty;
  customers?: InvoiceParty;
  customer?: InvoiceParty;
};

function getPartyCui(party: InvoiceParty): unknown {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0]?.cui ?? null;
  }

  return party.cui ?? null;
}

export function getInvoiceSupplierCui(invoice: InvoiceForCompanyClassification): unknown {
  return (
    invoice.supplier_cui ??
    invoice.supplierCui ??
    getPartyCui(invoice.suppliers) ??
    getPartyCui(invoice.supplier)
  );
}

export function getInvoiceCustomerCui(invoice: InvoiceForCompanyClassification): unknown {
  return (
    invoice.customer_cui ??
    invoice.customerCui ??
    getPartyCui(invoice.customers) ??
    getPartyCui(invoice.customer)
  );
}

export function classifyInvoiceByCui({
  companyCui,
  supplierCui,
  customerCui,
}: {
  companyCui: string | null | undefined;
  supplierCui: string | null | undefined;
  customerCui: string | null | undefined;
}): InvoiceClassification {
  const normalizedCompanyCui = normalizeCui(companyCui);

  if (!normalizedCompanyCui) {
    return "unclassified";
  }

  if (normalizeCui(supplierCui) === normalizedCompanyCui) {
    return "revenue";
  }

  if (normalizeCui(customerCui) === normalizedCompanyCui) {
    return "expense";
  }

  return "unclassified";
}

export function classifyInvoiceForCompany(
  invoice: InvoiceForCompanyClassification,
  companyCui: string | null | undefined,
): InvoiceClassification {
  return classifyInvoiceByCui({
    companyCui,
    supplierCui: String(getInvoiceSupplierCui(invoice) ?? ""),
    customerCui: String(getInvoiceCustomerCui(invoice) ?? ""),
  });
}
