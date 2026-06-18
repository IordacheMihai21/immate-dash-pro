import { useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Network,
  RefreshCw,
  Sparkles,
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
  analyzeLayoutWithBackend,
  checkLayoutAiHealth,
  getLayoutAiBackendUrl,
  type LayoutAiBackendResponse,
  type LayoutAiFields,
  type LayoutAiHealth,
  type LayoutAiStatus,
} from "@/lib/layoutAiService";
import { cn } from "@/lib/utils";

const backendUnavailableMessage =
  "Backend indisponibil. Se afișează analiza locală existentă.";

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
  onApplyFields: (fields: LayoutAiFields) => void;
  onPreparedAnalysis: (analysis: DocumentAiAnalysis, fields: LayoutAiFields) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [health, setHealth] = useState<LayoutAiHealth | null>(null);
  const [result, setResult] = useState<LayoutAiBackendResponse | null>(null);
  const [message, setMessage] = useState("");
  const [technicalError, setTechnicalError] = useState("");
  const [processMessage, setProcessMessage] = useState("");
  const [comparisonFields, setComparisonFields] = useState<LayoutAiFields | null>(null);
  const backendUrl = getLayoutAiBackendUrl();
  const hasLocalExtraction = Boolean(analysis?.extractedText || hasAnyField(documentAiFields));

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && !isSupportedDocumentAiFile(file)) {
      toast.error("Selectează un fișier PDF, PNG, JPG sau JPEG.");
      event.currentTarget.value = "";
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setComparisonFields(null);
    setMessage("");
    setTechnicalError("");
  }

  async function handleCheckBackend() {
    try {
      setIsCheckingHealth(true);
      setMessage("");
      setTechnicalError("");
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
    } catch (error) {
      const errorMessage = getBackendUnavailableMessage();
      setHealth(null);
      setMessage(errorMessage);
      setTechnicalError(getTechnicalError(error));
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
      setTechnicalError("");
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

      if (!activeAnalysis?.extractedText.trim() || activeAnalysis.extractedText.trim().length < 20) {
        throw new LayoutPreparationError();
      }

      setComparisonFields(activeFields);
      setProcessMessage("Analizăm structura documentului cu LayoutXLM...");
      const nextHealth = await checkLayoutAiHealth();
      setHealth(nextHealth);

      const nextResult = await analyzeLayoutWithBackend({
        file: selectedFile,
        ocrText: activeAnalysis.extractedText,
        ocrWords: activeAnalysis.ocrWords,
        documentAiFields: activeFields,
      });

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
        setTechnicalError(getTechnicalError(error));
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

    onApplyFields(applicableFields);
    toast.success(`${appliedCount} propuneri AI au fost aplicate câmpurilor neconfirmate.`);
  }

  const effectiveDocumentFields = comparisonFields ?? toLayoutFields(documentAiFields);

  return (
    <div className="space-y-6">
      <InfoBanner icon={<BrainCircuit className="h-4 w-4" />}>
        Layout AI este un strat avansat de propuneri peste extracția Document AI. Datele existente
        nu sunt înlocuite automat.
      </InfoBanner>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <AdminPanel
          title="Analiză layout activă"
          description="Verifică serviciul și rulează analiza avansată a structurii documentului."
        >
          <div className="space-y-4">
            <BackendStatusCard health={health} message={message} />

            <div className="grid gap-3 sm:grid-cols-2">
              <ResultMetric label="Model layout-aware" value={health?.model ?? "LayoutXLM"} />
              <ResultMetric
                label="Status analiză"
                value={health ? "Serviciu activ" : "Neverificat"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="layout-ai-file">Document opțional pentru analiză</Label>
              <Input
                id="layout-ai-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
              />
              <p className="text-xs leading-5 text-slate-500">
                Poți încărca documentul direct. IMMapp pregătește automat textul și structura
                necesare analizei.
              </p>
            </div>

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
                Verifică serviciul
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
            </div>

            {processMessage && (
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-800">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                {processMessage}
              </div>
            )}

            {message && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="whitespace-pre-line">{message}</p>
              </div>
            )}

            <TechnicalDetails
              health={health}
              result={result}
              backendUrl={backendUrl}
              technicalError={technicalError}
            />
          </div>
        </AdminPanel>

        <AdminPanel
          title="Câmpuri identificate"
          description="Propuneri AI și comparație cu extracția Document AI curentă."
        >
          {!result ? (
            <div className="flex min-h-[300px] items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Network className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-slate-950">Analiza este pregătită</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
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

              {result.runtime_mode === "fallback_layout_aware" && (
                <InfoBanner tone="blue" icon={<Sparkles className="h-4 w-4" />}>
                  Analiza layout-aware este activă. Verifică propunerile înainte de aplicare.
                </InfoBanner>
              )}

              <LayoutFieldsTable
                result={result}
                documentAiFields={effectiveDocumentFields}
                verifiedFields={verifiedFields}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
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
        "rounded-2xl border p-4",
        isAvailable
          ? "border-emerald-200 bg-emerald-50"
          : isActive
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-slate-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-xl p-3",
              isAvailable
                ? "bg-emerald-100 text-emerald-700"
                : isActive
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600",
            )}
          >
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-950">
              {isAvailable
                ? "Analiză LayoutXLM activă"
                : isActive
                  ? "Analiză layout activă"
                  : "Serviciu neverificat"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {modelInferenceAvailable
                ? "Modelul LayoutXLM este pregătit pentru analiza documentului."
                : isActive
                  ? "Serviciul poate analiza structura documentului și poate propune câmpuri."
                  : message || "Apasă Verifică serviciul pentru a confirma disponibilitatea."}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full bg-white">
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
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Câmp</TableHead>
            <TableHead>Propunere AI</TableHead>
            <TableHead>Date curente</TableHead>
            <TableHead>Status</TableHead>
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
              <TableRow key={field}>
                <TableCell className="font-medium">{fieldLabels[field]}</TableCell>
                <TableCell>{proposed || "-"}</TableCell>
                <TableCell>{current || "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full",
                      status === "confirmed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : status === "review"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : status === "proposal"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {getComparisonStatusLabel(status)}
                  </Badge>
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
    >
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation}
            className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0 md:last:border-b"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm leading-6 text-slate-700">{recommendation}</p>
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
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-slate-950">
        Tokeni și poziții returnate
      </summary>
      <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
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
                <TableCell className="font-mono text-xs text-slate-500">
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
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-slate-950">
        Detalii tehnice
      </summary>
      <div className="mt-4 space-y-4 text-sm text-slate-600">
        <dl className="grid gap-3 sm:grid-cols-2">
          <TechnicalItem label="Model" value={result?.model ?? health?.model ?? "LayoutXLM"} />
          <TechnicalItem
            label="Model id"
            value={result?.model_id ?? health?.model_id ?? "microsoft/layoutxlm-base"}
          />
          <TechnicalItem label="Runtime mode" value={runtimeMode ?? "neverificat"} />
          <TechnicalItem label="Backend URL" value={backendUrl} />
          <TechnicalItem
            label="Metodă extracție"
            value={result?.field_extraction_method ?? "-"}
          />
          <TechnicalItem
            label="Inferență model executată"
            value={result?.model_inference_executed ? "Da" : "Nu"}
          />
          <TechnicalItem
            label="Dispozitiv"
            value={result?.technical.device ?? health?.device ?? "cpu"}
          />
        </dl>

        {runtimeMode === "layoutxlm_backbone" && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            Model LayoutXLM încărcat. Se folosește backbone-ul LayoutXLM împreună cu extracția
            layout-aware pentru câmpurile de factură.
          </p>
        )}
        {runtimeMode === "full_layoutxlm" && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            Modelul LayoutXLM cu clasificare de tokeni este încărcat și produce predicții de
            entități.
          </p>
        )}
        {runtimeMode === "fallback_layout_aware" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Modelul LayoutXLM complet nu este disponibil local. Se folosește fallback layout-aware.
          </p>
        )}

        {fallbackReason && (
          <TechnicalItem label="Motiv fallback" value={fallbackReason} />
        )}
        {technicalError && <TechnicalItem label="Eroare serviciu" value={technicalError} />}

        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <ResultMetric label="Tokeni" value={String(result.technical.tokens_count)} />
            <ResultMetric label="Cuvinte" value={String(result.technical.words_count)} />
            <ResultMetric label="Poziții" value={String(result.technical.boxes_count)} />
          </div>
        )}

        {notes.length > 0 && (
          <div>
            <p className="font-medium text-slate-900">Note tehnice</p>
            <ul className="mt-2 space-y-1">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {result && <TokenPreview result={result} />}

        {result && (
          <details className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer font-medium text-slate-900">
              Răspuns JSON
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-600">
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
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
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
  return fieldOrder.reduce(
    (applicable, field) => {
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
        if (documentConfidence < 0.8 && layoutConfidence > documentConfidence) {
          applicable[field] = proposed;
        }
      }

      return applicable;
    },
    toLayoutFields(null),
  );
}

function countPopulatedFields(fields: LayoutAiFields) {
  return Object.values(fields).filter((value) => value.trim()).length;
}

function toLayoutFields(
  fields: Partial<Record<DocumentAiFieldKey, unknown>> | null | undefined,
): LayoutAiFields {
  return fieldOrder.reduce(
    (normalized, field) => {
      normalized[field] = String(fields?.[field] ?? "").trim();
      return normalized;
    },
    {} as LayoutAiFields,
  );
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

function getBackendUnavailableMessage() {
  return "Modulul de analiză AI nu este pornit momentan. Pornește aplicația cu `npm run dev` și încearcă din nou.";
}

function getTechnicalError(error: unknown) {
  return error instanceof Error ? error.message : backendUnavailableMessage;
}

class LayoutPreparationError extends Error {
  constructor() {
    super(
      "Nu am putut extrage suficient text din document. Încearcă o imagine mai clară sau rulează Document AI înainte de analiza layout.",
    );
    this.name = "LayoutPreparationError";
  }
}
