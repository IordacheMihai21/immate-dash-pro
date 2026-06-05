import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { UploadModal } from "@/components/upload-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileCode2, Info, Loader2 } from "lucide-react";
import { formatRON } from "@/lib/mock-data";
import { getInvoices } from "@/lib/invoiceService";

export const Route = createFileRoute("/app/e-facturi/")({
  head: () => ({ meta: [{ title: "e-Facturi — IMMapp" }] }),
  component: EInvoicesPage,
});

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

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Activ" as any;
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ" as any;
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv" as any;
  }

  return "Activ" as any;
}

function EInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadInvoices() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getInvoices();

      setInvoices(data as unknown as InvoiceRow[]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la citirea facturilor.";

      setErrorMessage(message);
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

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleInvoiceImported);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="e-Facturi"
        description="Facturi importate din fisiere XML conforme structurii e-Factura."
        actions={
          <UploadModal
            trigger={
              <Button size="lg" className="gap-2">
                <FileCode2 className="h-4 w-4" />
                Importa e-Factura XML
              </Button>
            }
          />
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-foreground">
          Datele sunt extrase automat din fisierul XML, salvate in baza de date si utilizate
          ulterior pentru indicatorii financiari si dashboard-ul BI.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca facturile din baza de date...
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nu exista inca facturi salvate in baza de date.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Apasa pe „Importa e-Factura XML” pentru a incarca primul document.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr. factura</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Furnizor</TableHead>
                  <TableHead>CUI furnizor</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>CUI client</TableHead>
                  <TableHead className="text-right">Valoare fara TVA</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {invoices.map((invoice) => {
                  const supplier = getRelationParty(invoice.suppliers);
                  const customer = getRelationParty(invoice.customers);

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoice_number}
                      </TableCell>

                      <TableCell>{invoice.issue_date ?? "-"}</TableCell>

                      <TableCell>
                        {supplier?.name ?? "Furnizor necunoscut"}
                      </TableCell>

                      <TableCell className="font-mono text-xs">
                        {supplier?.cui ?? "-"}
                      </TableCell>

                      <TableCell>
                        {customer?.name ?? "Client necunoscut"}
                      </TableCell>

                      <TableCell className="font-mono text-xs">
                        {customer?.cui ?? "-"}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {formatRON(Number(invoice.tax_exclusive_amount ?? 0))}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {formatRON(Number(invoice.tax_amount ?? 0))}
                      </TableCell>

                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatRON(Number(invoice.payable_amount ?? 0))}
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={normalizeStatus(invoice.status)} />
                      </TableCell>

                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to="/app/e-facturi/$id"
                            params={{ id: invoice.id }}
                          >
                            Vezi
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}