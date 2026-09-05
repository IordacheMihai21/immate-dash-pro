import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FileCode2,
  FileText,
  Info,
  Link2,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { RecordDiscussion } from "@/components/record-discussion";
import { formatRON } from "@/lib/formatters";
import {
  getInvoiceDetails,
  updateInvoicePaymentStatus,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/invoiceService";
import { getActiveCompanyCui } from "@/lib/companyService";
import { classifyInvoiceForCompany } from "@/lib/cuiUtils";
import { buildPaymentReminderMessage } from "@/lib/paymentReminder";
import { enableInvoiceShare, disableInvoiceShare } from "@/lib/invoiceShareService";
import { generateUblInvoiceXml } from "@/lib/ublInvoiceGenerator";
import { InvoicePdfDocument } from "@/lib/pdfInvoiceGenerator";
import { cn } from "@/lib/utils";
import { pdf } from "@react-pdf/renderer";

export const Route = createFileRoute("/app/e-facturi/$id")({
  head: ({ params }) => ({ meta: [{ title: `Factura ${params.id} — IMMapp` }] }),
  component: InvoiceDetail,
});

type PartyRelation =
  | {
      name: string | null;
      cui: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
    }
  | {
      name: string | null;
      cui: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
    }[]
  | null
  | undefined;

type DocumentRelation =
  | {
      id: string | null;
      file_name: string | null;
      document_type: string | null;
      original_content: string | null;
      uploaded_at: string | null;
    }
  | {
      id: string | null;
      file_name: string | null;
      document_type: string | null;
      original_content: string | null;
      uploaded_at: string | null;
    }[]
  | null
  | undefined;

type InvoiceDetailsData = Awaited<ReturnType<typeof getInvoiceDetails>>;
type StatusBadgeValue = Parameters<typeof StatusBadge>[0]["status"];

function getParty(party: PartyRelation) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function getDocument(document: DocumentRelation) {
  if (!document) {
    return null;
  }

  if (Array.isArray(document)) {
    return document[0] ?? null;
  }

  return document;
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

type PaymentBadgeState = "Platita" | "Restanta" | "Neplatita";

function getPaymentBadgeState(invoice: {
  due_date: string | null;
  payment_status: string | null;
}): PaymentBadgeState {
  if (invoice.payment_status === "platita") {
    return "Platita";
  }

  if (invoice.due_date) {
    const dueDate = new Date(invoice.due_date);

    if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) {
      return "Restanta";
    }
  }

  return "Neplatita";
}

const paymentBadgeStyles: Record<PaymentBadgeState, string> = {
  Platita: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Restanta: "border-destructive/30 bg-destructive/10 text-destructive",
  Neplatita: "border-border bg-muted text-muted-foreground",
};

function PaymentStatusRow({
  invoice,
  isRevenue,
  customerName,
  supplierName,
  onUpdated,
}: {
  invoice: {
    id: string;
    invoice_number: string;
    due_date: string | null;
    payment_status: string | null;
    payment_date: string | null;
    payment_method: string | null;
    payable_amount: number | null;
  };
  isRevenue: boolean;
  customerName: string;
  supplierName: string;
  onUpdated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = getPaymentBadgeState(invoice);

  async function handleCopyReminder() {
    if (!invoice.due_date) {
      return;
    }

    const message = buildPaymentReminderMessage({
      customerName,
      invoiceNumber: invoice.invoice_number,
      payableAmount: Number(invoice.payable_amount ?? 0),
      dueDate: invoice.due_date,
      supplierName,
    });

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mesaj de reminder copiat in clipboard.");
    } catch {
      toast.error("Nu am putut copia mesajul in clipboard.");
    }
  }

  async function handleMarkPaid() {
    try {
      setIsSubmitting(true);
      await updateInvoicePaymentStatus(invoice.id, {
        status: "platita",
        paymentDate,
        paymentMethod,
      });
      toast.success(`Factura ${invoice.invoice_number} marcata ca platita.`);
      setOpen(false);
      await onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Statusul platii nu a putut fi actualizat.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMarkUnpaid() {
    try {
      await updateInvoicePaymentStatus(invoice.id, { status: "neplatita" });
      toast.success(`Factura ${invoice.invoice_number} marcata ca neplatita.`);
      await onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Statusul platii nu a putut fi actualizat.",
      );
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Status plata</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              paymentBadgeStyles[state],
            )}
          >
            {state}
          </span>
          {state === "Platita" ? (
            <button
              type="button"
              onClick={handleMarkUnpaid}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Anuleaza
            </button>
          ) : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                  Marcheaza platita
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Marcheaza factura ca platita</DialogTitle>
                  <DialogDescription>
                    Factura {invoice.invoice_number} va fi marcata ca incasata.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="detail-payment-date">Data platii</Label>
                    <Input
                      id="detail-payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="detail-payment-method">Metoda de plata</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                    >
                      <SelectTrigger id="detail-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                    Anuleaza
                  </Button>
                  <Button onClick={handleMarkPaid} disabled={isSubmitting || !paymentDate}>
                    {isSubmitting ? "Se salveaza..." : "Confirma plata"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {state === "Restanta" && isRevenue ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              title="Copiaza un mesaj de reminder pentru client"
              onClick={handleCopyReminder}
            >
              <ClipboardCopy className="h-3 w-3" />
              Reminder
            </Button>
          ) : null}
        </div>
      </div>

      {state === "Platita" && (invoice.payment_date || invoice.payment_method) ? (
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>Detalii plata</span>
          <span>
            {invoice.payment_date
              ? new Date(invoice.payment_date).toLocaleDateString("ro-RO")
              : "-"}
            {invoice.payment_method ? ` · ${invoice.payment_method}` : ""}
          </span>
        </div>
      ) : null}
    </>
  );
}

function InvoiceShareCard({
  invoiceId,
  invoiceNumber,
  shareToken,
  onUpdated,
}: {
  invoiceId: string;
  invoiceNumber: string;
  shareToken: string | null;
  onUpdated: () => void | Promise<void>;
}) {
  const [isWorking, setIsWorking] = useState(false);

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/factura/${shareToken}`
    : "";

  async function handleEnable() {
    try {
      setIsWorking(true);
      await enableInvoiceShare(invoiceId);
      toast.success("Link public generat.");
      await onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Linkul nu a putut fi generat.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDisable() {
    try {
      setIsWorking(true);
      await disableInvoiceShare(invoiceId);
      toast.success("Link public revocat.");
      await onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Linkul nu a putut fi revocat.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiat in clipboard.");
    } catch {
      toast.error("Nu am putut copia linkul in clipboard.");
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Link public pentru client</p>
            <p className="text-xs text-muted-foreground">
              {shareToken
                ? "Oricine are acest link poate vedea si descarca factura, fara cont."
                : `Genereaza un link pe care sa il trimiti clientului pentru factura ${invoiceNumber}.`}
            </p>
          </div>
        </div>

        {shareToken ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} className="h-8 w-64 bg-card text-xs" />
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copiaza
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisable}
              disabled={isWorking}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Revoca
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnable}
            disabled={isWorking}
            className="gap-1.5"
          >
            <Link2 className="h-3.5 w-3.5" />
            Genereaza link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceDetail() {
  const { id } = Route.useParams();

  const [data, setData] = useState<InvoiceDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [companyCui, setCompanyCui] = useState("");

  const loadInvoiceDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const details = await getInvoiceDetails(id);
      setData(details);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la incarcarea detaliilor facturii.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoiceDetails();
  }, [loadInvoiceDetails]);

  useEffect(() => {
    getActiveCompanyCui()
      .then(setCompanyCui)
      .catch(() => setCompanyCui(""));
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca detaliile facturii...
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-3 gap-1">
          <Link to="/app/e-facturi">
            <ArrowLeft className="h-4 w-4" /> Inapoi la e-Facturi
          </Link>
        </Button>

        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage || "Factura nu a fost gasita."}
        </div>
      </div>
    );
  }

  const invoice = data.invoice;
  const lines = data.lines;
  const supplier = getParty(invoice.suppliers as PartyRelation);
  const customer = getParty(invoice.customers as PartyRelation);
  const document = getDocument(invoice.documents as DocumentRelation);
  const isDocumentAiDocument = document?.document_type === "document-ai";

  function buildInvoiceExportData() {
    return {
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date ?? "",
      dueDate: invoice.due_date,
      currency: invoice.currency ?? "RON",
      taxExclusiveAmount: Number(invoice.tax_exclusive_amount ?? 0),
      taxAmount: Number(invoice.tax_amount ?? 0),
      taxInclusiveAmount: Number(invoice.tax_inclusive_amount ?? 0),
      payableAmount: Number(invoice.payable_amount ?? 0),
      supplier: {
        name: supplier?.name ?? "",
        cui: supplier?.cui ?? "",
        address: supplier?.address ?? "",
        city: supplier?.city ?? "",
        country: supplier?.country ?? "RO",
      },
      customer: {
        name: customer?.name ?? "",
        cui: customer?.cui ?? "",
        address: customer?.address ?? "",
        city: customer?.city ?? "",
        country: customer?.country ?? "RO",
      },
      lines: lines.map((line) => ({
        lineNumber: line.line_number ?? "1",
        description: line.description ?? "",
        quantity: Number(line.quantity ?? 0),
        unitCode: line.unit_code ?? "buc",
        unitPrice: Number(line.unit_price ?? 0),
        lineTotal: Number(line.line_total ?? 0),
      })),
    };
  }

  function handleDownloadXml() {
    try {
      const xml = generateUblInvoiceXml(buildInvoiceExportData());

      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoice_number}.xml`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "XML-ul UBL nu a putut fi generat.");
    }
  }

  async function handleDownloadPdf() {
    try {
      const blob = await pdf(<InvoicePdfDocument invoice={buildInvoiceExportData()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `factura-${invoice.invoice_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF-ul facturii nu a putut fi generat.",
      );
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-1">
        <Link to="/app/e-facturi">
          <ArrowLeft className="h-4 w-4" /> Inapoi la e-Facturi
        </Link>
      </Button>

      <PageHeader
        title={`Factura ${invoice.invoice_number}`}
        description={`Emisa la ${invoice.issue_date ?? "-"}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPdf}>
              <FileText className="h-4 w-4" />
              Descarca PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadXml}>
              <Download className="h-4 w-4" />
              Descarca XML e-Factura
            </Button>
            <StatusBadge status={normalizeStatus(invoice.status)} />
          </>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Aceasta pagina afiseaza datele extrase automat din document, liniile facturii, entitatile
          identificate si relatiile dintre acestea.
        </p>
      </div>

      <InvoiceShareCard
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        shareToken={invoice.share_token}
        onUpdated={loadInvoiceDetails}
      />

      <div className="mb-4">
        <RecordDiscussion entityType="invoice" entityId={invoice.id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Date generale</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            <Row label="Numar" value={invoice.invoice_number} />
            <Row label="Data emitere" value={invoice.issue_date ?? "-"} />
            <Row label="Data scadenta" value={invoice.due_date ?? "-"} />
            <Row label="Moneda" value={invoice.currency ?? "RON"} />
            <Row label="ID intern" value={invoice.id} mono />
            <PaymentStatusRow
              invoice={invoice}
              isRevenue={classifyInvoiceForCompany(invoice, companyCui) === "revenue"}
              customerName={customer?.name ?? ""}
              supplierName={supplier?.name ?? ""}
              onUpdated={loadInvoiceDetails}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Furnizor</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            <Row label="Denumire" value={supplier?.name ?? "Furnizor necunoscut"} />
            <Row label="CUI" value={supplier?.cui ?? "-"} mono />
            <Row label="Adresa" value={supplier?.address ?? "-"} />
            <Row label="Oras" value={supplier?.city ?? "-"} />
            <Row label="Tara" value={supplier?.country ?? "RO"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Client</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            <Row label="Denumire" value={customer?.name ?? "Client necunoscut"} />
            <Row label="CUI" value={customer?.cui ?? "-"} mono />
            <Row label="Adresa" value={customer?.address ?? "-"} />
            <Row label="Oras" value={customer?.city ?? "-"} />
            <Row label="Tara" value={customer?.country ?? "RO"} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Valori financiare</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Metric
              label="Valoare fara TVA"
              value={formatRON(Number(invoice.tax_exclusive_amount ?? 0))}
            />

            <Metric label="TVA" value={formatRON(Number(invoice.tax_amount ?? 0))} />

            <Metric
              label="Valoare cu TVA"
              value={formatRON(Number(invoice.tax_inclusive_amount ?? 0))}
            />

            <Metric
              label="Total de plata"
              value={formatRON(Number(invoice.payable_amount ?? 0))}
              primary
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Linii factura</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr.</TableHead>
                  <TableHead>Produs / Serviciu</TableHead>
                  <TableHead className="text-right">Cantitate</TableHead>
                  <TableHead>UM</TableHead>
                  <TableHead className="text-right">Pret unitar</TableHead>
                  <TableHead className="text-right">Total linie</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      Nu exista linii salvate pentru aceasta factura.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.line_number ?? "-"}</TableCell>
                      <TableCell className="font-medium">{line.description ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(line.quantity ?? 0)}
                      </TableCell>
                      <TableCell>{line.unit_code ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(Number(line.unit_price ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(Number(line.line_total ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Entitati extrase automat</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip entitate</TableHead>
                  <TableHead>Valoare extrasa</TableHead>
                  <TableHead>Metoda</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.entities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nu exista entitati extrase.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.entities.map((entity) => (
                    <TableRow key={entity.id}>
                      <TableCell className="font-medium">{entity.entity_type}</TableCell>
                      <TableCell>{entity.entity_value ?? "-"}</TableCell>
                      <TableCell>{formatExtractionMethod(entity.extraction_method)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(entity.confidence ?? 1).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Relatii intre entitati</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entitate sursa</TableHead>
                  <TableHead>Relatie</TableHead>
                  <TableHead>Entitate tinta</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.relations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      Nu exista relatii salvate.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.relations.map((relation) => (
                    <TableRow key={relation.id}>
                      <TableCell className="font-medium">{relation.source_entity}</TableCell>
                      <TableCell>{formatRelationType(relation.relation_type)}</TableCell>
                      <TableCell>{relation.target_entity}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileCode2 className="h-4 w-4" />
              {isDocumentAiDocument ? "Text extras din document" : "XML original al facturii"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
              <Row label="Fisier" value={document?.file_name ?? "-"} />
              <Row label="Tip" value={document?.document_type ?? "e-factura"} />
              <Row
                label="Incarcat la"
                value={document?.uploaded_at ? document.uploaded_at.slice(0, 10) : "-"}
              />
            </div>

            <pre className="max-h-96 overflow-auto rounded-md border border-border bg-secondary/30 p-4 text-xs">
              {document?.original_content ??
                (isDocumentAiDocument
                  ? "Textul extras nu este disponibil."
                  : "XML-ul original nu este disponibil.")}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatExtractionMethod(value: string | null | undefined) {
  if (!value) {
    return "Automat";
  }

  return "Automat";
}

function formatRelationType(value: string | null | undefined) {
  const labels: Record<string, string> = {
    are_furnizor: "Furnizor",
    are_client: "Client",
    are_total_de_plata: "Total de plata",
    are_tva: "TVA",
    emite: "Emite",
    primeste: "Primeste",
    contine_linii_factura: "Contine linii factura",
    include_tva: "Include TVA",
    este_furnizor: "Este furnizor",
    este_client: "Este client",
    necesita_asociere: "Necesita asociere",
  };

  if (!value) {
    return "-";
  }

  return labels[value] ?? value.replace(/_/g, " ");
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function Metric({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${primary ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
