import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  FileText,
  ImageIcon,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPanel, InfoBanner } from "@/components/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeInvoiceDocument,
  isSupportedDocumentAiFile,
  type DocumentAiAnalysis,
  type DocumentAiFieldKey,
} from "@/lib/documentAiService";
import {
  compareLayoutFieldValues,
  isCleanerLayoutProposal,
  analyzeLayoutWithBackend,
  checkLayoutAiHealth,
  type LayoutAiBackendResponse,
  type LayoutAiFields,
  type LayoutAiFieldDetail,
  type LayoutAiHealth,
  type LayoutAiStatus,
} from "@/lib/layoutAiService";
import { mergeLayoutXlmWithCandidateEngine } from "@/lib/layoutAiHybridMerge";
import { validateDocumentAiFile } from "@/lib/uploadValidation";
import { cn } from "@/lib/utils";
import {
  clearLayoutAiSession,
  loadLayoutAiSession,
  saveLayoutAiSession,
} from "@/lib/layoutAiSessionService";

const fieldLabels: Record<DocumentAiFieldKey, string> = {
  invoiceNumber: "Număr factură",
  invoiceDate: "Data factură",
  supplierName: "Furnizor",
  supplierCui: "CUI furnizor",
  customerName: "Client",
  customerCui: "CUI client",
  subtotal: "Valoare fără TVA",
  vatAmount: "TVA",
  totalAmount: "Total de plată",
  currency: "Monedă",
};

const fieldOrder = Object.keys(fieldLabels) as DocumentAiFieldKey[];

export function LayoutAiAnalysis({
  analysis,
  documentAiFields,
  verifiedFields,
  onApplyFields,
  onPreparedAnalysis,
}: {
  analysis: DocumentAiAnalysis | null;
  documentAiFields: Partial<Record<DocumentAiFieldKey, string>> | null;
  verifiedFields: DocumentAiFieldKey[];
  onApplyFields: (
    fields: LayoutAiFields,
    details: Record<DocumentAiFieldKey, LayoutAiFieldDetail>,
  ) => void;
  onPreparedAnalysis: (analysis: DocumentAiAnalysis, fields: LayoutAiFields) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionHydratedRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [health, setHealth] = useState<LayoutAiHealth | null>(null);
  const [result, setResult] = useState<LayoutAiBackendResponse | null>(null);
  const [message, setMessage] = useState("");
  const [processMessage, setProcessMessage] = useState("");
  const [comparisonFields, setComparisonFields] = useState<LayoutAiFields | null>(null);
  const hasLocalExtraction = Boolean(analysis?.extractedText || hasAnyField(documentAiFields));

  useEffect(() => {
    let active = true;
    void loadLayoutAiSession()
      .then((session) => {
        if (!active || !session) return;
        setSelectedFile(session.file);
        setResult(session.result);
        setComparisonFields(session.comparisonFields);
        setMessage(session.message);
      })
      .catch((error) => console.warn("Layout AI session could not be restored", error))
      .finally(() => {
        if (active) sessionHydratedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    void saveLayoutAiSession({
      file: selectedFile,
      result,
      comparisonFields,
      message,
    }).catch((error) => console.warn("Layout AI session could not be persisted", error));
  }, [comparisonFields, message, result, selectedFile]);

  useEffect(() => {
    if (!selectedFile || !isPreviewableImage(selectedFile)) {
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!isSupportedDocumentAiFile(file)) {
      toast.error("Selectează un fișier PDF, PNG, JPG sau JPEG.");
      event.currentTarget.value = "";
      return;
    }

    const sizeCheck = validateDocumentAiFile(file);

    if (!sizeCheck.ok) {
      toast.error(sizeCheck.reason);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setResult(null);
    setComparisonFields(null);
    setMessage("");
  }

  async function handleCheckBackend() {
    try {
      setIsCheckingHealth(true);
      setMessage("");
      const nextHealth = await checkLayoutAiHealth();

      setHealth(nextHealth);

      if (
        nextHealth.runtime_mode === "full_layoutxlm" ||
        nextHealth.runtime_mode === "layoutxlm_backbone"
      ) {
        toast.success("Serviciul Layout AI este activ.");
      } else {
        setMessage("Analiza layout este activă și pregătită pentru documente.");
        toast.info("Serviciul Layout AI este activ.");
      }
    } catch {
      const errorMessage = getBackendUnavailableMessage();
      setHealth(null);
      setMessage(errorMessage);
      toast.error("Modulul de analiză AI nu este pornit momentan.");
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function handleRunLayoutAnalysis() {
    if (!selectedFile && !hasLocalExtraction) {
      toast.error("Rulează mai întâi Document AI sau selectează un document pentru analiză.");
      return;
    }

    try {
      setIsRunning(true);
      setMessage("");
      let activeAnalysis = analysis;
      let activeFields = toLayoutFields(documentAiFields ?? analysis?.fields ?? null);
      const selectedFileNeedsOcr = Boolean(
        selectedFile &&
        (!activeAnalysis ||
          activeAnalysis.fileName !== selectedFile.name ||
          !activeAnalysis.extractedText.trim()),
      );

      if (selectedFileNeedsOcr && selectedFile) {
        setProcessMessage("Pregătim textul documentului pentru analiza layout...");
        try {
          activeAnalysis = await analyzeInvoiceDocument(selectedFile);
        } catch {
          throw new LayoutPreparationError();
        }
        activeFields = toLayoutFields(activeAnalysis.fields);
        onPreparedAnalysis(activeAnalysis, activeFields);
      }

      if (
        !activeAnalysis?.extractedText.trim() ||
        activeAnalysis.extractedText.trim().length < 20
      ) {
        throw new LayoutPreparationError();
      }

      setComparisonFields(activeFields);
      setProcessMessage("Analizăm structura documentului cu LayoutXLM...");
      const nextHealth = await checkLayoutAiHealth();
      setHealth(nextHealth);

      const backendResult = await analyzeLayoutWithBackend({
        file: selectedFile,
        ocrText: activeAnalysis.extractedText,
        ocrWords: activeAnalysis.ocrWords,
        documentAiFields: activeFields,
        verifiedFields,
      });

      const hybrid = mergeLayoutXlmWithCandidateEngine({
        candidateFields: activeFields,
        candidateConfidences: activeAnalysis.confidences,
        layoutFields: backendResult.fields,
        layoutConfidences: fieldOrder.reduce(
          (confidences, field) => {
            confidences[field] = backendResult.field_details[field]?.confidence ?? 0;
            return confidences;
          },
          {} as Partial<Record<DocumentAiFieldKey, number>>,
        ),
        layoutMethods: fieldOrder.reduce(
          (methods, field) => {
            methods[field] = backendResult.field_details[field]?.method ?? "";
            return methods;
          },
          {} as Partial<Record<DocumentAiFieldKey, string>>,
        ),
      });
      const nextResult: LayoutAiBackendResponse = {
        ...backendResult,
        fields: hybrid.fields,
        field_details: fieldOrder.reduce(
          (details, field) => {
            const backendDetail = backendResult.field_details[field];
            details[field] = {
              ...backendDetail,
              value: hybrid.fields[field],
              confidence: hybrid.confidences[field],
              method:
                hybrid.sources[field] === "candidate_engine"
                  ? "Candidate engine + LayoutXLM validation"
                  : backendDetail.method,
            };
            return details;
          },
          {} as Record<DocumentAiFieldKey, LayoutAiFieldDetail>,
        ),
      };

      setResult(nextResult);

      if (nextResult.status === "ok" && hasAnyField(nextResult.fields)) {
        toast.success("Analiza documentului a fost finalizată.");
      } else {
        const insufficientMessage =
          "Nu am putut extrage suficiente câmpuri din document. Verifică imaginea și încearcă din nou.";
        setMessage(insufficientMessage);
        toast.warning(insufficientMessage);
      }
    } catch (error) {
      if (error instanceof LayoutPreparationError) {
        setMessage(error.message);
        toast.error(error.message);
      } else {
        setMessage(getBackendUnavailableMessage());
        toast.error("Modulul de analiză AI nu este pornit momentan.");
      }
    } finally {
      setProcessMessage("");
      setIsRunning(false);
    }
  }

  function handleApplyFields() {
    if (!result) {
      return;
    }

    const currentFields = comparisonFields ?? toLayoutFields(documentAiFields);
    const applicableFields = getApplicableLayoutFields({
      result,
      currentFields,
      verifiedFields,
      documentConfidences: analysis?.confidences,
    });
    const appliedCount = countPopulatedFields(applicableFields);

    if (appliedCount === 0) {
      toast.info("Nu există propuneri mai sigure de aplicat automat.");
      return;
    }

    onApplyFields(applicableFields, result.field_details);
    toast.success(`${appliedCount} propuneri AI au fost aplicate câmpurilor neconfirmate.`);
  }

  function handleResetLayoutAnalysis() {
    setSelectedFile(null);
    setResult(null);
    setMessage("");
    setProcessMessage("");
    setComparisonFields(null);
    void clearLayoutAiSession().catch((error) =>
      console.warn("Layout AI session could not be cleared", error),
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    toast.info("Documentul și analiza Layout AI au fost șterse.");
  }

  const effectiveDocumentFields = comparisonFields ?? toLayoutFields(documentAiFields);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Analiză layout activă
            </div>
            <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
              Analiză inteligentă a structurii documentului
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-sidebar-foreground/80 sm:text-base">
              IMMapp folosește OCR și analiză layout-aware pentru a identifica, valida și confirma
              câmpurile importante din factură.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <HeroStatus label="Serviciu pregătit" active={Boolean(health)} />
            <HeroStatus
              label="Model AI disponibil"
              active={Boolean(health?.layout_model_available)}
            />
            <HeroStatus
              label="Analiză finalizată"
              active={Boolean(result)}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      <InfoBanner icon={<ShieldCheck className="h-4 w-4" />} tone="emerald">
        Propunerile completează analiza existentă, iar câmpurile deja confirmate rămân protejate.
      </InfoBanner>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <AdminPanel
          title="Analiză layout activă"
          description="Încarcă o factură sau continuă cu documentul procesat anterior."
          className="overflow-hidden rounded-3xl shadow-sm"
        >
          <div className="space-y-4">
            <BackendStatusCard health={health} message={message} />

            <div className="grid gap-3 sm:grid-cols-2">
              <ResultMetric label="Model AI" value={health?.model ?? "LayoutXLM"} />
              <ResultMetric
                label="Disponibilitate"
                value={health ? "Serviciu pregătit" : "De verificat"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="layout-ai-file">Document pentru analiză</Label>
              <Input
                ref={fileInputRef}
                id="layout-ai-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Încarcă o factură PDF sau imagine. IMMapp pregătește automat documentul pentru
                analiză.
              </p>
            </div>

            {selectedFile && (
              <UploadedDocumentCard
                file={selectedFile}
                previewUrl={previewUrl}
                status={result ? "Analiză finalizată" : "Pregătit pentru analiză"}
              />
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleCheckBackend}
                disabled={isCheckingHealth || isRunning}
                className="gap-2"
              >
                {isCheckingHealth ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Verifică disponibilitatea
              </Button>

              <Button
                onClick={handleRunLayoutAnalysis}
                disabled={isRunning || isCheckingHealth}
                className="gap-2"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                Analizează documentul
              </Button>

              {(selectedFile || result || message) && (
                <Button
                  variant="ghost"
                  onClick={handleResetLayoutAnalysis}
                  disabled={isRunning || isCheckingHealth}
                  className="gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {selectedFile ? "Șterge documentul" : "Resetează analiza"}
                </Button>
              )}
            </div>

            {processMessage && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary p-3 text-sm font-medium text-primary">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                {processMessage}
              </div>
            )}

            {message && (
              <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/20 p-4 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="whitespace-pre-line">{message}</p>
              </div>
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          title="Câmpuri identificate"
          description="Compară propunerile cu datele curente înainte de confirmare."
          className="overflow-hidden rounded-3xl shadow-sm"
        >
          {!result ? (
            <div className="flex min-h-[300px] items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Network className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-foreground">Analiza este pregătită</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Rulează analiza pentru a vedea câmpurile propuse și diferențele față de extracția
                  Document AI.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultMetric label="Analiză document" value={getStatusLabel(result.status)} />
                <ResultMetric
                  label="Câmpuri identificate"
                  value={String(countPopulatedFields(result.fields))}
                />
                <ResultMetric label="Încredere" value={formatConfidence(result.confidence)} />
              </div>

              <ComparisonSummary
                result={result}
                documentAiFields={effectiveDocumentFields}
                verifiedFields={verifiedFields}
              />

              <LayoutFieldsTable
                result={result}
                documentAiFields={effectiveDocumentFields}
                verifiedFields={verifiedFields}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleApplyFields}
                  disabled={!hasAnyField(result.fields)}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Aplică propunerile AI
                </Button>
              </div>
            </div>
          )}
        </AdminPanel>
      </div>

      {result && (
        <RecommendationsCard
          result={result}
          documentAiFields={effectiveDocumentFields}
          verifiedFields={verifiedFields}
        />
      )}
    </div>
  );
}

function UploadedDocumentCard({
  file,
  previewUrl,
  status,
}: {
  file: File;
  previewUrl: string;
  status: "Pregătit pentru analiză" | "Analiză finalizată";
}) {
  const isComplete = status === "Analiză finalizată";

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-secondary to-card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white bg-card text-primary shadow-sm">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Previzualizare ${file.name}`}
              className="h-full w-full object-cover"
            />
          ) : isPreviewableImage(file) ? (
            <ImageIcon className="h-6 w-6" />
          ) : (
            <FileText className="h-6 w-6" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Document încărcat
            </p>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full bg-card",
                isComplete ? "border-success/30 text-success" : "border-primary/30 text-primary",
              )}
            >
              {status}
            </Badge>
          </div>
          <p className="mt-1 truncate font-semibold text-foreground" title={file.name}>
            {file.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getFileTypeLabel(file)} · {formatFileSize(file.size)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BackendStatusCard({
  health,
  message,
}: {
  health: LayoutAiHealth | null;
  message: string;
}) {
  const isAvailable = Boolean(health?.layout_model_available);
  const isActive = Boolean(health);
  const modelInferenceAvailable = Boolean(health?.model_inference_available);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        isAvailable
          ? "border-success/30 bg-success/15"
          : isActive
            ? "border-warning/40 bg-warning/20"
            : "border-border bg-muted",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-xl p-3",
              isAvailable
                ? "bg-success/20 text-success"
                : isActive
                  ? "bg-warning/25 text-warning"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {isAvailable
                ? "Model AI disponibil"
                : isActive
                  ? "Serviciu pregătit"
                  : "Disponibilitate neverificată"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {modelInferenceAvailable
                ? "Analiza inteligentă este pregătită pentru document."
                : isActive
                  ? "Structura documentului poate fi analizată și comparată."
                  : message || "Verifică disponibilitatea înainte de prima analiză."}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full bg-card">
          {health?.model ?? "LayoutXLM"}
        </Badge>
      </div>
    </div>
  );
}

function LayoutFieldsTable({
  result,
  documentAiFields,
  verifiedFields,
}: {
  result: LayoutAiBackendResponse;
  documentAiFields: Partial<Record<DocumentAiFieldKey, string>> | null;
  verifiedFields: DocumentAiFieldKey[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Câmp</TableHead>
            <TableHead>Propunere AI</TableHead>
            <TableHead>Date curente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden 2xl:table-cell">Recomandare</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fieldOrder.map((field) => {
            const proposed = result.fields[field] ?? "";
            const current = documentAiFields?.[field] ?? "";
            const isVerified = verifiedFields.includes(field);
            const comparison = compareLayoutFieldValues(field, proposed, current);
            const status = isVerified ? "confirmed" : comparison.status;

            return (
              <TableRow key={field} className="hover:bg-muted">
                <TableCell className="whitespace-nowrap font-semibold text-foreground">
                  {fieldLabels[field]}
                </TableCell>
                <TableCell className="min-w-40 font-medium text-foreground">
                  {proposed || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="min-w-40 text-muted-foreground">
                  {current || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full",
                      status === "confirmed"
                        ? "border-success/30 bg-success/15 text-success"
                        : status === "review"
                          ? "border-warning/40 bg-warning/20 text-warning"
                          : status === "proposal"
                            ? "border-primary/30 bg-secondary text-primary"
                            : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {getComparisonStatusLabel(status)}
                  </Badge>
                </TableCell>
                <TableCell className="hidden max-w-60 text-sm text-muted-foreground 2xl:table-cell">
                  {getFieldRecommendation(status)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RecommendationsCard({
  result,
  documentAiFields,
  verifiedFields,
}: {
  result: LayoutAiBackendResponse;
  documentAiFields: LayoutAiFields;
  verifiedFields: DocumentAiFieldKey[];
}) {
  const recommendations = buildRecommendations(result, documentAiFields, verifiedFields);

  return (
    <AdminPanel
      title="Recomandări IMMapp"
      description="Pașii recomandați înainte de confirmarea datelor facturii."
      className="overflow-hidden rounded-3xl shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation}
            className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-4"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-sm leading-6 text-foreground">{recommendation}</p>
          </div>
        ))}
      </div>
    </AdminPanel>
  );
}

function buildRecommendations(
  result: LayoutAiBackendResponse,
  documentAiFields: LayoutAiFields,
  verifiedFields: DocumentAiFieldKey[],
) {
  const statuses = fieldOrder.reduce(
    (acc, field) => {
      acc[field] = verifiedFields.includes(field)
        ? "confirmed"
        : compareLayoutFieldValues(field, result.fields[field], documentAiFields[field]).status;
      return acc;
    },
    {} as Record<DocumentAiFieldKey, ReturnType<typeof compareLayoutFieldValues>["status"]>,
  );
  const recommendations: string[] = [];
  const dateComparison = compareLayoutFieldValues(
    "invoiceDate",
    result.fields.invoiceDate,
    documentAiFields.invoiceDate,
  );

  if (statuses.totalAmount === "confirmed") {
    recommendations.push("Totalul de plată este confirmat de analiza layout.");
  }
  if (dateComparison.status === "confirmed" && dateComparison.formatDifference) {
    recommendations.push(
      "Data facturii a fost recunoscută în format diferit, dar reprezintă aceeași valoare.",
    );
  }
  if (statuses.supplierName === "review" || statuses.customerName === "review") {
    recommendations.push("Furnizorul sau clientul necesită verificare manuală.");
  }
  if (statuses.vatAmount === "review") {
    recommendations.push("Valoarea TVA diferă între extracții și trebuie verificată.");
  }
  if (Object.values(statuses).some((status) => status === "missing")) {
    recommendations.push("Câmpurile lipsă pot fi completate manual înainte de salvare.");
  }
  if (Object.values(statuses).some((status) => status === "proposal")) {
    recommendations.push("Propunerile AI pot fi aplicate doar pentru câmpurile neconfirmate.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Datele identificate sunt coerente și pregătite pentru confirmare.");
  }

  return recommendations.slice(0, 5);
}

function TokenPreview({ result }: { result: LayoutAiBackendResponse }) {
  if (result.tokens.length === 0) {
    return null;
  }

  return (
    <details className="rounded-xl border border-border bg-muted p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
        Tokeni și poziții returnate
      </summary>
      <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Etichetă</TableHead>
              <TableHead>Bounding box</TableHead>
              <TableHead className="text-right">Încredere</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.tokens.slice(0, 40).map((token, index) => (
              <TableRow key={`${token.text}-${index}`}>
                <TableCell className="font-medium">{token.text}</TableCell>
                <TableCell>{token.label ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {token.bbox
                    ? `${token.bbox.x}, ${token.bbox.y}, ${token.bbox.width}, ${token.bbox.height}`
                    : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatConfidence(token.confidence)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function TechnicalDetails({
  health,
  result,
  backendUrl,
  technicalError,
}: {
  health: LayoutAiHealth | null;
  result: LayoutAiBackendResponse | null;
  backendUrl: string;
  technicalError: string;
}) {
  const runtimeMode = result?.runtime_mode ?? health?.runtime_mode;
  const fallbackReason = result?.fallback_reason ?? health?.fallback_reason;
  const notes = result?.notes ?? health?.notes ?? [];

  return (
    <details className="rounded-xl border border-border bg-muted p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
        Detalii tehnice
      </summary>
      <div className="mt-4 space-y-4 text-sm text-muted-foreground">
        <dl className="grid gap-3 sm:grid-cols-2">
          <TechnicalItem label="Model" value={result?.model ?? health?.model ?? "LayoutXLM"} />
          <TechnicalItem
            label="Model id"
            value={result?.model_id ?? health?.model_id ?? "microsoft/layoutxlm-base"}
          />
          <TechnicalItem label="Runtime mode" value={runtimeMode ?? "neverificat"} />
          <TechnicalItem label="Backend URL" value={backendUrl} />
          <TechnicalItem label="Metodă extracție" value={result?.field_extraction_method ?? "-"} />
          <TechnicalItem
            label="Model inference executed"
            value={result?.model_inference_executed ? "true" : "false"}
          />
          <TechnicalItem
            label="Dispozitiv"
            value={result?.technical.device ?? health?.device ?? "cpu"}
          />
        </dl>

        {runtimeMode === "layoutxlm_backbone" && (
          <p className="rounded-lg border border-success/30 bg-success/15 p-3 text-success">
            Model LayoutXLM încărcat. Se folosește backbone-ul LayoutXLM împreună cu extracția
            layout-aware pentru câmpurile de factură.
          </p>
        )}
        {runtimeMode === "full_layoutxlm" && (
          <p className="rounded-lg border border-success/30 bg-success/15 p-3 text-success">
            Modelul LayoutXLM cu clasificare de tokeni este încărcat și produce predicții de
            entități.
          </p>
        )}
        {runtimeMode === "fallback_layout_aware" && (
          <p className="rounded-lg border border-warning/40 bg-warning/20 p-3 text-warning">
            Modelul LayoutXLM complet nu este disponibil local. Se folosește fallback layout-aware.
          </p>
        )}

        {fallbackReason && <TechnicalItem label="Motiv fallback" value={fallbackReason} />}
        {technicalError && <TechnicalItem label="Eroare serviciu" value={technicalError} />}

        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <ResultMetric label="tokens_count" value={String(result.technical.tokens_count)} />
            <ResultMetric label="words_count" value={String(result.technical.words_count)} />
            <ResultMetric label="boxes_count" value={String(result.technical.boxes_count)} />
          </div>
        )}

        {notes.length > 0 && (
          <div>
            <p className="font-medium text-foreground">Note tehnice</p>
            <ul className="mt-2 space-y-1">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {result && <TokenPreview result={result} />}

        {result && (
          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="cursor-pointer font-medium text-foreground">Răspuns JSON</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

function TechnicalItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function HeroStatus({
  label,
  active,
  className,
}: {
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-36 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-medium text-white backdrop-blur",
        className,
      )}
    >
      {active ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {label}
    </div>
  );
}

function ComparisonSummary({
  result,
  documentAiFields,
  verifiedFields,
}: {
  result: LayoutAiBackendResponse;
  documentAiFields: LayoutAiFields;
  verifiedFields: DocumentAiFieldKey[];
}) {
  const counts = fieldOrder.reduce(
    (summary, field) => {
      const status = verifiedFields.includes(field)
        ? "confirmed"
        : compareLayoutFieldValues(field, result.fields[field], documentAiFields[field]).status;
      summary[status] += 1;
      return summary;
    },
    { confirmed: 0, proposal: 0, review: 0, missing: 0 },
  );
  const items = [
    { label: "Câmpuri confirmate", value: counts.confirmed, tone: "emerald" },
    { label: "Câmpuri propuse", value: counts.proposal, tone: "blue" },
    { label: "Câmpuri de verificat", value: counts.review, tone: "amber" },
    { label: "Câmpuri lipsă", value: counts.missing, tone: "rose" },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-xl border px-3 py-3",
            item.tone === "emerald" && "border-success/20 bg-success/15",
            item.tone === "blue" && "border-primary/20 bg-secondary",
            item.tone === "amber" && "border-warning/25 bg-warning/20",
            item.tone === "rose" && "border-destructive/20 bg-destructive/15",
          )}
        >
          <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function getFieldRecommendation(status: ReturnType<typeof compareLayoutFieldValues>["status"]) {
  const recommendations = {
    confirmed: "Valoare coerentă; poate fi confirmată.",
    proposal: "Propunere nouă disponibilă pentru aplicare.",
    review: "Compară valorile înainte de confirmare.",
    missing: "Completează manual dacă informația există pe factură.",
  } as const;

  return recommendations[status];
}

function getStatusLabel(value: LayoutAiStatus) {
  const labels: Record<LayoutAiStatus, string> = {
    ok: "Finalizată",
    success: "Finalizată",
    fallback: "Finalizată",
    unavailable: "Indisponibil",
  };

  return labels[value];
}

function getComparisonStatusLabel(status: ReturnType<typeof compareLayoutFieldValues>["status"]) {
  const labels = {
    confirmed: "Confirmat",
    proposal: "Propunere AI",
    review: "Necesită verificare",
    missing: "Lipsă",
  } as const;
  return labels[status];
}

function getApplicableLayoutFields({
  result,
  currentFields,
  verifiedFields,
  documentConfidences,
}: {
  result: LayoutAiBackendResponse;
  currentFields: LayoutAiFields;
  verifiedFields: DocumentAiFieldKey[];
  documentConfidences?: Partial<Record<DocumentAiFieldKey, number>>;
}) {
  const verified = new Set(verifiedFields);
  return fieldOrder.reduce((applicable, field) => {
    const proposed = result.fields[field]?.trim();
    if (!proposed || verified.has(field)) {
      return applicable;
    }

    const current = currentFields[field]?.trim();
    const comparison = compareLayoutFieldValues(field, proposed, current);
    if (comparison.status === "proposal") {
      applicable[field] = proposed;
      return applicable;
    }

    if (comparison.status === "review") {
      const documentConfidence = documentConfidences?.[field] ?? (current ? 0.75 : 0);
      const layoutConfidence = result.field_details[field]?.confidence ?? 0;
      const semanticallyBetter = isCleanerLayoutProposal(field, proposed, current);
      if (
        (semanticallyBetter && layoutConfidence >= 0.62) ||
        (documentConfidence < 0.8 && layoutConfidence > documentConfidence)
      ) {
        applicable[field] = proposed;
      }
    }

    return applicable;
  }, toLayoutFields(null));
}

function countPopulatedFields(fields: LayoutAiFields) {
  return Object.values(fields).filter((value) => value.trim()).length;
}

function toLayoutFields(
  fields: Partial<Record<DocumentAiFieldKey, unknown>> | null | undefined,
): LayoutAiFields {
  return fieldOrder.reduce((normalized, field) => {
    normalized[field] = String(fields?.[field] ?? "").trim();
    return normalized;
  }, {} as LayoutAiFields);
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function hasAnyField(fields: Partial<Record<DocumentAiFieldKey, unknown>> | null | undefined) {
  return Boolean(fields && Object.values(fields).some((value) => String(value ?? "").trim()));
}

function isPreviewableImage(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

function getFileTypeLabel(file: File) {
  const extension = file.name.split(".").pop()?.toUpperCase();

  if (extension === "JPEG") {
    return "JPG";
  }

  return extension || (file.type === "application/pdf" ? "PDF" : "Document");
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getBackendUnavailableMessage() {
  return "Analiza inteligentă nu este disponibilă momentan. Încearcă din nou în câteva momente.";
}

class LayoutPreparationError extends Error {
  constructor() {
    super(
      "Nu am putut extrage suficient text din document. Încearcă o imagine mai clară sau rulează Document AI înainte de analiza layout.",
    );
    this.name = "LayoutPreparationError";
  }
}
