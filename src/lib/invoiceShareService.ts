import { getActiveCompanyId } from "./companyService";
import { supabase } from "./supabaseClient";

export type SharedInvoiceParty = {
  name: string | null;
  cui: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
};

export type SharedInvoiceLine = {
  line_number: string | null;
  description: string | null;
  quantity: number | null;
  unit_code: string | null;
  unit_price: number | null;
  line_total: number | null;
};

export type SharedInvoice = {
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  tax_exclusive_amount: number | null;
  tax_amount: number | null;
  tax_inclusive_amount: number | null;
  payable_amount: number | null;
  payment_status: string | null;
  supplier: SharedInvoiceParty;
  customer: SharedInvoiceParty;
  lines: SharedInvoiceLine[];
};

export async function enableInvoiceShare(invoiceId: string): Promise<string> {
  const companyId = await getActiveCompanyId();
  const token = crypto.randomUUID();

  const { error } = await supabase
    .from("invoices")
    .update({ share_token: token })
    .eq("id", invoiceId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Linkul public nu a putut fi generat: ${error.message}`);
  }

  return token;
}

export async function disableInvoiceShare(invoiceId: string): Promise<void> {
  const companyId = await getActiveCompanyId();

  const { error } = await supabase
    .from("invoices")
    .update({ share_token: null })
    .eq("id", invoiceId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Linkul public nu a putut fi revocat: ${error.message}`);
  }
}

/** Public, unauthenticated read used by /factura/$token -- goes through the
 * get_shared_invoice(token) SECURITY DEFINER RPC rather than a table select,
 * since no RLS policy can safely make share_token-bearing rows anon-readable
 * without also making every other company's shared invoices enumerable. */
export async function getSharedInvoice(token: string): Promise<SharedInvoice | null> {
  const { data, error } = await supabase.rpc("get_shared_invoice", { p_token: token });

  if (error) {
    throw new Error(`Factura nu a putut fi incarcata: ${error.message}`);
  }

  return (data as SharedInvoice | null) ?? null;
}
