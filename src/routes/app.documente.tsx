import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  AlertTriangle,
  Eye,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { formatRON } from "@/lib/mock-data";
import {
  deleteDocument,
  deleteDocuments,
  getDocuments,
} from "@/lib/invoiceService";

export const Route = createFileRoute("/app/documente")({
  head: () => ({ meta: [{ title: "Documente — IMMapp" }] }),
  component: DocumentsPage,
});

type InvoiceItem = {
  id: string | null;
  invoice_number: string | null;
  payable_amount: number | null;
};

type InvoiceRelation = InvoiceItem | InvoiceItem[] | null | undefined;

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

function getInvoice(invoice: InvoiceRelation): InvoiceItem | null {
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

function markFinancialDataChanged() {
  localStorage.setItem("immapp:ai-forecast-status", "outdated");

  window.dispatchEvent(new Event("immapp:invoice-deleted"));
  window.dispatchEvent(new Event("immapp:ai-forecast-outdated"));
}

function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCount = selectedDocumentIds.length;

  const allVisibleDocumentsSelected = useMemo(() => {
    return (
      documents.length > 0 &&
      documents.every((document) => selectedDocumentIds.includes(document.id))
    );
  }, [documents, selectedDocumentIds]);

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

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) => {
      if (current.includes(documentId)) {
        return current.filter((id) => id !== documentId);
      }

      return [...current, documentId];
    });
  }

  function toggleAllDocuments() {
    if (allVisibleDocumentsSelected) {
      setSelectedDocumentIds([]);
      return;
    }

    setSelectedDocumentIds(documents.map((document) => document.id));
  }

  async function handleDeleteSingleDocument(documentId: string, fileName: string) {
    const confirmed = window.confirm(
      `Sigur vrei sa stergi documentul "${fileName}"?\n\nDatele asociate acestui document vor fi eliminate din dashboard, e-Facturi si predictii.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingDocumentId(documentId);

      await deleteDocument(documentId);

      setSelectedDocumentIds((current) => current.filter((id) => id !== documentId));
      markFinancialDataChanged();

      toast.success("Documentul a fost sters. Indicatorii financiari au fost actualizati.");

      await loadDocuments();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Documentul nu a putut fi sters.";

      toast.error(message);
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleDeleteSelectedDocuments() {
    if (selectedDocumentIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Sigur vrei sa stergi ${selectedDocumentIds.length} documente selectate?\n\nDatele asociate vor fi eliminate din dashboard, e-Facturi si predictii.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingSelected(true);

      await deleteDocuments(selectedDocumentIds);

      setSelectedDocumentIds([]);
      markFinancialDataChanged();

      toast.success("Documentele selectate au fost sterse. Dashboard-ul a fost actualizat.");

      await loadDocuments();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Documentele selectate nu au putut fi sterse.";

      toast.error(message);
    } finally {
      setIsDeletingSelected(false);
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
    <div className="space-y-6">
      <PageHeader
        title="Documente"
        description="Incarca, vizualizeaza si gestioneaza documentele financiare procesate in IMMapp."
        actions={
          <UploadModal
            trigger={
              <Button>
                <UploadCloud className="mr-2 h-4 w-4" />
                Incarca document
              </Button>
            }
          />
        }
      />

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Documente incarcate</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gestioneaza fisierele incarcate si datele extrase automat din acestea.
              </p>
            </div>

            {selectedCount > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                  {selectedCount} documente selectate
                </div>

                <Button
                  variant="destructive"
                  onClick={handleDeleteSelectedDocuments}
                  disabled={isDeletingSelected}
                >
                  {isDeletingSelected ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Sterge selectate
                </Button>
              </div>
            )}
          </div>

          {selectedCount > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <p className="text-muted-foreground">
                Stergerea documentelor va actualiza dashboard-ul si va marca predictiile AI ca
                necesitand actualizare.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {errorMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex min-h-[260px] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca documentele...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>

              <h2 className="text-lg font-semibold">Nu exista documente incarcate</h2>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Incarca primul document e-Factura XML pentru a incepe procesarea datelor
                financiare.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <input
                      type="checkbox"
                      checked={allVisibleDocumentsSelected}
                      onChange={toggleAllDocuments}
                      className="h-4 w-4 rounded border-border"
                      aria-label="Selecteaza toate documentele"
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Nume fisier</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Factura asociata</TableHead>
                  <TableHead>Data incarcarii</TableHead>
                  <TableHead>Procesat la</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valoare</TableHead>
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {documents.map((document) => {
                  const invoice = getInvoice(document.invoices);
                  const isSelected = selectedDocumentIds.includes(document.id);
                  const isDeletingThisDocument = deletingDocumentId === document.id;

                  return (
                    <TableRow key={document.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDocumentSelection(document.id)}
                          className="h-4 w-4 rounded border-border"
                          aria-label={`Selecteaza documentul ${document.file_name}`}
                        />
                      </TableCell>

                      <TableCell className="font-mono text-xs">
                        {document.id.slice(0, 8)}
                      </TableCell>

                      <TableCell className="font-medium">{document.file_name}</TableCell>

                      <TableCell>{document.document_type}</TableCell>

                      <TableCell>{invoice?.invoice_number ?? "-"}</TableCell>

                      <TableCell>{formatDate(document.uploaded_at)}</TableCell>

                      <TableCell>{formatDate(document.processed_at)}</TableCell>

                      <TableCell>
                        <StatusBadge status={normalizeStatus(document.status)} />
                      </TableCell>

                      <TableCell>
                        {invoice?.payable_amount
                          ? formatRON(Number(invoice.payable_amount))
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {invoice?.id ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                                <Eye className="mr-2 h-4 w-4" />
                                Vezi
                              </Link>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              <Eye className="mr-2 h-4 w-4" />
                              Vezi
                            </Button>
                          )}

<Button
  variant="destructive"
  size="icon"
  title="Sterge documentul"
  aria-label={`Sterge documentul ${document.file_name}`}
  onClick={() =>
    handleDeleteSingleDocument(document.id, document.file_name)
  }
  disabled={isDeletingThisDocument || isDeletingSelected}
>
  {isDeletingThisDocument ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Trash2 className="h-4 w-4" />
  )}
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