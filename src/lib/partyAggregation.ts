import { classifyInvoiceForCompany } from "@/lib/cuiUtils";
import { getActiveCompanyId, getCompanyProfileById } from "@/lib/companyService";
import { getInvoices } from "@/lib/invoiceService";

type RelationParty =
  | { name: string | null; cui: string | null }
  | { name: string | null; cui: string | null }[]
  | null
  | undefined;

type InvoiceForAggregation = {
  payable_amount: number | null;
  issue_date: string | null;
  created_at: string | null;
  suppliers?: RelationParty;
  customers?: RelationParty;
};

export type PartySummary = {
  key: string;
  name: string;
  cui: string;
  invoiceCount: number;
  totalValue: number;
  lastInvoiceDate: string | null;
  status: "Activ" | "Inactiv";
};

const ACTIVE_WINDOW_DAYS = 180;

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  return Array.isArray(party) ? (party[0] ?? null) : party;
}

function aggregateParties(
  invoices: InvoiceForAggregation[],
  relation: "suppliers" | "customers",
): PartySummary[] {
  const byKey = new Map<string, PartySummary>();

  for (const invoice of invoices) {
    const party = getRelationParty(invoice[relation]);
    const name = party?.name?.trim();

    if (!name) {
      continue;
    }

    const cui = party?.cui?.trim() ?? "";
    const key = cui || name;
    const invoiceDate = invoice.issue_date ?? invoice.created_at;
    const amount = Number(invoice.payable_amount ?? 0);
    const existing = byKey.get(key);

    if (existing) {
      existing.invoiceCount += 1;
      existing.totalValue += amount;
      if (invoiceDate && (!existing.lastInvoiceDate || invoiceDate > existing.lastInvoiceDate)) {
        existing.lastInvoiceDate = invoiceDate;
      }
    } else {
      byKey.set(key, {
        key,
        name,
        cui,
        invoiceCount: 1,
        totalValue: amount,
        lastInvoiceDate: invoiceDate,
        status: "Activ",
      });
    }
  }

  const activeCutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return Array.from(byKey.values())
    .map((party) => ({
      ...party,
      status: (party.lastInvoiceDate && new Date(party.lastInvoiceDate).getTime() >= activeCutoff
        ? "Activ"
        : "Inactiv") as PartySummary["status"],
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function getCustomerSummaries(): Promise<PartySummary[]> {
  const companyId = await getActiveCompanyId();
  const [invoices, companyProfile] = await Promise.all([
    getInvoices(),
    getCompanyProfileById(companyId),
  ]);

  // Only invoices where our company is the supplier represent real sales to
  // a client -- otherwise (an invoice where we're the customer) the
  // "customers" field on that row is our own company, not a client of ours.
  const salesInvoices = invoices.filter(
    (invoice) => classifyInvoiceForCompany(invoice, companyProfile?.cui) === "revenue",
  );

  return aggregateParties(salesInvoices, "customers");
}

export async function getSupplierSummaries(): Promise<PartySummary[]> {
  const companyId = await getActiveCompanyId();
  const [invoices, companyProfile] = await Promise.all([
    getInvoices(),
    getCompanyProfileById(companyId),
  ]);

  // Symmetric to getCustomerSummaries: only invoices where our company is
  // the customer represent a real purchase from a supplier.
  const purchaseInvoices = invoices.filter(
    (invoice) => classifyInvoiceForCompany(invoice, companyProfile?.cui) === "expense",
  );

  return aggregateParties(purchaseInvoices, "suppliers");
}
