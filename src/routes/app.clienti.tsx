import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, ReceiptText, TrendingUp, Users, Wallet } from "lucide-react";
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
import { useCustomerSummaries } from "@/hooks/use-party-summaries";
import { downloadCsv, todayForFilename } from "@/lib/csvExport";
import { formatRON } from "@/lib/formatters";

export const Route = createFileRoute("/app/clienti")({
  head: () => ({ meta: [{ title: "Clienți — IMMapp" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const { data: clients, isLoading } = useCustomerSummaries();

  const top = clients?.[0] ?? null;
  const totalValue = clients?.reduce((sum, client) => sum + client.totalValue, 0) ?? 0;

  function handleExportCsv() {
    if (!clients || clients.length === 0) {
      return;
    }

    downloadCsv(
      `clienti-immapp-${todayForFilename()}.csv`,
      ["Denumire client", "CUI", "Nr. facturi", "Valoare totala", "Ultima factura", "Status"],
      clients.map((client) => [
        client.name,
        client.cui,
        client.invoiceCount,
        client.totalValue.toFixed(2),
        client.lastInvoiceDate ?? "",
        client.status,
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Clienți"
        description="Lista clienților derivată din facturile emise, cu valoarea vânzărilor."
        actions={
          <Button variant="outline" onClick={handleExportCsv} disabled={!clients?.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total clienți"
          value={clients?.length ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Client principal"
          value={top?.name ?? "-"}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={top ? formatRON(top.totalValue) : undefined}
        />
        <KpiCard
          label="Valoare totală vânzări"
          value={formatRON(totalValue)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca clientii...
            </div>
          ) : !clients || clients.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm font-medium text-foreground">Niciun client identificat inca.</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Clientii apar automat aici pe masura ce emiti facturi catre ei.
              </p>
              <Button size="sm" asChild className="mt-1">
                <Link to="/app/e-facturi/noua">
                  <ReceiptText className="h-4 w-4" />
                  Creeaza prima factura
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Denumire client</TableHead>
                  <TableHead>CUI</TableHead>
                  <TableHead className="text-right">Nr. facturi</TableHead>
                  <TableHead className="text-right">Valoare totală</TableHead>
                  <TableHead>Ultima factură</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.key}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="font-mono text-xs">{client.cui || "-"}</TableCell>
                    <TableCell className="text-right">{client.invoiceCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(client.totalValue)}
                    </TableCell>
                    <TableCell>{client.lastInvoiceDate ?? "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={client.status} />
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
