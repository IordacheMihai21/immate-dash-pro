import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { BarChart3, CheckCircle2, CircleDashed, FileJson, Sparkles, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { DocumentAiAnalysis } from "@/lib/documentAiService";
import {
  DOCUMENT_AI_EVALUATION_FIELDS,
  evaluateBatch,
  hasEvaluationFields,
  parseFaturaAnnotationToExpected,
  type BatchEvaluationItem,
  type BatchEvaluationResult,
  type DocumentAiEvaluationFields,
} from "@/lib/documentAiEvaluationService";
import { cn } from "@/lib/utils";

const fieldLabels: Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], string> = {
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

export function DocumentAiEvaluation({
  analysis,
  predictedText,
  expectedText,
  expectedFields,
  result,
  onPredictedTextChange,
  onExpectedTextChange,
  onExpectedFieldsChange,
  onResultChange,
  onClearAnnotation,
}: {
  analysis: DocumentAiAnalysis | null;
  predictedText: string;
  expectedText: string;
  expectedFields: DocumentAiEvaluationFields | null;
  result: BatchEvaluationResult | null;
  onPredictedTextChange: (value: string) => void;
  onExpectedTextChange: (value: string) => void;
  onExpectedFieldsChange: (fields: DocumentAiEvaluationFields | null) => void;
  onResultChange: (result: BatchEvaluationResult | null) => void;
  onClearAnnotation: () => void;
}) {
  const expectedFileInputRef = useRef<HTMLInputElement | null>(null);
  const predictedFromAnalysis = useMemo(
    () => (analysis ? toEvaluationFields(analysis.fields) : null),
    [analysis],
  );

  useEffect(() => {
    if (predictedFromAnalysis && !predictedText.trim()) {
      onPredictedTextChange(JSON.stringify(predictedFromAnalysis, null, 2));
    }
  }, [onPredictedTextChange, predictedFromAnalysis, predictedText]);

  async function handleExpectedFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      updateExpectedAnnotation(await file.text());
      toast.success("Fisierul JSON a fost incarcat.");
    } catch {
      toast.error("Fisierul JSON nu a putut fi citit.");
    }
  }

  function updateExpectedAnnotation(value: string) {
    onExpectedTextChange(value);
    onResultChange(null);

    if (!value.trim()) {
      onExpectedFieldsChange(null);
      return;
    }

    try {
      const payload = JSON.parse(value);
      const parsed = parseFaturaAnnotationToExpected(payload);

      onExpectedFieldsChange(hasEvaluationFields(parsed) ? parsed : null);
    } catch {
      onExpectedFieldsChange(null);
    }
  }

  function handleClearAnnotation() {
    onClearAnnotation();

    if (expectedFileInputRef.current) {
      expectedFileInputRef.current.value = "";
    }
  }

  function handleEvaluate() {
    try {
      const predictedPayload = parseJsonObject(predictedText, "Datele extrase");
      const expectedPayload = parseJsonObject(expectedText, "Datele adnotate");
      const items = buildEvaluationItems(predictedPayload, expectedPayload);

      if (items.length === 0) {
        toast.error("Adauga cel putin un document pentru evaluare.");
        return;
      }

      if (items.every((item) => !hasEvaluationFields(item.expected))) {
        toast.error("Nu s-au putut extrage câmpuri de referință din adnotarea încărcată.");
        return;
      }

      onResultChange(evaluateBatch(items));
      toast.success("Evaluarea Document AI a fost calculata.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Evaluarea nu a putut fi calculata.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Evaluare AI activă
            </div>
            <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
              Validare automată pe dataset FATURA
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-sidebar-foreground/80 sm:text-base">
              Compară datele extrase de IMMapp cu adnotările de referință și calculează metrici
              precum Precizie, Reamintire, Scor F1 și Acuratețe pe câmpuri.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <EvaluationHeroStatus label="Dataset FATURA" active />
            <EvaluationHeroStatus
              label={result ? "F1 calculat" : "Metrici automate"}
              active={Boolean(result)}
            />
            <EvaluationHeroStatus
              label={result ? "Neconcordanțe afișate" : "Comparație câmpuri"}
              active={Boolean(result || expectedFields)}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      <InfoBanner icon={<BarChart3 className="h-4 w-4" />}>
        Evaluarea compară câmpurile extrase automat cu adnotările de referință din datasetul FATURA.
        Câmpurile absente din referință nu sunt obligatorii și nu reduc scorurile.
      </InfoBanner>

      <EvaluationMetricOverview result={result} />

      <AdminPanel
        title="Pregătire evaluare"
        description="Încarcă adnotarea de referință și compară cu extracția curentă."
        className="overflow-hidden rounded-3xl shadow-sm"
      >
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-muted p-4 sm:p-5">
            <div className="flex min-h-10 items-start justify-between gap-3">
              <Label htmlFor="predicted-json">Date extrase automat</Label>
              <Badge variant="outline" className="rounded-full bg-card">
                Predicție
              </Badge>
            </div>
            <Textarea
              id="predicted-json"
              value={predictedText}
              onChange={(event) => onPredictedTextChange(event.target.value)}
              placeholder='{"invoiceNumber":"INV-001","totalAmount":1200}'
              className="mt-3 min-h-72 flex-1 bg-card font-mono text-xs"
            />
            <p className="mt-3 flex min-h-10 items-center text-xs leading-5 text-muted-foreground">
              Datele sunt preluate automat din ultima analiză Document AI și pot fi revizuite.
            </p>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-border bg-muted p-4 sm:p-5">
            <div className="flex min-h-10 items-start justify-between gap-3">
              <Label htmlFor="expected-json">Adnotare de referință</Label>
              <Badge variant="outline" className="rounded-full bg-card">
                Referință
              </Badge>
            </div>
            <Textarea
              id="expected-json"
              value={expectedText}
              onChange={(event) => updateExpectedAnnotation(event.target.value)}
              placeholder='{"invoiceNumber":"INV-001","totalAmount":1200}'
              className="mt-3 min-h-72 flex-1 bg-card font-mono text-xs"
            />
            <div className="mt-3 flex min-h-10 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Încarcă fișierul JSON de referință
              </span>
              <Input
                ref={expectedFileInputRef}
                type="file"
                accept=".json,application/json"
                aria-label="Încarcă adnotarea de referință"
                className="w-full bg-card sm:max-w-72"
                onChange={handleExpectedFileChange}
              />
            </div>
          </div>
        </div>

        {expectedFields && <ExpectedFieldsPreview fields={expectedFields} />}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={handleEvaluate} className="gap-2">
            <FileJson className="h-4 w-4" />
            Calculează evaluarea
          </Button>
          {(expectedText || result) && (
            <Button variant="outline" onClick={handleClearAnnotation} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Șterge adnotarea
            </Button>
          )}
          {!analysis && (
            <span className="text-sm text-muted-foreground">
              Nu există încă o extracție Document AI. Rulează mai întâi analiza unei facturi.
            </span>
          )}
        </div>
      </AdminPanel>

      {result && <EvaluationResults result={result} />}
    </div>
  );
}

function EvaluationResults({ result }: { result: BatchEvaluationResult }) {
  return (
    <div className="space-y-6">
      <AdminPanel
        title="Performanță pe câmpuri"
        description="Acuratețe și erori calculate pentru fiecare câmp extras."
        className="overflow-hidden rounded-3xl shadow-sm"
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Câmp</TableHead>
                <TableHead className="text-right">Acuratețe</TableHead>
                <TableHead className="text-right">Corecte</TableHead>
                <TableHead className="text-right">Lipsă</TableHead>
                <TableHead className="text-right">Incorecte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.fieldMetrics.map((field) => (
                <TableRow key={field.field} className="hover:bg-muted">
                  <TableCell className="font-medium">{fieldLabels[field.field]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(field.accuracy)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{field.correct}</TableCell>
                  <TableCell className="text-right tabular-nums">{field.missing}</TableCell>
                  <TableCell className="text-right tabular-nums">{field.incorrect}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Rezultate pe document"
        description="Rezumatul calității pentru fiecare document evaluat."
        className="overflow-hidden rounded-3xl shadow-sm"
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Acuratețe pe câmpuri</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.documents.map((document) => {
              return (
                <TableRow key={document.documentId} className="hover:bg-muted">
                  <TableCell className="font-medium">{document.documentId}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        (document.strictExactMatch ?? false) ||
                          (document.normalizedExactMatch ?? document.exactMatch)
                          ? "border-success/30 bg-success/15 text-success"
                          : "border-warning/40 bg-warning/20 text-warning",
                      )}
                    >
                      {document.strictExactMatch
                        ? "Exact strict"
                        : (document.normalizedExactMatch ?? document.exactMatch)
                          ? "Exact normalizat"
                          : "Necesită analiză"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(document.fieldAccuracy)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AdminPanel>

      <MismatchPanel result={result} />
    </div>
  );
}

function ExpectedFieldsPreview({ fields }: { fields: DocumentAiEvaluationFields }) {
  return (
    <div className="mt-5 rounded-2xl border border-border bg-muted p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">
            Câmpuri de referință extrase din dataset
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Aceste valori sunt folosite ca referință în calculul metricilor.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full bg-card">
          Referință
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {DOCUMENT_AI_EVALUATION_FIELDS.map((field) => (
          <div key={field} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {fieldLabels[field]}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-foreground">
              {formatFieldValue(fields[field]) || "-"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function EvaluationHeroStatus({
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

function EvaluationMetricOverview({ result }: { result: BatchEvaluationResult | null }) {
  const metrics = [
    { label: "Precizie", value: result ? formatPercent(result.precision) : "—" },
    { label: "Reamintire", value: result ? formatPercent(result.recall) : "—" },
    { label: "Scor F1", value: result ? formatPercent(result.f1Score) : "—" },
    {
      label: "Exact strict",
      value: result ? formatPercent(result.strictExactMatchRate ?? result.exactMatchRate) : "—",
    },
    {
      label: "Exact normalizat",
      value: result ? formatPercent(result.normalizedExactMatchRate ?? result.exactMatchRate) : "—",
    },
    { label: "Acuratețe pe câmpuri", value: result ? formatPercent(result.fieldAccuracy) : "—" },
    { label: "Documente evaluate", value: result ? String(result.documentsEvaluated) : "0" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}

function MismatchPanel({ result }: { result: BatchEvaluationResult }) {
  const mismatches = result.documents.flatMap((document) =>
    document.fields
      .filter((field) => field.missing || field.incorrect)
      .map((field) => ({ ...field, documentId: document.documentId })),
  );

  return (
    <AdminPanel
      title="Diferențe identificate"
      description="Valorile care merită verificate între predicție și referință."
      className="overflow-hidden rounded-3xl shadow-sm"
    >
      {mismatches.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/15 p-4 text-sm font-medium text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          Nu au fost identificate diferențe.
        </div>
      ) : (
        <div className="space-y-3">
          {mismatches.map((field) => (
            <div
              key={`${field.documentId}-${field.field}`}
              className="rounded-2xl border border-warning/25 bg-warning/20/50 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{fieldLabels[field.field]}</p>
                <Badge variant="outline" className="rounded-full bg-card text-muted-foreground">
                  {field.documentId}
                </Badge>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <DifferenceValue label="Predicție" value={field.predicted || "—"} />
                <DifferenceValue label="Referință" value={field.expected || "—"} />
                <DifferenceValue
                  label="Diferență"
                  value={field.missing ? "Valoare lipsă" : "Valori diferite"}
                  accent
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  );
}

function DifferenceValue({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words font-medium text-foreground", accent && "text-warning")}>
        {value}
      </p>
    </div>
  );
}

function parseJsonObject(value: string, label: string): unknown {
  if (!value.trim()) {
    throw new Error(`${label}: completeaza JSON-ul pentru evaluare.`);
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label}: JSON invalid.`);
  }
}

function buildEvaluationItems(
  predictedPayload: unknown,
  expectedPayload: unknown,
): BatchEvaluationItem[] {
  if (Array.isArray(expectedPayload)) {
    return expectedPayload.map((item, index) => {
      const record = isRecord(item) ? item : {};
      const predictedFromItem = isRecord(record.predicted) ? record.predicted : undefined;
      const expectedFromItem = resolveExpectedFields(
        isRecord(record.expected) || isRecord(record.groundTruth)
          ? (record.expected ?? record.groundTruth)
          : record,
      );

      return {
        documentId:
          typeof record.documentId === "string" ? record.documentId : `Document ${index + 1}`,
        predicted: resolvePredictedFields(
          predictedFromItem ??
            (Array.isArray(predictedPayload) && isRecord(predictedPayload[index])
              ? predictedPayload[index]
              : predictedPayload),
        ),
        expected: expectedFromItem,
      };
    });
  }

  const expectedRecord = isRecord(expectedPayload) ? expectedPayload : {};
  const predictedRecord = isRecord(predictedPayload) ? predictedPayload : {};
  const expectedSource =
    isRecord(expectedRecord.expected) || isRecord(expectedRecord.groundTruth)
      ? (expectedRecord.expected ?? expectedRecord.groundTruth)
      : expectedRecord;
  const predictedSource = isRecord(predictedRecord.predicted)
    ? predictedRecord.predicted
    : predictedRecord;

  return [
    {
      documentId: "Document curent",
      predicted: resolvePredictedFields(predictedSource),
      expected: resolveExpectedFields(expectedSource),
    },
  ];
}

function resolveExpectedFields(value: unknown): DocumentAiEvaluationFields {
  if (!isRecord(value)) {
    return {};
  }

  const directFields = toEvaluationFields(value);

  if (hasEvaluationFields(directFields)) {
    return directFields;
  }

  return parseFaturaAnnotationToExpected(value);
}

function resolvePredictedFields(value: unknown): DocumentAiEvaluationFields {
  return isRecord(value) ? toEvaluationFields(value) : {};
}

function toEvaluationFields(
  fields: Partial<Record<(typeof DOCUMENT_AI_EVALUATION_FIELDS)[number], unknown>>,
): DocumentAiEvaluationFields {
  return DOCUMENT_AI_EVALUATION_FIELDS.reduce((acc, field) => {
    return {
      ...acc,
      [field]: fields[field] ?? "",
    };
  }, {} as DocumentAiEvaluationFields);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatFieldValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
