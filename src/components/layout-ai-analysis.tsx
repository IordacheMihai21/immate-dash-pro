import { useState, type ChangeEvent } from "react";
import { AlertTriangle, BrainCircuit, Loader2, Network, UploadCloud } from "lucide-react";
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
  analyzeLayoutWithModel,
  getLayoutAiBackendUrl,
  isLayoutAiBackendConfigured,
  type LayoutAiResult,
} from "@/lib/layoutAiClient";
import { cn } from "@/lib/utils";

const unavailableMessage =
  "Analiza LayoutLM/LayoutXLM nu este disponibilă momentan. Fluxul OCR local rămâne activ.";

export function LayoutAiAnalysis() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<LayoutAiResult | null>(null);
  const [message, setMessage] = useState("");
  const backendConfigured = isLayoutAiBackendConfigured();
  const backendUrl = getLayoutAiBackendUrl();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setResult(null);
    setMessage("");
  }

  async function handleRunLayoutAnalysis() {
    if (!backendConfigured) {
      setMessage(unavailableMessage);
      return;
    }

    if (!selectedFile) {
      toast.error("Selecteaza un document pentru analiza layout.");
      return;
    }

    try {
      setIsRunning(true);
      setMessage("");
      setResult(await analyzeLayoutWithModel(selectedFile));
      toast.success("Analiza LayoutLM/LayoutXLM a fost finalizata.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : unavailableMessage;
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <InfoBanner icon={<BrainCircuit className="h-4 w-4" />}>
        Analiza Layout AI completeaza fluxul OCR local cu modele specializate pentru tokeni,
        pozitii, etichete si entitati extrase din documente.
      </InfoBanner>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <AdminPanel
          title="Status conector Layout AI"
          description="Pregatit pentru integrare cu LayoutLM/LayoutXLM prin endpoint dedicat."
        >
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-2xl border p-4",
                backendConfigured
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-xl p-3",
                      backendConfigured
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700",
                    )}
                  >
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">
                      {backendConfigured ? "Conector configurat" : "Conector neconfigurat"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {backendConfigured
                        ? "Endpointul este pregatit pentru rularea modelului."
                        : unavailableMessage}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full bg-white">
                  LayoutLM/LayoutXLM
                </Badge>
              </div>
            </div>

            {backendConfigured && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Conector activ: <span className="font-medium text-slate-950">{backendUrl}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="layout-ai-file">Document pentru analiza layout</Label>
              <Input
                id="layout-ai-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
              />
            </div>

            <Button onClick={handleRunLayoutAnalysis} disabled={isRunning} className="gap-2">
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Rulează analiză LayoutLM/LayoutXLM
            </Button>

            {message && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{message}</p>
              </div>
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          title="Rezultat analiza layout"
          description="Tokeni, pozitii, etichete si entitati returnate de model."
          contentClassName="p-0"
        >
          {!result ? (
            <div className="flex min-h-[300px] items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-slate-950">Asteapta analiza modelului</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Cand serviciul este disponibil, rezultatul va afisa modelul folosit, tokenii OCR,
                  bounding box-urile, etichetele si scorurile de incredere.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultMetric label="Model" value={result.modelName ?? "LayoutLM/LayoutXLM"} />
                <ResultMetric label="Tokeni OCR" value={String(result.tokens.length)} />
                <ResultMetric label="Entitati" value={String(result.entities.length)} />
              </div>

              {result.warnings.length > 0 && (
                <InfoBanner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                  <div className="space-y-1">
                    {result.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </InfoBanner>
              )}

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-950">Entitati extrase</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.entities.length === 0 ? (
                    <p className="text-sm text-slate-500">Nu exista entitati returnate.</p>
                  ) : (
                    result.entities.map((entity, index) => (
                      <div key={`${entity.type}-${index}`} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-950">{entity.type}</p>
                        <p className="mt-1 text-sm text-slate-600">{entity.value}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Incredere: {formatConfidence(entity.confidence)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Eticheta</TableHead>
                      <TableHead>Bounding box</TableHead>
                      <TableHead className="text-right">Incredere</TableHead>
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
            </div>
          )}
        </AdminPanel>
      </div>
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

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}
