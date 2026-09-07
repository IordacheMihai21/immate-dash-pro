import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Loader2, ReceiptText, TrendingUp, UploadCloud, Users, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/chart-card";
import {
  ImpactBadge,
  ReportActionCard,
  ReportEmptyState,
  ReportHero,
  ReportInsightCard,
  ReportKpiCard,
  ReportPanel,
  SearchInput,
} from "@/components/report-ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useInvoicesData } from "@/hooks/use-invoices-data";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/formatters";
import {
  buildMonthlyReportPoints,
  filterInvoicesByClassification,
  formatDate,
  formatPercent,
  getCustomerName,
  getInvoiceDate,
  getInvoiceTotal,
  getNewestInvoiceTime,
  isRecentInvoice,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/revenue")({
  head: () => ({ meta: [{ title: "Raport venituri - IMMapp" }] }),
  component: RevenueReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type RevenueTab = "all" | "high" | "recent";

function RevenueReportPage() {
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
  } = useDashboardData();
  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    isError: isInvoicesError,
  } = useInvoicesData();
  const invoices = useMemo(
    () => (invoicesData as unknown as ReportInvoice[]) ?? [],
    [invoicesData],
  );
  const [activeTab, setActiveTab] = useState<RevenueTab>("all");
  const [search, setSearch] = useState("");
  const isLoading = isDashboardLoading || isInvoicesLoading;
  const errorMessage =
    isDashboardError || isInvoicesError
      ? "Nu s-au putut încărca datele pentru raportul de venituri."
      : "";

  const report = useMemo(() => {
    const revenueInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["revenue"])
      : [];
    const totalRevenue = revenueInvoices.reduce(
      (sum, invoice) => sum + getInvoiceTotal(invoice),
      0,
    );
    const averageInvoice = revenueInvoices.length > 0 ? totalRevenue / revenueInvoices.length : 0;
    const newestTime = getNewestInvoiceTime(revenueInvoices);
    const monthly = dashboardData
      ? buildMonthlyReportPoints(invoices, [], {
          companyCui: dashboardData.companyCui,
          classifications: ["revenue"],
        })
      : [];
    const averageMonthly =
      monthly.length > 0 ? monthly.reduce((sum, item) => sum + item.value, 0) / monthly.length : 0;
    const customerMap = new Map<string, { name: string; total: number }>();

    revenueInvoices.forEach((invoice) => {
      const name = getCustomerName(invoice);
      const current = customerMap.get(name) ?? { name, total: 0 };

      current.total += getInvoiceTotal(invoice);
      customerMap.set(name, current);
    });

    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const topCustomerShare =
      totalRevenue > 0 && topCustomers[0] ? (topCustomers[0].total / totalRevenue) * 100 : 0;
    const rows = revenueInvoices
      .map((invoice) => {
        const total = getInvoiceTotal(invoice);
        const impact =
          total > averageInvoice * 1.25
            ? "Ridicat"
            : total >= averageInvoice * 0.75
              ? "Mediu"
              : "Scăzut";

        return {
          invoice,
          invoiceNumber: invoice.invoice_number ?? "-",
          customer: getCustomerName(invoice),
          date: formatDate(getInvoiceDate(invoice)),
          total,
          share: totalRevenue > 0 ? (total / totalRevenue) * 100 : 0,
          impact,
          recent: isRecentInvoice(invoice, newestTime),
        };
      })
      .sort((a, b) => b.total - a.total);
    const searchValue = normalizeText(search);
    const filteredRows = rows.filter((row) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "high" && row.impact === "Ridicat") ||
        (activeTab === "recent" && row.recent);

      if (!matchesTab) {
        return false;
      }

      return searchValue
        ? normalizeText(`${row.invoiceNumber} ${row.customer}`).includes(searchValue)
        : true;
    });

    return {
      totalRevenue,
      averageInvoice,
      highRevenueInvoices: rows.filter((row) => row.impact === "Ridicat").length,
      monthlyChart: monthly.map((item) => ({
        month: item.month,
        venituri: item.value,
        medie: averageMonthly,
      })),
      revenueTrend: getRevenueTrend(monthly),
      topCustomers,
      topCustomerShare,
      rows: filteredRows,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul de venituri...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportHero
        title="Venituri"
        subtitle="Analizeaza evolutia veniturilor, clientii importanti si concentrarea facturilor emise."
        eyebrow="Raport comercial"
        badge="Facturi emise"
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        actions={
          <Button asChild className="rounded-full bg-card text-foreground hover:bg-muted">
            <Link to="/app/documente">
              <UploadCloud className="h-4 w-4" />
              Importa documente
            </Link>
          </Button>
        }
      />

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 || !dashboardData ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ReportKpiCard
              title="Venit procesat"
              value={formatRON(report.totalRevenue)}
              description="Valoare totală din facturile procesate"
              icon={<Wallet className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Venit estimat"
              value={formatRON(dashboardData.prediction.revenueForecast)}
              description="Estimare generată din istoricul financiar"
              icon={<TrendingUp className="h-5 w-5" />}
              tone="emerald"
            />
            <ReportKpiCard
              title="Facturi peste medie"
              value={String(report.highRevenueInvoices)}
              description="Facturi cu valoare peste pragul de impact"
              icon={<ReceiptText className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="Valoare medie factură"
              value={formatRON(report.averageInvoice)}
              description="Prag de comparație pentru venituri"
              icon={<Users className="h-5 w-5" />}
              tone="slate"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Evoluție venituri lunare"
              description="Venituri lunare comparate cu media perioadei"
              className="border-border bg-card shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={report.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value) => formatRON(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="venituri"
                    name="Venituri"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="medie"
                    name="Medie"
                    stroke="#f59e0b"
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Top clienți după venit"
              description="Clienții care concentrează cea mai mare valoare"
              className="border-border bg-card shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.topCustomers} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={12}
                    width={120}
                  />
                  <Tooltip formatter={(value) => formatRON(Number(value))} />
                  <Bar dataKey="total" name="Venit" fill="#10b981" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <ReportInsightCard
              title="Concentrare pe clientul principal"
              value={formatPercent(report.topCustomerShare)}
              description="Arata cat de mult depind veniturile de cel mai important client."
              icon={<Users className="h-5 w-5" />}
              tone={report.topCustomerShare > 50 ? "amber" : "emerald"}
            />
            <ReportInsightCard
              title="Ritm venituri"
              value={report.revenueTrend}
              description="Semnal calculat din ultimele luni disponibile in facturile emise."
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
            />
            <ReportInsightCard
              title="Facturi peste medie"
              value={String(report.highRevenueInvoices)}
              description="Facturi care pot influenta vizibil evolutia veniturilor."
              icon={<ReceiptText className="h-5 w-5" />}
              tone="amber"
            />
          </section>

          <ReportPanel
            eyebrow="Recomandari"
            title="Semnale comerciale de urmarit"
            description="Puncte utile pentru stabilitatea veniturilor."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ReportActionCard
                priority={report.topCustomerShare > 50 ? "Medie" : "Scazuta"}
                title="Verifica dependenta de client"
                description="Daca un client concentreaza o pondere mare, urmareste termenele si recurenta comenzilor."
              />
              <ReportActionCard
                priority={report.highRevenueInvoices > 0 ? "Medie" : "Scazuta"}
                title="Analizeaza facturile mari"
                description="Facturile cu valoare ridicata pot explica variatii lunare importante."
              />
              <ReportActionCard
                priority="Scazuta"
                title="Pastreaza istoricul actualizat"
                description="Importa e-Facturile noi pentru o imagine corecta asupra ritmului veniturilor."
              />
            </div>
          </ReportPanel>

          <ReportPanel
            title="Facturi care influențează veniturile"
            description="Filtrează facturile cu impact ridicat asupra veniturilor."
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Caută factură sau client"
              />
            }
            contentClassName="p-0"
          >
            <div className="border-b border-border p-5">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RevenueTab)}>
                <TabsList>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                  <TabsTrigger value="high">Valoare ridicată</TabsTrigger>
                  <TabsTrigger value="recent">Recente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Număr factură</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Data emitere</TableHead>
                    <TableHead className="text-right">Valoare</TableHead>
                    <TableHead className="text-right">Pondere</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.invoice.id}>
                      <TableCell className="font-medium text-foreground">
                        {row.invoiceNumber}
                      </TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.share)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={row.impact} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/e-facturi/$id" params={{ id: row.invoice.id }}>
                            <Eye className="h-4 w-4" />
                            Detalii
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportPanel>

          <ReportPanel title="Interpretare venituri">
            <p className="text-sm leading-6 text-muted-foreground">
              {report.highRevenueInvoices > 0
                ? `Veniturile sunt influențate de ${report.highRevenueInvoices} facturi cu valoare ridicată. Monitorizează clienții principali și actualizează analiza după fiecare import.`
                : "Veniturile sunt distribuite relativ echilibrat în facturile procesate. Continuă urmărirea evoluției lunare pentru a identifica din timp schimbările de ritm."}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

function getRevenueTrend(monthly: { value: number }[]) {
  if (monthly.length < 2) {
    return "Istoric limitat";
  }

  const latest = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];

  if (latest.value > previous.value) {
    return "In crestere";
  }

  if (latest.value < previous.value) {
    return "In scadere";
  }

  return "Stabil";
}
