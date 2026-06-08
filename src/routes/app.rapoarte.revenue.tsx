import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, ReceiptText, TrendingUp, Users, Wallet } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import {
  ImpactBadge,
  ReportEmptyState,
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
import { getDashboardData } from "@/lib/dashboardService";
import { getInvoices } from "@/lib/invoiceService";
import { formatRON } from "@/lib/mock-data";
import {
  buildMonthlyReportPoints,
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
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<RevenueTab>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadReport() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [dashboard, invoiceData] = await Promise.all([getDashboardData(), getInvoices()]);

        setDashboardData(dashboard);
        setInvoices(invoiceData as unknown as ReportInvoice[]);
      } catch {
        setErrorMessage("Nu s-au putut încărca datele pentru raportul de venituri.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
    const averageInvoice = invoices.length > 0 ? totalRevenue / invoices.length : 0;
    const newestTime = getNewestInvoiceTime(invoices);
    const monthly = buildMonthlyReportPoints(invoices);
    const averageMonthly =
      monthly.length > 0 ? monthly.reduce((sum, item) => sum + item.value, 0) / monthly.length : 0;
    const customerMap = new Map<string, { name: string; total: number }>();

    invoices.forEach((invoice) => {
      const name = getCustomerName(invoice);
      const current = customerMap.get(name) ?? { name, total: 0 };

      current.total += getInvoiceTotal(invoice);
      customerMap.set(name, current);
    });

    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const rows = invoices
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
      topCustomers,
      rows: filteredRows,
    };
  }, [activeTab, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul de venituri...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport venituri"
        description="Analizează evoluția veniturilor, clienții importanți și facturile cu valoare ridicată."
      />

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
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
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={report.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
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
              className="border-slate-200 bg-white shadow-sm"
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
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar dataKey="total" name="Venit" fill="#10b981" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

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
            <div className="border-b border-slate-100 p-5">
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
                      <TableCell className="font-medium text-slate-900">
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
            <p className="text-sm leading-6 text-slate-600">
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
