import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Eye, Loader2, Timer } from "lucide-react";
import { AdminPanel, EmptyState, StatCard } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvoices } from "@/lib/invoiceService";
import { getActiveCompanyCui } from "@/lib/companyService";
import { classifyInvoiceForCompany } from "@/lib/cuiUtils";
import { buildPaymentReminderMessage, daysOverdue } from "@/lib/paymentReminder";
import { formatRON } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/e-facturi/colectare")({
  head: () => ({ meta: [{ title: "Colectare - IMMapp" }] }),
  component: CollectionsPage,
});

type RelationParty =
  | { name: string | null; cui: string | null }
  | { name: string | null; cui: string | null }[]
  | null
  | undefined;

type InvoiceRow = {
  id: string;
  invoice_number: string;
  due_date: string | null;
  payable_amount: number | null;
  payment_status: string | null;
  suppliers?: RelationParty;
  customers?: RelationParty;
};

type OverdueInvoice = {
  invoice: InvoiceRow;
  customerName: string;
  supplierName: string;
  overdueDays: number;
};

function getRelationParty(party: RelationParty) {
  if (!party) return null;
  if (Array.isArray(party)) return party[0] ?? null;
  return party;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
}

function agingBucket(days: number): "0-30" | "31-60" | "60+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}

function CollectionsPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [companyCui, setCompanyCui] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [invoiceData, cui] = await Promise.all([getInvoices(), getActiveCompanyCui()]);

      setInvoices(invoiceData as unknown as InvoiceRow[]);
      setCompanyCui(cui);
    } catch {
      setErrorMessage("Nu s-au putut incarca facturile restante.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const handleRefresh = () => loadData();

    window.addEventListener("immapp:invoice-imported", handleRefresh);
    window.addEventListener("immapp:invoice-deleted", handleRefresh);

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleRefresh);
      window.removeEventListener("immapp:invoice-deleted", handleRefresh);
    };
  }, []);

  const overdue = useMemo<OverdueInvoice[]>(() => {
    const now = Date.now();

    return invoices
      .filter((invoice) => {
        if (invoice.payment_status === "platita" || !invoice.due_date) return false;
        const due = new Date(invoice.due_date);
        if (Number.isNaN(due.getTime()) || due.getTime() >= now) return false;
        return classifyInvoiceForCompany(invoice, companyCui) === "revenue";
      })
      .map((invoice) => ({
        invoice,
        customerName: getRelationParty(invoice.customers)?.name ?? "Client necunoscut",
        supplierName: getRelationParty(invoice.suppliers)?.name ?? "",
        overdueDays: daysOverdue(invoice.due_date as string),
      }))
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }, [invoices, companyCui]);

  const stats = useMemo(() => {
    const total = overdue.reduce((sum, item) => sum + Number(item.invoice.payable_amount ?? 0), 0);
    const buckets = { "0-30": 0, "31-60": 0, "60+": 0 };

    for (const item of overdue) {
      buckets[agingBucket(item.overdueDays)] += 1;
    }

    return { count: overdue.length, total, buckets };
  }, [overdue]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === overdue.length ? new Set() : new Set(overdue.map((item) => item.invoice.id)),
    );
  }

  async function handleCopySelected() {
    const chosen = overdue.filter((item) => selected.has(item.invoice.id));

    if (chosen.length === 0) return;

    const message = chosen
      .map((item) =>
        buildPaymentReminderMessage({
          customerName: item.customerName,
          invoiceNumber: item.invoice.invoice_number,
          payableAmount: Number(item.invoice.payable_amount ?? 0),
          dueDate: item.invoice.due_date as string,
          supplierName: item.supplierName,
        }),
      )
      .join("\n\n----------\n\n");

    try {
      await navigator.clipboard.writeText(message);
      toast.success(
        `${chosen.length} ${chosen.length === 1 ? "mesaj copiat" : "mesaje copiate"} in clipboard.`,
      );
    } catch {
      toast.error("Nu am putut copia mesajele in clipboard.");
    }
  }

  async function handleCopyOne(item: OverdueInvoice) {
    const message = buildPaymentReminderMessage({
      customerName: item.customerName,
      invoiceNumber: item.invoice.invoice_number,
      payableAmount: Number(item.invoice.payable_amount ?? 0),
      dueDate: item.invoice.due_date as string,
      supplierName: item.supplierName,
    });

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mesaj de reminder copiat in clipboard.");
    } catch {
      toast.error("Nu am putut copia mesajul in clipboard.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Colectare"
        description="Facturile de incasat restante, sortate dupa vechime, pentru o sesiune de urmarire a platilor."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total restante"
          value={String(stats.count)}
          description={
            stats.count > 0 ? `${formatRON(stats.total)} neincasate` : "Nicio factura restanta"
          }
          icon={<Timer className="h-5 w-5" />}
          tone={stats.count > 0 ? "rose" : "slate"}
        />
        <StatCard
          title="1-30 zile"
          value={String(stats.buckets["0-30"])}
          description="Restanta recenta"
          icon={<Timer className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          title="31-60 zile"
          value={String(stats.buckets["31-60"])}
          description="Necesita urmarire"
          icon={<Timer className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          title="60+ zile"
          value={String(stats.buckets["60+"])}
          description="Risc ridicat de neincasare"
          icon={<Timer className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      <AdminPanel
        title="Facturi de urmarit"
        description="Bifeaza facturile pentru care vrei sa copiezi mesaje de reminder, apoi trimite-le manual clientilor."
        action={
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-card"
            disabled={selected.size === 0}
            onClick={handleCopySelected}
          >
            <ClipboardCopy className="h-4 w-4" />
            Copiaza mesaje ({selected.size})
          </Button>
        }
        contentClassName="p-0"
      >
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se incarca facturile restante...
          </div>
        ) : errorMessage ? (
          <div className="p-5 text-sm text-destructive">{errorMessage}</div>
        ) : overdue.length === 0 ? (
          <EmptyState
            title="Nicio factura restanta"
            description="Toate facturile emise sunt incasate sau inca in termen."
            icon={<Timer className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === overdue.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecteaza toate facturile"
                    />
                  </TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Suma</TableHead>
                  <TableHead>Scadenta</TableHead>
                  <TableHead className="text-right">Zile intarziere</TableHead>
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {overdue.map((item) => (
                  <TableRow key={item.invoice.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.invoice.id)}
                        onCheckedChange={() => toggleSelected(item.invoice.id)}
                        aria-label={`Selecteaza factura ${item.invoice.invoice_number}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {item.customerName}
                    </TableCell>
                    <TableCell>{item.invoice.invoice_number}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatRON(Number(item.invoice.payable_amount ?? 0))}
                    </TableCell>
                    <TableCell>{formatDate(item.invoice.due_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          item.overdueDays > 60
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {item.overdueDays} {item.overdueDays === 1 ? "zi" : "zile"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          title="Copiaza un mesaj de reminder pentru client"
                          onClick={() => handleCopyOne(item)}
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                          Reminder
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Vezi factura"
                          aria-label={`Vezi factura ${item.invoice.invoice_number}`}
                          asChild
                        >
                          <Link to="/app/e-facturi/$id" params={{ id: item.invoice.id }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
