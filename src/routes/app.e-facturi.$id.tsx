import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Info } from "lucide-react";
import { eInvoices, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/e-facturi/$id")({
  head: ({ params }) => ({ meta: [{ title: `Factură ${params.id} — IMMapp` }] }),
  loader: ({ params }) => {
    const invoice = eInvoices.find((i) => i.id === params.id);
    if (!invoice) throw notFound();
    return { invoice };
  },
  component: InvoiceDetail,
  notFoundComponent: () => (
    <div className="p-8 text-center text-muted-foreground">Factura nu a fost găsită.</div>
  ),
});

function InvoiceDetail() {
  // TODO: XML parser integration — bind data from parsed XML
  const { invoice } = Route.useLoaderData();

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-1">
        <Link to="/app/e-facturi">
          <ArrowLeft className="h-4 w-4" /> Înapoi la e-Facturi
        </Link>
      </Button>

      <PageHeader
        title={`Factură ${invoice.number}`}
        description={`Emisă la ${invoice.date}`}
        actions={<StatusBadge status={invoice.status} />}
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>Datele sunt extrase automat din fișierul XML și pot fi validate înainte de salvare.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Date generale</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Număr" value={invoice.number} />
            <Row label="Data" value={invoice.date} />
            <Row label="ID intern" value={invoice.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Furnizor</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Denumire" value={invoice.supplier} />
            <Row label="CUI" value={invoice.supplierCui} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Client</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Denumire" value={invoice.client} />
            <Row label="CUI" value={invoice.clientCui} mono />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Valori financiare</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Valoare fără TVA" value={formatRON(invoice.net)} />
            <Metric label="TVA (19%)" value={formatRON(invoice.vat)} />
            <Metric label="Total" value={formatRON(invoice.total)} primary />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Linii factură</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produs / Serviciu</TableHead>
                  <TableHead className="text-right">Cantitate</TableHead>
                  <TableHead className="text-right">Preț unitar</TableHead>
                  <TableHead className="text-right">TVA (%)</TableHead>
                  <TableHead className="text-right">Total linie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{l.product}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRON(l.price)}</TableCell>
                    <TableCell className="text-right">{l.vat}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRON(l.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
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
