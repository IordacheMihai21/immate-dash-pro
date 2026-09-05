import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { AdminPanel, EmptyState, InfoBanner } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadModal } from "@/components/upload-modal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteDocument, deleteDocuments, getDocuments } from "@/lib/invoiceService";
import { formatRON } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/documente")({
  head: () => ({ meta: [{ title: "Documente financiare - IMMapp" }] }),
  component: DocumentsPage,
});

type InvoiceItem = {
  id: string | null;
  invoice_number: string | null;
  payable_amount: number | null;
};

type InvoiceRelation = InvoiceItem | InvoiceItem[] | null | undefined;
type StatusBadgeValue = Parameters<typeof StatusBadge>[0]["status"];

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
      setErrorMessage(
        error instanceof Error ? error.message : "Nu s-au putut incarca documentele financiare.",
      );
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
      await loadDocuments();

      setSelectedDocumentIds((current) => current.filter((id) => id !== documentId));
      markFinancialDataChanged();

      toast.success("Documentul a fost sters. Indicatorii financiari au fost actualizati.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Documentul nu a putut fi sters. Incearca din nou.",
      );
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
      await loadDocuments();

      setSelectedDocumentIds([]);
      markFinancialDataChanged();

      toast.success(
        "Documentele selectate au fost sterse. Indicatorii financiari au fost actualizati.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Documentele selectate nu au putut fi sterse. Incearca din nou.",
      );
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
        title="Documente financiare"
        description="Încarcă e-Facturi XML și gestionează documentele financiare importate."
        actions={
          <UploadModal
            trigger={
              <Button className="gap-2">
                <UploadCloud className="h-4 w-4" />
                Încarcă e-Factura XML
              </Button>
            }
          />
        }
      />

      <InfoBanner icon={<ShieldCheck className="h-4 w-4" />}>
        Fluxul XML e-Factura rămâne sursa structurată principală pentru dashboard, rapoarte și
        predicțiile financiare.
      </InfoBanner>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <AdminPanel
        title="Documente incarcate"
        description="Selecteaza, verifica si gestioneaza documentele financiare procesate."
        action={
          selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary">
                {selectedCount} selectate
              </span>
              <Button
                variant="destructive"
                onClick={handleDeleteSelectedDocuments}
                disabled={isDeletingSelected}
              >
                {isDeletingSelected ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Sterge selectate
              </Button>
            </div>
          ) : null
        }
        contentClassName="p-0"
      >
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se incarca documentele...
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            title="Nu exista documente incarcate"
            description="Încarcă primul XML e-Factura pentru a alimenta istoricul financiar."
            icon={<UploadCloud className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
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
                  <TableHead>Document</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Numar factura</TableHead>
                  <TableHead>Upload</TableHead>
                  <TableHead>Procesat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valoare</TableHead>
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {documents.map((document) => {
                  const invoice = getInvoice(document.invoices);
                  const isSelected = selectedDocumentIds.includes(document.id);
                  const isDeletingThisDocument = deletingDocumentId === document.id;

                  return (
                    <TableRow key={document.id} className={cn(isSelected && "bg-secondary/60")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDocumentSelection(document.id)}
                          className="h-4 w-4 rounded border-border"
                          aria-label={`Selecteaza documentul ${document.file_name}`}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="font-medium text-foreground">{document.file_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {getDocumentKindLabel(document)}
                        </div>
                      </TableCell>
                      <TableCell>{document.file_type?.toUpperCase() ?? "XML"}</TableCell>
                      <TableCell>{invoice?.invoice_number ?? "-"}</TableCell>
                      <TableCell>{formatDate(document.uploaded_at)}</TableCell>
                      <TableCell>{formatDate(document.processed_at)}</TableCell>
                      <TableCell>
                        <StatusBadge status={normalizeStatus(document.status)} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {invoice?.payable_amount ? formatRON(Number(invoice.payable_amount)) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            title="Vezi factura"
                            aria-label={`Vezi factura pentru ${document.file_name}`}
                            disabled={!invoice?.id}
                            asChild={Boolean(invoice?.id)}
                          >
                            {invoice?.id ? (
                              <Link to="/app/e-facturi/$id" params={{ id: invoice.id }}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>

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
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function getInvoice(invoice: InvoiceRelation): InvoiceItem | null {
  if (!invoice) {
    return null;
  }

  if (Array.isArray(invoice)) {
    return invoice[0] ?? null;
  }

  return invoice;
}

function normalizeStatus(status: string | null | undefined): StatusBadgeValue {
  if (!status) {
    return "Activ";
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ";
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv";
  }

  return "Activ";
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDocumentKindLabel(document: DocumentRow) {
  if (document.document_type === "document-ai") {
    return "Document AI";
  }

  return "XML e-Factura";
}

function markFinancialDataChanged() {
  localStorage.setItem("immapp:ai-forecast-status", "outdated");
  window.dispatchEvent(new Event("immapp:invoice-deleted"));
  window.dispatchEvent(new Event("immapp:ai-forecast-outdated"));
}
