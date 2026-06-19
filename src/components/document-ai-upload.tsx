import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  FileImage,
  Loader2,
  Network,
  Save,
  ScanText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPanel, EmptyState, InfoBanner } from "@/components/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeInvoiceDocument,
  isSupportedDocumentAiFile,
  type DocumentAiAnalysis,
  type DocumentAiExtractionMethod,
  type DocumentAiExtractedFields,
  type DocumentAiFieldKey,
} from "@/lib/documentAiService";
import { saveDocumentAiInvoice } from "@/lib/invoiceService";
import { recordDocumentAiCorrection } from "@/lib/documentAiCorrectionService";
import { classifyInvoiceByCui, type InvoiceClassification } from "@/lib/cuiUtils";
import { cn } from "@/lib/utils";

export type DocumentAiEditableFields = Record<DocumentAiFieldKey, string>;
type PipelineStatus = "finalizat" | "necesită verificare" | "incomplet";

const fieldLabels: Record<DocumentAiFieldKey, string> = {
  invoiceNumber: "Numar factura",
  invoiceDate: "Data factura",
  supplierName: "Furnizor",
  supplierCui: "CUI furnizor",
  customerName: "Client",
  customerCui: "CUI client",
  subtotal: "Valoare fara TVA",
  vatAmount: "TVA",
  totalAmount: "Total de plata",
  currency: "Moneda",
};

const fieldOrder: DocumentAiFieldKey[] = [
  "invoiceNumber",
  "invoiceDate",
  "supplierName",
  "supplierCui",
  "customerName",
  "customerCui",
  "subtotal",
  "vatAmount",
  "totalAmount",
  "currency",
];

const numericFields = new Set<DocumentAiFieldKey>(["subtotal", "vatAmount", "totalAmount"]);

export function DocumentAiUpload({
  analysis,
  editableFields,
  verifiedFields,
  onInvoiceSaved,
  onAnalysisChange,
  onEditableFieldsChange,
  onVerifiedFieldsChange,
  onClearAnalysis,
}: {
  analysis: DocumentAiAnalysis | null;
  editableFields: DocumentAiEditableFields | null;
  verifiedFields: DocumentAiFieldKey[];
  onInvoiceSaved?: () => void;
  onAnalysisChange: (analysis: DocumentAiAnalysis | null) => void;
  onEditableFieldsChange: (fields: DocumentAiEditableFields | null) => void;
  onVerifiedFieldsChange: (fields: DocumentAiFieldKey[]) => void;
  onClearAnalysis: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const correctionStartValuesRef = useRef<Partial<Record<DocumentAiFieldKey, string>>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const verifiedFieldSet = useMemo(() => new Set(verifiedFields), [verifiedFields]);

  const currentClassification = useMemo(() => {
    if (!analysis || !editableFields) {
      return "unclassified" as InvoiceClassification;
    }

    return classifyInvoiceByCui({
      companyCui: analysis.companyCui,
      supplierCui: editableFields.supplierCui,
      customerCui: editableFields.customerCui,
    });
  }, [analysis, editableFields]);

  const canSave = Boolean(
    analysis &&
    editableFields?.invoiceNumber.trim() &&
    toNumber(editableFields?.totalAmount) > 0 &&
    !isProcessing &&
    !isSaving,
  );
  const readyForSave = Boolean(
    analysis && editableFields?.invoiceNumber.trim() && toNumber(editableFields?.totalAmount) > 0,
  );
  const hasDetectedEntities = Boolean(
    analysis && Object.values(analysis.fields).some((value) => value !== null && value !== ""),
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!isSupportedDocumentAiFile(file)) {
      toast.error("Document AI accepta fisiere PDF, PNG, JPG sau JPEG.");
      event.currentTarget.value = "";
      setSelectedFile(null);
      return;
    }

    onClearAnalysis();
    setIsSaved(false);
    setProgress(0);
    setProgressLabel("");
    setSelectedFile(file);
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      toast.error("Selecteaza o factura PDF sau imagine.");
      return;
    }

    try {
      setIsProcessing(true);
      setIsSaved(false);
      setProgress(5);
      setProgressLabel("Se pregateste documentul");

      const result = await analyzeInvoiceDocument(selectedFile, (nextProgress) => {
        setProgress(Math.round(nextProgress.progress * 100));
        setProgressLabel(nextProgress.status);
      });

      onAnalysisChange(result);
      onEditableFieldsChange(toDocumentAiEditableFields(result.fields));
      onVerifiedFieldsChange([]);
      setProgress(100);
      setProgressLabel("Analiza finalizata");

      if (result.warnings.length > 0) {
        toast.warning("Documentul a fost analizat. Verifica datele marcate inainte de salvare.");
      } else {
        toast.success("Documentul a fost analizat si este pregatit pentru verificare.");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Documentul nu a putut fi analizat. Incearca din nou.";
      toast.error(message);
      setProgress(0);
      setProgressLabel("");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleSave() {
    if (!analysis || !editableFields) {
      return;
    }

    if (!canSave) {
      toast.error("Verifica numarul facturii si totalul inainte de salvare.");
      return;
    }

    try {
      setIsSaving(true);

      await saveDocumentAiInvoice({
        fileName: analysis.fileName,
        fileType: analysis.fileType,
        extractedText: analysis.extractedText,
        invoiceNumber: editableFields.invoiceNumber.trim(),
        issueDate: editableFields.invoiceDate.trim() || null,
        currency: editableFields.currency.trim() || "RON",
        supplierName: editableFields.supplierName.trim(),
        supplierCui: editableFields.supplierCui.trim(),
        customerName: editableFields.customerName.trim(),
        customerCui: editableFields.customerCui.trim(),
        taxExclusiveAmount: toNumber(editableFields.subtotal),
        taxAmount: toNumber(editableFields.vatAmount),
        taxInclusiveAmount: toNumber(editableFields.subtotal) + toNumber(editableFields.vatAmount),
        payableAmount: toNumber(editableFields.totalAmount),
        confidenceByField: toEntityConfidenceMap(analysis, verifiedFieldSet),
        classification: currentClassification,
      });

      localStorage.setItem("immapp:ai-forecast-status", "outdated");
      window.dispatchEvent(new Event("immapp:ai-forecast-outdated"));
      window.dispatchEvent(new Event("immapp:invoice-imported"));

      setIsSaved(true);
      onInvoiceSaved?.();
      toast.success("Factura a fost salvata dupa verificare.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Factura nu a putut fi salvata. Verifica datele si incearca din nou.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  function updateField(field: DocumentAiFieldKey, value: string) {
    if (!editableFields) {
      return;
    }

    if (correctionStartValuesRef.current[field] === undefined) {
      correctionStartValuesRef.current[field] = editableFields[field];
    }

    onEditableFieldsChange({
      ...editableFields,
      [field]: value,
    });

    if (!verifiedFieldSet.has(field)) {
      onVerifiedFieldsChange([...verifiedFields, field]);
    }
  }

  function commitFieldCorrection(field: DocumentAiFieldKey, correctedValue: string) {
    const previousPredictedValue = correctionStartValuesRef.current[field];
    delete correctionStartValuesRef.current[field];
    if (!analysis || previousPredictedValue === undefined) return;
    recordDocumentAiCorrection({
      analysis,
      fieldName: field,
      previousPredictedValue,
      correctedValue,
    });
  }

  function handleClearAnalysis() {
    setSelectedFile(null);
    setIsSaved(false);
    setProgress(0);
    setProgressLabel("");
    correctionStartValuesRef.current = {};
    onClearAnalysis();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-6 text-white shadow-lg shadow-blue-950/10 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 backdrop-blur">
              <BrainCircuit className="h-3.5 w-3.5" />
              Document AI activ
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Extragere inteligentă din documente financiare
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
              IMMapp transformă facturile PDF, JPG sau PNG în date structurate folosind OCR,
              preprocesare imagine și extracție de entități.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DocumentHeroStatus
              label={analysis?.extractedText ? "OCR finalizat" : "OCR pregătit"}
              active={Boolean(analysis?.extractedText)}
            />
            <DocumentHeroStatus
              label={hasDetectedEntities ? "Entități detectate" : "Preprocesare activă"}
              active={hasDetectedEntities}
            />
            <DocumentHeroStatus
              label={readyForSave ? "Date pregătite" : "Date structurate"}
              active={readyForSave}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      <AdminPanel
        title="Încarcă și analizează factura"
        description="Formate acceptate: PDF, PNG, JPG și JPEG."
        className="overflow-hidden rounded-3xl shadow-sm"
      >
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-600 p-3 text-white">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-950">
                    OCR → Layout → Entități → Validare → Structurare
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Cinci etape clare, de la document brut la date pregătite.
                  </p>
                </div>
              </div>

              <PipelineStatusGrid
                analysis={analysis}
                fields={editableFields}
                readyForSave={readyForSave}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="document-ai-file">Factura PDF / Imagine</Label>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50/30">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-100 p-3 text-slate-600">
                      <FileImage className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">PDF, PNG, JPG sau JPEG</p>
                      <p className="text-xs text-slate-500">
                        Recomandăm o scanare clară, dreaptă și bine luminată.
                      </p>
                    </div>
                  </div>

                  <Input
                    ref={fileInputRef}
                    id="document-ai-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    className="max-w-sm"
                    disabled={isProcessing || isSaving}
                    onChange={handleFileChange}
                  />
                </div>

                {(selectedFile || analysis) && (
                  <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {selectedFile ? "Fisier selectat" : "Ultima analiza"}:{" "}
                    <span className="font-medium text-slate-950">
                      {selectedFile?.name ?? analysis?.fileName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {isProcessing && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-blue-900">{progressLabel}</span>
                  <span className="tabular-nums text-blue-700">{progress}%</span>
                </div>
                <Progress value={progress} className="mt-3 bg-blue-100" />
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleAnalyze}
                disabled={!selectedFile || isProcessing || isSaving}
                className="gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanText className="h-4 w-4" />
                )}
                Analizează factura
              </Button>

              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!canSave || isSaved}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvează factura verificată
              </Button>

              {(analysis || selectedFile) && (
                <Button
                  variant="ghost"
                  onClick={handleClearAnalysis}
                  disabled={isProcessing || isSaving}
                  className="gap-2 text-slate-600"
                >
                  Șterge analiza curentă
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {analysis ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ScoreCard
                    label="Încredere generală"
                    value={`${analysis.overallConfidence}%`}
                    icon={<Sparkles className="h-4 w-4" />}
                  />
                  <ScoreCard
                    label="Calitate text"
                    value={`${Math.round(analysis.ocrConfidence * 100)}%`}
                    icon={<ScanText className="h-4 w-4" />}
                  />
                  <ScoreCard
                    label="Tip factură"
                    value={getClassificationLabel(currentClassification)}
                    icon={<BadgeCheck className="h-4 w-4" />}
                  />
                </div>

                <LayoutSummaryCard analysis={analysis} />
              </>
            ) : (
              <EmptyState
                title="Totul este pregătit"
                description="Selectează o factură pentru a vedea textul extras, câmpurile detectate și nivelul de încredere."
                icon={<BrainCircuit className="h-6 w-6" />}
              />
            )}
          </div>
        </div>

        {analysis && (
          <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
            {analysis.warnings.length > 0 && (
              <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                <div className="space-y-1">
                  {analysis.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </InfoBanner>
            )}

            <StructuredPreview
              analysis={analysis}
              fields={editableFields}
              verifiedFields={verifiedFieldSet}
              onUpdate={updateField}
              onCommit={commitFieldCorrection}
            />

            <DetectedRelationshipsCard
              analysis={analysis}
              fields={editableFields}
              classification={currentClassification}
            />

            <GeneratedStructureCard
              analysis={analysis}
              fields={editableFields}
              classification={currentClassification}
              verifiedFields={verifiedFieldSet}
            />
          </div>
        )}
      </AdminPanel>

      {analysis && (
        <AdminPanel
          title="Text extras"
          description="Previzualizare a conținutului identificat în document."
          className="overflow-hidden rounded-3xl shadow-sm"
        >
          <Textarea
            value={
              analysis.extractedText.trim() ||
              "Nu exista suficient text extras pentru previzualizare."
            }
            readOnly
            className="min-h-56 resize-y bg-slate-50 font-mono text-xs leading-5"
          />
        </AdminPanel>
      )}
    </div>
  );
}

function PipelineStatusGrid({
  analysis,
  fields,
  readyForSave,
}: {
  analysis: DocumentAiAnalysis | null;
  fields: DocumentAiEditableFields | null;
  readyForSave: boolean;
}) {
  const detectedFields = analysis
    ? Object.values(analysis.fields).filter((value) => value !== null && value !== "").length
    : 0;
  const cuiFieldsPresent = Boolean(fields?.supplierCui.trim() && fields.customerCui.trim());
  const pipelineSteps: {
    title: string;
    status: PipelineStatus;
    description: string;
  }[] = [
    {
      title: "Text extras",
      status: getPipelineStatus(Boolean(analysis?.extractedText), Boolean(analysis)),
      description: "Conținut preluat din document.",
    },
    {
      title: "Structură analizată",
      status: !analysis
        ? "incomplet"
        : analysis.layout.hasLayoutData
          ? "finalizat"
          : analysis.extractedText.trim()
            ? "necesită verificare"
            : "incomplet",
      description: "Poziții și secțiuni identificate.",
    },
    {
      title: "Entități detectate",
      status: !analysis
        ? "incomplet"
        : detectedFields >= 8
          ? "finalizat"
          : detectedFields > 0
            ? "necesită verificare"
            : "incomplet",
      description: "Datele importante sunt localizate.",
    },
    {
      title: "CUI verificat",
      status: !analysis
        ? "incomplet"
        : cuiFieldsPresent && analysis.companyCui
          ? "finalizat"
          : cuiFieldsPresent
            ? "necesită verificare"
            : "incomplet",
      description: "Părțile facturii sunt verificate.",
    },
    {
      title: "Date pregătite",
      status: !analysis ? "incomplet" : readyForSave ? "finalizat" : "necesită verificare",
      description: "Câmpurile pot fi confirmate.",
    },
  ];

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      {pipelineSteps.map((step, index) => (
        <PipelineStatusCard key={step.title} {...step} step={index + 1} />
      ))}
    </div>
  );
}

function PipelineStatusCard({
  title,
  status,
  description,
  step,
}: {
  title: string;
  status: PipelineStatus;
  description: string;
  step: number;
}) {
  const styles: Record<PipelineStatus, string> = {
    finalizat: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "necesită verificare": "border-amber-200 bg-amber-50 text-amber-700",
    incomplet: "border-slate-200 bg-white text-slate-500",
  };

  return (
    <div className={cn("rounded-xl border p-3", styles[status])}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold text-slate-600">
            {step}
          </span>
          <p className="text-xs font-semibold text-slate-950">{title}</p>
        </div>
        {status === "finalizat" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : status === "necesită verificare" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-4 text-slate-600">{description}</p>
    </div>
  );
}

function getPipelineStatus(done: boolean, started: boolean): PipelineStatus {
  if (done) {
    return "finalizat";
  }

  return started ? "necesită verificare" : "incomplet";
}

function ScoreCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function LayoutSummaryCard({ analysis }: { analysis: DocumentAiAnalysis }) {
  const positionedPercent =
    analysis.layout.wordCount > 0
      ? Math.round((analysis.layout.wordsWithPosition / analysis.layout.wordCount) * 100)
      : 0;
  const ocrDetails = analysis.ocrDetails;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">Analiza layout</h3>
          <p className="mt-1 text-sm text-slate-500">
            Rezumat al cuvintelor si pozitiilor folosite in extragere.
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "rounded-full",
            analysis.layout.hasLayoutData
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {analysis.layout.hasLayoutData ? "Layout disponibil" : "Verificare vizuala"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <LayoutMetric label="Cuvinte OCR" value={String(analysis.layout.wordCount)} />
        <LayoutMetric label="Cu pozitii" value={`${positionedPercent}%`} />
        <LayoutMetric label="Linii detectate" value={String(analysis.layout.detectedLines)} />
        <LayoutMetric
          label="Incredere cuvinte"
          value={`${Math.round(analysis.layout.averageWordConfidence * 100)}%`}
        />
      </div>

      {ocrDetails && (
        <OcrDetailsPanel details={ocrDetails} extractedText={analysis.extractedText} />
      )}
    </div>
  );
}

function LayoutMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function OcrDetailsPanel({
  details,
  extractedText,
}: {
  details: NonNullable<DocumentAiAnalysis["ocrDetails"]>;
  extractedText: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-950">Preprocesare imagine</h4>
          <p className="mt-1 text-sm text-slate-600">
            IMMapp compara mai multe variante OCR si pastreaza rezultatul cu cel mai bun scor.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full bg-white text-blue-700">
          {details.preprocessingApplied ? "Preprocesare aplicata" : "Text extras direct"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LayoutMetric label="Variantă OCR selectată" value={details.selectedLabel} />
        <LayoutMetric label="Încredere OCR" value={formatConfidence(details.confidence)} />
        <LayoutMetric label="Număr cuvinte" value={String(details.wordCount)} />
        <LayoutMetric label="Cuvinte relevante" value={String(details.usefulWordCount)} />
        <LayoutMetric label="Cuvinte-cheie detectate" value={String(details.invoiceKeywordCount)} />
        <LayoutMetric label="Încercări OCR" value={String(details.attempts.length)} />
        <LayoutMetric label="Scor OCR" value={formatConfidence(details.score)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {details.attempts.map((attempt) => (
          <span
            key={attempt.variant}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              attempt.selected
                ? "border-blue-200 bg-white text-blue-700"
                : "border-slate-200 bg-white/70 text-slate-600",
            )}
          >
            {attempt.label}: {formatConfidence(attempt.score)}
          </span>
        ))}
      </div>

      <details className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-950">
          Detalii OCR
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LayoutMetric label="Variantă selectată" value={details.selectedLabel} />
          <LayoutMetric label="Încredere OCR" value={formatConfidence(details.confidence)} />
          <LayoutMetric label="Scor OCR" value={formatConfidence(details.score)} />
          <LayoutMetric
            label="Cuvinte-cheie detectate"
            value={String(details.invoiceKeywordCount)}
          />
        </div>
        <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {(extractedText.trim() || "Nu exista text OCR selectat.").slice(0, 1000)}
        </pre>
      </details>
    </div>
  );
}

function StructuredPreview({
  analysis,
  fields,
  verifiedFields,
  onUpdate,
  onCommit,
}: {
  analysis: DocumentAiAnalysis;
  fields: DocumentAiEditableFields | null;
  verifiedFields: Set<DocumentAiFieldKey>;
  onUpdate: (field: DocumentAiFieldKey, value: string) => void;
  onCommit: (field: DocumentAiFieldKey, value: string) => void;
}) {
  if (!fields) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">Date structurate detectate</h3>
          <p className="mt-1 text-sm text-slate-500">
            Verifică doar câmpurile marcate și confirmă rezultatul.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          {analysis.fileType.toUpperCase()}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fieldOrder.map((field) => {
          const isVerified = verifiedFields.has(field);
          const fieldDetail = analysis.fieldDetails[field];
          const displayMethod = isVerified ? "User verified" : fieldDetail.method;
          const missing = !fields[field]?.trim();
          const lowConfidence = !missing && fieldDetail.confidence < 0.55;

          return (
            <div
              key={field}
              className={cn(
                "space-y-2 rounded-2xl border bg-slate-50/70 p-3.5 transition focus-within:border-blue-300 focus-within:bg-blue-50/30",
                missing
                  ? "border-rose-200 bg-rose-50/70"
                  : lowConfidence
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-slate-100",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`document-ai-${field}`} className="text-xs text-slate-500">
                  {fieldLabels[field]}
                </Label>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    getConfidenceTone(isVerified ? 1 : fieldDetail.confidence),
                  )}
                >
                  {formatConfidence(isVerified ? 1 : fieldDetail.confidence)}
                </span>
              </div>

              <Input
                id={`document-ai-${field}`}
                value={fields[field]}
                inputMode={numericFields.has(field) ? "decimal" : "text"}
                onChange={(event) => onUpdate(field, event.target.value)}
                onBlur={(event) => onCommit(field, event.target.value)}
                placeholder="Nedetectat"
                className="bg-white"
              />

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white text-[10px] font-medium text-slate-500"
                >
                  {formatExtractionMethod(displayMethod)}
                </Badge>
                {(missing || lowConfidence || fieldDetail.warning) && (
                  <span className={missing ? "text-rose-600" : "text-amber-700"}>
                    {missing ? "Câmp lipsă" : "Verifică valoarea"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentHeroStatus({
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
        "flex min-w-36 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-medium text-blue-50 backdrop-blur",
        className,
      )}
    >
      {active ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-blue-200" />
      )}
      {label}
    </div>
  );
}

function GeneratedStructureCard({
  analysis,
  fields,
  classification,
  verifiedFields,
}: {
  analysis: DocumentAiAnalysis;
  fields: DocumentAiEditableFields | null;
  classification: InvoiceClassification;
  verifiedFields: Set<DocumentAiFieldKey>;
}) {
  const generatedStructure = buildGeneratedStructure(
    analysis,
    fields,
    classification,
    verifiedFields,
  );

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer select-none text-sm font-semibold text-slate-950">
        Structură generată
      </summary>
      <p className="mt-2 text-sm text-slate-500">
        Previzualizare a datelor structurate rezultate din pipeline.
      </p>
      <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
        {JSON.stringify(generatedStructure, null, 2)}
      </pre>
    </details>
  );
}

function DetectedRelationshipsCard({
  analysis,
  fields,
  classification,
}: {
  analysis: DocumentAiAnalysis;
  fields: DocumentAiEditableFields | null;
  classification: InvoiceClassification;
}) {
  const relationships = buildDetectedRelationships(analysis, fields, classification);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">Relații detectate</h3>
          <p className="mt-1 text-sm text-slate-500">
            Model semantic intre entitatile extrase si rolul companiei in factura.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full bg-blue-50 text-blue-700">
          <Network className="mr-1 h-3.5 w-3.5" />
          {relationships.length} relatii
        </Badge>
      </div>

      <div className="grid gap-3">
        {relationships.map((relationship) => (
          <div
            key={`${relationship.source}-${relationship.relation}-${relationship.target}`}
            className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_auto_1fr_auto]"
          >
            <RelationshipNode label="Sursa" value={relationship.source} />
            <div className="flex items-center justify-center">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {relationship.relation}
              </span>
            </div>
            <RelationshipNode label="Tinta" value={relationship.target} />
            <div className="flex items-center justify-end">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  getConfidenceTone(relationship.confidence),
                )}
              >
                {formatConfidence(relationship.confidence)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelationshipNode({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function toDocumentAiEditableFields(
  fields: DocumentAiExtractedFields,
): DocumentAiEditableFields {
  return fieldOrder.reduce((acc, key) => {
    const value = fields[key];

    acc[key] =
      typeof value === "number"
        ? value.toFixed(2).replace(".", ",")
        : typeof value === "string"
          ? value
          : "";

    return acc;
  }, {} as DocumentAiEditableFields);
}

function toEntityConfidenceMap(
  analysis: DocumentAiAnalysis,
  verifiedFields: Set<DocumentAiFieldKey>,
) {
  const confidenceFor = (field: DocumentAiFieldKey) =>
    verifiedFields.has(field) ? 1 : analysis.confidences[field];

  return {
    invoice_number: confidenceFor("invoiceNumber"),
    issue_date: confidenceFor("invoiceDate"),
    supplier_name: confidenceFor("supplierName"),
    supplier_cui: confidenceFor("supplierCui"),
    customer_name: confidenceFor("customerName"),
    customer_cui: confidenceFor("customerCui"),
    tax_exclusive_amount: confidenceFor("subtotal"),
    tax_amount: confidenceFor("vatAmount"),
    tax_inclusive_amount: confidenceFor("totalAmount"),
    payable_amount: confidenceFor("totalAmount"),
    currency: confidenceFor("currency"),
  };
}

function buildGeneratedStructure(
  analysis: DocumentAiAnalysis,
  fields: DocumentAiEditableFields | null,
  classification: InvoiceClassification,
  verifiedFields: Set<DocumentAiFieldKey>,
) {
  const extractedFields = fieldOrder.reduce(
    (acc, field) => {
      const verified = verifiedFields.has(field);
      const detail = analysis.fieldDetails[field];

      return {
        ...acc,
        [field]: {
          value: fields?.[field] ?? detail.value,
          confidence: verified ? 1 : detail.confidence,
          method: verified ? "User verified" : detail.method,
          warning: verified ? undefined : detail.warning,
        },
      };
    },
    {} as Record<
      DocumentAiFieldKey,
      {
        value: string | number | null;
        confidence: number;
        method: DocumentAiExtractionMethod;
        warning?: string;
      }
    >,
  );

  return {
    document_type: "document-ai",
    extraction_method: "document_ai",
    classification,
    confidence: analysis.overallConfidence,
    layout: {
      word_count: analysis.layout.wordCount,
      words_with_position: analysis.layout.wordsWithPosition,
      detected_lines: analysis.layout.detectedLines,
      has_layout_data: analysis.layout.hasLayoutData,
    },
    ocr: analysis.ocrDetails
      ? {
          selected_variant: analysis.ocrDetails.selectedLabel,
          confidence: analysis.ocrDetails.confidence,
          score: analysis.ocrDetails.score,
          word_count: analysis.ocrDetails.wordCount,
          relevant_words: analysis.ocrDetails.usefulWordCount,
          detected_keywords: analysis.ocrDetails.invoiceKeywordCount,
          attempts: analysis.ocrDetails.attempts.map((attempt) => ({
            variant: attempt.label,
            score: attempt.score,
            selected: Boolean(attempt.selected),
          })),
        }
      : undefined,
    extracted_fields: extractedFields,
    relationships: buildDetectedRelationships(analysis, fields, classification),
    warnings: analysis.warnings,
  };
}

function buildDetectedRelationships(
  analysis: DocumentAiAnalysis,
  fields: DocumentAiEditableFields | null,
  classification: InvoiceClassification,
) {
  const invoiceLabel = fields?.invoiceNumber?.trim()
    ? `Factura ${fields.invoiceNumber.trim()}`
    : "Factura";
  const supplierLabel = fields?.supplierName?.trim() || fields?.supplierCui?.trim() || "Furnizor";
  const customerLabel = fields?.customerName?.trim() || fields?.customerCui?.trim() || "Client";
  const totalConfidence = Math.max(
    analysis.confidences.totalAmount,
    analysis.confidences.vatAmount,
  );
  const partyConfidence = Math.max(
    analysis.confidences.supplierCui,
    analysis.confidences.customerCui,
  );
  const companyTarget: Record<InvoiceClassification, string> = {
    revenue: "Venit",
    expense: "Cheltuială",
    unclassified: "Neclasificat",
  };
  const companyRelation: Record<InvoiceClassification, string> = {
    revenue: "este furnizor",
    expense: "este client",
    unclassified: "necesită asociere",
  };

  return [
    {
      source: supplierLabel,
      relation: "emite",
      target: invoiceLabel,
      confidence: Math.max(analysis.confidences.supplierName, analysis.confidences.supplierCui),
    },
    {
      source: customerLabel,
      relation: "primește",
      target: invoiceLabel,
      confidence: Math.max(analysis.confidences.customerName, analysis.confidences.customerCui),
    },
    {
      source: invoiceLabel,
      relation: "conține",
      target: "Linii factură",
      confidence: Math.max(0.45, analysis.overallConfidence / 100 - 0.1),
    },
    {
      source: invoiceLabel,
      relation: "include",
      target: "TVA",
      confidence: totalConfidence,
    },
    {
      source: "Companie curentă",
      relation: companyRelation[classification],
      target: companyTarget[classification],
      confidence: classification === "unclassified" ? 0.35 : Math.max(0.65, partyConfidence),
    },
  ];
}

function toNumber(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatConfidence(value: number) {
  if (!value) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function getConfidenceTone(value: number) {
  if (value >= 0.75) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value >= 0.55) {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function formatExtractionMethod(value: DocumentAiExtractionMethod | "User verified") {
  const labels: Record<string, string> = {
    OCR: "OCR",
    Regex: "Regex",
    "Layout heuristic": "Layout heuristic",
    "User verified": "User verified",
  };

  return labels[value] ?? value;
}

function getClassificationLabel(value: InvoiceClassification) {
  const labels: Record<InvoiceClassification, string> = {
    revenue: "Venit",
    expense: "Cheltuiala",
    unclassified: "Neclasificat",
  };

  return labels[value];
}
