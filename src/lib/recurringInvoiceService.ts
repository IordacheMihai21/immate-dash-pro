import { getActiveCompanyId } from "./companyService";
import { createManualInvoice } from "./invoiceService";
import { supabase } from "./supabaseClient";

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Saptamanal",
  monthly: "Lunar",
  quarterly: "Trimestrial",
  yearly: "Anual",
};

export type RecurringInvoiceTemplate = {
  id: string;
  template_name: string;
  customer_name: string;
  customer_cui: string;
  customer_address: string;
  customer_city: string;
  customer_country: string;
  description: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  currency: string;
  vat_rate_percent: number;
  due_days: number;
  frequency: RecurringFrequency;
  next_run_date: string;
  active: boolean;
  last_generated_at: string | null;
  last_generated_invoice_id: string | null;
};

export type RecurringTemplateInput = {
  templateName: string;
  customer: {
    name: string;
    cui: string;
    address: string;
    city: string;
    country: string;
  };
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  currency: string;
  vatRatePercent: number;
  dueDays: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
};

const columns = `
  id,
  template_name,
  customer_name,
  customer_cui,
  customer_address,
  customer_city,
  customer_country,
  description,
  quantity,
  unit_code,
  unit_price,
  currency,
  vat_rate_percent,
  due_days,
  frequency,
  next_run_date,
  active,
  last_generated_at,
  last_generated_invoice_id
`;

export async function getRecurringTemplates(): Promise<RecurringInvoiceTemplate[]> {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("recurring_invoice_templates")
    .select(columns)
    .eq("company_id", companyId)
    .order("next_run_date", { ascending: true });

  if (error) {
    throw new Error(`Sabloanele de facturi recurente nu au putut fi citite: ${error.message}`);
  }

  return (data ?? []) as unknown as RecurringInvoiceTemplate[];
}

export async function createRecurringTemplate(input: RecurringTemplateInput): Promise<void> {
  const companyId = await getActiveCompanyId();

  const { error } = await supabase.from("recurring_invoice_templates").insert({
    company_id: companyId,
    template_name: input.templateName,
    customer_name: input.customer.name,
    customer_cui: input.customer.cui,
    customer_address: input.customer.address,
    customer_city: input.customer.city,
    customer_country: input.customer.country || "RO",
    description: input.description,
    quantity: input.quantity,
    unit_code: input.unitCode || "buc",
    unit_price: input.unitPrice,
    currency: input.currency || "RON",
    vat_rate_percent: input.vatRatePercent,
    due_days: input.dueDays,
    frequency: input.frequency,
    next_run_date: input.nextRunDate,
  });

  if (error) {
    throw new Error(`Sablonul nu a putut fi salvat: ${error.message}`);
  }
}

export async function setRecurringTemplateActive(id: string, active: boolean): Promise<void> {
  const companyId = await getActiveCompanyId();

  const { error } = await supabase
    .from("recurring_invoice_templates")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Sablonul nu a putut fi actualizat: ${error.message}`);
  }
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  const companyId = await getActiveCompanyId();

  const { error } = await supabase
    .from("recurring_invoice_templates")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Sablonul nu a putut fi sters: ${error.message}`);
  }
}

export function computeNextRunDate(current: string, frequency: RecurringFrequency): string {
  const date = new Date(current);

  switch (frequency) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "yearly":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Generates one real invoice from a template, via the exact same
 * createManualInvoice() path a user creating a one-off invoice by hand
 * would go through -- no separate, divergent invoice-building logic. */
export async function generateInvoiceFromTemplate(
  template: RecurringInvoiceTemplate,
): Promise<string> {
  const companyId = await getActiveCompanyId();
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = addDays(issueDate, template.due_days);
  const invoiceNumber = `REC-${template.id.slice(0, 8).toUpperCase()}-${issueDate.slice(0, 7).replace("-", "")}`;

  const result = await createManualInvoice({
    invoiceNumber,
    issueDate,
    dueDate,
    currency: template.currency,
    vatRatePercent: template.vat_rate_percent,
    customer: {
      name: template.customer_name,
      cui: template.customer_cui,
      address: template.customer_address,
      city: template.customer_city,
      country: template.customer_country,
    },
    lines: [
      {
        description: template.description,
        quantity: template.quantity,
        unitCode: template.unit_code,
        unitPrice: template.unit_price,
      },
    ],
  });

  const { error } = await supabase
    .from("recurring_invoice_templates")
    .update({
      next_run_date: computeNextRunDate(template.next_run_date, template.frequency),
      last_generated_at: new Date().toISOString(),
      last_generated_invoice_id: result.invoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(
      `Factura ${invoiceNumber} a fost creata, dar sablonul nu a putut fi actualizat: ${error.message}`,
    );
  }

  return result.invoiceId;
}
