import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Gauge, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSharedInvoice, type SharedInvoice } from "@/lib/invoiceShareService";
import { InvoicePdfDocument } from "@/lib/pdfInvoiceGenerator";
import { formatRON } from "@/lib/formatters";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";

export const Route = createFileRoute("/factura/$token")({
  head: () => ({ meta: [{ title: "Factura - IMMapp" }] }),
  component: PublicInvoicePage,
});

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ro-RO", { day: "2-digit", month: "long", year: "numeric" });
}

function PublicInvoicePage() {
  const { token } = Route.useParams();
  const [invoice, setInvoice] = useState<SharedInvoice | null | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    getSharedInvoice(token)
      .then(setInvoice)
      .catch(() => {
        setErrorMessage("Factura nu a putut fi incarcata.");
        setInvoice(null);
      });
  }, [token]);

  async function handleDownloadPdf() {
    if (!invoice) return;

    try {
      const blob = await pdf(
        <InvoicePdfDocument
          invoice={{
            invoiceNumber: invoice.invoice_number,
            issueDate: invoice.issue_date ?? "",
            dueDate: invoice.due_date,
            currency: invoice.currency ?? "RON",
            taxExclusiveAmount: Number(invoice.tax_exclusive_amount ?? 0),
            taxAmount: Number(invoice.tax_amount ?? 0),
            taxInclusiveAmount: Number(invoice.tax_inclusive_amount ?? 0),
            payableAmount: Number(invoice.payable_amount ?? 0),
            supplier: {
              name: invoice.supplier.name ?? "",
              cui: invoice.supplier.cui ?? "",
              address: invoice.supplier.address ?? "",
              city: invoice.supplier.city ?? "",
              country: invoice.supplier.country ?? "RO",
            },
            customer: {
              name: invoice.customer.name ?? "",
              cui: invoice.customer.cui ?? "",
              address: invoice.customer.address ?? "",
              city: invoice.customer.city ?? "",
              country: invoice.customer.country ?? "RO",
            },
            lines: invoice.lines.map((line) => ({
              lineNumber: line.line_number ?? "1",
              description: line.description ?? "",
              quantity: Number(line.quantity ?? 0),
              unitCode: line.unit_code ?? "buc",
              unitPrice: Number(line.unit_price ?? 0),
              lineTotal: Number(line.line_total ?? 0),
            })),
          }}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `factura-${invoice.invoice_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("PDF-ul facturii nu a putut fi generat.");
    }
  }

  return (
    <div className="immapp-landing min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Gauge className="h-3.5 w-3.5" />
          </span>
          IMMapp
        </div>

        {invoice === undefined ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se incarca factura...
          </div>
        ) : invoice === null || errorMessage ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
              <p className="font-medium text-foreground">
                {errorMessage || "Acest link nu mai este valabil."}
              </p>
              <p className="text-sm text-muted-foreground">
                Cere expeditorului un link nou catre aceasta factura.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <div>
                  <CardTitle className="text-xl">Factura {invoice.invoice_number}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Emisa la {formatDate(invoice.issue_date)}
                    {invoice.due_date ? ` · Scadenta la ${formatDate(invoice.due_date)}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPdf}>
                  <FileText className="h-4 w-4" />
                  Descarca PDF
                </Button>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Furnizor
                    </p>
                    <p className="font-medium text-foreground">{invoice.supplier.name || "-"}</p>
                    {invoice.supplier.cui ? (
                      <p className="text-muted-foreground">CUI: {invoice.supplier.cui}</p>
                    ) : null}
                    {invoice.supplier.address ? (
                      <p className="text-muted-foreground">{invoice.supplier.address}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Client
                    </p>
                    <p className="font-medium text-foreground">{invoice.customer.name || "-"}</p>
                    {invoice.customer.cui ? (
                      <p className="text-muted-foreground">CUI: {invoice.customer.cui}</p>
                    ) : null}
                    {invoice.customer.address ? (
                      <p className="text-muted-foreground">{invoice.customer.address}</p>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descriere</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Pret unitar</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.lines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                            Nu exista linii salvate pentru aceasta factura.
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoice.lines.map((line, index) => (
                          <TableRow key={`${line.line_number}-${index}`}>
                            <TableCell className="font-medium text-foreground">
                              {line.description ?? "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(line.quantity ?? 0)} {line.unit_code ?? ""}
                            </TableCell>
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
                </div>

                <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Valoare fara TVA</span>
                    <span className="tabular-nums">
                      {formatRON(Number(invoice.tax_exclusive_amount ?? 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>TVA</span>
                    <span className="tabular-nums">
                      {formatRON(Number(invoice.tax_amount ?? 0))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold text-foreground">
                    <span>Total de plata</span>
                    <span className="tabular-nums">
                      {formatRON(Number(invoice.payable_amount ?? 0))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              Aceasta pagina afiseaza un rezumat al facturii, partajat printr-un link privat.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
