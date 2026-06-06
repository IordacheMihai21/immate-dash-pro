import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadModal } from "@/components/upload-modal";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Loader2, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { formatRON } from "@/lib/mock-data";
import { getDocuments } from "@/lib/invoiceService";

export const Route = createFileRoute("/app/documente")({
  head: () => ({ meta: [{ title: "Documente — IMMapp" }] }),
  component: DocumentsPage,
});

type InvoiceRelation =
  | {
      id: string | null;
      invoice_number: string | null;
      payable_amount: number | null;
    }
  | {
      id: string | null;
      invoice_number: string | null;
      payable_amount: number | null;
    }[]
  | null
  | undefined;

type DocumentRow = {
  id: string;
  file_name: string;
  file_type: string;
  document_type: string;
  status: string | null;
  uploaded_at: string | null;
  processed_at: string | null;
  invoices?: InvoiceRelation;
};

function getInvoice(invoice: InvoiceRelation) {
  if (!invoice) {
    return null;
  }

  if (Array.isArray(invoice)) {
    return invoice[0] ?? null;
  }

  return invoice;
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

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return "-";
  }

  return dateValue.slice(0, 10);
}

function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDocuments() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getDocuments();
      setDocuments(data as unknown as DocumentRow[]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la citirea documentelor.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();

    const handleInvoiceImported = () => {
      loadDocuments();
    };

    window.addEventListener("immapp:invoice-imported", handleInvoiceImported);

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleInvoiceImported);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Documente"
        description="Toate documentele financiare incarcate si procesate in platforma."
        actions={
          <UploadModal
            trigger={
              <Button size="lg" className="gap-2">
                <UploadCloud className="h-4 w-4" />
                Incarca document
              </Button>
            }
          />
        }
      />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-medium">
                Incarca documente financiare pentru procesare automata
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                In aceasta versiune este functional importul XML e-Factura.
              </p>
            </div>

            <UploadModal
              trigger={
                <Button variant="outline" size="sm">
                  Selecteaza fisier XML
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

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
              Se incarca documentele din baza de date...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nu exista inca documente salvate in baza de date.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Incarca primul XML e-Factura pentru a popula aceasta sectiune.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Nume fisier</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Factura asociata</TableHead>
                  <TableHead>Data incarcarii</TableHead>
                  <TableHead>Procesat la</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valoare</TableHead>
                  <TableHead className="w-40 text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {documents.map((document) => {
                  const invoice = getInvoice(document.invoices);

                  return (
                    <TableRow key={document.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {document.id.slice(0, 8)}
                      </TableCell>

                      <TableCell className="font-medium">
                        {document.file_name}
                      </TableCell>

                      <TableCell>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {document.document_type}
                        </span>
                      </TableCell>

                      <TableCell>
                        {invoice?.invoice_number ?? "-"}
                      </TableCell>

                      <TableCell>{formatDate(document.uploaded_at)}</TableCell>

                      <TableCell>{formatDate(document.processed_at)}</TableCell>

                      <TableCell>
                        <StatusBadge status={normalizeStatus(document.status)} />
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {invoice?.payable_amount
                          ? formatRON(Number(invoice.payable_amount))
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {invoice?.id ? (
                            <Button variant="ghost" size="sm" title="Vezi" asChild>
                              <Link
                                to="/app/e-facturi/$id"
                                params={{ id: invoice.id }}
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" title="Vezi" disabled>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}

                          <Button variant="ghost" size="sm" title="Reproceseaza" disabled>
                            <RotateCcw className="h-4 w-4" />
                          </Button>

                          <Button variant="ghost" size="sm" title="Sterge" disabled>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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