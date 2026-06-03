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
import { Truck, TrendingUp, Wallet } from "lucide-react";
import { suppliers, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/furnizori")({
  head: () => ({ meta: [{ title: "Furnizori — IMMapp" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const top = suppliers.slice().sort((a, b) => b.total - a.total)[0];
  const totalValue = suppliers.reduce((s, x) => s + x.total, 0);
  return (
    <div>
      <PageHeader title="Furnizori" description="Lista furnizorilor și valoarea achizițiilor." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total furnizori" value={suppliers.length} icon={<Truck className="h-4 w-4" />} />
        <KpiCard label="Furnizor principal" value={top.name} icon={<TrendingUp className="h-4 w-4" />} hint={formatRON(top.total)} />
        <KpiCard label="Valoare totală achiziții" value={formatRON(totalValue)} icon={<Wallet className="h-4 w-4" />} />
      </div>
      <Card>
        <CardContent className="p-0">
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
              {suppliers.map((s) => (
                <TableRow key={s.cui}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.cui}</TableCell>
                  <TableCell className="text-right">{s.invoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRON(s.total)}</TableCell>
                  <TableCell>{s.lastInvoice}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
