import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { AlertTriangle, BarChart3, FileJson, Trash2, UploadCloud } from "lucide-react";
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
      <InfoBanner icon={<BarChart3 className="h-4 w-4" />}>
        Evaluarea Document AI compara campurile extrase automat cu date adnotate si calculeaza
        metrici academice pentru validarea pipeline-ului.
      </InfoBanner>

      <div className="grid gap-3 md:grid-cols-5">
        {["Precizie", "Reamintire", "Scor F1", "Potrivire exactă", "Acuratețe pe câmpuri"].map(
          (metric) => (
            <div
              key={metric}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-950">{metric}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Calculat dupa incarcarea adnotarilor.
              </p>
            </div>
          ),
        )}
      </div>

      <AdminPanel
        title="Evaluare Document AI"
        description="Incarca sau lipeste JSON-ul adnotat si compara rezultatul cu extractia curenta."
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="predicted-json">Date extrase</Label>
              <Badge variant="outline" className="rounded-full">
                Predictie
              </Badge>
            </div>
            <Textarea
              id="predicted-json"
              value={predictedText}
              onChange={(event) => onPredictedTextChange(event.target.value)}
              placeholder='{"invoiceNumber":"INV-001","totalAmount":1200}'
              className="min-h-72 bg-slate-50 font-mono text-xs"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="expected-json">Date adnotate</Label>
              <div className="flex items-center gap-2">
                <Input
                  ref={expectedFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="max-w-56"
                  onChange={handleExpectedFileChange}
                />
              </div>
            </div>
            <Textarea
              id="expected-json"
              value={expectedText}
              onChange={(event) => updateExpectedAnnotation(event.target.value)}
              placeholder='{"invoiceNumber":"INV-001","totalAmount":1200}'
              className="min-h-72 bg-slate-50 font-mono text-xs"
            />
          </div>
        </div>

        {expectedFields && <ExpectedFieldsPreview fields={expectedFields} />}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={handleEvaluate} className="gap-2">
            <FileJson className="h-4 w-4" />
            Calculeaza evaluarea
          </Button>
          {(expectedText || result) && (
            <Button variant="outline" onClick={handleClearAnnotation} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Șterge adnotarea
            </Button>
          )}
          {!analysis && (
            <span className="text-sm text-slate-500">
              Nu există încă o extracție Document AI. Rulează mai întâi analiza unei facturi.
            </span>
          )}
        </div>
      </AdminPanel>

      <DatasetValidationCard />

      {result && <EvaluationResults result={result} />}
    </div>
  );
}

function EvaluationResults({ result }: { result: BatchEvaluationResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Precizie" value={formatPercent(result.precision)} />
        <MetricCard label="Reamintire" value={formatPercent(result.recall)} />
        <MetricCard label="Scor F1" value={formatPercent(result.f1Score)} />
        <MetricCard label="Potrivire exactă" value={formatPercent(result.exactMatchRate)} />
        <MetricCard label="Acuratețe pe câmpuri" value={formatPercent(result.fieldAccuracy)} />
        <MetricCard label="Documente evaluate" value={String(result.documentsEvaluated)} />
      </div>

      <AdminPanel
        title="Metrici pe campuri"
        description="Acuratete si erori calculate pentru fiecare camp extras."
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Camp</TableHead>
              <TableHead className="text-right">Acuratete</TableHead>
              <TableHead className="text-right">Campuri corecte</TableHead>
              <TableHead className="text-right">Campuri lipsa</TableHead>
              <TableHead className="text-right">Campuri incorecte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.fieldMetrics.map((field) => (
              <TableRow key={field.field}>
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
      </AdminPanel>

      <AdminPanel
        title="Rezultate pe document"
        description="Rezumat document-level si nepotriviri pentru fiecare document evaluat."
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Acuratețe pe câmpuri</TableHead>
              <TableHead>Neconcordante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.documents.map((document) => {
              const mismatches = document.fields.filter(
                (field) => field.missing || field.incorrect,
              );

              return (
                <TableRow key={document.documentId}>
                  <TableCell className="font-medium">{document.documentId}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        document.exactMatch
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                      )}
                    >
                      {document.exactMatch ? "Potrivire exactă" : "Necesită analiză"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(document.fieldAccuracy)}
                  </TableCell>
                  <TableCell>
                    {mismatches.length === 0 ? (
                      <span className="text-slate-500">Fara neconcordante</span>
                    ) : (
                      <div className="space-y-1">
                        {mismatches.slice(0, 4).map((field) => (
                          <div key={field.field} className="text-xs text-slate-600">
                            <span className="font-medium">{fieldLabels[field.field]}:</span>{" "}
                            Predicție: "{field.predicted || "-"}", Referință: "
                            {field.expected || "-"}"
                          </div>
                        ))}
                        {mismatches.length > 4 && (
                          <div className="text-xs text-slate-500">
                            +{mismatches.length - 4} alte campuri
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AdminPanel>
    </div>
  );
}

function DatasetValidationCard() {
  const datasets = ["SROIE", "CORD", "FATURA", "FUNSD", "XFUND"];

  return (
    <AdminPanel
      title="Validare pe seturi de date"
      description="Pregătit pentru validare pe seturi publice de documente adnotate."
    >
      <div className="flex flex-wrap gap-2">
        {datasets.map((dataset) => (
          <Badge key={dataset} variant="outline" className="rounded-full px-3 py-1">
            {dataset}
          </Badge>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Rezultatele sunt afisate numai dupa incarcarea adnotarilor si rularea evaluarii in IMMapp.
        </p>
      </div>
    </AdminPanel>
  );
}

function ExpectedFieldsPreview({ fields }: { fields: DocumentAiEvaluationFields }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">
            Câmpuri de referință extrase din dataset
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Aceste valori sunt folosite ca referință în calculul metricilor.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full bg-white">
          Referință
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {DOCUMENT_AI_EVALUATION_FIELDS.map((field) => (
          <div key={field} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {fieldLabels[field]}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-950">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
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
