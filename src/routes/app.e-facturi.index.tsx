import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { getInvoices } from "@/lib/invoiceService";
import { formatRON } from "@/lib/formatters";
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

function EInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [activeTab, setActiveTab] = useState<InvoiceTab>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const stats = useMemo(() => {
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.payable_amount ?? 0), 0);
    const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.tax_amount ?? 0), 0);
    const processed = invoices.filter(
      (invoice) => normalizeStatus(invoice.status) === "Activ",
    ).length;

    return {
      total,
      vat,
      processed,
      processingRate: invoices.length > 0 ? Math.round((processed / invoices.length) * 100) : 0,
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
          title="Status procesare"
          value={`${stats.processingRate}%`}
          description={`${stats.processed} facturi procesate`}
          icon={<Timer className="h-5 w-5" />}
          tone="slate"
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
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
