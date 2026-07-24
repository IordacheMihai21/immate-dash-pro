import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
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
import { Users, TrendingUp, Wallet } from "lucide-react";
import { clients, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/clienti")({
  head: () => ({ meta: [{ title: "Clienți — IMMapp" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const top = clients.slice().sort((a, b) => b.total - a.total)[0];
  const totalValue = clients.reduce((s, x) => s + x.total, 0);
  return (
    <div>
      <PageHeader title="Clienți" description="Lista clienților și valoarea vânzărilor." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total clienți"
          value={clients.length}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Client principal"
          value={top.name}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={formatRON(top.total)}
        />
        <KpiCard
          label="Valoare totală vânzări"
          value={formatRON(totalValue)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>
      <Card>
        <CardContent className="p-0">
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
              {clients.map((c) => (
                <TableRow key={c.cui}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.cui}</TableCell>
                  <TableCell className="text-right">{c.invoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRON(c.total)}</TableCell>
                  <TableCell>{c.lastInvoice}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
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
