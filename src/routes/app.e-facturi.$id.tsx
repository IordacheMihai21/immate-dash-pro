import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { ArrowLeft, FileCode2, Info, Loader2 } from "lucide-react";
import { formatRON } from "@/lib/mock-data";
import { getInvoiceDetails } from "@/lib/invoiceService";

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

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Activ" as any;
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ" as any;
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv" as any;
  }

  return "Activ" as any;
}

function InvoiceDetail() {
  const { id } = Route.useParams();

  const [data, setData] = useState<InvoiceDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadInvoiceDetails() {
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
  }

  useEffect(() => {
    loadInvoiceDetails();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca detaliile facturii din baza de date...
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
  const supplier = getParty(invoice.suppliers as PartyRelation);
  const customer = getParty(invoice.customers as PartyRelation);
  const document = getDocument(invoice.documents as DocumentRelation);

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
        actions={<StatusBadge status={normalizeStatus(invoice.status)} />}
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Aceasta pagina afiseaza datele extrase automat din XML, liniile facturii,
          entitatile identificate si relatiile dintre acestea.
        </p>
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

            <Metric
              label="TVA"
              value={formatRON(Number(invoice.tax_amount ?? 0))}
            />

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
                      <TableCell className="font-medium">
                        {line.description ?? "-"}
                      </TableCell>
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
                      <TableCell className="font-medium">
                        {entity.entity_type}
                      </TableCell>
                      <TableCell>{entity.entity_value ?? "-"}</TableCell>
                      <TableCell>{entity.extraction_method ?? "xml_parser"}</TableCell>
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
                      <TableCell className="font-medium">
                        {relation.source_entity}
                      </TableCell>
                      <TableCell>{relation.relation_type}</TableCell>
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
              XML original salvat in baza de date
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
              {document?.original_content ?? "XML-ul original nu este disponibil."}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-xs" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${primary ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}