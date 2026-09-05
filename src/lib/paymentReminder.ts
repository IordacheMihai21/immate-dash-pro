import { formatRON } from "@/lib/formatters";

export type PaymentReminderInput = {
  customerName: string;
  invoiceNumber: string;
  payableAmount: number;
  dueDate: string;
  supplierName: string;
};

export function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate);

  if (Number.isNaN(due.getTime())) {
    return 0;
  }

  const diffMs = Date.now() - due.getTime();

  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function formatDueDate(dueDate: string): string {
  const due = new Date(dueDate);

  if (Number.isNaN(due.getTime())) {
    return dueDate;
  }

  return due.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function buildPaymentReminderMessage(input: PaymentReminderInput): string {
  const overdue = daysOverdue(input.dueDate);
  const dueDateLabel = formatDueDate(input.dueDate);

  return `Buna ziua${input.customerName ? `, ${input.customerName}` : ""},

Va scriem in legatura cu factura ${input.invoiceNumber}, in valoare de ${formatRON(input.payableAmount)}, cu scadenta la ${dueDateLabel}.

Conform evidentelor noastre, aceasta factura este restanta de ${overdue} ${overdue === 1 ? "zi" : "zile"}. Va rugam sa confirmati efectuarea platii sau sa ne contactati daca a intervenit vreo problema.

Multumim pentru intelegere,
${input.supplierName}`;
}
