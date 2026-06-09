import {
  classifyInvoiceForCompany,
  type InvoiceClassification,
} from "./cuiUtils";

export type RelationParty =
  | {
      name: string | null;
      cui: string | null;
    }
  | {
      name: string | null;
      cui: string | null;
    }[]
  | null
  | undefined;

export type ReportInvoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  currency: string | null;
  tax_exclusive_amount: number | null;
  tax_amount: number | null;
  tax_inclusive_amount: number | null;
  payable_amount: number | null;
  status: string | null;
  created_at: string | null;
  suppliers?: RelationParty;
  customers?: RelationParty;
};

export type ReportDocument = {
  id: string;
  file_name: string | null;
  file_type: string | null;
  document_type: string | null;
  status: string | null;
  uploaded_at: string | null;
  processed_at: string | null;
};

export type MonthlyReportPoint = {
  monthKey: string;
  month: string;
  documents: number;
  invoices: number;
  value: number;
  vat: number;
  base: number;
};

export function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

export function getSupplierName(invoice: ReportInvoice) {
  return getRelationParty(invoice.suppliers)?.name ?? "Furnizor necunoscut";
}

export function getCustomerName(invoice: ReportInvoice) {
  return getRelationParty(invoice.customers)?.name ?? "Client necunoscut";
}

export function getInvoiceTotal(invoice: ReportInvoice) {
  return toNumber(invoice.payable_amount ?? invoice.tax_inclusive_amount);
}

export function getInvoiceBase(invoice: ReportInvoice) {
  const explicitBase = toNumber(invoice.tax_exclusive_amount);

  if (explicitBase > 0) {
    return explicitBase;
  }

  return Math.max(getInvoiceTotal(invoice) - toNumber(invoice.tax_amount), 0);
}

export function getInvoiceDate(invoice: ReportInvoice) {
  return invoice.issue_date ?? invoice.created_at;
}

export function getInvoiceClassification(
  invoice: ReportInvoice,
  companyCui: string | null | undefined,
): InvoiceClassification {
  return classifyInvoiceForCompany(invoice, companyCui);
}

export function filterInvoicesByClassification(
  invoices: ReportInvoice[],
  companyCui: string | null | undefined,
  classifications: InvoiceClassification[],
) {
  return invoices.filter((invoice) =>
    classifications.includes(getInvoiceClassification(invoice, companyCui)),
  );
}

export function getDateMs(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const time = new Date(dateValue).getTime();

  return Number.isNaN(time) ? null : time;
}

export function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ro-RO");
}

export function getMonthKey(dateValue: string | null | undefined) {
  if (!dateValue) {
    return "Necunoscut";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Necunoscut";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(monthKey: string) {
  if (monthKey === "Necunoscut") {
    return "N/A";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("ro-RO", {
    month: "short",
    year: "numeric",
  });
}

export function getNewestInvoiceTime(invoices: ReportInvoice[]) {
  return invoices.reduce<number | null>((latest, invoice) => {
    const time = getDateMs(getInvoiceDate(invoice));

    if (time === null) {
      return latest;
    }

    return latest === null ? time : Math.max(latest, time);
  }, null);
}

export function isRecentInvoice(invoice: ReportInvoice, newestTime: number | null, days = 45) {
  if (newestTime === null) {
    return false;
  }

  const time = getDateMs(getInvoiceDate(invoice));

  if (time === null) {
    return false;
  }

  return time >= newestTime - days * 24 * 60 * 60 * 1000;
}

export function buildMonthlyReportPoints(
  invoices: ReportInvoice[],
  documents: ReportDocument[] = [],
  options: {
    companyCui?: string | null;
    classifications?: InvoiceClassification[];
  } = {},
): MonthlyReportPoint[] {
  const monthlyMap = new Map<string, MonthlyReportPoint>();

  function ensureMonth(monthKey: string) {
    const existing = monthlyMap.get(monthKey);

    if (existing) {
      return existing;
    }

    const created = {
      monthKey,
      month: getMonthLabel(monthKey),
      documents: 0,
      invoices: 0,
      value: 0,
      vat: 0,
      base: 0,
    };

    monthlyMap.set(monthKey, created);

    return created;
  }

  invoices.forEach((invoice) => {
    if (
      options.classifications &&
      !options.classifications.includes(
        getInvoiceClassification(invoice, options.companyCui),
      )
    ) {
      return;
    }

    const month = ensureMonth(getMonthKey(getInvoiceDate(invoice)));

    month.invoices += 1;
    month.value += getInvoiceTotal(invoice);
    month.vat += toNumber(invoice.tax_amount);
    month.base += getInvoiceBase(invoice);
  });

  documents.forEach((document) => {
    const month = ensureMonth(getMonthKey(document.uploaded_at ?? document.processed_at));

    month.documents += 1;
  });

  return Array.from(monthlyMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${value.toFixed(1)}%`;
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase();
}
