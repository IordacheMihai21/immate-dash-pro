import { createFileRoute } from "@tanstack/react-router";
import { Building2, Loader2, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClientPortfolio } from "@/hooks/use-client-portfolio";
import { formatRON } from "@/lib/formatters";
import { reloadForCompanySwitch, setSelectedCompanyId } from "@/lib/companyService";

export const Route = createFileRoute("/app/portofoliu")({
  head: () => ({ meta: [{ title: "Portofoliu companii — IMMapp" }] }),
  component: PortfolioPage,
});

const roleLabels: Record<string, string> = {
  owner: "Proprietar",
  admin: "Administrator",
  contabil: "Contabil",
  vizualizator: "Vizualizator",
};

function PortfolioPage() {
  const { data: entries, isLoading } = useClientPortfolio();

  const totalRevenue = entries?.reduce((sum, entry) => sum + entry.revenueTotal, 0) ?? 0;

  function handleOpen(companyId: string) {
    setSelectedCompanyId(companyId);
    reloadForCompanySwitch();
  }

  return (
    <div>
      <PageHeader
        title="Portofoliu companii"
        description="Toate companiile la care ai acces, intr-un singur loc -- util mai ales daca esti contabil pentru mai multi clienti."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Companii"
          value={entries?.length ?? 0}
          icon={<Building2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Venit total (toate companiile)"
          value={formatRON(totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Rol curent"
          value={entries?.[0] ? (roleLabels[entries[0].role] ?? entries[0].role) : "-"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca companiile...
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                Nu esti membru al niciunei companii inca.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Companie</TableHead>
                  <TableHead>CUI</TableHead>
                  <TableHead>Rolul tau</TableHead>
                  <TableHead className="text-right">Facturi</TableHead>
                  <TableHead className="text-right">Venit</TableHead>
                  <TableHead className="text-right">Cheltuieli</TableHead>
                  <TableHead>Ultima activitate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.companyId}>
                    <TableCell className="font-medium">{entry.companyName}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.cui || "-"}</TableCell>
                    <TableCell>{roleLabels[entry.role] ?? entry.role}</TableCell>
                    <TableCell className="text-right">{entry.invoiceCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(entry.revenueTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(entry.expenseTotal)}
                    </TableCell>
                    <TableCell>{entry.lastActivityDate ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpen(entry.companyId)}
                      >
                        Deschide
                      </Button>
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
