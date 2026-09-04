import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, ReceiptText, TrendingUp, Truck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSupplierSummaries } from "@/hooks/use-party-summaries";
import { downloadCsv, todayForFilename } from "@/lib/csvExport";
import { formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/furnizori")({
  head: () => ({ meta: [{ title: "Furnizori — IMMapp" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { data: suppliers, isLoading } = useSupplierSummaries();

  const top = suppliers?.[0] ?? null;
  const totalValue = suppliers?.reduce((sum, supplier) => sum + supplier.totalValue, 0) ?? 0;

  function handleExportCsv() {
    if (!suppliers || suppliers.length === 0) {
      return;
    }

    downloadCsv(
      `furnizori-immapp-${todayForFilename()}.csv`,
      ["Denumire furnizor", "CUI", "Nr. facturi", "Valoare totala", "Ultima factura", "Status"],
      suppliers.map((supplier) => [
        supplier.name,
        supplier.cui,
        supplier.invoiceCount,
        supplier.totalValue.toFixed(2),
        supplier.lastInvoiceDate ?? "",
        supplier.status,
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Furnizori"
        description="Lista furnizorilor derivată din facturile primite, cu valoarea achizițiilor."
        actions={
          <Button variant="outline" onClick={handleExportCsv} disabled={!suppliers?.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total furnizori"
          value={suppliers?.length ?? 0}
          icon={<Truck className="h-4 w-4" />}
        />
        <KpiCard
          label="Furnizor principal"
          value={top?.name ?? "-"}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={top ? formatRON(top.totalValue) : undefined}
        />
        <KpiCard
          label="Valoare totală achiziții"
          value={formatRON(totalValue)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca furnizorii...
            </div>
          ) : !suppliers || suppliers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                Niciun furnizor identificat inca.
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Furnizorii apar automat aici pe masura ce importi facturi primite de la ei.
              </p>
              <Button size="sm" asChild className="mt-1">
                <Link to="/app/e-facturi">
                  <ReceiptText className="h-4 w-4" />
                  Importa e-Factura XML
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Denumire furnizor</TableHead>
                  <TableHead>CUI</TableHead>
                  <TableHead className="text-right">Nr. facturi</TableHead>
                  <TableHead className="text-right">Valoare totală</TableHead>
                  <TableHead>Ultima factură</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.key}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="font-mono text-xs">{supplier.cui || "-"}</TableCell>
                    <TableCell className="text-right">{supplier.invoiceCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(supplier.totalValue)}
                    </TableCell>
                    <TableCell>{supplier.lastInvoiceDate ?? "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={supplier.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
