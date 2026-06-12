import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  FileImage,
  Loader2,
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
  type DocumentAiExtractedFields,
  type DocumentAiFieldKey,
} from "@/lib/documentAiService";
import { saveDocumentAiInvoice } from "@/lib/invoiceService";
import { classifyInvoiceByCui, type InvoiceClassification } from "@/lib/cuiUtils";
import { cn } from "@/lib/utils";

type EditableFields = Record<DocumentAiFieldKey, string>;

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

export function DocumentAiUpload({ onInvoiceSaved }: { onInvoiceSaved?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAiAnalysis | null>(null);
  const [editableFields, setEditableFields] = useState<EditableFields | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setAnalysis(null);
    setEditableFields(null);
    setIsSaved(false);
    setProgress(0);
    setProgressLabel("");

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

      setAnalysis(result);
      setEditableFields(toEditableFields(result.fields));
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
        confidenceByField: toEntityConfidenceMap(analysis),
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
    setEditableFields((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  return (
    <div className="space-y-6">
      <AdminPanel
        title="Document AI"
        description="Extrage textul si transforma facturile PDF sau imaginile in date structurate pentru verificare."
      >
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-600 p-3 text-white">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-950">
                    OCR → Entitati → Validare → Structurare
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Incarca o factura ne-structurata si verifica rezultatul inainte de salvare.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PipelineBadge active={Boolean(analysis?.extractedText)} label="Text extras" />
                <PipelineBadge active={Boolean(analysis)} label="Campuri detectate" />
                <PipelineBadge
                  active={Boolean(analysis && analysis.warnings.length > 0)}
                  label="Necesita verificare"
                  tone="amber"
                />
                <PipelineBadge active={isSaved} label="Gata de salvare" tone="emerald" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="document-ai-file">Factura PDF / Imagine</Label>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-100 p-3 text-slate-600">
                      <FileImage className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">PDF, PNG, JPG sau JPEG</p>
                      <p className="text-xs text-slate-500">
                        Pentru imagini, foloseste o scanare clara si bine luminata.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="document-ai-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    className="max-w-sm"
                    disabled={isProcessing || isSaving}
                    onChange={handleFileChange}
                  />
                </div>

                {selectedFile && (
                  <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Fisier selectat:{" "}
                    <span className="font-medium text-slate-950">{selectedFile.name}</span>
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
                Analizeaza factura
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
                Salveaza factura verificata
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {analysis ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ScoreCard
                    label="Incredere generala"
                    value={`${analysis.overallConfidence}%`}
                    icon={<Sparkles className="h-4 w-4" />}
                  />
                  <ScoreCard
                    label="Calitate text"
                    value={`${Math.round(analysis.ocrConfidence * 100)}%`}
                    icon={<ScanText className="h-4 w-4" />}
                  />
                  <ScoreCard
                    label="Tip factura"
                    value={getClassificationLabel(currentClassification)}
                    icon={<BadgeCheck className="h-4 w-4" />}
                  />
                </div>

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
                  onUpdate={updateField}
                />
              </>
            ) : (
              <EmptyState
                title="Analiza asteapta un document"
                description="Selecteaza o factura PDF sau imagine pentru a vedea textul extras, campurile detectate si scorurile de incredere."
                icon={<BrainCircuit className="h-6 w-6" />}
              />
            )}
          </div>
        </div>
      </AdminPanel>

      {analysis && (
        <AdminPanel
          title="Text extras"
          description="Previzualizare a continutului identificat in document."
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

function PipelineBadge({
  active,
  label,
  tone = "blue",
}: {
  active: boolean;
  label: string;
  tone?: "blue" | "amber" | "emerald";
}) {
  const styles = {
    blue: active
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-white text-slate-500",
    amber: active
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-white text-slate-500",
    emerald: active
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-500",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3 py-2 text-xs font-semibold", styles)}>
      {active && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
      {label}
    </div>
  );
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

function StructuredPreview({
  analysis,
  fields,
  onUpdate,
}: {
  analysis: DocumentAiAnalysis;
  fields: EditableFields | null;
  onUpdate: (field: DocumentAiFieldKey, value: string) => void;
}) {
  if (!fields) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">Date structurate detectate</h3>
          <p className="mt-1 text-sm text-slate-500">
            Corecteaza campurile daca este nevoie, apoi salveaza factura.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          {analysis.fileType.toUpperCase()}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fieldOrder.map((field) => (
          <div key={field} className="space-y-1.5 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`document-ai-${field}`} className="text-xs text-slate-500">
                {fieldLabels[field]}
              </Label>
              <span className="text-xs font-medium text-slate-400">
                {formatConfidence(analysis.confidences[field])}
              </span>
            </div>

            <Input
              id={`document-ai-${field}`}
              value={fields[field]}
              inputMode={numericFields.has(field) ? "decimal" : "text"}
              onChange={(event) => onUpdate(field, event.target.value)}
              placeholder="Nedetectat"
              className="bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function toEditableFields(fields: DocumentAiExtractedFields): EditableFields {
  return fieldOrder.reduce((acc, key) => {
    const value = fields[key];

    acc[key] =
      typeof value === "number" ? value.toFixed(2) : typeof value === "string" ? value : "";

    return acc;
  }, {} as EditableFields);
}

function toEntityConfidenceMap(analysis: DocumentAiAnalysis) {
  return {
    invoice_number: analysis.confidences.invoiceNumber,
    issue_date: analysis.confidences.invoiceDate,
    supplier_name: analysis.confidences.supplierName,
    supplier_cui: analysis.confidences.supplierCui,
    customer_name: analysis.confidences.customerName,
    customer_cui: analysis.confidences.customerCui,
    tax_exclusive_amount: analysis.confidences.subtotal,
    tax_amount: analysis.confidences.vatAmount,
    tax_inclusive_amount: analysis.confidences.totalAmount,
    payable_amount: analysis.confidences.totalAmount,
    currency: analysis.confidences.currency,
  };
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

function getClassificationLabel(value: InvoiceClassification) {
  const labels: Record<InvoiceClassification, string> = {
    revenue: "Venit",
    expense: "Cheltuiala",
    unclassified: "Neclasificat",
  };

  return labels[value];
}
