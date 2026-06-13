import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Eye,
  Loader2,
  Network,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AdminPanel, EmptyState, InfoBanner } from "@/components/admin-ui";
import { DocumentAiEvaluation } from "@/components/document-ai-evaluation";
import {
  DocumentAiUpload,
  toDocumentAiEditableFields,
  type DocumentAiEditableFields,
} from "@/components/document-ai-upload";
import { LayoutAiAnalysis } from "@/components/layout-ai-analysis";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadModal } from "@/components/upload-modal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteDocument, deleteDocuments, getDocuments } from "@/lib/invoiceService";
import type { DocumentAiAnalysis, DocumentAiFieldKey } from "@/lib/documentAiService";
import {
  hasEvaluationFields,
  parseFaturaAnnotationToExpected,
  type BatchEvaluationResult,
  type DocumentAiEvaluationFields,
} from "@/lib/documentAiEvaluationService";
import { formatRON } from "@/lib/mock-data";
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

const DOCUMENT_AI_ANALYSIS_KEY = "immapp:document-ai:last-analysis";
const DOCUMENT_AI_FILE_NAME_KEY = "immapp:document-ai:last-file-name";
const DOCUMENT_AI_FIELDS_KEY = "immapp:document-ai:last-fields";
const DOCUMENT_AI_VERIFIED_FIELDS_KEY = "immapp:document-ai:last-verified-fields";
const DOCUMENT_AI_PREDICTED_TEXT_KEY = "immapp:document-ai:last-predicted-text";
const FATURA_ANNOTATION_KEY = "immapp:document-ai:last-fatura-annotation";
const FATURA_EXPECTED_KEY = "immapp:document-ai:last-fatura-expected";
const EVALUATION_KEY = "immapp:document-ai:last-evaluation";

function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [latestDocumentAiAnalysis, setLatestDocumentAiAnalysis] =
    useState<DocumentAiAnalysis | null>(null);
  const [latestDocumentAiFields, setLatestDocumentAiFields] =
    useState<DocumentAiEditableFields | null>(null);
  const [latestDocumentAiVerifiedFields, setLatestDocumentAiVerifiedFields] = useState<
    DocumentAiFieldKey[]
  >([]);
  const [latestEvaluationPredictedText, setLatestEvaluationPredictedText] = useState("");
  const [latestFaturaAnnotationRaw, setLatestFaturaAnnotationRaw] = useState("");
  const [latestFaturaExpectedFields, setLatestFaturaExpectedFields] =
    useState<DocumentAiEvaluationFields | null>(null);
  const [latestEvaluationResults, setLatestEvaluationResults] =
    useState<BatchEvaluationResult | null>(null);

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
    } catch {
      setErrorMessage("Nu s-au putut incarca documentele financiare.");
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
    } catch {
      toast.error("Documentul nu a putut fi sters. Incearca din nou.");
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
    } catch {
      toast.error("Documentele selectate nu au putut fi sterse. Incearca din nou.");
    } finally {
      setIsDeletingSelected(false);
    }
  }

  const handleDocumentAiAnalysisChange = useCallback((analysis: DocumentAiAnalysis | null) => {
    setLatestDocumentAiAnalysis(analysis);

    if (!analysis) {
      removeStorageKeys([DOCUMENT_AI_ANALYSIS_KEY, DOCUMENT_AI_FILE_NAME_KEY]);
      return;
    }

    const predictedText = JSON.stringify(analysis.fields, null, 2);
    setLatestEvaluationPredictedText(predictedText);
    writeStoredJson(DOCUMENT_AI_ANALYSIS_KEY, analysis);
    writeStoredText(DOCUMENT_AI_FILE_NAME_KEY, analysis.fileName);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, predictedText);
  }, []);

  const handleDocumentAiFieldsChange = useCallback((fields: DocumentAiEditableFields | null) => {
    setLatestDocumentAiFields(fields);

    if (!fields) {
      removeStorageKeys([DOCUMENT_AI_FIELDS_KEY]);
      return;
    }

    const predictedText = JSON.stringify(fields, null, 2);
    setLatestEvaluationPredictedText(predictedText);
    writeStoredJson(DOCUMENT_AI_FIELDS_KEY, fields);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, predictedText);
  }, []);

  const handleDocumentAiVerifiedFieldsChange = useCallback((fields: DocumentAiFieldKey[]) => {
    const uniqueFields = Array.from(new Set(fields));
    setLatestDocumentAiVerifiedFields(uniqueFields);
    writeStoredJson(DOCUMENT_AI_VERIFIED_FIELDS_KEY, uniqueFields);
  }, []);

  const clearDocumentAiAnalysis = useCallback(() => {
    setLatestDocumentAiAnalysis(null);
    setLatestDocumentAiFields(null);
    setLatestDocumentAiVerifiedFields([]);
    setLatestEvaluationPredictedText("");
    removeStorageKeys([
      DOCUMENT_AI_ANALYSIS_KEY,
      DOCUMENT_AI_FILE_NAME_KEY,
      DOCUMENT_AI_FIELDS_KEY,
      DOCUMENT_AI_VERIFIED_FIELDS_KEY,
      DOCUMENT_AI_PREDICTED_TEXT_KEY,
    ]);
  }, []);

  const handleEvaluationPredictedTextChange = useCallback((value: string) => {
    setLatestEvaluationPredictedText(value);
    writeStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY, value);
  }, []);

  const handleFaturaAnnotationChange = useCallback((value: string) => {
    setLatestFaturaAnnotationRaw(value);

    if (!value.trim()) {
      removeStorageKeys([FATURA_ANNOTATION_KEY]);
      return;
    }

    writeStoredText(FATURA_ANNOTATION_KEY, value);
  }, []);

  const handleFaturaExpectedFieldsChange = useCallback(
    (fields: DocumentAiEvaluationFields | null) => {
      setLatestFaturaExpectedFields(fields);

      if (!fields) {
        removeStorageKeys([FATURA_EXPECTED_KEY]);
        return;
      }

      writeStoredJson(FATURA_EXPECTED_KEY, fields);
    },
    [],
  );

  const handleEvaluationResultsChange = useCallback((result: BatchEvaluationResult | null) => {
    setLatestEvaluationResults(result);

    if (!result) {
      removeStorageKeys([EVALUATION_KEY]);
      return;
    }

    writeStoredJson(EVALUATION_KEY, result);
  }, []);

  const clearFaturaAnnotation = useCallback(() => {
    setLatestFaturaAnnotationRaw("");
    setLatestFaturaExpectedFields(null);
    setLatestEvaluationResults(null);
    removeStorageKeys([FATURA_ANNOTATION_KEY, FATURA_EXPECTED_KEY, EVALUATION_KEY]);
  }, []);

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

  useEffect(() => {
    const storedAnalysis = readStoredJson<DocumentAiAnalysis>(DOCUMENT_AI_ANALYSIS_KEY);
    const storedFields = readStoredJson<DocumentAiEditableFields>(DOCUMENT_AI_FIELDS_KEY);
    const storedVerifiedFields = readStoredJson<DocumentAiFieldKey[]>(
      DOCUMENT_AI_VERIFIED_FIELDS_KEY,
    );
    const storedPredictedText = readStoredText(DOCUMENT_AI_PREDICTED_TEXT_KEY);
    const storedAnnotation = readStoredText(FATURA_ANNOTATION_KEY);
    const storedExpected = readStoredJson<DocumentAiEvaluationFields>(FATURA_EXPECTED_KEY);
    const storedEvaluation = readStoredJson<BatchEvaluationResult>(EVALUATION_KEY);

    if (storedAnalysis) {
      setLatestDocumentAiAnalysis(storedAnalysis);
      setLatestDocumentAiFields(storedFields ?? toDocumentAiEditableFields(storedAnalysis.fields));
    } else if (storedFields) {
      setLatestDocumentAiFields(storedFields);
    }

    if (Array.isArray(storedVerifiedFields)) {
      setLatestDocumentAiVerifiedFields(storedVerifiedFields);
    }

    if (storedPredictedText) {
      setLatestEvaluationPredictedText(storedPredictedText);
    }

    if (storedAnnotation) {
      setLatestFaturaAnnotationRaw(storedAnnotation);
    }

    if (storedExpected && hasEvaluationFields(storedExpected)) {
      setLatestFaturaExpectedFields(storedExpected);
    } else if (storedAnnotation) {
      const parsed = parseStoredFaturaExpectedFields(storedAnnotation);

      if (parsed) {
        setLatestFaturaExpectedFields(parsed);
        writeStoredJson(FATURA_EXPECTED_KEY, parsed);
      }
    }

    if (storedEvaluation) {
      setLatestEvaluationResults(storedEvaluation);
    }
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documente financiare"
        description="Incarca documente XML e-Factura sau analizeaza facturi PDF si imagini cu Document AI."
        actions={
          <UploadModal
            trigger={
              <Button className="gap-2">
                <UploadCloud className="h-4 w-4" />
                Incarca e-Factura XML
              </Button>
            }
          />
        }
      />

      <Tabs defaultValue="xml" className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="xml" className="gap-2 rounded-xl px-4 py-2">
            <UploadCloud className="h-4 w-4" />
            e-Factura XML
          </TabsTrigger>
          <TabsTrigger value="document-ai" className="gap-2 rounded-xl px-4 py-2">
            <BrainCircuit className="h-4 w-4" />
            Document AI
          </TabsTrigger>
          <TabsTrigger value="evaluare-ai" className="gap-2 rounded-xl px-4 py-2">
            <BarChart3 className="h-4 w-4" />
            Evaluare AI
          </TabsTrigger>
          <TabsTrigger value="layout-ai" className="gap-2 rounded-xl px-4 py-2">
            <Network className="h-4 w-4" />
            Layout AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="xml" className="space-y-6">
          <InfoBanner icon={<ShieldCheck className="h-4 w-4" />}>
            Fluxul XML e-Factura ramane sursa structurata principala pentru dashboard, rapoarte si
            predictiile AI.
          </InfoBanner>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <AdminPanel
            title="Documente incarcate"
            description="Selecteaza, verifica si gestioneaza documentele financiare procesate."
            action={
              selectedCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
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
              <div className="flex min-h-[280px] items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Se incarca documentele...
              </div>
            ) : documents.length === 0 ? (
              <EmptyState
                title="Nu exista documente incarcate"
                description="Incarca primul XML e-Factura sau analizeaza o factura PDF/imagine pentru a alimenta istoricul financiar."
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
                          className="h-4 w-4 rounded border-slate-300"
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
                        <TableRow key={document.id} className={cn(isSelected && "bg-blue-50/60")}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleDocumentSelection(document.id)}
                              className="h-4 w-4 rounded border-slate-300"
                              aria-label={`Selecteaza documentul ${document.file_name}`}
                            />
                          </TableCell>

                          <TableCell>
                            <div className="font-medium text-slate-900">{document.file_name}</div>
                            <div className="text-xs text-slate-500">
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
                            {invoice?.payable_amount
                              ? formatRON(Number(invoice.payable_amount))
                              : "-"}
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
        </TabsContent>

        <TabsContent value="document-ai" className="space-y-6">
          <InfoBanner icon={<BrainCircuit className="h-4 w-4" />} tone="emerald">
            Document AI este separat de importul XML si este folosit pentru facturi PDF sau imagini
            care necesita extragere din text ne-structurat.
          </InfoBanner>

          <DocumentAiUpload
            analysis={latestDocumentAiAnalysis}
            editableFields={latestDocumentAiFields}
            verifiedFields={latestDocumentAiVerifiedFields}
            onInvoiceSaved={loadDocuments}
            onAnalysisChange={handleDocumentAiAnalysisChange}
            onEditableFieldsChange={handleDocumentAiFieldsChange}
            onVerifiedFieldsChange={handleDocumentAiVerifiedFieldsChange}
            onClearAnalysis={clearDocumentAiAnalysis}
          />
        </TabsContent>

        <TabsContent value="evaluare-ai" className="space-y-6">
          <DocumentAiEvaluation
            analysis={latestDocumentAiAnalysis}
            predictedText={latestEvaluationPredictedText}
            expectedText={latestFaturaAnnotationRaw}
            expectedFields={latestFaturaExpectedFields}
            result={latestEvaluationResults}
            onPredictedTextChange={handleEvaluationPredictedTextChange}
            onExpectedTextChange={handleFaturaAnnotationChange}
            onExpectedFieldsChange={handleFaturaExpectedFieldsChange}
            onResultChange={handleEvaluationResultsChange}
            onClearAnnotation={clearFaturaAnnotation}
          />
        </TabsContent>

        <TabsContent value="layout-ai" className="space-y-6">
          <LayoutAiAnalysis />
        </TabsContent>
      </Tabs>
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

function readStoredText(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStoredText(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function readStoredJson<T>(key: string): T | null {
  const value = readStoredText(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  writeStoredText(key, JSON.stringify(value));
}

function removeStorageKeys(keys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function parseStoredFaturaExpectedFields(value: string): DocumentAiEvaluationFields | null {
  try {
    const parsed = parseFaturaAnnotationToExpected(JSON.parse(value));

    return hasEvaluationFields(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
