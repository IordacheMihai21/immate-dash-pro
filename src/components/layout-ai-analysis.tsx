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
import type { DocumentAiAnalysis, DocumentAiFieldKey } from "@/lib/documentAiService";
import {
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
}: {
  analysis: DocumentAiAnalysis | null;
  documentAiFields: Partial<Record<DocumentAiFieldKey, string>> | null;
  verifiedFields: DocumentAiFieldKey[];
  onApplyFields: (fields: LayoutAiFields) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [health, setHealth] = useState<LayoutAiHealth | null>(null);
  const [result, setResult] = useState<LayoutAiBackendResponse | null>(null);
  const [message, setMessage] = useState("");
  const backendUrl = getLayoutAiBackendUrl();
  const hasLocalExtraction = Boolean(analysis?.extractedText || hasAnyField(documentAiFields));

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setMessage("");
  }

  async function handleCheckBackend() {
    try {
      setIsCheckingHealth(true);
      setMessage("");
      const nextHealth = await checkLayoutAiHealth();

      setHealth(nextHealth);

      if (nextHealth.layout_model_available) {
        toast.success("Backend activ. Model LayoutXLM disponibil.");
      } else {
        const fallbackMessage =
          "Backend activ. Model LayoutXLM indisponibil momentan. Se folosește modul fallback layout-aware.";
        setMessage(fallbackMessage);
        toast.info(fallbackMessage);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : backendUnavailableMessage;
      setHealth(null);
      setMessage(errorMessage);
      toast.error(errorMessage);
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
      const nextResult = await analyzeLayoutWithBackend({
        file: selectedFile,
        ocrText: analysis?.extractedText ?? "",
        documentAiFields: documentAiFields ?? analysis?.fields ?? null,
      });

      setResult(nextResult);

      if (nextResult.status === "success") {
        toast.success("Analiza LayoutXLM a fost finalizată.");
      } else if (nextResult.status === "fallback") {
        toast.info(
          "Backend activ. Model LayoutXLM indisponibil momentan. Se folosește modul fallback layout-aware.",
        );
      } else {
        toast.warning("Analiza LayoutXLM nu a putut genera câmpuri suficiente.");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : backendUnavailableMessage;
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRunning(false);
    }
  }

  function handleApplyFields() {
    if (!result) {
      return;
    }

    onApplyFields(result.fields);
    toast.success("Propunerile LayoutXLM au fost aplicate câmpurilor neverificate.");
  }

  return (
    <div className="space-y-6">
      <InfoBanner icon={<BrainCircuit className="h-4 w-4" />}>
        Layout AI este un strat avansat de propuneri peste extracția Document AI. Datele existente
        nu sunt înlocuite automat.
      </InfoBanner>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <AdminPanel
          title="Status backend"
          description="Conectare la serviciul local LayoutXLM pentru analiză layout-aware."
        >
          <div className="space-y-4">
            <BackendStatusCard health={health} message={message} />

            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Endpoint: <span className="font-medium text-slate-950">{backendUrl}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ResultMetric label="Model layout-aware" value={health?.model ?? "LayoutXLM"} />
              <ResultMetric
                label="Status backend"
                value={health ? "Backend activ" : "Neverificat"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="layout-ai-file">Document opțional pentru backend</Label>
              <Input
                id="layout-ai-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
              />
              <p className="text-xs leading-5 text-slate-500">
                Dacă există o extracție Document AI curentă, OCR text și câmpurile detectate sunt
                trimise automat către backend.
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
                Verifică backend
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
                Rulează analiza LayoutXLM
              </Button>
            </div>

            {message && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{message}</p>
              </div>
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          title="Propuneri LayoutXLM"
          description="Câmpuri prezise de backend și comparație cu extracția Document AI."
        >
          {!result ? (
            <div className="flex min-h-[300px] items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Network className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-slate-950">Așteaptă analiza LayoutXLM</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Rulează analiza pentru a vedea câmpurile propuse de LayoutXLM și diferențele față
                  de extracția Document AI.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultMetric label="Model" value={result.model} />
                <ResultMetric label="Status" value={getStatusLabel(result.status)} />
                <ResultMetric label="Confidence" value={formatConfidence(result.confidence)} />
              </div>

              {result.status === "fallback" && (
                <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                  Backend activ. Model LayoutXLM indisponibil momentan. Se folosește modul fallback
                  layout-aware.
                </InfoBanner>
              )}

              <LayoutFieldsTable
                result={result}
                documentAiFields={documentAiFields}
                verifiedFields={verifiedFields}
              />

              {result.notes.length > 0 && (
                <InfoBanner tone="blue" icon={<Sparkles className="h-4 w-4" />}>
                  <div className="space-y-1">
                    {result.notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                </InfoBanner>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleApplyFields}
                  disabled={!hasAnyField(result.fields)}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Aplică propunerile LayoutXLM
                </Button>
              </div>

              <TokenPreview result={result} />
            </div>
          )}
        </AdminPanel>
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
                ? "LayoutXLM disponibil"
                : isActive
                  ? "LayoutXLM fallback"
                  : "Backend neverificat"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {isAvailable
                ? "Backend activ. Modelul layout-aware este disponibil."
                : isActive
                  ? "Backend activ. Model LayoutXLM indisponibil momentan. Se folosește modul fallback layout-aware."
                  : message || "Apasă Verifică backend pentru statusul serviciului local."}
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
            <TableHead>Câmpuri prezise de LayoutXLM</TableHead>
            <TableHead>Comparare cu extracția Document AI</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fieldOrder.map((field) => {
            const proposed = result.fields[field] ?? "";
            const current = documentAiFields?.[field] ?? "";
            const isVerified = verifiedFields.includes(field);
            const same = normalizeFieldValue(proposed) === normalizeFieldValue(current);

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
                      isVerified
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : proposed && current && same
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : proposed
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {isVerified
                      ? "Verificat manual"
                      : proposed && current && same
                        ? "Potrivire"
                        : proposed
                          ? "Propunere"
                          : "Lipsă"}
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
    success: "LayoutXLM disponibil",
    fallback: "Fallback layout-aware",
    unavailable: "Indisponibil",
  };

  return labels[value];
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

function normalizeFieldValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
