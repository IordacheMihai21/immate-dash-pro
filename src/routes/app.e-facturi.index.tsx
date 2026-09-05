import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCopy,
  Download,
  Eye,
  FileCode2,
  Loader2,
  MoreHorizontal,
  Percent,
  ReceiptText,
  Search,
  Timer,
  UploadCloud,
  Wallet,
  X,
} from "lucide-react";
import { AdminPanel, EmptyState, InfoBanner, StatCard } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadModal } from "@/components/upload-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, todayForFilename } from "@/lib/csvExport";
import {
  getInvoices,
  updateInvoicePaymentStatus,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/invoiceService";
import { getActiveCompanyCui } from "@/lib/companyService";
import { classifyInvoiceForCompany } from "@/lib/cuiUtils";
import { buildPaymentReminderMessage } from "@/lib/paymentReminder";
import { formatRON } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/e-facturi/")({
  head: () => ({ meta: [{ title: "e-Facturi - IMMapp" }] }),
  component: EInvoicesPage,
});

type InvoiceTab = "all" | "processed" | "recent";

type RelationParty =
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

type InvoiceRow = {
  id: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  tax_exclusive_amount: number | null;
  tax_amount: number | null;
  tax_inclusive_amount: number | null;
  payable_amount: number | null;
  status: string | null;
  payment_status: string | null;
  payment_date: string | null;
  payment_method: string | null;
  created_at: string | null;
  suppliers?: RelationParty;
  customers?: RelationParty;
};

type PaymentBadgeState = "Platita" | "Restanta" | "Neplatita";

function getPaymentBadgeState(invoice: InvoiceRow): PaymentBadgeState {
  if (invoice.payment_status === "platita") {
    return "Platita";
  }

  if (invoice.due_date) {
    const dueDate = new Date(invoice.due_date);

    if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) {
      return "Restanta";
    }
  }

  return "Neplatita";
}

const paymentBadgeStyles: Record<PaymentBadgeState, string> = {
  Platita: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Restanta: "border-destructive/30 bg-destructive/10 text-destructive",
  Neplatita: "border-border bg-muted text-muted-foreground",
};

function PaymentCell({
  invoice,
  companyCui,
  onUpdated,
}: {
  invoice: InvoiceRow;
  companyCui: string;
  onUpdated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = getPaymentBadgeState(invoice);
  const isRevenue = classifyInvoiceForCompany(invoice, companyCui) === "revenue";

  async function handleCopyReminder() {
    if (!invoice.due_date) {
      return;
    }

    const supplier = getRelationParty(invoice.suppliers);
    const customer = getRelationParty(invoice.customers);
    const message = buildPaymentReminderMessage({
      customerName: customer?.name ?? "",
      invoiceNumber: invoice.invoice_number,
      payableAmount: Number(invoice.payable_amount ?? 0),
      dueDate: invoice.due_date,
      supplierName: supplier?.name ?? "",
    });

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mesaj de reminder copiat in clipboard.");
    } catch {
      toast.error("Nu am putut copia mesajul in clipboard.");
    }
  }

  async function handleMarkPaid() {
    try {
      setIsSubmitting(true);
      await updateInvoicePaymentStatus(invoice.id, {
        status: "platita",
        paymentDate,
        paymentMethod,
      });
      toast.success(`Factura ${invoice.invoice_number} marcata ca platita.`);
      setOpen(false);
      await onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Statusul platii nu a putut fi actualizat.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMarkUnpaid() {
    try {
      await updateInvoicePaymentStatus(invoice.id, { status: "neplatita" });
      toast.success(`Factura ${invoice.invoice_number} marcata ca neplatita.`);
      await onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Statusul platii nu a putut fi actualizat.",
      );
    }
  }

  if (state === "Platita") {
    return (
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            paymentBadgeStyles.Platita,
          )}
        >
          Platita
        </span>
        <button
          type="button"
          onClick={handleMarkUnpaid}
          className="text-left text-xs text-muted-foreground transition hover:text-foreground"
        >
          {invoice.payment_date ? formatDate(invoice.payment_date) : null}
          {invoice.payment_method ? ` · ${invoice.payment_method}` : null}
          {" · anuleaza"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium",
          paymentBadgeStyles[state],
        )}
      >
        {state}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            Marcheaza platita
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcheaza factura ca platita</DialogTitle>
            <DialogDescription>
              Factura {invoice.invoice_number} va fi marcata ca incasata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="payment-date">Data platii</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method">Metoda de plata</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              >
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Anuleaza
            </Button>
            <Button onClick={handleMarkPaid} disabled={isSubmitting || !paymentDate}>
              {isSubmitting ? "Se salveaza..." : "Confirma plata"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {state === "Restanta" && isRevenue ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          title="Copiaza un mesaj de reminder pentru client"
          onClick={handleCopyReminder}
        >
          <ClipboardCopy className="h-3 w-3" />
          Reminder
        </Button>
      ) : null}
    </div>
  );
}

function EInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [activeTab, setActiveTab] = useState<InvoiceTab>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [companyCui, setCompanyCui] = useState("");

  const stats = useMemo(() => {
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.payable_amount ?? 0), 0);
    const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.tax_amount ?? 0), 0);
    const overdueInvoices = invoices.filter(
      (invoice) => getPaymentBadgeState(invoice) === "Restanta",
    );
    const overdueTotal = overdueInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.payable_amount ?? 0),
      0,
    );

    return {
      total,
      vat,
      overdueCount: overdueInvoices.length,
      overdueTotal,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let result = invoices;

    if (activeTab === "processed") {
      result = result.filter((invoice) => normalizeStatus(invoice.status) === "Activ");
    } else if (activeTab === "recent") {
      result = result.filter((invoice) => isRecentDate(invoice.issue_date ?? invoice.created_at));
    }

    const query = searchQuery.trim().toLowerCase();

    if (query) {
      result = result.filter((invoice) => {
        const supplier = getRelationParty(invoice.suppliers);
        const customer = getRelationParty(invoice.customers);

        return [invoice.invoice_number, supplier?.name, customer?.name].some((value) =>
          value?.toLowerCase().includes(query),
        );
      });
    }

    return result;
  }, [activeTab, invoices, searchQuery]);

  function handleExportCsv() {
    if (filteredInvoices.length === 0) {
      toast.info("Nu exista facturi de exportat pentru filtrul curent.");
      return;
    }

    const rows = filteredInvoices.map(buildInvoiceCsvRow);

    downloadCsv(`facturi-immapp-${todayForFilename()}.csv`, invoiceCsvHeaders, rows);
    toast.success(`${filteredInvoices.length} facturi exportate.`);
  }

  function handleExportInvoiceCsv(invoice: InvoiceRow) {
    downloadCsv(
      `factura-${invoice.invoice_number || invoice.id}-${todayForFilename()}.csv`,
      invoiceCsvHeaders,
      [buildInvoiceCsvRow(invoice)],
    );
    toast.success(`Factura ${invoice.invoice_number} exportata.`);
  }

  async function loadInvoices() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getInvoices();
      setInvoices(data as unknown as InvoiceRow[]);
    } catch {
      setErrorMessage("Nu s-au putut incarca facturile.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
    getActiveCompanyCui()
      .then(setCompanyCui)
      .catch(() => setCompanyCui(""));

    const handleInvoiceImported = () => {
      loadInvoices();
    };

    window.addEventListener("immapp:invoice-imported", handleInvoiceImported);
    window.addEventListener("immapp:invoice-deleted", handleInvoiceImported);

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleInvoiceImported);
      window.removeEventListener("immapp:invoice-deleted", handleInvoiceImported);
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="e-Facturi"
        description="Urmareste facturile extrase din fisiere XML e-Factura si impactul lor financiar."
        actions={
          <>
            <Link to="/app/e-facturi/noua">
              <Button variant="outline" className="gap-2">
                <FileCode2 className="h-4 w-4" />
                Factura noua
              </Button>
            </Link>
            <UploadModal
              trigger={
                <Button className="gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Incarca e-Factura XML
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total facturi"
          value={String(invoices.length)}
          description="Facturi extrase din XML e-Factura"
          icon={<ReceiptText className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Valoare totala"
          value={formatRON(stats.total)}
          description="Total de plata cumulat"
          icon={<Wallet className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          title="TVA colectata"
          value={formatRON(stats.vat)}
          description="TVA identificata in facturi"
          icon={<Percent className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          title="Facturi restante"
          value={String(stats.overdueCount)}
          description={
            stats.overdueCount > 0
              ? `${formatRON(stats.overdueTotal)} neincasate dupa scadenta`
              : "Nicio factura restanta"
          }
          icon={<Timer className="h-5 w-5" />}
          tone={stats.overdueCount > 0 ? "rose" : "slate"}
        />
      </div>

      <InfoBanner icon={<FileCode2 className="h-4 w-4" />}>
        Facturile listate aici provin din XML e-Factura si alimenteaza dashboard-ul, documentele
        financiare si predictiile pe date reale.
      </InfoBanner>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <AdminPanel
        title="Lista facturi"
        description="Filtreaza si deschide rapid detaliile fiecarei facturi."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cauta factura sau partener..."
                className="h-8 w-56 bg-card pl-8 text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Sterge cautarea"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Button variant="outline" size="sm" className="bg-card" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
        contentClassName="p-0"
      >
        <div className="border-b border-border p-5">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InvoiceTab)}>
            <TabsList>
              <TabsTrigger value="all">Toate</TabsTrigger>
              <TabsTrigger value="processed">Procesate</TabsTrigger>
              <TabsTrigger value="recent">Recente</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se incarca facturile...
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="Nu exista facturi extrase"
            description="Incarca un XML e-Factura pentru a vedea facturile in acest tabel."
            icon={<FileCode2 className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numar factura</TableHead>
                  <TableHead>Furnizor</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Data emitere</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plata</TableHead>
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nu exista facturi pentru filtrul selectat.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const supplier = getRelationParty(invoice.suppliers);
                    const customer = getRelationParty(invoice.customers);

                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium text-foreground">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell>{supplier?.name ?? "Furnizor necunoscut"}</TableCell>
                        <TableCell>{customer?.name ?? "Client necunoscut"}</TableCell>
                        <TableCell>
                          {formatDate(invoice.issue_date ?? invoice.created_at)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatRON(Number(invoice.payable_amount ?? 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRON(Number(invoice.tax_amount ?? 0))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={normalizeStatus(invoice.status)} />
                        </TableCell>
                        <TableCell>
                          <PaymentCell
                            invoice={invoice}
                            companyCui={companyCui}
                            onUpdated={loadInvoices}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              title="Vezi factura"
                              aria-label={`Vezi factura ${invoice.invoice_number}`}
                              asChild
                            >
                              <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Actiuni"
                                  aria-label={`Actiuni pentru factura ${invoice.invoice_number}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                                    Detalii factura
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportInvoiceCsv(invoice)}>
                                  Export CSV
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

const invoiceCsvHeaders = [
  "Numar factura",
  "Data emiterii",
  "Furnizor",
  "CUI furnizor",
  "Client",
  "CUI client",
  "Valoare fara TVA",
  "TVA",
  "Total de plata",
  "Moneda",
  "Status",
  "Status plata",
  "Data platii",
  "Metoda de plata",
];

function buildInvoiceCsvRow(invoice: InvoiceRow) {
  const supplier = getRelationParty(invoice.suppliers);
  const customer = getRelationParty(invoice.customers);

  return [
    invoice.invoice_number,
    formatDate(invoice.issue_date),
    supplier?.name ?? "",
    supplier?.cui ?? "",
    customer?.name ?? "",
    customer?.cui ?? "",
    Number(invoice.tax_exclusive_amount ?? 0).toFixed(2),
    Number(invoice.tax_amount ?? 0).toFixed(2),
    Number(invoice.payable_amount ?? 0).toFixed(2),
    invoice.currency ?? "RON",
    normalizeStatus(invoice.status),
    getPaymentBadgeState(invoice),
    invoice.payment_date ? formatDate(invoice.payment_date) : "",
    invoice.payment_method ?? "",
  ];
}

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function normalizeStatus(status: string | null | undefined): "Activ" | "Inactiv" {
  if (status === "eroare" || status === "Eroare") {
    return "Inactiv";
  }

  return "Activ";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isRecentDate(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}
