import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileCode2, Info } from "lucide-react";
import { eInvoices, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/e-facturi/")({
  head: () => ({ meta: [{ title: "e-Facturi — IMMapp" }] }),
  component: EInvoicesPage,
});

function EInvoicesPage() {
  // TODO: XML parser integration (ANAF e-Factură)
  return (
    <div>
      <PageHeader
        title="e-Facturi"
        description="Facturi importate din fișiere XML conforme ANAF."
        actions={
          <Button size="lg" className="gap-2">
            <FileCode2 className="h-4 w-4" /> Importă e-Factură XML
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-foreground">
          Datele sunt extrase automat din fișierul XML și pot fi validate înainte de salvare.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr. factură</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Furnizor</TableHead>
                <TableHead>CUI furnizor</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>CUI client</TableHead>
                <TableHead className="text-right">Valoare fără TVA</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell>{inv.date}</TableCell>
                  <TableCell>{inv.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.supplierCui}</TableCell>
                  <TableCell>{inv.client}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.clientCui}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRON(inv.net)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRON(inv.vat)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatRON(inv.total)}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/e-facturi/$id" params={{ id: inv.id }}>Vezi</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
