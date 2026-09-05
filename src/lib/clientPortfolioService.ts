import { classifyInvoiceForCompany } from "./cuiUtils";
import { getUserCompanyMemberships } from "./companyMembershipsService";
import { supabase } from "./supabaseClient";

export type ClientPortfolioEntry = {
  companyId: string;
  companyName: string;
  cui: string;
  role: string;
  invoiceCount: number;
  revenueTotal: number;
  expenseTotal: number;
  lastActivityDate: string | null;
};

type PortfolioInvoiceRow = {
  payable_amount: number | null;
  issue_date: string | null;
  created_at: string | null;
  suppliers: { cui: string | null } | { cui: string | null }[] | null;
  customers: { cui: string | null } | { cui: string | null }[] | null;
};

/**
 * Real per-company summary for every company the current user belongs to
 * -- the actual "multi-client dashboard" feature (Bill.com-style: an
 * accountant sees all their client companies' activity from one place,
 * instead of only whichever one happens to be "active"). One query per
 * company (RLS already allows reading any company the user is a member
 * of), run in parallel -- fine at the scale of a single accountant's real
 * client list.
 */
export async function getClientPortfolio(): Promise<ClientPortfolioEntry[]> {
  const memberships = await getUserCompanyMemberships();

  const entries = await Promise.all(
    memberships.map(async (membership): Promise<ClientPortfolioEntry> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("payable_amount, issue_date, created_at, suppliers(cui), customers(cui)")
        .eq("company_id", membership.companyId);

      if (error) {
        throw new Error(
          `Datele pentru ${membership.companyName} nu au putut fi citite: ${error.message}`,
        );
      }

      const invoices = (data ?? []) as PortfolioInvoiceRow[];
      let revenueTotal = 0;
      let expenseTotal = 0;
      let lastActivityDate: string | null = null;

      for (const invoice of invoices) {
        const classification = classifyInvoiceForCompany(invoice, membership.cui);
        const amount = Number(invoice.payable_amount ?? 0);

        if (classification === "revenue") {
          revenueTotal += amount;
        } else if (classification === "expense") {
          expenseTotal += amount;
        }

        const dateText = invoice.issue_date ?? invoice.created_at;
        if (dateText && (!lastActivityDate || dateText > lastActivityDate)) {
          lastActivityDate = dateText;
        }
      }

      return {
        companyId: membership.companyId,
        companyName: membership.companyName,
        cui: membership.cui,
        role: membership.role,
        invoiceCount: invoices.length,
        revenueTotal,
        expenseTotal,
        lastActivityDate,
      };
    }),
  );

  return entries.sort((a, b) => b.revenueTotal - a.revenueTotal);
}
